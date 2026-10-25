// Browser smoke test: three users drive the real app against real PostgREST.
// Covers the Phase 1–4 exit conditions end to end: group + invite + join,
// expenses, a three-party transfer approved on "three devices", the
// derivation self-check, a two-sided settlement, and a trip.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const { APP, SHOTS, U_A, T_A, U_B, T_B, U_C, T_C, CHROME_PATH } = process.env;
const browser = await chromium.launch({ headless: true, ...(CHROME_PATH ? { executablePath: CHROME_PATH } : {}) });
fs.mkdirSync(SHOTS, { recursive: true });

const errors = [];
async function user(id, token, label) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const session = {
    access_token: token, refresh_token: 'local', token_type: 'bearer', expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    user: { id, aud: 'authenticated', role: 'authenticated', email: `${label}@test.local`, app_metadata: {}, user_metadata: {} },
  };
  await ctx.addInitScript(([s]) => localStorage.setItem('sb-localhost-auth-token', s), [JSON.stringify(session)]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/WebSocket|realtime|ERR_CONNECTION|404|I6 VIOLATION/.test(m.text())) errors.push(`${label} console: ${m.text()}`);
    if (/I6 VIOLATION/.test(m.text())) errors.push(`${label}: ${m.text()}`);
  });
  return page;
}
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const step = (s) => console.log(`   · ${s}`);
const expectText = async (page, text, timeout = 8000) => {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout });
};

const arif = await user(U_A, T_A, 'arif');
const sami = await user(U_B, T_B, 'sami');
const rafi = await user(U_C, T_C, 'rafi');

try {
  // A-04 empty state → A-02 create
  await arif.goto(`${APP}/groups`);
  await expectText(arif, 'No groups yet');
  await shot(arif, '01-empty-groups');
  step('empty state');
  await arif.getByRole('button', { name: /New group/ }).click();
  await arif.getByLabel('Group name').fill('Hall 3 Friends');
  await arif.getByRole('button', { name: 'Create', exact: true }).click();
  await expectText(arif, 'Invite your friends');
  const invite = await arif.locator('code').first().innerText();
  await shot(arif, '02-new-group');
  step(`group created, invite ${invite}`);

  // A-03 join on two other "devices"
  for (const [page, who] of [[sami, 'sami'], [rafi, 'rafi']]) {
    await page.goto(invite.replace(/^https?:\/\/[^/]+/, APP));
    await expectText(page, 'Join Hall 3 Friends?');
    if (who === 'sami') await shot(page, '03-join');
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expectText(page, 'Add expense');
  }
  step('Sami and Rafi joined');

  // B-01: ৳1,200 split three ways, Arif paid
  const groupUrl = arif.url().split('?')[0];
  await arif.goto(groupUrl);
  await arif.getByRole('link', { name: /Add expense/ }).first().click();
  await arif.getByLabel('Amount (৳)').fill('1200');
  await arif.getByLabel('What was it?').fill('Dinner at Star');
  await shot(arif, '04-add-expense');
  await arif.getByRole('button', { name: /Save ৳1,200.00/ }).click();
  await expectText(arif, "You're owed");
  await expectText(arif, '৳800.00');
  await shot(arif, '05-dashboard-owed');
  step('dinner recorded; Arif is owed ৳800.00');

  // Rafi pays ৳1,000 hotel for Arif only → Arif now owes Rafi ৳600 net
  await rafi.goto(groupUrl + '/add');
  await rafi.getByLabel('Amount (৳)').fill('1000');
  await rafi.getByLabel('What was it?').fill('Hotel for Arif');
  await rafi.getByRole('button', { name: /Everyone/ }).click();   // clear
  await rafi.locator('button[aria-pressed]', { hasText: /^Arif/ }).last().click(); // participant chip, not payer
  await rafi.getByRole('button', { name: /Save ৳1,000.00/ }).click();
  await expectText(rafi, 'Add expense');
  step('hotel recorded');

  // C-01: Arif proposes Sami's ৳400 move to Rafi
  await arif.goto(groupUrl + '/transfer');
  await expectText(arif, 'Right now');
  await expectText(arif, 'After, if all three agree');
  await shot(arif, '06-transfer-builder');
  await arif.getByRole('button', { name: 'Send for approval' }).click();
  await expectText(arif, 'Everyone must agree');
  const proposalUrl = arif.url();
  await shot(arif, '07-proposal-pending');
  step('transfer proposed');

  // C-02 on the other two devices
  await sami.goto(`${APP}/proposals`);
  await expectText(sami, 'Transfer');
  await shot(sami, '08-inbox');
  await sami.goto(proposalUrl.replace(/^https?:\/\/[^/]+/, APP));
  await expectText(sami, 'If this goes through');
  await sami.getByRole('button', { name: 'Approve', exact: true }).click();
  await expectText(sami, 'Waiting for the others');
  await rafi.goto(proposalUrl.replace(/^https?:\/\/[^/]+/, APP));
  await rafi.getByRole('button', { name: 'Approve', exact: true }).click();
  await expectText(rafi, 'Approved by everyone');
  await shot(rafi, '09-approved');
  step('approved by all three — ledger committed');

  // Balances after: Sami square with Arif, Arif owes Rafi ৳200
  await arif.goto(groupUrl);
  await expectText(arif, 'You owe');
  await expectText(arif, '৳200.00');
  step('Arif now owes ৳200.00');

  // E-01 + I6: derivation with Rafi
  await arif.getByRole('link', { name: 'Why?' }).first().click();
  await expectText(arif, 'Every step that produced this figure');
  await expectText(arif, 'Transfer approved by');
  if (await arif.getByText('Something’s wrong').count()) throw new Error('I6 self-check failed in the UI');
  await shot(arif, '10-explain');
  step('derivation consistent with balance (I6)');

  // F-01/F-02: Sami settles with Rafi; Rafi confirms
  await sami.goto(groupUrl + '/settle');
  await expectText(sami, 'You pay');
  await shot(sami, '11-settle');
  await sami.getByRole('button', { name: 'I paid this' }).first().click();
  await expectText(sami, 'Everyone must agree');
  const settleUrl = sami.url();
  await rafi.goto(settleUrl.replace(/^https?:\/\/[^/]+/, APP));
  await rafi.getByRole('button', { name: 'Approve', exact: true }).click();
  await expectText(rafi, 'Approved by everyone');
  step('two-sided settlement confirmed');

  // D-01 trip, D-02 leader entry, D-12 non-leader note
  await arif.goto(groupUrl + '/trips');
  await arif.getByRole('button', { name: /Start a trip|New trip/ }).first().click();
  await arif.getByLabel('Trip name').fill('Sylhet Tour');
  await arif.getByRole('button', { name: 'Start trip' }).click();
  await expectText(arif, 'Trip so far');
  const tripUrl = arif.url();
  await arif.getByRole('link', { name: /Add expense/ }).click();
  await arif.getByLabel('Amount (৳)').fill('100');
  await arif.getByLabel('What was it?').fill('Auto rickshaw');
  await expectText(arif, '+1 poisha');
  await arif.getByRole('button', { name: /Save ৳100.00/ }).click();
  await expectText(arif, 'Auto rickshaw');
  await shot(arif, '12-trip-dashboard');
  await sami.goto(tripUrl.replace(/^https?:\/\/[^/]+/, APP));
  await expectText(sami, 'Only leaders add expenses on this trip');
  await shot(sami, '13-trip-non-leader');
  step('trip: leader added, non-leader sees who to ask');

  // B-05 history
  await arif.goto(groupUrl + '/history');
  await expectText(arif, 'Dinner at Star');
  await shot(arif, '14-history');
  step('history renders');

  if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
} catch (e) {
  for (const [p, n] of [[arif, 'arif'], [sami, 'sami'], [rafi, 'rafi']]) await shot(p, `FAIL-${n}`).catch(() => {});
  console.error(e.message);
  if (errors.length) console.error(errors.join('\n'));
  await browser.close();
  process.exit(1);
}
await browser.close();
