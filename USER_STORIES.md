# HishebNama — User Stories and Scenarios

**Companion to `DEVELOPMENT_PLAN.md` v1.3**

| | |
|---|---|
| **Document version** | 1.1 |
| **Date** | 25 October 2026 |
| **Status** | Pre-development specification |
| **Platform** | Mobile-first responsive web app (PWA) |
| **Companion document** | `DEVELOPMENT_PLAN.md` v1.3 — architecture, schema, security |

---

## Table of Contents

1. [How to Read This Document](#1-how-to-read-this-document)
2. [Personas](#2-personas)
3. [Epic Index](#3-epic-index)
4. [Epic A — Accounts and Groups](#4-epic-a--accounts-and-groups)
5. [Epic B — Expenses and Balances](#5-epic-b--expenses-and-balances)
6. [Epic C — Consent-Based Transfers and Corrections](#6-epic-c--consent-based-transfers-and-corrections)
7. [Epic D — Trips and Leaders](#7-epic-d--trips-and-leaders)
8. [Epic E — Transparency and Explanation](#8-epic-e--transparency-and-explanation)
9. [Epic F — Settlement](#9-epic-f--settlement)
10. [Epic G — Notifications and Awareness](#10-epic-g--notifications-and-awareness)
11. [Epic H — Abuse, Attack and Misuse](#11-epic-h--abuse-attack-and-misuse)
12. [Cross-Cutting Unhappy Paths](#12-cross-cutting-unhappy-paths)
13. [Traceability Matrix](#13-traceability-matrix)

---

## 1. How to Read This Document

Each story has a fixed shape:

| Part | Meaning |
|---|---|
| **ID** | Stable reference (`A-01`). Cite these in commits, tests and issues. |
| **Story** | As a *role*, I want *capability*, so that *outcome*. |
| **Priority** | `MUST` ships in the first usable version · `SHOULD` ships before launch · `COULD` is deferrable. |
| **Happy path** | The main success scenario, numbered, from trigger to outcome. |
| **Unhappy paths** | Everything that can go otherwise: user error, conflict, race, network, permission, malice. Each names the **expected system behaviour**, not just the failure. |
| **Acceptance criteria** | Given/When/Then statements. These are the test cases. |

### Two conventions that matter

**Unhappy paths are specifications, not disclaimers.** "What happens when two people approve at the same instant" has exactly one correct answer, and it is written here. An unspecified unhappy path becomes whatever the code happens to do, which in a money app is how trust is lost.

**Every error has a defined user-visible message.** An error the user cannot act on is a bug. Where a message is given in quotes, that wording (or a faithful Bangla equivalent) is the specification.

### Instruction to AI coding agents

When implementing a story, treat its unhappy paths as mandatory, not optional hardening. Generate tests for the unhappy paths **before** the happy path — the happy path is usually obvious from the UI, while the unhappy paths are where defects live. Where a story's behaviour appears to conflict with `DEVELOPMENT_PLAN.md`, the plan's Sections 7, 8, 11, 12 and 14 win; say so rather than silently reconciling.

---

## 2. Personas

| Persona | Description | What they need |
|---|---|---|
| **Arif — the organiser** | Arranges outings, usually fronts cash, ends up as trip leader. Comfortable with apps. | Fast entry, confidence the numbers are right, a way to chase people without nagging. |
| **Sami — the casual member** | Joins trips, rarely pays up front, does not want to think about money. | To know what he owes, in one number, without learning anything. |
| **Nadia — the careful one** | Wants to verify figures before paying. Has been short-changed before. | A derivation she can check. Will not pay a number she cannot trace. |
| **Rafi — the reluctant counterparty** | Lent money to a friend and is uncomfortable being reassigned to a stranger. | The right to refuse a transfer without social awkwardness. |
| **Tania — the second leader** | Co-organiser on a large tour, enters expenses when Arif is busy. | Shared authority without stepping on Arif's entries. |

---

## 3. Epic Index

| Epic | Theme | Stories |
|---|---|---|
| **A** | Accounts and Groups | A-01 … A-06 |
| **B** | Expenses and Balances | B-01 … B-08 |
| **C** | Consent-Based Transfers and Corrections | C-01 … C-08 |
| **D** | Trips and Leaders | D-01 … D-12 |
| **E** | Transparency and Explanation | E-01 … E-05 |
| **F** | Settlement | F-01 … F-05 |
| **G** | Notifications and Awareness | G-01 … G-04 |
| **H** | Abuse, Attack and Misuse | H-01 … H-07 |

**55 stories.** Numbering is stable; gaps are never reused.

---

## 4. Epic A — Accounts and Groups

### A-01 — Sign in with Google · `MUST`

> **As** a new user, **I want** to sign in with my Google account, **so that** I can start using the app without creating another password.

**Happy path**
1. User opens the app URL on their phone.
2. Taps "Continue with Google".
3. Chooses a Google account in the standard consent screen.
4. Returns to the app, signed in, with a profile created from their Google name and avatar.
5. Lands on the groups list (empty for a new user).

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | User cancels the Google consent screen | Return to landing page, no error dialog, no partial account. |
| 2 | Network drops mid-redirect | "Couldn't complete sign in. Check your connection and try again." Retry button. No orphan profile row. |
| 3 | Google account has no display name | Fall back to the local part of the email address. Never show a blank or a raw UUID. |
| 4 | User signs in on a second device | Same account, same data. No "session elsewhere" warning — concurrent sessions are normal. |
| 5 | Session token expires mid-use | Silent refresh. If refresh fails, return to sign-in preserving the intended destination. |
| 6 | OAuth redirect URL misconfigured after deploy | Google shows its own error. Deployment checklist must verify the redirect for every environment. |

**Acceptance criteria**
- **Given** a user with no account, **when** they complete Google sign-in, **then** exactly one `profiles` row exists with their display name populated.
- **Given** a cancelled consent screen, **when** the user returns, **then** no `profiles` row and no `auth.users` row has been created.

---

### A-02 — Create a group · `MUST`

> **As** Arif, **I want** to create a named group, **so that** my friends and I have one shared ledger.

**Happy path**
1. Arif taps "New group" on the groups list.
2. Enters a name ("Hall 3 Friends").
3. Taps Create.
4. The group is created; Arif is its owner and first member.
5. He lands on the group dashboard with an invite link ready to share.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Empty or whitespace-only name | Create button stays disabled. Inline hint: "Give your group a name." |
| 2 | Name longer than 60 characters | Input stops accepting input at the limit; counter shown from 50 onward. |
| 3 | Name identical to an existing group of theirs | Allowed. Duplicate names are not an error; groups are distinguished by their members. |
| 4 | Double-tap on Create | Button disables on first tap. Exactly one group is created. |
| 5 | Request fails mid-flight | "Couldn't create the group." Form state preserved so nothing is retyped. |

**Acceptance criteria**
- **Given** a valid name, **when** Arif creates a group, **then** one `groups` row and one `group_members` row with `role='owner'` exist.
- **Given** a double submission, **when** both requests land, **then** exactly one group exists.

---

### A-03 — Join a group by invite link · `MUST`

> **As** Sami, **I want** to join by tapping a link, **so that** I don't have to be found and added manually.

**Happy path**
1. Arif shares the invite link over WhatsApp.
2. Sami taps it on his phone; the app opens in the browser.
3. He is prompted to sign in (A-01); the invite is remembered through the redirect.
4. He sees "Join Hall 3 Friends?" with the member list.
5. He taps Join and lands on the group dashboard.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Invite code invalid or rotated | "This invite link is no longer valid. Ask for a new one." No group details leaked. |
| 2 | Sami is already a member | Skip the prompt, go straight to the dashboard. No duplicate membership, no error. |
| 3 | Not signed in | Sign-in first, then return to the join prompt with the code intact. |
| 4 | Two devices tap the same link simultaneously | `on conflict do nothing` — one membership row. |
| 5 | Link opened on desktop | Works identically. Layout is a centered column. |
| 6 | Link pasted into an app that mangles it | Join screen also accepts a manually typed code. |

**Acceptance criteria**
- **Given** a valid code, **when** Sami joins, **then** a `group_members` row exists with `role='member'`.
- **Given** an invalid code, **when** the page loads, **then** no group name, member names or balances appear anywhere in the response.

---

### A-04 — See all my groups with my position · `MUST`

> **As** Sami, **I want** one screen showing every group and whether I owe or am owed, **so that** I know where I stand at a glance.

**Happy path**
1. Sami opens the app, already signed in.
2. The groups list shows each group with a single net figure, colour-coded: red when he owes, green when he is owed, grey at zero.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | No groups yet | Empty state explaining what a group is, with "Create" and "I have an invite link". |
| 2 | Group with no expenses | Shows "All settled" rather than "৳0.00", which reads like an error. |
| 3 | Balances still loading | Skeleton placeholders, never `0` — a transient zero on a money screen is alarming. |
| 4 | Offline | Last known values with a "Showing saved data" banner and a retry. |
| 5 | Many groups | List is virtualised; order is most-recent-activity first. |

**Acceptance criteria**
- **Given** three groups with differing positions, **when** the list renders, **then** each figure equals that group's `v_user_net` for the signed-in user.

---

### A-05 — Rotate a leaked invite link · `SHOULD`

> **As** Arif, **I want** to invalidate an invite link, **so that** a link forwarded to the wrong chat cannot be used.

**Happy path**
1. Arif opens group settings and taps "Reset invite link".
2. Confirms.
3. A new code is generated; the old link stops working immediately.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Someone is mid-join with the old code | Their join fails with "This invite link is no longer valid." No partial membership. |
| 2 | Non-owner attempts rotation | Refused in the database, not just hidden in the UI. |
| 3 | Arif loses the new link | It is always visible in group settings; rotation is repeatable. |

**Acceptance criteria**
- **Given** rotation, **when** the old code is submitted, **then** `INVALID_INVITE_CODE` is raised.

---

### A-06 — Leave a group · `COULD`

> **As** Sami, **I want** to leave a group I'm no longer part of, **so that** it stops cluttering my list.

**Happy path**
1. Sami opens group settings, taps "Leave group", confirms.
2. He is removed and returns to the groups list.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | **Sami has a non-zero balance** | **Refused.** "Settle up before leaving — you still owe ৳320." Leaving with outstanding debt would orphan entries referencing a non-member and break the ledger's integrity. |
| 2 | Sami is the only owner | Refused until ownership is transferred. |
| 3 | Sami is an active trip leader | Refused: "Hand over trip leadership first." |
| 4 | Sami rejoins later via invite | Allowed. Historical entries remain correctly attributed. |

**Acceptance criteria**
- **Given** a non-zero `v_user_net`, **when** Sami attempts to leave, **then** the operation is refused and his membership persists.

---

## 5. Epic B — Expenses and Balances

### B-01 — Record an expense split equally · `MUST`

> **As** Arif, **I want** to record that I paid for something shared, **so that** everyone's share is tracked without me having to remember it.

**Happy path**
1. Arif taps "Add expense" on the group dashboard.
2. Enters amount ৳1,200 (keypad focused on open).
3. Enters description "Dinner at Star".
4. Payer defaults to himself.
5. Participants default to all members; he leaves them.
6. Taps Save.
7. The dashboard updates: each of the other three owes him ৳300.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Amount is zero or blank | Save disabled. Hint: "Enter an amount." |
| 2 | Amount is negative | Impossible via the keypad; rejected by a `CHECK` constraint if forced. |
| 3 | Amount does not divide evenly | Largest-remainder split. Extra poisha assigned in a fixed order and shown in the breakdown before saving. |
| 4 | Only one participant (the payer) | Refused: "An expense needs at least one other person." |
| 5 | Payer not among participants | **Allowed** — Arif may pay for a meal he did not eat. He is owed the full amount. |
| 6 | Description blank | Refused. An unlabelled expense is unverifiable later. |
| 7 | Network fails on save | "Couldn't save." Form state preserved entirely. No partial write — the RPC is one transaction. |
| 8 | Double-tap Save | Button disables on first tap. Exactly one expense. |
| 9 | Amount above the sanity bound | "That looks unusually large — check the amount." Confirmable, not blocked. |
| 10 | Participant left the group after loading the form | `SHARE_USER_NOT_A_MEMBER`. "Someone in this split is no longer in the group." Form reloads members. |

**Acceptance criteria**
- **Given** ৳1,200 split 4 ways, **when** saved, **then** three `ledger_entries` of 30000 poisha each exist and `expense_shares` sums to exactly 120000.
- **Given** ৳100 split 3 ways, **when** saved, **then** shares are 3334/3333/3333 and sum to exactly 10000.

---

### B-02 — Record an expense with unequal shares · `MUST`

> **As** Arif, **I want** to assign different amounts per person, **so that** people pay for what they actually ordered.

**Happy path**
1. Arif enters the total ৳1,200 and switches to "Split unequally".
2. Enters per-person amounts: 500, 400, 300, 0.
3. A running indicator shows "৳1,200 of ৳1,200 assigned" turning green.
4. Saves.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Shares sum to less than the total | Save disabled: "৳150 still unassigned." One-tap "Split the rest evenly". |
| 2 | Shares exceed the total | Save disabled: "৳50 over." |
| 3 | A share is negative | Rejected at input and by constraint. |
| 4 | A share is zero | Allowed — that person was present but owes nothing. No ledger entry is created for them. |
| 5 | Shares tampered with client-side to not sum | `SHARES_DO_NOT_SUM_TO_TOTAL`. The server re-validates; the client indicator is a convenience only. |

**Acceptance criteria**
- **Given** shares summing to anything other than the total, **when** submitted directly to the RPC, **then** `SHARES_DO_NOT_SUM_TO_TOTAL` is raised and nothing is written.

---

### B-03 — Record an expense paid by someone else · `MUST`

> **As** Arif, **I want** to record that Tania paid, **so that** the ledger is right even when she isn't entering it herself.

**Happy path**
1. Arif adds an expense and changes the payer to Tania.
2. Saves.
3. The expense shows "paid by Tania · added by Arif".
4. Tania is notified that an expense naming her as payer was recorded.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Payer is not a group member | `PAYER_NOT_A_MEMBER`. |
| 2 | Tania disagrees that she paid | She disputes it (D-11). No auto-reversal. |
| 3 | Both Arif and Tania record the same payment | Two expenses exist, double-counting. Detection is social; **mitigation is a duplicate warning**: on save, if a same-amount, same-payer expense exists within 10 minutes, warn "A similar expense was added 4 minutes ago — add anyway?" |

**Acceptance criteria**
- **Given** an expense where payer ≠ creator, **when** displayed, **then** both names appear with distinct labels.

---

### B-04 — See what I owe and am owed in a group · `MUST`

> **As** Sami, **I want** one clear number plus a per-person breakdown, **so that** I know who to pay.

**Happy path**
1. Sami opens the group.
2. A headline figure reads "You owe ৳540".
3. Below, a per-person list: "to Arif ৳300", "to Tania ৳240".

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Everything settled | "All settled" with a quiet confirmation, not "৳0.00". |
| 2 | Sami owes some people and is owed by others | Both shown, grouped under "You owe" and "You're owed". The headline is the net. |
| 3 | Rounding makes the per-person list differ from the headline by a poisha | Cannot occur — the headline is the sum of the same integers. Invariant **I1** covers it. |
| 4 | A member was deleted from the platform | Name renders as "(former member)". Balances remain intact. |

**Acceptance criteria**
- **Given** any state, **when** the dashboard renders, **then** the headline equals the sum of the per-person figures, exactly, in poisha.

---

### B-05 — Browse the full history · `MUST`

> **As** Nadia, **I want** to scroll everything that has happened, **so that** I can check nothing is missing.

**Happy path**
1. Nadia opens "History".
2. A reverse-chronological feed: expenses, transfers, settlements, voids, leader changes.
3. Each entry shows what, who, when, and how much.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Very long history | Paginated or infinite-scrolled. Never truncated silently. |
| 2 | A voided expense | Shown with strikethrough plus "Voided by Arif — wrong amount", or "Cancelled by agreement" where it went through a void proposal. Never hidden. |
| 3 | An invalidated proposal | Shown with a plain-language reason. |
| 4 | Two entries with identical timestamps | Ordered deterministically by `(created_at, id)` so the order never shifts between loads. |

**Acceptance criteria**
- **Given** a voided expense, **when** history renders, **then** both the original and its void are visible.

---

### B-06 — Correct an expense entered by mistake, outside a trip · `MUST`

> **As** Arif, **I want** to cancel a wrong expense with the agreement of the people it affects, **so that** the ledger reflects reality without anyone's balance changing behind their back.

**The rule.** Outside an active trip, **nobody can void unilaterally — not even the person who created the entry.** A void moves every participant's balance at once, so it needs unanimous agreement from the payer and everyone holding a share. Direct voiding exists only for trip leaders inside an active trip (D-07).

**Happy path**
1. Arif opens an expense he added with the wrong amount.
2. Taps "Propose cancelling this" and gives a reason ("typed 1200, was 1100").
3. A void proposal is created; Arif is auto-approved as proposer; everyone else in the split is notified.
4. Each of them approves.
5. On the last approval, the expense is cancelled: reversing entries are appended and the original is marked voided.
6. Arif enters the corrected expense as a new one.
7. History shows the original, the agreed cancellation with its reason, and the replacement.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | **Arif tries to void his own entry directly** | `NOT_AUTHORIZED_TO_VOID`. The UI offers "Propose cancelling this" instead. There is no author self-void. |
| 2 | No reason given | `VOID_REASON_REQUIRED`. An unexplained cancellation is indistinguishable from tampering. |
| 3 | Someone in the split declines | No cancellation. The expense stands. The disagreement is visible in history. |
| 4 | Someone never responds | The proposal expires. The expense stands. Arif can propose again. |
| 5 | Expense already voided | `ALREADY_VOIDED`. |
| 6 | A void is already pending on the same expense | `VOID_ALREADY_PROPOSED`. One at a time. |
| 7 | Arif is neither payer nor share-holder | `NOT_INVOLVED_IN_EXPENSE`. |
| 8 | A leader voids it directly while the proposal is pending | The proposal becomes `invalidated`: "This expense was already cancelled." |
| 9 | Expense belongs to a closed trip | Leader authority has lapsed. The void proposal is the only route. |
| 10 | Arif wants a quick fix and finds this heavy | Accepted cost. The alternative is a second exception to the consent rule, which makes the rule unmemorable. For high-tempo correction, use a trip. |

**Acceptance criteria**
- **Given** an expense with no trip, **when** its creator calls `void_expense`, **then** `NOT_AUTHORIZED_TO_VOID` is raised and nothing changes.
- **Given** a void proposal, **when** the last participant approves, **then** that expense contributes exactly zero to every balance (invariant **I8**).
- **Given** a completed void, **when** the original row is inspected, **then** it still exists with `voided_at` set — never deleted.
- **Given** one decline, **when** it lands, **then** the expense is unchanged and still counts.

---

### B-07 — Add an expense while offline · `COULD`

> **As** Arif, **I want** entry to survive a dead signal, **so that** I don't lose what I typed at a restaurant with no data.

**Happy path**
1. Arif enters an expense with no connectivity.
2. It is queued locally with a "Pending" badge.
3. On reconnection it submits automatically and the badge clears.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Server rejects on sync (member left, trip closed) | Item stays queued and marked "Needs attention" with the reason. Never discarded silently. |
| 2 | Arif closes the browser before sync | Queue persists in IndexedDB and resumes on next open. |
| 3 | Same expense queued on two devices | Both submit; the duplicate warning (B-03) fires on the second. |
| 4 | Queued against a trip that closes meanwhile | Fails with `TRIP_CLOSED`, surfaced for manual handling. |

**Acceptance criteria**
- **Given** a queued expense and restored connectivity, **when** sync runs, **then** exactly one expense is created.

---

### B-08 — Enter amounts in taka without thinking about poisha · `MUST`

> **As** any user, **I want** to type "1200" or "1200.50", **so that** I never think about internal units.

**Happy path**
1. User types `1200.50`.
2. Stored as `120050` poisha.
3. Displayed everywhere as `৳1,200.50`.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | More than two decimal places | Input accepts at most two. |
| 2 | Comma as decimal separator | Accepted and normalised. |
| 3 | Leading zeros or spaces | Trimmed silently. |
| 4 | Floating-point drift | Impossible: parsing goes string → integer poisha, never through a float. |

**Acceptance criteria**
- **Given** `0.1` and `0.2` entered as separate expenses, **when** summed, **then** the total is exactly 30 poisha.

---

## 6. Epic C — Consent-Based Transfers and Corrections

### C-01 — Propose transferring a debt · `MUST`

> **As** Arif, **I want** to propose that Sami's debt to me be redirected to Rafi, **so that** one payment settles two obligations.

**Happy path**
1. Arif sees Sami owes him ৳30 and he owes Rafi ৳20.
2. Taps "Transfer a debt".
3. Picks debtor Sami, creditor Rafi, amount ৳20.
4. A before/after panel shows: *Now — Sami owes you ৳30, you owe Rafi ৳20. After — Sami owes Rafi ৳20, Sami owes you ৳10.*
5. Sends. He is auto-approved; Sami and Rafi are notified.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Amount exceeds either leg | `DEBTOR_LEG_INSUFFICIENT` / `INTERMEDIARY_LEG_INSUFFICIENT`. The slider caps at the lesser leg, so this is only reachable by direct API use. |
| 2 | Arif is not one of the three parties | `PROPOSER_NOT_INVOLVED`. |
| 3 | Any two parties are the same person | `PARTIES_MUST_BE_DISTINCT`. |
| 4 | A party is not a group member | `ALL_PARTIES_MUST_BE_MEMBERS`. |
| 5 | A leg is settled between form load and submit | Validated at creation; fails cleanly with a refreshed view. |
| 6 | Arif proposes two transfers spending the same debt | Both may be created. The **second to reach full approval** becomes `invalidated`. Documented, not prevented — failing at approval is acceptable; double-spending is not. |

**Acceptance criteria**
- **Given** legs of ৳30 and ৳20, **when** Arif attempts ৳25, **then** it is refused and no proposal exists.
- **Given** a valid proposal, **when** created, **then** three `proposal_participants` rows exist with the proposer `approved` and the others `pending`.

---

### C-02 — Approve a transfer · `MUST`

> **As** Rafi, **I want** to approve a transfer that affects me, **so that** the change only happens with my agreement.

**Happy path**
1. Rafi gets a notification and opens his inbox.
2. Sees the proposal in plain language with a before/after.
3. Taps Approve.
4. Status shows "Waiting for Sami".
5. When Sami approves, all three see the ledger update.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Rafi already responded | `NOT_A_PENDING_PARTICIPANT`. UI shows his recorded decision. |
| 2 | Proposal expired | Returns `expired`. "This expired before everyone responded." |
| 3 | Proposal already rejected by someone else | Shown as rejected; no approve control. |
| 4 | **Underlying debt changed before the last approval** | Proposal becomes `invalidated`: "This is no longer possible because the underlying debt changed since it was proposed." |
| 5 | Rafi taps Approve twice rapidly | Second call raises `NOT_A_PENDING_PARTICIPANT`. One decision recorded. |
| 6 | Rafi and Sami approve at the same instant | Advisory lock serialises them. Exactly one commits the ledger entries. |
| 7 | Rafi is not a participant at all | `NOT_A_PENDING_PARTICIPANT`, even via direct API. |

**Acceptance criteria**
- **Given** the final approval, **when** it commits, **then** exactly three `ledger_entries` are written in one transaction.
- **Given** simultaneous final approvals of two proposals on the same debt, **when** both resolve, **then** exactly one is `approved` and the other `invalidated`.

---

### C-03 — Reject a transfer · `MUST`

> **As** Rafi, **I want** to decline without explaining myself, **so that** I keep the right to choose who owes me.

**Happy path**
1. Rafi opens the proposal and taps Decline.
2. An optional reason field — he leaves it blank.
3. The proposal is immediately rejected. All parties are notified. No balance changes.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Rafi declines after others approved | Still rejected. There is no majority rule. |
| 2 | Arif re-proposes identically | Allowed — a new proposal. Rate-limited to prevent nagging (H-06). |
| 3 | Rafi wants to reverse his rejection | Not possible. Rejection is terminal. "Ask for a new proposal." |

**Acceptance criteria**
- **Given** one rejection among three participants, **when** it lands, **then** status is `rejected` and no `ledger_entries` were written.

---

### C-04 — See proposals awaiting me · `MUST`

> **As** Sami, **I want** one inbox of things needing my decision, **so that** nothing waits on me unnoticed.

**Happy path**
1. A badge shows a count.
2. The inbox lists pending items with group, amount, who is waiting, and time remaining.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Nothing pending | "Nothing needs you right now." |
| 2 | An item expires while open | Live update to expired; approve control disappears. |
| 3 | Another party approves while Sami watches | Approval state updates live via Realtime. |
| 4 | Realtime connection drops | Falls back to refresh-on-focus. Realtime is never a correctness dependency. |

---

### C-05 — Withdraw my own proposal · `SHOULD`

> **As** Arif, **I want** to cancel a proposal I sent in error, **so that** nobody acts on it.

**Happy path**
1. Arif opens his sent proposal and taps Withdraw.
2. Status becomes cancelled; participants are notified.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Someone else tries to withdraw it | `CANNOT_CANCEL` — only the proposer. |
| 2 | Already resolved | `CANNOT_CANCEL`. |
| 3 | Withdrawal races the final approval | Advisory lock serialises. Either fully approved or fully cancelled — never half. |

---

### C-06 — Proposals expire on their own · `MUST`

> **As** any user, **I want** stale proposals to lapse, **so that** my inbox isn't full of dead items.

**Happy path**
1. A proposal sits unresolved past its window.
2. A scheduled sweep marks it `expired`.
3. It leaves the inbox and appears in history with its reason.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Someone approves at the moment of expiry | The approval checks `expires_at` under the lock and returns `expired`. No entries written. |
| 2 | The sweep job fails to run | Approval-time expiry check is the backstop. Expiry is enforced in two places by design. |

**Acceptance criteria**
- **Given** an expired pending proposal, **when** anyone attempts approval, **then** it returns `expired` and writes nothing.

---

### C-07 — Agree a correction to a standing balance · `MUST`

> **As** Nadia, **I want** a balance changed only with the other person's agreement, **so that** nobody can quietly reduce what they owe me.

**Happy path**
1. Nadia opens her balance with Sami and taps "Propose a correction".
2. Enters the new figure and a reason.
3. Sami is notified, reviews, and approves.
4. A compensating entry is appended.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Sami declines | No change. The disagreement is visible in history. |
| 2 | Nadia attempts a direct balance edit via the console | No update policy exists on `ledger_entries`. Refused. |
| 3 | A decrease exceeds the current balance | `invalidated` at commit with a plain reason. |
| 4 | The balance changes before Sami approves | Re-validated at commit; `invalidated` if no longer applicable. |

**Acceptance criteria**
- **Given** an amendment, **when** it commits, **then** a new entry is appended and no existing row is modified.

---

### C-08 — Approve cancelling an expense I'm part of · `MUST`

> **As** Sami, **I want** to agree before an expense I'm charged for is cancelled, **so that** my balance never moves without me knowing — in either direction.

**Why approval is needed to *remove* a charge.** Cancelling is not always in the charged person's favour. If Sami already paid Arif for that dinner, voiding it leaves Arif owing Sami. And an expense disappearing silently is exactly as alarming as one appearing silently. Both directions need agreement.

**Happy path**
1. Sami is notified: "Arif wants to cancel Dinner ৳1,200 — reason: typed 1200, was 1100."
2. He opens it and sees the expense, the reason, and what his balance becomes if it goes through.
3. He approves.
4. When everyone in the split has approved, the expense is cancelled and all balances update together.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Sami declines | The expense stands. Everyone is notified. Arif can propose again with a better reason, or raise a dispute. |
| 2 | Sami ignores it | It expires. The expense stands. |
| 3 | Sami isn't in the split | He is not a participant and never sees it. |
| 4 | Sami approves after a leader already voided it directly | `invalidated`: "This expense was already cancelled." |
| 5 | Sami's balance with others would flip direction | Shown explicitly in the preview before he approves: "Arif would owe you ৳275." |
| 6 | Many people in the split | All must approve. A fifteen-person expense needs fifteen approvals — which is precisely why high-tempo correction belongs inside a trip, where leaders handle it. |

**Acceptance criteria**
- **Given** a void proposal, **when** any participant declines, **then** status is `rejected` and the expense still counts in every balance.
- **Given** full approval, **when** it commits, **then** the mirrored entries and the `voided_at` marking happen in one transaction.

---

## 7. Epic D — Trips and Leaders

### D-01 — Create a trip with leaders · `MUST`

> **As** Arif, **I want** to start a trip and name two co-leaders, **so that** a few trusted people can record everything quickly.

**Happy path**
1. Arif taps "New trip" in the group.
2. Names it "Sylhet Tour".
3. Selects the roster — 15 members.
4. Selects Tania and Nabil as additional leaders; he is automatically one.
5. Leaves entry mode as "Leaders only".
6. Creates. The trip dashboard opens.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | A proposed leader is not on the roster | They are added to the roster automatically, or the selection is refused with an explanation. Never silently dropped. |
| 2 | A proposed leader is not a group member | `LEADER_MUST_BE_GROUP_MEMBER`. |
| 3 | No extra leaders chosen | Valid — Arif is sole leader. A warning suggests a second: "If only you can record, nothing gets recorded while you're busy." |
| 4 | Many leaders chosen | Allowed, with a caution that every leader can change balances without approval. |
| 5 | Empty roster | Refused: "Add at least two people." |
| 6 | Duplicate trip name | Allowed. Distinguished by date. |

**Acceptance criteria**
- **Given** trip creation, **when** it completes, **then** the creator is in `trip_leaders` and a `trip_leader_log` row exists for every initial leader.
- **Given** any trip, **when** inspected, **then** it has at least one leader.

---

### D-02 — Record a trip expense as a leader · `MUST`

> **As** Tania, **I want** to record a fare in seconds while standing in the street, **so that** it's captured before I forget.

**Happy path**
1. Tania taps the trip's floating add button.
2. The keypad is already focused; she types `100`.
3. The roster is pre-selected; payer defaults to her — she switches it to Arif.
4. Types "Auto rickshaw".
5. Saves. Under ten seconds, four taps.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Tania is not a leader and mode is `leaders_only` | `LEADERS_ONLY_TRIP`. The UI shows a note naming the leaders instead of a dead button. |
| 2 | Trip already closed | `TRIP_CLOSED`. "This trip is closed. Reopen it or add to the group instead." |
| 3 | No signal | Queued locally (B-07). |
| 4 | Wrong trip selected | Void and re-enter (B-06). Entries cannot be moved between trips — that would rewrite history. |
| 5 | Two leaders record the same fare | Both saved; duplicate warning fires on the second. Resolution is a void. |

**Acceptance criteria**
- **Given** `leaders_only`, **when** a non-leader calls `add_expense` with that `trip_id`, **then** `LEADERS_ONLY_TRIP` is raised.
- **Given** a trip expense, **when** written, **then** every resulting `ledger_entries` row carries that `trip_id`.

---

### D-03 — Split a cost between a subset of the trip · `MUST`

> **As** Arif, **I want** to charge a second vehicle to only the three who rode it, **so that** people aren't billed for things they didn't do.

**Happy path**
1. Arif adds an expense of ৳100.
2. Taps "Everyone" to clear, then selects Sami, Nadia and himself.
3. The preview shows ৳33.34 / ৳33.33 / ৳33.33.
4. Saves. The other twelve are unaffected.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Only one person selected | Refused: at least two participants. |
| 2 | Someone not on the trip roster is needed | Allowed if they are a group member — the roster is a default, not a restriction. |
| 3 | The same subset recurs | After the second use, offer "Save this group of people?" with a name. |
| 4 | The 3-way split leaves a poisha | Fixed-order assignment, shown in the preview before saving. |

**Acceptance criteria**
- **Given** a 3-of-15 expense, **when** saved, **then** exactly two `ledger_entries` are created and twelve members' balances are unchanged.

---

### D-04 — Reuse a saved participant preset · `SHOULD`

> **As** Arif, **I want** one tap for "the fort group", **so that** I'm not reselecting three people all day.

**Happy path**
1. Arif opens the add form.
2. Preset chips appear above the participant list: "Everyone", "Fort group", "Dinner crew".
3. Taps "Fort group"; three people are selected.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | A preset member has left the group | They are omitted and a note appears: "Nabil is no longer in this group." |
| 2 | Many presets | Show the three most recently used; the rest behind "More". |
| 3 | Deleting a preset | Allowed by anyone on the trip. Affects no past expense. |

---

### D-05 — Appoint an additional leader mid-trip · `SHOULD`

> **As** Arif, **I want** to add Nadia as a leader, **so that** recording continues while Tania and I are busy.

**Happy path**
1. Arif opens trip leaders and taps "Add leader".
2. Picks Nadia from the roster.
3. She is a leader immediately and is notified. The change is logged.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | A non-leader attempts it | `NOT_A_TRIP_LEADER` — enforced in the database. |
| 2 | Nadia is already a leader | No-op, no error. |
| 3 | Nadia is not a group member | `LEADER_MUST_BE_GROUP_MEMBER`. |
| 4 | Attempted on a closed trip | `NOT_A_TRIP_LEADER` — authority has lapsed for everyone. |
| 5 | **A member inserts themselves into `trip_leaders` via the console** | **Refused.** No insert policy exists. This is the privilege-escalation test (H-03). |

**Acceptance criteria**
- **Given** a non-leader calling `add_trip_leader`, **when** executed, **then** `NOT_A_TRIP_LEADER` is raised.
- **Given** any `trip_leaders` row, **when** audited, **then** a matching `trip_leader_log` row exists (invariant **I10**).

---

### D-06 — Remove a leader · `SHOULD`

> **As** Arif, **I want** to remove a leader, **so that** authority matches who is actually organising.

**Happy path**
1. Arif opens trip leaders and removes Nabil.
2. Nabil loses leader powers immediately; the removal is logged.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Removing the last leader | `CANNOT_REMOVE_LAST_LEADER`. "A trip needs at least one leader." |
| 2 | Two removals race, leaving zero | Advisory lock serialises; the second is refused. Never leaderless. |
| 3 | A leader removes themselves | Allowed, if others remain. |
| 4 | Nabil has an action in flight | It completes or fails cleanly. No half-written ledger state. |

**Acceptance criteria**
- **Given** one leader, **when** removal is attempted, **then** it is refused and the leader remains.

---

### D-07 — Correct another member's entry as a leader · `MUST`

> **As** Arif, **I want** to fix a wrong entry immediately, **so that** the trip ledger stays accurate without chasing anyone for approval.

**Happy path**
1. Arif spots a ৳1,200 dinner that should have been ৳1,100.
2. Opens it, taps "Void and re-enter", reason "wrong amount".
3. Enters the corrected expense.
4. Everyone affected is notified. History shows all three events.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Arif is not a leader of that trip | `NOT_AUTHORIZED_TO_VOID`, even if he authored the entry. Route to a void proposal (B-06). |
| 2 | The expense has no trip | Leader authority does not apply at all. Void proposal only (B-06). |
| 3 | The trip is closed | Authority has lapsed. Void proposal only. |
| 4 | No reason given | `VOID_REASON_REQUIRED`. |
| 5 | **Arif tries to edit rather than void** | No such path exists. `UPDATE` on `ledger_entries` raises at the trigger. History is never rewritten, by anyone. |

**Acceptance criteria**
- **Given** a leader void, **when** balances recompute, **then** the voided expense contributes exactly zero (**I8**).
- **Given** any leader action, **when** audited, **then** the actor was a leader of an `active` trip at write time (**I9**).

---

### D-08 — Record a repayment as a leader · `MUST`

> **As** Tania, **I want** to note that Sami handed Arif ৳500 in cash, **so that** the ledger matches reality without both of them tapping approve.

**Happy path**
1. Tania opens the trip and taps "Record a payment".
2. Selects Sami → Arif, amount ৳500.
3. Saves. Balances update immediately; both are notified.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | **Amount exceeds what this trip created** | `EXCEEDS_TRIP_BALANCE`. Leader authority cannot reach debts from outside the trip. This boundary is the point. |
| 2 | Tania is not a leader | `NOT_A_TRIP_LEADER`. |
| 3 | Trip is closed | Refused. Use the two-sided settlement flow (F-02). |
| 4 | Debtor and creditor are the same | `PARTIES_MUST_DIFFER`. |
| 5 | Sami says he never paid | He disputes it (D-11). Visible, not auto-reversed. |
| 6 | Tania records it twice | Second may exceed the trip balance and be refused; otherwise a duplicate warning fires. |

**Acceptance criteria**
- **Given** a trip balance of ৳500, **when** a leader records ৳600, **then** `EXCEEDS_TRIP_BALANCE` is raised and nothing is written.
- **Given** a leader settlement, **when** written, **then** a `proposals` row exists with status `approved` and a resolution naming the leader.

---

### D-09 — See the running trip total · `SHOULD`

> **As** Arif, **I want** to see what the trip has cost so far, **so that** mistakes are noticed now rather than at settlement.

**Happy path**
1. The trip dashboard shows total spent, a per-person net list, and recent entries.
2. It updates as entries are added.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | No expenses yet | "Nothing recorded yet" with a prominent add button. |
| 2 | Voided entries | Excluded from the total; visible in the feed as struck through. |
| 3 | Another leader adds while Arif watches | Updates live via Realtime; falls back to refresh-on-focus. |

---

### D-10 — Close a trip · `MUST`

> **As** Arif, **I want** to close the trip, **so that** we move to settling up and nobody keeps adding to it.

**Happy path**
1. Arif taps "Close trip".
2. A summary shows what each person owes and the suggested payments.
3. He confirms. The trip moves to Closed.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Balances are outstanding | **Closing is still allowed.** Debts survive as ordinary group debts. Closing ends leader authority; it does not demand settlement. |
| 2 | A correction is needed afterwards | Normal consent path. Shown clearly: "This trip is closed — corrections now need both people to agree." |
| 3 | Someone adds an expense during closing | Serialised; either included before close or refused with `TRIP_CLOSED`. |
| 4 | Reopening | Possible by a former leader, logged, and notified to the roster. Never silent. |
| 5 | A non-leader closes it | Refused. |

**Acceptance criteria**
- **Given** a closed trip, **when** `is_trip_leader` is called for any former leader, **then** it returns false.
- **Given** a closed trip, **when** a leader action is attempted, **then** it is refused.

---

### D-11 — Dispute an entry I believe is wrong · `SHOULD`

> **As** Sami, **I want** to flag an entry, **so that** I can object without being able to change other people's records myself.

**Happy path**
1. Sami opens an expense and taps "This doesn't look right".
2. Types a reason: "I didn't eat at this dinner".
3. Submits. The entry is marked disputed; leaders are notified. **No balance changes.**
4. Arif reviews, agrees, voids and re-enters.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Sami expects an automatic reversal | It does not happen, and the UI says so: "Flagged for the trip leaders to review." Auto-reversal would hand every member the unilateral power leaders were given deliberately. |
| 2 | Sami disputes the same entry twice | Updates the existing dispute rather than creating a second. |
| 3 | Leaders ignore it | It stays open and visible in the derivation indefinitely. Social pressure is the mechanism. |
| 4 | Sami withdraws it | Allowed; status becomes withdrawn, history retained. |
| 5 | A non-member disputes | `NOT_A_MEMBER`. |

**Acceptance criteria**
- **Given** a dispute, **when** balances are recomputed, **then** they are unchanged.

---

### D-12 — Know who holds authority on a trip · `MUST`

> **As** Sami, **I want** to see who the leaders are, **so that** I know who can change my balance and who to ask.

**Happy path**
1. The trip dashboard names the leaders prominently.
2. A badge appears beside their names throughout the trip UI.
3. Entries show "added by Tania (trip leader)".

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Sami doesn't understand what a leader can do | A one-tap explainer: what leaders can and cannot do, including that they cannot transfer debts. |
| 2 | Leadership changed since Sami last looked | The appointment log is viewable by any member. |
| 3 | Sami objects to who holds it | Social matter. The app guarantees visibility, not veto. |

---

## 8. Epic E — Transparency and Explanation

### E-01 — Understand why I owe a specific amount · `MUST`

> **As** Nadia, **I want** to expand any balance into its causes, **so that** I can verify it before paying.

**Happy path**
1. Nadia sees "You owe Arif ৳847".
2. Taps "Why?".
3. A chronological derivation appears: every contributing entry with date, cause, amount and running total.
4. The final running total reads ৳847, matching the headline.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Very long history | Paginated with the running total always correct at each page boundary. |
| 2 | **Final running total disagrees with the headline** | A visible warning is shown and the mismatch is logged. This indicates a real engine bug; it is never hidden (invariant **I6**). |
| 3 | An entry references a departed member | Name renders as "(former member)". The amount remains. |
| 4 | Nadia requests a derivation for a group she is not in | `NOT_A_MEMBER`. A read-only function is not a public function. |
| 5 | Entries share a timestamp | Deterministically ordered so the derivation never reshuffles between views. |

**Acceptance criteria**
- **Given** any pair, **when** the derivation is computed, **then** its final running total equals `net_owed()` exactly.
- **Given** a non-member, **when** `explain_balance` is called, **then** no financial data is returned.

---

### E-02 — Understand an odd single-poisha difference · `MUST`

> **As** Nadia, **I want** to know why my share is one poisha more, **so that** I don't suspect manipulation.

**Happy path**
1. Nadia sees her share is ৳33.34 while others paid ৳33.33.
2. The derivation states: *"৳100 split 3 ways — you were charged ৳33.34, one poisha more than the others, because remainders are assigned in a fixed order."*

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Nadia thinks it's unfair | The explanation notes the order is fixed and repeatable, not random or targeted. |
| 2 | An uneven split from an unequal entry, not rounding | The note distinguishes "entered by hand" from "rounding remainder". |

---

### E-03 — Trace a leader's action · `MUST`

> **As** Sami, **I want** leader actions clearly attributed, **so that** I can see who changed what.

**Happy path**
1. Sami opens a derivation.
2. An entry reads: *"Dinner — ৳1,100 paid by Arif, split 5 ways, share ৳220 · added by Tania (trip leader)"*.
3. A voided entry reads: *"Voided by Arif — wrong amount"*.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | The actor is no longer a leader | Shows their role **at the time of the action**, not now. |
| 2 | The actor has left the group | "(former member)" with the role preserved. |

**Acceptance criteria**
- **Given** a leader-created entry, **when** the derivation renders, **then** the actor and their role at write time are shown.

---

### E-04 — Explain one trip only · `SHOULD`

> **As** Nadia, **I want** to see just the Sylhet trip's contribution, **so that** I can check it separately from everything else.

**Happy path**
1. From the trip dashboard she taps "Why?" on her trip balance.
2. The derivation is filtered to that trip's entries.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | No entries between her and the other person on this trip | "Nothing on this trip between you two." |
| 2 | She expects trip + group totals to be the same | A note clarifies she is viewing one trip; a link switches to the full view. |

---

### E-05 — Export my history · `COULD`

> **As** Nadia, **I want** to download the record, **so that** I have a copy independent of the app.

**Happy path**
1. Nadia taps "Export" and chooses CSV.
2. Receives a file with every entry visible to her, with causes.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Very large history | Generated server-side and delivered as a link rather than blocking the UI. |
| 2 | She requests another member's view | Only her own visible data is exportable. |

---

## 9. Epic F — Settlement

### F-01 — See the simplest way to settle · `MUST`

> **As** Arif, **I want** the minimum set of payments, **so that** fifteen people aren't making forty transfers.

**Happy path**
1. Arif opens "Settle up".
2. A short list: "Sami pays Arif ৳530", "Nadia pays Tania ৳210".
3. Each has a "Record this payment" action.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Everyone settled | "Everyone's square." |
| 2 | The suggestion pairs people who don't know each other | Suggestions are advisory. Anyone can record a different payment instead. |
| 3 | Balances change while the screen is open | Recomputed on focus; stale suggestions are never actionable. |
| 4 | A perfectly minimal set is not found | Acceptable and documented — the greedy result is optimal or near-optimal at these sizes. Amounts are always exact; only the grouping is heuristic. |

**Acceptance criteria**
- **Given** n members with non-zero balances, **when** suggestions are computed, **then** there are at most n−1 payments and applying all of them zeroes every balance.

---

### F-02 — Record that I paid someone · `MUST`

> **As** Sami, **I want** to mark a debt paid, **so that** it stops appearing.

**Happy path**
1. Sami taps "Record this payment" on "You pay Arif ৳530".
2. Confirms. Arif is asked to confirm receipt.
3. On Arif's confirmation, the balance clears.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Arif doesn't confirm | The debt stays. The pending claim is visible to both. One-sided settlement is never applied. |
| 2 | Arif declines | Rejected; the debt remains; both see the disagreement. |
| 3 | Sami paid less than the full amount | Partial amounts allowed. |
| 4 | Sami pays more than he owes | `invalidated` at commit, or the input caps at the balance. |
| 5 | The balance changes before Arif confirms | Re-validated; `invalidated` with a plain reason. |
| 6 | Both record the same payment | The second finds insufficient balance and is `invalidated`. |

**Acceptance criteria**
- **Given** an unconfirmed settlement, **when** balances are computed, **then** they are unchanged.

---

### F-03 — Settle a trip at the end · `SHOULD`

> **As** Arif, **I want** trip-scoped settlement suggestions, **so that** we square the trip without touching older debts.

**Happy path**
1. On closing, suggestions are computed from that trip's entries only.
2. Each can be recorded by a leader (D-08) or through the two-sided flow.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | People also owe each other from before | Clearly labelled "from this trip". A link shows the full position. |
| 2 | Some settle, some don't | Partial settlement is normal. Remaining debts persist as group debts. |

---

### F-04 — Open bKash with the amount prefilled · `COULD`

> **As** Sami, **I want** a shortcut into my payment app, **so that** I don't retype amounts.

**Happy path**
1. Sami taps "Pay with bKash" on a suggested payment.
2. bKash opens with the amount prefilled.
3. He returns and records the payment (F-02).

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | bKash not installed | The control is hidden or falls back to copying the amount. |
| 2 | Deep link fails | A copyable amount and recipient are shown instead. |
| 3 | Sami assumes tapping it records the payment | The app never assumes payment. He must still record it; the UI makes this explicit. |

---

### F-05 — Settle everything with one person at once · `SHOULD`

> **As** Sami, **I want** to clear my whole balance with Arif in one action, **so that** I'm not recording six separate payments.

**Happy path**
1. Sami opens his balance with Arif and taps "Settle all — ৳847".
2. Arif confirms. All of it clears in one entry.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | The balance changes before Arif confirms | Re-validated at commit; `invalidated` if it no longer matches. |
| 2 | Sami wants to settle part | Partial amounts supported. |

---

## 10. Epic G — Notifications and Awareness

### G-01 — Be told when something needs my decision · `MUST`

> **As** Rafi, **I want** to know a proposal is waiting, **so that** I don't block others unknowingly.

**Happy path**
1. A transfer naming Rafi is created.
2. He gets a push notification (Android) or sees an inbox badge.
3. Tapping it opens the proposal.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | **iOS without "Add to Home Screen"** | No push is possible. The inbox badge and email fallback cover it. Known platform limit, documented. |
| 2 | Push permission denied | Badge plus email. Never a nag loop. |
| 3 | Push delivery fails | Badge is authoritative; push is a convenience, never the only channel. |
| 4 | Many notifications at once | Batched: "3 things need your decision." |

---

### G-02 — Be told when my balance changes · `MUST`

> **As** Sami, **I want** to know when I've been added to an expense, **so that** nothing appears silently.

**Happy path**
1. A leader records a ৳200 share for Sami.
2. He is notified: "Tania added you to Dinner — your share ৳200."
3. Tapping opens the entry, with the dispute action available.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Many entries during a busy trip | Batched hourly: "6 new expenses on Sylhet Tour — your share ৳1,240." |
| 2 | Sami mutes trip notifications | Allowed. The trip dashboard still shows everything. Muting never suppresses proposals needing his decision. |
| 3 | Notification arrives for a later-voided entry | A follow-up notes the void. |

---

### G-03 — Be told when a proposal resolves · `SHOULD`

> **As** Arif, **I want** to know the outcome, **so that** I know whether to act.

**Happy path**
1. The last participant approves.
2. All three are notified: "Transfer approved — Sami now owes Rafi ৳20."

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Rejected | All notified, no reason disclosed unless given. |
| 2 | Invalidated | Notified with a plain-language cause, not a status code. |
| 3 | Expired | A single quiet notification. |

---

### G-04 — Control what reaches me · `COULD`

> **As** Sami, **I want** to tune notifications, **so that** a busy trip doesn't flood my phone.

**Happy path**
1. Sami opens settings and sets trip expenses to "Daily summary".
2. Proposals stay immediate.

**Unhappy paths**

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | Sami mutes everything | Allowed, with a warning that he may block others by not responding. Proposals still appear in the inbox. |
| 2 | Email bounces | Logged; in-app remains authoritative. |

---

## 11. Epic H — Abuse, Attack and Misuse

> These stories are written from the attacker's perspective deliberately. Each must **fail**. They correspond to the acceptance tests in `DEVELOPMENT_PLAN.md` Section 12.7.

### H-01 — A user tries to write the ledger directly · `MUST FAIL`

> **As** a technically capable user, **I want** to insert a ledger entry from the browser console, **so that** I can make someone owe me money.

**Expected:** `new row violates row-level security policy`. No `INSERT`, `UPDATE` or `DELETE` policy exists on `ledger_entries`. The attempt is logged server-side.

**Variants that must also fail:** updating an existing entry; deleting one; inserting via a crafted RPC payload; replaying a captured request with a modified body.

---

### H-02 — A user tries to approve on someone else's behalf · `MUST FAIL`

> **As** an impatient proposer, **I want** to approve as the other parties, **so that** my transfer goes through.

**Expected:** `NOT_A_PENDING_PARTICIPANT`. Identity comes from `auth.uid()`, never from a parameter. Forging it would require the project's JWT secret.

**Variants:** directly updating `proposal_participants`; passing another user's id to the RPC; replaying another user's captured request (signature invalid).

---

### H-03 — A member tries to make themselves a trip leader · `MUST FAIL`

> **As** an ordinary member, **I want** to insert myself into `trip_leaders`, **so that** I can change balances without approval.

**Expected:** refused — `trip_leaders` has no insert policy. Only `add_trip_leader()` writes it, and only an existing leader may call it.

**Why this is the most important test in the document:** leadership is the one privilege in the system that permits unconsented writes. If it can be self-granted, every guarantee in Section 12.8 collapses.

---

### H-04 — A leader tries to act outside their trip · `MUST FAIL`

> **As** a trip leader, **I want** to settle a debt that has nothing to do with my trip, **so that** I can clear something inconvenient.

**Expected:** `EXCEEDS_TRIP_BALANCE`. Leader settlement is bounded by what that trip created.

**Variants:** acting after the trip closes (`NOT_A_TRIP_LEADER`); voiding an expense from another trip, or one with no trip, or one the attacker authored themselves (`NOT_AUTHORIZED_TO_VOID` in every case); attempting a debt transfer (no leader path exists).

---

### H-05 — A user tries to read another group's data · `MUST FAIL`

> **As** a curious user, **I want** to query another group's expenses, **so that** I can see what they spend.

**Expected:** empty result. RLS scopes every read to group membership. `explain_balance` raises `NOT_A_MEMBER` rather than returning anything.

**Variants:** querying by guessed group id; calling `trip_net_positions` for a foreign trip; resolving a profile of someone sharing no group.

---

### H-06 — A user floods the group with proposals · `SHOULD FAIL`

> **As** a pushy member, **I want** to re-send a rejected transfer repeatedly, **so that** the other person gives in.

**Expected:** rate-limited per user per group. Beyond the limit: "You've sent several proposals recently. Give it some time." Repeated identical proposals to the same party after rejection are flagged to the group.

**Note:** this is a social problem with a technical mitigation. The limit exists to prevent harassment through notification volume, not to prevent legitimate re-proposal.

---

### H-07 — A leader quietly misstates balances · `PARTIALLY MITIGATED — ACCEPTED RISK`

> **As** a dishonest trip leader, **I want** to record expenses that inflate what others owe me, **so that** I profit.

**Expected: this is possible.** It is the accepted residual risk of the trust model (Section 12.8). The system does not prevent it. It ensures it cannot be done invisibly:

| Mitigation | Effect |
|---|---|
| Attribution | Every entry names its creator. |
| Notification | Every affected member is told their balance moved. |
| Derivation | Every figure traces to its causes, on demand. |
| Immutability | Nothing can be erased; voids are themselves visible. |
| Scope | Confined to one trip, lapsing on close. |
| Dispute | Any member can flag publicly. |

**Design position:** the threat model for a friend-group ledger is honest mistakes and forgetfulness, not fraud. Defending against a malicious leader by requiring consent would reintroduce exactly the coordination problem the leader model exists to solve. Visibility is the correct defence, and it is the one the group can actually act on.

---

## 12. Cross-Cutting Unhappy Paths

These apply to **every** story and should be implemented once, centrally, rather than per screen.

### 12.1 Network and connectivity

| Situation | Expected behaviour |
|---|---|
| Request times out | Retry with backoff, up to three attempts, then a clear error with a manual retry. |
| Request succeeds but the response is lost | **Every write RPC must be safe to retry.** Either naturally idempotent, or guarded by a client-generated request id. A retried approval must not double-apply. |
| Offline on load | Cached shell plus last-known data with a clear "saved data" banner. |
| Connection restored | Queued writes flush; views refresh. |
| Slow connection | Skeletons, never a spinner with no context. Never a transient `0` on a money figure. |

### 12.2 Authentication

| Situation | Expected behaviour |
|---|---|
| Token expires mid-action | Silent refresh, then the action proceeds. If refresh fails, sign-in preserving intent. |
| Signed in on two devices | Both work. Changes appear on the other via Realtime or on focus. |
| Signed out in another tab | Current tab detects it and returns to sign-in without losing unsaved input. |

### 12.3 Concurrency

| Situation | Expected behaviour |
|---|---|
| Two writes to the same group at once | Serialised by the per-group advisory lock. Both succeed, in some order, or one fails cleanly. |
| A read during a write | Reads are never blocked; they see pre- or post-transaction state, never a partial one. |
| A proposal resolves while being viewed | View updates live; stale controls are removed before they can be tapped. |

### 12.4 Data integrity

| Situation | Expected behaviour |
|---|---|
| Any balance appears wrong | Invariants I1–I10 are continuously testable. The derivation is the user-facing check. |
| An entry references a departed member | Renders as "(former member)". Balances are never silently dropped. |
| Clock skew between client and server | All timestamps are server-generated. The client never supplies one. |

### 12.5 Mobile and platform

| Situation | Expected behaviour |
|---|---|
| Small screen (360px) | Fully usable. No horizontal scroll anywhere. |
| On-screen keyboard covers the form | The focused field scrolls into view; the save control stays reachable. |
| Browser back during a multi-step flow | Returns a step, never losing entered data. |
| Page refreshed mid-entry | Draft restored from local storage where available. |
| Opened on desktop | Centered column. Every feature available. |
| Added to home screen | Launches standalone, no browser chrome. |

---

## 13. Traceability Matrix

| Epic | Plan section | Key invariants | Security tests |
|---|---|---|---|
| A — Accounts and Groups | §5 F1, §8.2, §11.7 | — | 4, 5 |
| B — Expenses and Balances | §5 F1, §9.2, §11.2 | I1, I2, I8 | 1, 3, 6, 11, 11b |
| C — Consent-Based Transfers and Corrections | §5 F2/F2b, §10, §11.3–11.4 | I3, I4, I5 | 2, 5, 11, 11b |
| D — Trips and Leaders | §5 F4, §11.6, §12.8 | I7, I8, I9, I10 | 8, 9, 10, 11, 12 |
| E — Transparency | §5 F4.5, §11.5 | I6 | 7 |
| F — Settlement | §5 F3/F2b, §9.3 | I1, I5 | — |
| G — Notifications | §6, §13.3 | — | — |
| H — Abuse and Attack | §12 (all) | I9, I10 | 1–12 |

### Priority summary

| Priority | Count | Meaning |
|---|---|---|
| `MUST` | 32 | The app is not usable without these. |
| `SHOULD` | 15 | Expected before real-world use. |
| `COULD` | 8 | Deferrable without harming correctness. |

---

*End of document.*
