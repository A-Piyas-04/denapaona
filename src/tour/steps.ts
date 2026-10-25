import type { Side } from 'driver.js';

/** Where a step lives.  `group` and `add` need a group picked earlier in the tour. */
export type TourPlace = 'groups' | 'group' | 'add' | 'inbox' | 'me';

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** CSS selector of the element to spotlight.  None means a centred modal. */
  element?: string;
  place?: TourPlace;
  /** The user acts: the step completes when the URL matches. */
  action?: RegExp;
  hint?: string;
  /** Shown instead of `body` when the element isn't on screen. */
  fallback?: string;
  side?: Side;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    place: 'groups',
    title: 'Welcome to HishebNama',
    body: 'A quick tour of the main features. It takes about two minutes, and you can skip it at any time.',
  },
  {
    id: 'open-group',
    place: 'groups',
    element: '[data-tour="group-row"]',
    title: 'Your groups',
    body: 'Each group shows your balance at a glance. Green means you’re owed, red means you owe.',
    action: /^\/groups\/[0-9a-f-]{36}$/,
    hint: 'Tap the group to open it',
    fallback: 'Create a group with the + button, or join one with an invite link.',
    side: 'bottom',
  },
  {
    id: 'balance',
    place: 'group',
    element: '[data-tour="balance-hero"]',
    title: 'Where you stand',
    body: 'Your total in this group. Tap “Why?” any time to see every step behind the number.',
    side: 'bottom',
  },
  {
    id: 'add-expense',
    place: 'group',
    element: '[data-tour="add-expense"]',
    title: 'Add an expense',
    body: 'Record what someone paid. The amount and a description are all you need.',
    action: /^\/groups\/[0-9a-f-]{36}\/add$/,
    hint: 'Tap Add expense to try it',
    side: 'top',
  },
  {
    id: 'split',
    place: 'add',
    element: '[data-tour="split-row"]',
    title: 'Who paid, and how to split',
    body: 'It defaults to you paying, split equally. Tap here to change people or enter shares by hand.',
    side: 'top',
  },
  {
    id: 'actions',
    place: 'group',
    element: '[data-tour="group-actions"]',
    title: 'Settle and transfer',
    body: 'Settle up shows the fewest payments to clear everyone. Transfer passes a debt along, if everyone agrees.',
    side: 'bottom',
  },
  {
    id: 'inbox',
    element: '[data-tour="nav-inbox"]',
    title: 'Your inbox',
    body: 'Payments, transfers and corrections that need your OK arrive here.',
    action: /^\/proposals$/,
    hint: 'Tap Inbox to open it',
    side: 'top',
  },
  {
    id: 'proposal',
    place: 'inbox',
    element: '[data-tour="proposal-card"]',
    title: 'Nothing changes without you',
    body: 'Open a request to approve or decline it. One “no” is enough to stop it.',
    fallback: 'When someone asks you to approve a change, it shows up here. Nothing changes without your OK.',
    side: 'bottom',
  },
  {
    id: 'me',
    element: '[data-tour="nav-me"]',
    title: 'Your profile',
    body: 'Your name, language and settings live here.',
    action: /^\/me$/,
    hint: 'Tap Me to open it',
    side: 'top',
  },
  {
    id: 'replay',
    place: 'me',
    element: '[data-tour="replay-tour"]',
    title: 'You’re all set',
    body: 'Replay this tour from here whenever you need a refresher.',
    side: 'bottom',
  },
];
