# HishebNama — Development Plan

**Consent-based debt ledger for friend groups**

| | |
|---|---|
| **Document version** | 1.3 |
| **Date** | 25 October 2026 |
| **Status** | Pre-development specification |
| **Team** | Solo developer + AI coding agents |
| **Platform** | Mobile-first responsive web app (PWA) — see Section 6 |
| **Sequencing** | Dependency-ordered build phases, no fixed schedule (Section 15) |

> *Working title. Rename freely — "Hisheb" (হিসাব) means "account/reckoning" in Bangla.*

---

## Table of Contents

1. [Purpose of This Document](#1-purpose-of-this-document)
2. [Problem Statement](#2-problem-statement)
3. [What Makes This Different](#3-what-makes-this-different)
4. [Goals and Non-Goals](#4-goals-and-non-goals)
5. [Feature Specification](#5-feature-specification)
6. [Technology Stack](#6-technology-stack)
7. [Architectural Principles](#7-architectural-principles)
8. [Data Model](#8-data-model)
9. [Core Algorithms](#9-core-algorithms)
10. [The Proposal State Machine](#10-the-proposal-state-machine)
11. [Database Functions (RPC Layer)](#11-database-functions-rpc-layer)
12. [**SECURITY** — Dedicated Section](#12-security--dedicated-section)
13. [Frontend Architecture](#13-frontend-architecture)
14. [Testing Strategy and Invariants](#14-testing-strategy-and-invariants)
15. [Build Order and Sequencing](#15-build-order-and-sequencing)
16. [Deployment](#16-deployment)
17. [Out of Scope / Future Work](#17-out-of-scope--future-work)
18. [Glossary](#18-glossary)

---

## 1. Purpose of This Document

This is the single source of truth for the project. It is written to be read by:

- **The developer**, as a build order and reference.
- **AI coding agents** (Cursor, Claude Code), as full project context. Agents should read this file before generating any code, and should treat its architectural rules as non-negotiable constraints rather than suggestions.

**Companion document.** `USER_STORIES.md` holds 55 user stories with happy paths, unhappy paths and acceptance criteria. This document says *how the system is built*; that one says *what it must do and how it must behave when things go wrong*. Implement a story by reading both: the story for behaviour, this file for the mechanism. Where they appear to conflict, Sections 7, 8, 11, 12 and 14 here take precedence — say so rather than silently reconciling.

**Instruction to AI agents reading this file:** Sections 7, 8, 11, 12 and 14 define hard constraints. If a requested change would violate a rule in those sections, say so explicitly rather than implementing it. In particular: never write code that mutates `ledger_entries`, never accept a user identity as a function parameter, and never perform authorization checks in the browser.

**Two further constraints, added in v1.2.** First, trip leader authority is checked in the database against `auth.uid()`, never in React. A hidden button is not an authorization control. `trip_leaders` is read-only to clients; self-appointment must be impossible. Second, leaders may void and settle but **never transfer** — do not add a leader bypass to Feature 2 under any framing.

**And from v1.1:** trips (Feature 4) are a *reporting scope*, not a second ledger. Do not create trip balance tables, do not write a separate calculation path for trip expenses, and do not key the advisory lock on `trip_id`. A trip-scoped balance is the same derivation filtered by one column. If a task seems to call for trip-specific arithmetic, re-read Feature 4.1 in Section 5 — it almost certainly does not.

---

## 2. Problem Statement

In university halls, offices and friend circles, small informal debts accumulate constantly. A typical state of affairs in a group of five people involves a dozen outstanding obligations of 20–500 taka each, tracked in people's heads, in a Notes app, or not at all.

Two specific failures recur:

**Failure 1 — Debts are not transferable without friction.** Consider three people:

- Z owes X 30 taka
- X owes Y 20 taka

The arithmetically obvious move is for X to drop out of the middle: Z pays Y 20 directly, and Z's remaining debt to X falls to 10. This resolves two obligations with one real-world payment.

But this cannot happen silently, because **debt is not fungible**. Y lent money to X, not to Z. Y may not know Z well, may not want to chase Z for payment, and may reasonably refuse. Equally, Z may object — Z borrowed from X and is willing to repay X, but has no relationship with Y. Either objection is legitimate and must be respected.

Today this negotiation happens over messages and is forgotten, disputed, or never completed.

**Failure 2 — Group bills produce tangled obligations.** Eight people eat at a restaurant. Two of them pay the whole bill between them. Orders differed, so shares differ. Working out who now owes whom, and minimising the number of actual payments required, is tedious enough that people default to splitting evenly (unfair) or forgetting (resentment).

---

## 3. What Makes This Different

**This project is not a new category.** Splitwise, Settle Up, Tricount and others have solved group expense tracking and automatic debt simplification for over a decade, for free, on both platforms. Building only Feature 1 and Feature 3 would produce a strictly worse Splitwise with no users.

**The differentiator is consent.** Existing apps perform debt simplification *silently and automatically*. Splitwise's "simplify debts" will quietly reassign who owes whom without asking anyone, which is one of its most-complained-about behaviours precisely because it ignores the social reality that a debt is a relationship, not a number.

This project inverts that: **a debt may only be reassigned with the explicit approval of every party whose position changes.**

That single principle is the product. Everything else is the substrate it needs in order to operate.

**One scoped exception, which proves rather than weakens the rule.** Inside an active trip, consent is replaced by named authority: two or three trip leaders record and correct freely (Feature 4.3). This is not a retreat from the thesis — it is recognition that consent is valuable precisely where it protects an *ongoing* relationship of exposure, and merely obstructive where everyone is standing in the same place with no mobile data. The exception is bounded to one trip, lapses when the trip closes, and never extends to debt transfers. Everywhere else, and after the trip ends, unanimous consent holds.

A secondary differentiator is locality: Bangla interface, taka formatting, bKash/Nagad payment deep links, and design tuned for campus-scale groups rather than Western flatmates and holidays.

**Honest risk assessment:** the binding constraint on this project is adoption, not engineering. The app has zero value unless an entire friend group installs it. One user alone gets nothing. Every product decision should be evaluated against "does this make it easier to get my whole circle onto this?" — which is the main reason for the web-app decision in Section 6.

---

## 4. Goals and Non-Goals

### Goals

| # | Goal |
|---|---|
| G1 | Record group expenses with equal or itemised splits, accurately, in integer currency. |
| G2 | Allow a debt to be reassigned to a third party **only** with unanimous consent of affected parties — without exception, including inside trips. |
| G2a | Inside an active trip, let two or three named leaders record and correct entries immediately, with no approval, while keeping every such action attributed, notified and permanently visible. |
| G3 | Guarantee that no ledger state can ever be reached without the required consent, including under concurrent operations and including by a technically sophisticated user with developer tools open. |
| G4 | Maintain a complete, immutable, auditable history of why every balance is what it is. |
| G5 | Be installable and usable by a non-technical person in under 60 seconds from a shared link, on any device. |
| G6 | Support high-frequency shared spending (trips, outings) where payers and participant subsets change constantly, with expense entry fast enough to do in the moment. |
| G7 | Make every balance fully explainable on demand, so that a disputed figure can be traced to its causes without the user trusting the app blindly. |
| G8 | Run at zero recurring cost. |

### Non-Goals

| # | Non-goal | Reason |
|---|---|---|
| N1 | Moving actual money. | Real payment happens offline via bKash, Nagad, bank transfer or cash. The app tracks obligations only. Payment integration would require regulatory licensing. |
| N2 | Verifying that a payment occurred. | Out of scope by explicit decision. The ledger records *agreed obligations*, not *verified cash movement*. |
| N3 | Any LLM or AI involvement in calculation. | See Section 9. The mathematics is deterministic and fully solved. Nondeterminism in a money ledger is a defect, not a feature. |
| N4 | Native app store distribution. | See Section 6. |
| N5 | Multi-currency. | Bangladeshi taka only for v1. |
| N6 | Offline-first operation. | Deferred. See Section 17. |

---

## 5. Feature Specification

Features are numbered as in the original brief. **Note the dependency inversion:** Feature 2 is the product thesis, but it is structurally dependent on Feature 1, because a transfer requires existing debts to transfer. Feature 1 must therefore be built first — but built in the shape Feature 2 requires, which is not the shape a generic expense tracker would take.

### Feature 1 — Group Ledger (the substrate)

Commodity functionality. Build fast, but build to the data model in Section 8.

- Google sign-in.
- Create a group; invite members via shareable link.
- Add an expense: payer, total amount, description, and a per-person share breakdown (equal split or custom amounts).
- Derived balances: what each member net owes or is owed, and the pairwise breakdown.
- Complete activity history for the group.

**Critical:** expenses are **immutable once created**. Correcting an expense creates a correcting entry with visible history, never a silent edit. Silent edits to a shared financial record destroy trust permanently.

### Feature 2 — Consent-Based Ledger Transfer (the MVP, the thesis)

This is where engineering effort concentrates.

**Flow:**

1. **X proposes** a transfer: "Z's debt to me of 20 taka should become Z's debt to Y, cancelling my debt to Y."
2. X is **recorded as approved automatically** as the proposer.
3. Y and Z each receive the proposal and must **approve or reject**.
4. **Any single rejection kills the proposal.** There is no majority rule.
5. On the final approval, the system **re-validates against live balances** and commits atomically.
6. Proposals **expire** after 7 days without full resolution.

**Who must approve:** every party whose pairwise position changes. For a standard three-party transfer this is exactly the debtor, the intermediary and the creditor.

**Validity constraint:** the transfer amount A must satisfy

```
A ≤ net_owed(debtor → intermediary)
A ≤ net_owed(intermediary → creditor)
A > 0
```

In the worked example, `A ≤ min(30, 20) = 20`. Partial transfers are permitted.

### Feature 2b — Amendments and Settlements (same machinery)

A key simplification: **a transfer, an amendment and a settlement are the same object with different payloads.**

All three are "a proposed change to the ledger requiring consent from everyone whose position moves."

- **Amendment** — two parties agree to adjust an existing balance. A creditor cannot unilaterally reduce a 100 taka debt to 50; both must approve.
- **Settlement** — marking a debt as paid is itself a ledger change, so by the same rule it requires two-sided agreement: the debtor proposes "I have paid you 100," the creditor approves.

This means **one state machine and one approval UI serve three features.** Build it once.

### Feature 3 — Settlement Optimisation

Given the net position of every group member, compute the minimum set of payments that settles everyone.

This is a pure function over derived balances. It is **display logic, not stored state** — it suggests payments; it does not create them. Acting on a suggestion creates a settlement proposal (Feature 2b).

Specification and algorithm in Section 9.

### Feature 4 — Trips (high-frequency shared spending)

**Motivating scenario.** Five friends take a trip. On arrival they take an auto rickshaw costing ৳100; one person pays the whole fare and the other four will repay him individually. Later, three of the five go on to another location by a second vehicle, also ৳100, paid by a different person — and that cost must be divided between those three only, not all five. Over two days this repeats across dozens of small payments: meals, tickets, snacks, more vehicles. Different payers, different subsets, every time.

By the end, nobody can reconstruct who owes whom, and nobody can check whether a figure is right.

#### 4.1 What the existing model already handles

**Most of this scenario requires no new logic.** This must be stated clearly so that neither the developer nor an AI agent is tempted to build a parallel calculation engine for trips.

An expense already carries an explicit per-person share list. An expense involving three of five members is simply an expense whose share list names three people. The remaining two receive no share and no ledger entry. Netting across the append-only log then produces the correct answer automatically.

Worked through with the exact numbers from the scenario (members A–E, all values in poisha):

| Step | Entries appended |
|---|---|
| Auto rickshaw ৳100, **A** pays, split 5 ways (2000 each) | `B→A 2000`, `C→A 2000`, `D→A 2000`, `E→A 2000` |
| Second vehicle ৳100, **B** pays, split between **A, B, C** (3334 / 3333 / 3333) | `A→B 3334`, `C→B 3333` |

Resulting net positions:

| Member | Net | |
|---|---|---|
| A | `+4666` | ৳46.66 owed to them |
| B | `+4667` | ৳46.67 owed to them |
| C | `−5333` | ৳53.33 owed by them |
| D | `−2000` | ৳20.00 owed by them |
| E | `−2000` | ৳20.00 owed by them |
| | `0` | sums to zero, always |

And the pairwise view resolves the case the scenario specifically raises — the first payer who later does not pay:

> A was owed ৳20 by B. A then incurred a ৳33.34 share on a trip leg that B paid for. **A owes B ৳13.34**, not ৳33.34.

This is exactly the "his 20 taka will be deducted" outcome, produced by `net_owed()` with no special-case code. D and E, who did not join the second leg, remain at ৳20 each. Nothing about the core engine changes.

**Therefore Feature 4 is not a calculation feature.** It is a *grouping, data-entry, authority and transparency* feature. The parts below are the only genuinely new work.

#### 4.1a A correction about consent, before the authority model

A misreading worth heading off: **adding an expense has never required anyone's approval**, on a trip or otherwise. That rule was set in Feature 1 and holds throughout. A ten-person restaurant bill has always been one person typing one entry. Nobody is ever asked to tap "approve" on a rickshaw fare, and no part of this system has ever required ten people to be online simultaneously to record a cost.

What *does* require consent in the base model is the narrower set of operations that move an existing obligation between people, or erase one:

| Operation | Base rule | Why consent was required |
|---|---|---|
| Add an expense | **No consent, ever** | Recording a cost is not moving a debt. |
| Transfer a debt to a third party | Unanimous | Changes who you are exposed to. The product thesis. |
| Amend an existing balance | Both parties | Prevents unilateral reduction of what someone owes you. |
| Void (cancel) an expense | Everyone in the split | A void moves every participant's balance at once. |
| Settle a debt | Both parties | Prevents a debtor zeroing a debt the creditor never received. |

So the coordination problem identified in the scenario is real, but it bites on **corrections and settlements during a trip**, not on expense entry. A trip generates constant small corrections — wrong amount, wrong payer, someone was left off, someone who left early should not be on the dinner bill — and under the base rules each one needs its counterparty to be reachable. During a trip they frequently are not.

Section 4.3 resolves that, and confines the resolution to trips.

#### 4.2 Trip container

A **trip** is a named, time-bounded scope within a group. It is a label on expenses, **not a separate ledger**.

This distinction is load-bearing. A trip must never hold its own balances, because that would create a second source of truth that can drift from the group ledger. Instead, `trip_id` is an optional column on expenses and on the ledger entries they generate, and a trip balance is the same derivation filtered by that column.

Consequences, all desirable:

- Group balance = sum over all entries. Trip balance = sum where `trip_id = X`. One engine, two views.
- A trip can be settled without settling the rest of the group, because a settlement entry carries the same `trip_id` and therefore zeroes both views consistently.
- A trip can be closed. Closing is a soft state: it hides the trip from the active list and prompts settlement. **Closing never locks or freezes the ledger** — corrections must remain possible afterwards, through the normal amendment path.

A trip has a **roster** — the members who are on the trip. The roster is the default participant list for new expenses and exists purely to make entry fast. It does not restrict anything.

#### 4.3 Trip leaders — authority by trust, bounded by scope

**The rule: inside an active trip, consent is suspended and replaced by named authority.**

Each trip has two or three **trip leaders**. A leader may record, correct, void and settle anything within that trip, immediately, with no approval from anyone. This is deliberate and it is the correct trade-off for the situation: a trip is a high-tempo, low-connectivity environment among people who are physically together and already trust each other. Requiring asynchronous consent from a counterparty standing three feet away but with no mobile data is friction that produces abandonment, not safety.

This is trust-based by design. The guarantees below exist not to constrain that trust, but to keep it informed — the failure mode of a trusted-leader system is not malice, it is an honest mistake nobody notices.

##### What a leader can do, and what remains out of reach

| Action | Leader, inside an active trip | Anyone else, or after close |
|---|---|---|
| Add an expense | Yes, immediate | Per the trip's `entry_mode` setting |
| Correct an expense (void and re-enter) | Yes, immediate | Requires a **void proposal** — unanimous consent from everyone in the split |
| Record a settlement between two members | Yes, immediate | Requires both parties' consent |
| Add or remove another leader | Yes | No |
| **Transfer a debt to a third party** | **No — always consent-gated** | **No** |
| Touch any balance that did not originate in this trip | **No** | — |

Two of those refusals are load-bearing and must not be relaxed:

**Leaders cannot perform debt transfers.** Feature 2 is the product's reason to exist, and a trip is not an excuse to reassign who someone is exposed to without asking. It is also unnecessary: the netting described in 4.1 already collapses trip debts automatically, so a trip never needs an explicit transfer to resolve.

**Leader authority is scoped to the trip and ends when the trip closes.** A leader cannot reach a debt tagged to a different trip or to no trip at all, and once the trip is closed every correction reverts to the normal consent path. This bounds the blast radius of a mistaken or compromised leader account to one trip's entries, over one trip's lifetime.

##### Entry mode

Each trip carries an `entry_mode`:

- **`leaders_only`** (default) — only leaders add expenses. Matches the scenario: two or three trusted people handle all recording.
- **`open`** — any trip member may add an expense; leaders retain exclusive power to void, correct and settle.

Offered because the right answer varies by group. A fifteen-person tour wants `leaders_only`. Five flatmates on a weekend away probably want `open`. It is one column and one toggle.

##### Corrections never mutate

A leader correcting an expense does **not** edit it. Principle P1 is absolute and leader authority does not suspend it. `void_expense()` appends reversing ledger entries and marks the original with `voided_at` and `voided_by`; the leader then enters the corrected expense as a new one. Both remain permanently visible in history, and the derivation shows the void and its stated reason.

A leader who can silently rewrite history is a far worse problem than a leader who can post corrections, because the first destroys the audit trail that makes the second recoverable.

##### Voiding without a leader

Unapproved voiding exists **only** inside an active trip. There is deliberately no author self-void: an expense the caller created themselves, outside a trip or on a closed one, is cancelled the same way as anyone else's — through `propose_void()`, which requires unanimous approval from the payer and everyone holding a share.

This costs a little friction on an honest typo. It buys a rule that fits in one sentence, with exactly one clause:

> **Nothing changes your balance without your agreement, except inside an active trip.**

A second exception for "unless they typed it themselves" would be defensible in isolation, but it turns a rule users can hold in their heads into one they have to look up — and a rule nobody can recite is one nobody relies on.

##### What keeps trust sustainable

No approval gates, but nothing invisible:

| Safeguard | Effect |
|---|---|
| **Attribution on every action** | Every entry records who created it. The UI shows "added by Arif (trip leader)" distinctly from who paid. |
| **Notification to affected members** | Anyone whose balance moves is notified, including for leader actions. Silent balance changes are what destroy trust. |
| **Visible in the derivation** | The explanation engine (4.5) labels leader-originated entries and shows any void with its reason. |
| **Dispute, not reversal** | Any member can flag an entry. A dispute does not auto-revert — it notifies the leaders and marks the entry as questioned. Auto-reversal would hand every member the unilateral power the design just removed. |
| **Leader changes are logged** | Appointments and removals are recorded with actor and timestamp. |
| **A trip always retains at least one leader** | Removing the last leader is refused; the trip would become unmanageable while still accruing debts. |

##### Honest statement of the residual risk

This is the only path in the entire system by which one person can alter another person's balance without that person agreeing. It is a genuine, deliberate weakening, confined to trips. A leader who is careless, or whose account is compromised, can misstate trip balances, and no cryptographic guarantee prevents it — only visibility and the social cost of being caught.

The mitigations are that the power is scoped to one trip, expires when the trip closes, is fully attributed, triggers notifications, and leaves an immutable trail. That is the correct trade for this context, but it should be chosen knowingly rather than discovered later. See Section 12.8.

#### 4.4 Fast entry (the part that decides whether this is used)

The engineering is trivial; the UX is the actual product risk. Someone standing beside a rickshaw with one hand free will not fill in a six-field form. If entry is slow, people revert to memory and the trip data is worthless.

Requirements:

- **Participant selection in one tap, not five.** Default to the full trip roster. Offer an "everyone" toggle and per-person chips that deselect.
- **Named subsets.** A trip often has recurring sub-groups ("the three who went to the fort"). After a subset is used twice, offer to save it as a named preset for one-tap reuse.
- **Recent-set shortcut.** Surface the last three participant sets used on this trip as chips above the selector.
- **Payer defaults to the current user**, overridable in one tap.
- **Amount keypad first.** The amount field takes focus on open, with a numeric keypad.
- **Running trip total** visible while entering, so mistakes are noticed immediately rather than at settlement.
- **Target: under 10 seconds** for the common case (equal split, full roster, you paid). Treat this as an acceptance criterion, not an aspiration.

Unequal splits (different people ordered different things) use the existing itemised share path, with a helper that distributes any unassigned remainder evenly.

#### 4.5 The explanation engine ("deep analysis")

This is the most valuable new capability in v1.1, and it is directly motivated by the concern raised in the scenario: *"if there is an error in the calculation, we cannot observe that."*

**Design rule: hidden by default, complete on demand.** Every balance in the app is accompanied by an unobtrusive **"Why?"** affordance. Tapping it expands a full derivation of that number. It is never shown unprompted, because it would bury the one figure people actually want.

A derivation shows, in chronological order, every ledger entry contributing to the balance, each with:

- Date and running balance after that entry — so the number can be followed line by line.
- Direction and amount.
- The **cause**, in plain language rather than identifiers:
  - For an expense: `"Auto rickshaw — ৳100 paid by Arif, split 5 ways, your share ৳20"`
  - For a transfer: `"Transfer approved by you, Arif and Sami on 12 Oct"`
  - For a settlement: `"You paid Arif ৳50, confirmed by Arif on 13 Oct"`
- **Rounding attribution, stated explicitly.** Where a split did not divide evenly, the derivation says so: `"৳100 split 3 ways — you were charged ৳33.34, one poisha more than the others, because remainders are assigned in a fixed order."` Unexplained single-poisha differences are a recurring source of suspicion in ledger apps, and one sentence removes it permanently.

Scoping: the derivation can be requested for a whole group or filtered to a single trip.

**Why this is cheap to build and trustworthy to rely on:** because the ledger is append-only (principle P1) and balances are derived rather than stored (principle P2), the full causal history is already present and complete. The explanation engine is a *read* over data that must exist for the system to work at all. It cannot drift from the balance, because it is computed from the same rows.

**Self-check requirement.** The derivation's final running total must equal the value returned by `net_owed()` for the same pair. The UI asserts this and displays a visible warning if they disagree. This converts the explanation screen into a continuous correctness check on the engine itself, which is precisely the reassurance the scenario asks for. See invariant **I6** in Section 14.

#### 4.6 Trip settlement

On closing a trip, show the settlement optimiser (Section 9.3) scoped to that trip's entries: the minimum set of payments that squares everyone for this trip.

As everywhere else, these are **suggestions**. Acting on one opens a settlement proposal requiring the counterparty's approval. The optimiser never writes to the ledger.

#### 4.7 Known gap — non-member participants

A real and common trip scenario is someone joining who does not use the app — a friend's cousin, a colleague's partner.

**Deferred to v2, deliberately.** A non-user cannot approve anything, and consent is the product's central guarantee. Admitting placeholder people would create ledger positions that can never consent to a transfer, an amendment or a settlement, which would quietly undermine the model everywhere else.

Interim guidance for users: have one group member front the non-member's share and settle with them privately. The app records what the member owes; the side arrangement stays outside the system — consistent with non-goal **N1**.

---

## 6. Technology Stack

### Decision: Progressive Web App, not native

**Rationale:**

| Factor | Native (Flutter) | Web PWA |
|---|---|---|
| iOS distribution without App Store | Requires $99/yr Apple Developer Program. TestFlight builds expire every 90 days; Ad Hoc caps at 100 UDID-registered devices. No free path exists. | Open a URL. |
| Android distribution | APK sideload triggers "unknown sources" + Play Protect warnings — fatal friction for a money app from an unknown developer. Or $25 + 12 testers × 14 days for Play Store. | Open a URL. |
| Invite links | Deep links require the app to already be installed. | A link opens the running app. **Directly serves the adoption constraint.** |
| Version skew | User A on v1.2 and user B on v1.0 can disagree about transfer semantics — a correctness hazard in a consent system. | Everyone on the same code after a refresh. Permanently. |
| Google OAuth setup | SHA-1 fingerprints, separate platform client IDs, custom URL schemes. | One redirect URL. |
| Cost | $25 + $99/yr + a Mac or CI runner. | $0. |

**Accepted trade-off:** Web Push notifications work on Android Chrome but on iOS require the user to manually "Add to Home Screen" first. Mitigation: in-app badge counts as the baseline, Web Push where available, email fallback via Edge Function. Notifications belong in a late phase, not the foundation — no proposal in this system is time-critical to the minute.

**Escape hatch:** Capacitor can wrap this exact codebase into a native APK and IPA with no rewrite, should Play Store presence ever be wanted. The option is preserved at no present cost.

### Stack

| Layer | Choice | Notes |
|---|---|---|
| Build | Vite + React 19 + TypeScript | **Not Next.js.** No public pages, no SEO need, everything behind auth. SSR buys nothing and the server/client component boundary is a reliable source of AI-generated bugs. |
| Routing | React Router | |
| UI | Tailwind CSS + shadcn/ui | AI agents generate these reliably and consistently. |
| Data access | `@supabase/supabase-js` + TanStack Query | |
| Realtime | Supabase Realtime subscriptions | Live approval status on open proposals. |
| PWA | `vite-plugin-pwa` | Manifest, icons, home-screen install. |
| Database | Supabase (PostgreSQL) | Chosen over Firebase because the domain is relational and because atomic multi-row ledger operations require real ACID transactions. Firestore's document model and eventual consistency are a poor fit for a ledger. |
| Auth | Supabase Auth — Google provider | |
| Hosting | Netlify | Static SPA deploy. |
| Scheduled jobs | Supabase `pg_cron` | Proposal expiry sweep. |

**Design target:** mobile-first at 390px width. Desktop is a centered column, not a separate layout. Nobody settles a dinner bill from a laptop.

---

## 7. Architectural Principles

These five rules are load-bearing. Violating any one of them breaks a correctness or security guarantee elsewhere in the system.

### P1 — The ledger is append-only

`ledger_entries` is never updated and never deleted. There is no `UPDATE` path and no `DELETE` path, at any layer, ever. Corrections are expressed as new compensating entries.

*Why:* it makes the complete causal history of every balance permanently reconstructible, which is what resolves the disputes this app exists to prevent.

### P2 — Balances are derived, never stored

There is no `balance` column anywhere in the schema. A balance is always computed by summing `ledger_entries`.

*Why:* a stored balance is a cache, and a cache that disagrees with the log is a silent money bug.

### P3 — The server decides; the client only asks

All authorization, validation and state transition logic lives in PostgreSQL functions. The browser renders state and submits requests. It never determines whether an action is permitted.

*Why:* the browser is fully under the user's control. Any check performed there is advisory. See Section 12.

### P4 — Identity comes from the verified token, never from a parameter

No function accepts a `user_id` argument to identify its caller. Caller identity is always `auth.uid()`, derived from the cryptographically verified JWT.

*Why:* a client-supplied identity parameter allows any user to act as any other user, which would nullify the entire consent model — the product's only reason to exist.

### P5 — Money is integers

All amounts are stored as `BIGINT` in **poisha** (1 taka = 100 poisha). Floating point is forbidden throughout the stack, including in TypeScript.

*Why:* `0.1 + 0.2 !== 0.3`. Accumulated float error in a shared ledger is both a correctness bug and a trust bug.

---

## 8. Data Model

### 8.1 Entity overview

```
auth.users (Supabase-managed)
     │
     └── profiles
            │
            ├── groups ──── group_members
            │                    │
            │                    ├── expenses ──── expense_shares
            │                    │        │
            │                    │        └──────────┐
            │                    │                   ▼
            │                    │            ledger_entries   ◀── APPEND ONLY
            │                    │                   ▲              single source of truth
            │                    │                   │
            │                    └── proposals ──────┘
            │                             │
            │                             └── proposal_participants
```

### 8.2 Schema

```sql
-- ─────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;
create extension if not exists pg_cron;

-- ─────────────────────────────────────────────────────────────
-- PROFILES
-- ─────────────────────────────────────────────────────────────
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email        text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

-- Auto-create a profile row whenever a user signs up.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- GROUPS
-- ─────────────────────────────────────────────────────────────
create table groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 60),
  created_by  uuid not null references profiles(id),
  invite_code text not null unique default encode(gen_random_bytes(9), 'base64'),
  created_at  timestamptz not null default now()
);

create table group_members (
  group_id  uuid not null references groups(id) on delete cascade,
  user_id   uuid not null references profiles(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index on group_members (user_id);

-- ─────────────────────────────────────────────────────────────
-- TRIPS  (a SCOPE over expenses — never a separate ledger)
-- ─────────────────────────────────────────────────────────────
create table trips (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references groups(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 60),
  started_on  date not null default current_date,
  ended_on    date,
  status      text not null default 'active' check (status in ('active', 'closed')),
  entry_mode  text not null default 'leaders_only'
                check (entry_mode in ('leaders_only', 'open')),
  created_by  uuid not null references profiles(id),
  created_at  timestamptz not null default now()
);

create index on trips (group_id, status, started_on desc);

-- Trip leaders: the trusted few who record and correct without consent.
-- Authority is scoped to this trip and lapses when the trip closes.
create table trip_leaders (
  trip_id      uuid not null references trips(id) on delete cascade,
  user_id      uuid not null references profiles(id),
  appointed_by uuid not null references profiles(id),
  appointed_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

-- Audit of leader appointments and removals. Append-only by convention;
-- the UI surfaces it in the trip activity feed.
create table trip_leader_log (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references trips(id) on delete cascade,
  user_id    uuid not null references profiles(id),
  action     text not null check (action in ('appointed', 'removed')),
  actor_id   uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create index on trip_leader_log (trip_id, created_at desc);

-- Member-raised dispute on an entry. Flags and notifies; never auto-reverts,
-- because auto-reversal would restore the unilateral power leaders replaced.
create table entry_disputes (
  id         uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  raised_by  uuid not null references profiles(id),
  reason     text not null check (length(trim(reason)) between 1 and 300),
  status     text not null default 'open'
               check (status in ('open', 'resolved', 'withdrawn')),
  created_at timestamptz not null default now(),
  unique (expense_id, raised_by)
);

create index on entry_disputes (expense_id) where status = 'open';

-- Default participant list for new expenses on this trip. Convenience only:
-- it restricts nothing, and an expense may name people outside the roster.
create table trip_members (
  trip_id uuid not null references trips(id) on delete cascade,
  user_id uuid not null references profiles(id),
  primary key (trip_id, user_id)
);

-- Saved participant subsets, e.g. "the three who went to the fort".
create table trip_presets (
  id       uuid primary key default gen_random_uuid(),
  trip_id  uuid not null references trips(id) on delete cascade,
  label    text not null check (length(trim(label)) between 1 and 40),
  user_ids uuid[] not null check (array_length(user_ids, 1) >= 2)
);

create index on trip_presets (trip_id);

-- ─────────────────────────────────────────────────────────────
-- EXPENSES  (immutable once created)
-- ─────────────────────────────────────────────────────────────
create table expenses (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references groups(id) on delete cascade,
  trip_id      uuid references trips(id) on delete set null,  -- NULL = not on a trip
  payer_id     uuid not null references profiles(id),
  total_poisha bigint not null check (total_poisha > 0),
  description  text not null check (length(trim(description)) between 1 and 200),
  created_by   uuid not null references profiles(id),
  created_at   timestamptz not null default now(),

  -- Voiding is a correction, never a deletion. The row and its original
  -- ledger entries remain; reversing entries are appended alongside.
  voided_at     timestamptz,
  voided_by     uuid references profiles(id),
  void_reason   text check (length(trim(void_reason)) between 1 and 300),
  constraint void_fields_together check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and voided_by is not null and void_reason is not null)
  )
);

create index on expenses (group_id, created_at desc);
create index on expenses (trip_id, created_at desc) where trip_id is not null;

create table expense_shares (
  expense_id   uuid not null references expenses(id) on delete cascade,
  user_id      uuid not null references profiles(id),
  share_poisha bigint not null check (share_poisha >= 0),
  primary key (expense_id, user_id)
);
-- INVARIANT (enforced in add_expense): sum(share_poisha) = expenses.total_poisha

-- ─────────────────────────────────────────────────────────────
-- LEDGER ENTRIES  ◀── APPEND ONLY. NEVER UPDATE. NEVER DELETE.
-- ─────────────────────────────────────────────────────────────
create table ledger_entries (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references groups(id) on delete cascade,
  trip_id       uuid references trips(id) on delete set null,  -- inherited from source
  from_user     uuid not null references profiles(id),  -- owes
  to_user       uuid not null references profiles(id),  -- is owed
  amount_poisha bigint not null check (amount_poisha > 0),
  source_type   text not null check (source_type in ('expense', 'proposal')),
  source_id     uuid not null,
  created_at    timestamptz not null default now(),
  constraint no_self_debt check (from_user <> to_user)
);

create index on ledger_entries (group_id);
create index on ledger_entries (group_id, from_user, to_user);
create index on ledger_entries (source_id);
create index on ledger_entries (trip_id) where trip_id is not null;

-- NOTE: trip_id is set by the RPC that creates the entry — never by a client.
-- For an expense entry it is copied from expenses.trip_id. For a proposal entry
-- it comes from the proposal payload's optional "trip_id". It is purely a
-- reporting dimension and has NO effect on validation or on netting.

-- Belt and braces: block mutation at the database level, so that even a
-- future bug or a compromised role cannot rewrite history.
create or replace function block_ledger_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'ledger_entries is append-only (attempted %)', tg_op;
end $$;

create trigger ledger_no_update before update on ledger_entries
  for each row execute function block_ledger_mutation();
create trigger ledger_no_delete before delete on ledger_entries
  for each row execute function block_ledger_mutation();

-- ─────────────────────────────────────────────────────────────
-- PROPOSALS
-- ─────────────────────────────────────────────────────────────
create table proposals (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references groups(id) on delete cascade,
  type              text not null check (type in ('transfer', 'amendment',
                                                  'settlement', 'void')),
  proposer_id       uuid not null references profiles(id),
  payload           jsonb not null,
  note              text check (length(note) <= 300),
  status            text not null default 'pending'
                      check (status in ('pending','approved','rejected',
                                        'expired','invalidated','cancelled')),
  expires_at        timestamptz not null default now() + interval '7 days',
  resolved_at       timestamptz,
  resolution_reason text,
  created_at        timestamptz not null default now()
);

create index on proposals (group_id, status, created_at desc);
create index on proposals (status, expires_at) where status = 'pending';

create table proposal_participants (
  proposal_id uuid not null references proposals(id) on delete cascade,
  user_id     uuid not null references profiles(id),
  decision    text not null default 'pending'
                check (decision in ('pending', 'approved', 'rejected')),
  decided_at  timestamptz,
  primary key (proposal_id, user_id)
);

create index on proposal_participants (user_id, decision);
```

### 8.3 Payload shapes

`proposals.payload` is JSONB, shaped by `type`. All amounts in poisha.

**`transfer`** — three-party reassignment:
```json
{
  "debtor":       "<uuid>",
  "intermediary": "<uuid>",
  "creditor":     "<uuid>",
  "amount":       2000
}
```
Meaning: *debtor* owes *intermediary* at least `amount`, and *intermediary* owes *creditor* at least `amount`. After commit, both legs reduce by `amount` and *debtor* owes *creditor* `amount`.

**`amendment`** — two-party balance correction:
```json
{ "from_user": "<uuid>", "to_user": "<uuid>", "amount": 5000, "direction": "increase" }
```
`direction` is `"increase"` or `"decrease"` on what `from_user` owes `to_user`.

**`settlement`** — debt marked paid:
```json
{ "debtor": "<uuid>", "creditor": "<uuid>", "amount": 10000 }
```

**`void`** — cancel an expense by agreement, used outside an active trip:
```json
{ "expense_id": "<uuid>", "trip_id": "<uuid or null>" }
```
The reason is carried in `proposals.note`. On approval, every ledger entry the expense produced is mirrored and the expense is marked voided.

### 8.4 Derived views

```sql
-- Net position per member per group.
-- Positive => the group owes this person. Negative => this person owes the group.
create or replace view v_user_net as
select group_id, user_id, sum(delta)::bigint as net_poisha
from (
  select group_id, to_user   as user_id,  amount_poisha as delta from ledger_entries
  union all
  select group_id, from_user as user_id, -amount_poisha as delta from ledger_entries
) t
group by group_id, user_id;

-- Pairwise net: how much `debtor` owes `creditor` right now.
-- Returns a negative number if the relationship actually runs the other way.
create or replace function net_owed(p_group uuid, p_debtor uuid, p_creditor uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
    case
      when from_user = p_debtor   and to_user = p_creditor then  amount_poisha
      when from_user = p_creditor and to_user = p_debtor   then -amount_poisha
      else 0
    end
  ), 0)::bigint
  from public.ledger_entries
  where group_id = p_group
    and from_user in (p_debtor, p_creditor)
    and to_user   in (p_debtor, p_creditor);
$$;

-- Trip-scoped net position. Identical derivation, filtered by trip.
-- There is deliberately no separate trip balance table: one engine, two views.
create or replace view v_trip_net as
select trip_id, group_id, user_id, sum(delta)::bigint as net_poisha
from (
  select trip_id, group_id, to_user   as user_id,  amount_poisha as delta
    from ledger_entries where trip_id is not null
  union all
  select trip_id, group_id, from_user as user_id, -amount_poisha as delta
    from ledger_entries where trip_id is not null
) t
group by trip_id, group_id, user_id;
```

---

## 9. Core Algorithms

**No LLM is used anywhere in this section, and none should be introduced.** These are fully solved, deterministic problems. An LLM here would be nondeterministic (the same bill could yield two different answers), prone to arithmetic error, dependent on network availability, and — fatally — unable to show its work in a way a disputing user can audit.

The only defensible future LLM use is **input parsing** (receipt OCR, or "Rafi paid 1200 for dinner, split me/Rafi/Sami" → structured data), feeding into the deterministic engine below. That is a v3 convenience, never part of calculation.

### 9.1 Worked example: how a transfer becomes three entries

Initial state:
- `Z owes X 30 taka` → `entry(from=Z, to=X, 3000)`
- `X owes Y 20 taka` → `entry(from=X, to=Y, 2000)`

X proposes a transfer of 20 taka. On commit, three entries are appended:

| Entry | Effect |
|---|---|
| `entry(from=X, to=Z, 2000)` | Z's debt to X: 30 → 10 ✓ |
| `entry(from=Y, to=X, 2000)` | X's debt to Y: 20 → 0 ✓ |
| `entry(from=Z, to=Y, 2000)` | Z now owes Y 20 ✓ |

Nothing is mutated. The original two entries remain forever. The history reads as a complete, inspectable narrative.

### 9.2 Share splitting with largest-remainder rounding

100 taka split three ways is 3333.33 poisha each. Poisha are indivisible, so 1 poisha must be assigned to someone, deterministically and visibly.

```typescript
/**
 * Split an integer amount into n shares as evenly as possible.
 * Remainder poisha are distributed one each to the first `r` recipients
 * in a stable order (sorted by user id), so the result is deterministic
 * and reproducible by any client.
 */
export function splitEvenly(totalPoisha: number, userIds: string[]): Map<string, number> {
  const ids = [...userIds].sort();           // stable, deterministic order
  const n = ids.length;
  const base = Math.floor(totalPoisha / n);
  const remainder = totalPoisha - base * n;  // 0 <= remainder < n

  const out = new Map<string, number>();
  ids.forEach((id, i) => out.set(id, base + (i < remainder ? 1 : 0)));
  return out;
}
// INVARIANT: sum of all shares === totalPoisha, exactly, always.
```

For itemised splits the user supplies explicit per-person amounts; the server rejects the expense unless they sum exactly to the total.

### 9.3 Settlement optimisation (Feature 3)

**Step 1 — Net everyone out.** Read `v_user_net`. Positive = creditor, negative = debtor. The sum across a group is always exactly zero (every entry contributes `+x` and `−x`).

This step alone collapses the "eight people, two paid, unequal orders" scenario into a flat list of creditors and debtors.

**Step 2 — Greedy matching.** Repeatedly pair the largest debtor with the largest creditor:

```typescript
export interface Payment { from: string; to: string; amountPoisha: number; }

/**
 * Produce a small set of payments that settles every balance.
 * Terminates in at most n-1 payments for n people.
 *
 * NOTE: minimising the payment count is NP-hard in the general case
 * (it reduces to set partition), but for friend-group sizes (n < 20) the
 * greedy result is optimal or near-optimal, and the difference is at most
 * a payment or two. This is display logic — correctness of *amounts* is
 * guaranteed by netting; only the *grouping* is heuristic.
 */
export function settle(net: Map<string, number>): Payment[] {
  const debtors  = [...net].filter(([, v]) => v < 0).map(([k, v]) => ({ id: k, amt: -v }));
  const creditors = [...net].filter(([, v]) => v > 0).map(([k, v]) => ({ id: k, amt:  v }));

  debtors.sort((a, b) => b.amt - a.amt);
  creditors.sort((a, b) => b.amt - a.amt);

  const payments: Payment[] = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amt, creditors[j].amt);
    payments.push({ from: debtors[i].id, to: creditors[j].id, amountPoisha: amount });

    debtors[i].amt   -= amount;
    creditors[j].amt -= amount;

    if (debtors[i].amt === 0) i++;
    if (creditors[j].amt === 0) j++;
  }

  return payments;
}
```

**Step 3 — Suggestions, not state.** The output is rendered as suggested payments. Tapping one opens a *settlement proposal*, which still requires the counterparty's approval. The optimiser never writes to the ledger.

---

## 10. The Proposal State Machine

```
                    ┌──────────────────────────────── cancelled
                    │                                 (proposer withdraws)
                    │
   created ──▶  pending  ──────────────────────────▶  rejected
                 │  │                                 (any participant rejects)
                 │  │
                 │  └───────────────────────────────▶ expired
                 │                                    (7-day TTL, pg_cron sweep)
                 │
                 │  all participants approved
                 ▼
          [ revalidate against LIVE balances ]
                 │                    │
         still valid              no longer valid
                 │                    │
                 ▼                    ▼
            approved            invalidated
    (3 ledger entries appended)  (underlying debt changed
                                  since proposal was made)
```

### Rules

| Rule | Detail |
|---|---|
| **Proposer auto-approves** | The proposer's `proposal_participants` row is created with `decision = 'approved'`. |
| **Unanimity required** | Every participant must approve. There is no quorum and no majority. |
| **Rejection is final** | A single `reject` terminates the proposal immediately. It cannot be revived; a new proposal must be created. |
| **Terminal states are terminal** | `approved`, `rejected`, `expired`, `invalidated`, `cancelled` never transition again. |
| **Validation happens at commit** | Balances are re-checked when the *final* approval arrives, never against a snapshot from proposal time. |
| **Commit is atomic** | All three ledger entries are inserted in one transaction alongside the status change, or none are. |
| **`invalidated` is not a failure to hide** | The UI must explain it plainly: "This transfer is no longer possible because the underlying debt changed." |

### Participant derivation

| Type | Participants |
|---|---|
| `transfer` | debtor, intermediary, creditor (3) |
| `amendment` | from_user, to_user (2) |
| `settlement` | debtor, creditor (2) |
| `void` | the payer plus everyone holding a non-zero share (2 … n) |

---

## 11. Database Functions (RPC Layer)

Every one of these is `security definer`, sets an empty `search_path`, derives identity from `auth.uid()`, and is the **only** way to write to the ledger.

### 11.1 The concurrency guarantee

The central correctness problem: between proposal creation and final approval, the underlying balances may change. Two concrete attacks:

1. X proposes transferring the 20 taka Z owes X to Y. Y approves. Before Z responds, Z settles the whole debt with X in cash. Y has now approved a transfer of a debt that no longer exists.
2. X simultaneously proposes transferring the *same* Z→X debt to both Y and W. Both approve. X has spent the same debt twice.

**Both are closed by one mechanism:** a per-group advisory lock held for the duration of the transaction, combined with re-validation inside that same transaction.

```sql
perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 0));
```

Every ledger-mutating function takes this lock first. This serialises all writes within a group: they happen strictly one at a time. Validation and insertion are therefore inseparable — nothing can change between the check and the write.

Attack 1 fails because re-validation sees the settled debt and marks the proposal `invalidated`. Attack 2 fails because whichever proposal commits first consumes the balance; the second finds insufficient balance and is `invalidated`.

Groups are small and these transactions complete in microseconds. Lock contention is a non-issue at this scale.

### 11.2 `add_expense`

```sql
create or replace function add_expense(
  p_group_id    uuid,
  p_payer_id    uuid,
  p_total       bigint,
  p_description text,
  p_shares      jsonb   -- [{"user_id":"...","share":1234}, ...]
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid := auth.uid();
  v_expense_id uuid;
  v_sum        bigint := 0;
  v_share      jsonb;
  v_uid        uuid;
  v_amt        bigint;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- caller must belong to the group
  if not exists (select 1 from public.group_members
                 where group_id = p_group_id and user_id = v_actor) then
    raise exception 'NOT_A_MEMBER';
  end if;

  -- payer must belong to the group
  if not exists (select 1 from public.group_members
                 where group_id = p_group_id and user_id = p_payer_id) then
    raise exception 'PAYER_NOT_A_MEMBER';
  end if;

  if p_total <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 0));

  -- validate shares: every user is a member, amounts non-negative, sum matches
  for v_share in select * from jsonb_array_elements(p_shares) loop
    v_uid := (v_share ->> 'user_id')::uuid;
    v_amt := (v_share ->> 'share')::bigint;

    if v_amt < 0 then raise exception 'NEGATIVE_SHARE'; end if;

    if not exists (select 1 from public.group_members
                   where group_id = p_group_id and user_id = v_uid) then
      raise exception 'SHARE_USER_NOT_A_MEMBER';
    end if;

    v_sum := v_sum + v_amt;
  end loop;

  if v_sum <> p_total then
    raise exception 'SHARES_DO_NOT_SUM_TO_TOTAL: % vs %', v_sum, p_total;
  end if;

  insert into public.expenses (group_id, payer_id, total_poisha, description, created_by)
  values (p_group_id, p_payer_id, p_total, p_description, v_actor)
  returning id into v_expense_id;

  insert into public.expense_shares (expense_id, user_id, share_poisha)
  select v_expense_id, (s ->> 'user_id')::uuid, (s ->> 'share')::bigint
  from jsonb_array_elements(p_shares) s;

  -- emit one ledger entry per non-payer with a non-zero share
  insert into public.ledger_entries
         (group_id, from_user, to_user, amount_poisha, source_type, source_id)
  select p_group_id, (s ->> 'user_id')::uuid, p_payer_id,
         (s ->> 'share')::bigint, 'expense', v_expense_id
  from jsonb_array_elements(p_shares) s
  where (s ->> 'user_id')::uuid <> p_payer_id
    and (s ->> 'share')::bigint > 0;

  return v_expense_id;
end $$;
```

### 11.3 `propose_transfer`

```sql
create or replace function propose_transfer(
  p_group_id     uuid,
  p_debtor       uuid,
  p_intermediary uuid,
  p_creditor     uuid,
  p_amount       bigint,
  p_note         text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_id    uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  -- the proposer must be one of the three affected parties
  if v_actor not in (p_debtor, p_intermediary, p_creditor) then
    raise exception 'PROPOSER_NOT_INVOLVED';
  end if;

  if p_debtor = p_intermediary
     or p_intermediary = p_creditor
     or p_debtor = p_creditor then
    raise exception 'PARTIES_MUST_BE_DISTINCT';
  end if;

  if p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  -- all three must be members of the group
  if (select count(*) from public.group_members
      where group_id = p_group_id
        and user_id in (p_debtor, p_intermediary, p_creditor)) <> 3 then
    raise exception 'ALL_PARTIES_MUST_BE_MEMBERS';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 0));

  -- feasibility check at proposal time (re-checked again at commit)
  if public.net_owed(p_group_id, p_debtor, p_intermediary) < p_amount then
    raise exception 'DEBTOR_LEG_INSUFFICIENT';
  end if;
  if public.net_owed(p_group_id, p_intermediary, p_creditor) < p_amount then
    raise exception 'INTERMEDIARY_LEG_INSUFFICIENT';
  end if;

  insert into public.proposals (group_id, type, proposer_id, payload, note)
  values (
    p_group_id, 'transfer', v_actor,
    jsonb_build_object(
      'debtor',       p_debtor,
      'intermediary', p_intermediary,
      'creditor',     p_creditor,
      'amount',       p_amount
    ),
    p_note
  )
  returning id into v_id;

  -- proposer is auto-approved; the other two start pending
  insert into public.proposal_participants (proposal_id, user_id, decision, decided_at)
  select v_id,
         u,
         case when u = v_actor then 'approved' else 'pending' end,
         case when u = v_actor then now() else null end
  from unnest(array[p_debtor, p_intermediary, p_creditor]) u;

  -- a 3-party proposal where the proposer is the only participant cannot
  -- happen (parties are distinct), so no immediate auto-commit is needed here
  return v_id;
end $$;
```

### 11.4 `respond_to_proposal` — the critical function

```sql
create or replace function respond_to_proposal(
  p_proposal_id uuid,
  p_approve     boolean
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := auth.uid();
  v_prop     public.proposals%rowtype;
  v_pending  int;
  v_payload  jsonb;
  v_debtor   uuid;
  v_inter    uuid;
  v_creditor uuid;
  v_amount   bigint;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_prop from public.proposals where id = p_proposal_id;
  if not found then raise exception 'PROPOSAL_NOT_FOUND'; end if;

  -- SERIALISE every ledger mutation in this group
  perform pg_advisory_xact_lock(hashtextextended(v_prop.group_id::text, 0));

  -- re-read under the lock: status may have changed while we waited
  select * into v_prop from public.proposals where id = p_proposal_id;

  if v_prop.status <> 'pending' then
    raise exception 'PROPOSAL_NOT_PENDING: %', v_prop.status;
  end if;

  if v_prop.expires_at < now() then
    update public.proposals
       set status = 'expired', resolved_at = now(),
           resolution_reason = 'Expired before all parties responded'
     where id = p_proposal_id;
    return 'expired';
  end if;

  -- IDENTITY CHECK: caller must be a listed participant.
  -- Identity is auth.uid(), never a parameter. See principle P4.
  if not exists (select 1 from public.proposal_participants
                 where proposal_id = p_proposal_id
                   and user_id = v_actor
                   and decision = 'pending') then
    raise exception 'NOT_A_PENDING_PARTICIPANT';
  end if;

  update public.proposal_participants
     set decision = case when p_approve then 'approved' else 'rejected' end,
         decided_at = now()
   where proposal_id = p_proposal_id and user_id = v_actor;

  -- any rejection ends it immediately
  if not p_approve then
    update public.proposals
       set status = 'rejected', resolved_at = now(),
           resolution_reason = 'Rejected by a participant'
     where id = p_proposal_id;
    return 'rejected';
  end if;

  select count(*) into v_pending
  from public.proposal_participants
  where proposal_id = p_proposal_id and decision = 'pending';

  if v_pending > 0 then
    return 'pending';
  end if;

  -- ══ ALL APPROVED — RE-VALIDATE AGAINST LIVE BALANCES AND COMMIT ══
  v_payload := v_prop.payload;

  if v_prop.type = 'transfer' then
    v_debtor   := (v_payload ->> 'debtor')::uuid;
    v_inter    := (v_payload ->> 'intermediary')::uuid;
    v_creditor := (v_payload ->> 'creditor')::uuid;
    v_amount   := (v_payload ->> 'amount')::bigint;

    -- live re-check, NOT a snapshot from proposal time
    if public.net_owed(v_prop.group_id, v_debtor, v_inter) < v_amount
       or public.net_owed(v_prop.group_id, v_inter, v_creditor) < v_amount then
      update public.proposals
         set status = 'invalidated', resolved_at = now(),
             resolution_reason =
               'The underlying debt changed after this was proposed'
       where id = p_proposal_id;
      return 'invalidated';
    end if;

    insert into public.ledger_entries
      (group_id, from_user, to_user, amount_poisha, source_type, source_id)
    values
      (v_prop.group_id, v_inter,    v_debtor,   v_amount, 'proposal', p_proposal_id),
      (v_prop.group_id, v_creditor, v_inter,    v_amount, 'proposal', p_proposal_id),
      (v_prop.group_id, v_debtor,   v_creditor, v_amount, 'proposal', p_proposal_id);

  elsif v_prop.type = 'settlement' then
    v_debtor   := (v_payload ->> 'debtor')::uuid;
    v_creditor := (v_payload ->> 'creditor')::uuid;
    v_amount   := (v_payload ->> 'amount')::bigint;

    if public.net_owed(v_prop.group_id, v_debtor, v_creditor) < v_amount then
      update public.proposals
         set status = 'invalidated', resolved_at = now(),
             resolution_reason = 'The debt changed after this was proposed'
       where id = p_proposal_id;
      return 'invalidated';
    end if;

    insert into public.ledger_entries
      (group_id, from_user, to_user, amount_poisha, source_type, source_id)
    values
      (v_prop.group_id, v_creditor, v_debtor, v_amount, 'proposal', p_proposal_id);

  elsif v_prop.type = 'amendment' then
    v_debtor   := (v_payload ->> 'from_user')::uuid;
    v_creditor := (v_payload ->> 'to_user')::uuid;
    v_amount   := (v_payload ->> 'amount')::bigint;

    if (v_payload ->> 'direction') = 'increase' then
      insert into public.ledger_entries
        (group_id, from_user, to_user, amount_poisha, source_type, source_id)
      values (v_prop.group_id, v_debtor, v_creditor, v_amount, 'proposal', p_proposal_id);
    else
      if public.net_owed(v_prop.group_id, v_debtor, v_creditor) < v_amount then
        update public.proposals
           set status = 'invalidated', resolved_at = now(),
               resolution_reason = 'The balance changed after this was proposed'
         where id = p_proposal_id;
        return 'invalidated';
      end if;
      insert into public.ledger_entries
        (group_id, from_user, to_user, amount_poisha, source_type, source_id)
      values (v_prop.group_id, v_creditor, v_debtor, v_amount, 'proposal', p_proposal_id);
    end if;
  end if;

  update public.proposals
     set status = 'approved', resolved_at = now(),
         resolution_reason = 'Approved by all parties'
   where id = p_proposal_id;

  return 'approved';
end $$;
```

### 11.5 The explanation engine (Feature 4.4)

A read-only derivation of a pairwise balance. Returns every contributing entry in
chronological order with a running total and a plain-language cause.

This is `stable`, not `volatile` — it writes nothing. It is `security definer` only
so that it can join across tables uniformly; it re-checks group membership itself.

```sql
create or replace function explain_balance(
  p_group_id uuid,
  p_other    uuid,            -- the other party; "you" is always auth.uid()
  p_trip_id  uuid default null -- optional: restrict to one trip
)
returns table (
  entry_id        uuid,
  occurred_at     timestamptz,
  signed_poisha   bigint,     -- + they owe you more, - you owe them more
  running_poisha  bigint,     -- + they owe you overall, at this point in time
  cause_type      text,
  cause_label     text,       -- plain language, ready to display
  detail          jsonb       -- structured backup for the UI
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  if not exists (select 1 from public.group_members
                 where group_id = p_group_id and user_id = v_actor) then
    raise exception 'NOT_A_MEMBER';
  end if;

  return query
  with rel as (
    select le.*,
           case when le.to_user = v_actor then  le.amount_poisha
                else                           -le.amount_poisha end as signed
    from public.ledger_entries le
    where le.group_id = p_group_id
      and (p_trip_id is null or le.trip_id = p_trip_id)
      and le.from_user in (v_actor, p_other)
      and le.to_user   in (v_actor, p_other)
  )
  select
    r.id,
    r.created_at,
    r.signed,
    sum(r.signed) over (order by r.created_at, r.id
                        rows between unbounded preceding and current row)::bigint,
    r.source_type,
    case
      -- ── expense ──────────────────────────────────────────────
      when r.source_type = 'expense' then
        e.description
        || ' — '   || public.fmt_taka(e.total_poisha)
        || ' paid by ' || pay.display_name
        || ', split ' || sc.n::text || ' ways'
        || ', share ' || public.fmt_taka(r.amount_poisha)
        || case when sc.uneven
                then ' (uneven split — see note)' else '' end
      -- ── proposal ─────────────────────────────────────────────
      when r.source_type = 'proposal' then
        case p.type
          when 'transfer'   then 'Transfer approved by all parties'
          when 'settlement' then 'Settlement confirmed'
          when 'amendment'  then 'Agreed correction'
        end
        || ' on ' || to_char(p.resolved_at, 'DD Mon YYYY')
      else 'Unknown'
    end,
    case
      when r.source_type = 'expense' then
        jsonb_build_object(
          'description',   e.description,
          'total',         e.total_poisha,
          'payer',         pay.display_name,
          'split_count',   sc.n,
          'your_share',    r.amount_poisha,
          'uneven',        sc.uneven,
          'rounding_note', case when sc.uneven then
            'This amount did not divide evenly. Remainder poisha are assigned '
            || 'in a fixed, repeatable order, so the shares differ by at most '
            || 'one poisha.' else null end,
          'trip_id',       r.trip_id)
      else
        jsonb_build_object(
          'proposal_type', p.type,
          'approvers',     (select jsonb_agg(pr.display_name)
                            from public.proposal_participants pp
                            join public.profiles pr on pr.id = pp.user_id
                            where pp.proposal_id = p.id and pp.decision = 'approved'),
          'resolved_at',   p.resolved_at,
          'note',          p.note,
          'trip_id',       r.trip_id)
    end
  from rel r
  left join public.expenses  e   on r.source_type = 'expense'  and e.id = r.source_id
  left join public.profiles  pay on pay.id = e.payer_id
  left join public.proposals p   on r.source_type = 'proposal' and p.id = r.source_id
  left join lateral (
    select count(*)::int as n,
           (count(distinct s.share_poisha) > 1) as uneven
    from public.expense_shares s
    where s.expense_id = e.id and s.share_poisha > 0
  ) sc on true
  order by r.created_at, r.id;
end $$;

-- Display helper: poisha -> "৳1,234.50"
create or replace function fmt_taka(p bigint)
returns text language sql immutable as $$
  select '৳' || to_char(p / 100.0, 'FM999,999,990.00');
$$;
```

**Self-check (invariant I6).** The final `running_poisha` returned by this function
must equal `net_owed(p_group_id, p_other, auth.uid())`. The UI asserts this on every
render and shows a visible warning on mismatch. Because both are computed from the
same append-only rows, a disagreement means a genuine engine bug — which is exactly
the condition the user needs to be able to detect.

```sql
-- Trip-scoped settlement input: net positions for one trip.
create or replace function trip_net_positions(p_trip_id uuid)
returns table (user_id uuid, display_name text, net_poisha bigint)
language plpgsql stable security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_group uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  select group_id into v_group from public.trips where id = p_trip_id;
  if not found then raise exception 'TRIP_NOT_FOUND'; end if;

  if not exists (select 1 from public.group_members
                 where group_id = v_group and user_id = v_actor) then
    raise exception 'NOT_A_MEMBER';
  end if;

  return query
  select n.user_id, pr.display_name, n.net_poisha
  from public.v_trip_net n
  join public.profiles pr on pr.id = n.user_id
  where n.trip_id = p_trip_id and n.net_poisha <> 0
  order by n.net_poisha desc;
end $$;
```

### 11.6 Trip leader authority (Feature 4.3)

Leader status is checked **inside the database against `auth.uid()`**, exactly like every other
authorization decision (principle P4). The browser may hide a button for a non-leader, but that
is cosmetic — the refusal happens in Postgres.

```sql
-- The single source of truth for leader authority.
-- Returns false for a closed trip: authority lapses on close, by design.
create or replace function is_trip_leader(p_trip_id uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.trip_leaders l
    join public.trips t on t.id = l.trip_id
    where l.trip_id = p_trip_id
      and l.user_id = p_user
      and t.status  = 'active'
  );
$$;

create or replace function add_trip_leader(p_trip_id uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_group uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  select group_id into v_group from public.trips where id = p_trip_id;
  if not found then raise exception 'TRIP_NOT_FOUND'; end if;

  -- only an existing leader may appoint another
  if not public.is_trip_leader(p_trip_id, v_actor) then
    raise exception 'NOT_A_TRIP_LEADER';
  end if;

  if not exists (select 1 from public.group_members
                 where group_id = v_group and user_id = p_user) then
    raise exception 'LEADER_MUST_BE_GROUP_MEMBER';
  end if;

  insert into public.trip_leaders (trip_id, user_id, appointed_by)
  values (p_trip_id, p_user, v_actor)
  on conflict do nothing;

  insert into public.trip_leader_log (trip_id, user_id, action, actor_id)
  values (p_trip_id, p_user, 'appointed', v_actor);
end $$;

create or replace function remove_trip_leader(p_trip_id uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_remaining int;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  if not public.is_trip_leader(p_trip_id, v_actor) then
    raise exception 'NOT_A_TRIP_LEADER';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_trip_id::text, 1));

  select count(*) into v_remaining
  from public.trip_leaders where trip_id = p_trip_id;

  -- A trip accruing debts with nobody able to correct them is unmanageable.
  if v_remaining <= 1 then
    raise exception 'CANNOT_REMOVE_LAST_LEADER';
  end if;

  delete from public.trip_leaders where trip_id = p_trip_id and user_id = p_user;

  insert into public.trip_leader_log (trip_id, user_id, action, actor_id)
  values (p_trip_id, p_user, 'removed', v_actor);
end $$;
```

#### Voiding an expense — correction without mutation

```sql
-- Appends reversing entries. NEVER updates or deletes the originals.
-- Principle P1 is not suspended for leaders.
create or replace function void_expense(p_expense_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_exp   public.expenses%rowtype;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'VOID_REASON_REQUIRED';
  end if;

  select * into v_exp from public.expenses where id = p_expense_id;
  if not found then raise exception 'EXPENSE_NOT_FOUND'; end if;
  if v_exp.voided_at is not null then raise exception 'ALREADY_VOIDED'; end if;

  -- Authority: a trip leader inside an ACTIVE trip. Nothing else.
  --
  -- There is deliberately NO author self-void. Outside an active trip — and
  -- that includes an expense the caller created themselves, and any expense
  -- on a closed trip — voiding requires the unanimous consent of everyone in
  -- the split, via propose_void(). Unapproved balance changes exist inside an
  -- active trip and nowhere else. See Feature 4.3 and Section 12.8.
  if v_exp.trip_id is null
     or not public.is_trip_leader(v_exp.trip_id, v_actor) then
    raise exception 'NOT_AUTHORIZED_TO_VOID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_exp.group_id::text, 0));

  -- reverse every entry this expense produced, by appending mirrors
  insert into public.ledger_entries
    (group_id, trip_id, from_user, to_user, amount_poisha, source_type, source_id)
  select le.group_id, le.trip_id, le.to_user, le.from_user,
         le.amount_poisha, 'expense', p_expense_id
  from public.ledger_entries le
  where le.source_type = 'expense' and le.source_id = p_expense_id;

  update public.expenses
     set voided_at = now(), voided_by = v_actor, void_reason = p_reason
   where id = p_expense_id;
end $$;
```

> **Note on the reversal.** Mirrored entries carry `source_id = p_expense_id`, so a void and its
> original share a source. The derivation view pairs them and renders the void explicitly with
> its reason, rather than leaving the reader to notice two offsetting rows.

#### Voiding by consent — the path outside an active trip

`void_expense()` above is leader-only and trip-only. Everywhere else, cancelling an expense is a
**proposal requiring unanimous approval from everyone in the split**, because a void moves every
participant's balance at once. It reuses the proposal state machine unchanged; only the payload
type is new.

```sql
create or replace function propose_void(p_expense_id uuid, p_reason text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_exp   public.expenses%rowtype;
  v_id    uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'VOID_REASON_REQUIRED';
  end if;

  select * into v_exp from public.expenses where id = p_expense_id;
  if not found      then raise exception 'EXPENSE_NOT_FOUND'; end if;
  if v_exp.voided_at is not null then raise exception 'ALREADY_VOIDED'; end if;

  -- The proposer must be affected by the expense: the payer, or someone
  -- holding a share. Being charged for something is standing to contest it.
  if v_actor <> v_exp.payer_id
     and not exists (select 1 from public.expense_shares
                     where expense_id = p_expense_id and user_id = v_actor) then
    raise exception 'NOT_INVOLVED_IN_EXPENSE';
  end if;

  if exists (select 1 from public.proposals
             where type = 'void' and status = 'pending'
               and (payload ->> 'expense_id')::uuid = p_expense_id) then
    raise exception 'VOID_ALREADY_PROPOSED';
  end if;

  insert into public.proposals (group_id, type, proposer_id, payload, note)
  values (v_exp.group_id, 'void', v_actor,
          jsonb_build_object('expense_id', p_expense_id,
                             'trip_id',    v_exp.trip_id),
          p_reason)
  returning id into v_id;

  -- Participants: the payer plus everyone holding a non-zero share.
  -- The proposer is auto-approved, per the standard rule.
  insert into public.proposal_participants (proposal_id, user_id, decision, decided_at)
  select distinct v_id, u,
         case when u = v_actor then 'approved' else 'pending' end,
         case when u = v_actor then now() else null end
  from (
    select v_exp.payer_id as u
    union
    select user_id from public.expense_shares
     where expense_id = p_expense_id and share_poisha > 0
  ) parties;

  return v_id;
end $$;
```

**Commit branch to add inside `respond_to_proposal`**, alongside the existing types:

```sql
  elsif v_prop.type = 'void' then
    declare v_target uuid := (v_payload ->> 'expense_id')::uuid;
    begin
      -- Re-validate: the expense must still be un-voided. A leader may have
      -- voided it while this proposal was pending.
      if exists (select 1 from public.expenses
                 where id = v_target and voided_at is not null) then
        update public.proposals
           set status = 'invalidated', resolved_at = now(),
               resolution_reason = 'This expense was already cancelled'
         where id = p_proposal_id;
        return 'invalidated';
      end if;

      -- Append the mirror of every entry the expense produced.
      insert into public.ledger_entries
        (group_id, trip_id, from_user, to_user, amount_poisha, source_type, source_id)
      select le.group_id, le.trip_id, le.to_user, le.from_user,
             le.amount_poisha, 'expense', v_target
      from public.ledger_entries le
      where le.source_type = 'expense' and le.source_id = v_target;

      update public.expenses
         set voided_at = now(),
             voided_by = v_prop.proposer_id,
             void_reason = coalesce(v_prop.note, 'Cancelled by agreement')
       where id = v_target;
    end;

#### Leader-recorded settlement

```sql
-- Records that one member paid another, with no approval from either.
-- Permitted ONLY by a leader, ONLY inside an active trip, and ONLY against
-- a balance that arose within that same trip.
create or replace function leader_record_settlement(
  p_trip_id  uuid,
  p_debtor   uuid,
  p_creditor uuid,
  p_amount   bigint,
  p_note     text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_group uuid;
  v_trip_balance bigint;
  v_id uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_debtor = p_creditor then raise exception 'PARTIES_MUST_DIFFER'; end if;

  select group_id into v_group from public.trips where id = p_trip_id;
  if not found then raise exception 'TRIP_NOT_FOUND'; end if;

  if not public.is_trip_leader(p_trip_id, v_actor) then
    raise exception 'NOT_A_TRIP_LEADER';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_group::text, 0));

  -- Scope guard: the leader may only settle what this trip created.
  select coalesce(sum(
    case when from_user = p_debtor   and to_user = p_creditor then  amount_poisha
         when from_user = p_creditor and to_user = p_debtor   then -amount_poisha
         else 0 end), 0)
    into v_trip_balance
  from public.ledger_entries
  where trip_id = p_trip_id
    and from_user in (p_debtor, p_creditor)
    and to_user   in (p_debtor, p_creditor);

  if v_trip_balance < p_amount then
    raise exception 'EXCEEDS_TRIP_BALANCE: trip balance is %', v_trip_balance;
  end if;

  -- Recorded as a proposal for a uniform audit trail, but opened already
  -- resolved: there is no pending state and nobody is asked to approve.
  insert into public.proposals
    (group_id, type, proposer_id, payload, note, status,
     resolved_at, resolution_reason)
  values (
    v_group, 'settlement', v_actor,
    jsonb_build_object('debtor', p_debtor, 'creditor', p_creditor,
                       'amount', p_amount, 'trip_id', p_trip_id,
                       'leader_recorded', true),
    p_note, 'approved', now(),
    'Recorded by trip leader — no approval required inside an active trip'
  )
  returning id into v_id;

  insert into public.proposal_participants (proposal_id, user_id, decision, decided_at)
  values (v_id, v_actor, 'approved', now());

  insert into public.ledger_entries
    (group_id, trip_id, from_user, to_user, amount_poisha, source_type, source_id)
  values (v_group, p_trip_id, p_creditor, p_debtor, p_amount, 'proposal', v_id);

  return v_id;
end $$;
```

**Why a settlement still creates a proposal row.** Uniformity of audit. Every ledger entry traces
to either an expense or a proposal, so the derivation engine needs no special case, and invariant
**I2** holds unchanged. The row is simply born `approved` with a resolution reason naming the
leader.

#### Disputes

```sql
create or replace function raise_dispute(p_expense_id uuid, p_reason text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_group uuid; v_id uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  select group_id into v_group from public.expenses where id = p_expense_id;
  if not found then raise exception 'EXPENSE_NOT_FOUND'; end if;

  if not exists (select 1 from public.group_members
                 where group_id = v_group and user_id = v_actor) then
    raise exception 'NOT_A_MEMBER';
  end if;

  insert into public.entry_disputes (expense_id, raised_by, reason)
  values (p_expense_id, v_actor, p_reason)
  on conflict (expense_id, raised_by)
    do update set reason = excluded.reason, status = 'open'
  returning id into v_id;

  return v_id;
end $$;
```

A dispute **changes no balance**. It flags the entry, notifies the leaders, and surfaces in the
derivation. Resolution is a leader voiding and re-entering, or the disputant withdrawing. Making
a dispute auto-reverse would hand every member exactly the unilateral power the leader model was
introduced to concentrate.

### 11.7 Trip management functions

```sql
create or replace function create_trip(
  p_group_id   uuid,
  p_name       text,
  p_member_ids uuid[],
  p_leader_ids uuid[] default '{}',
  p_entry_mode text default 'leaders_only'
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_trip uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  if not exists (select 1 from public.group_members
                 where group_id = p_group_id and user_id = v_actor) then
    raise exception 'NOT_A_MEMBER';
  end if;

  -- every listed member must belong to the group
  if exists (
    select 1 from unnest(p_member_ids) u
    where not exists (select 1 from public.group_members
                      where group_id = p_group_id and user_id = u)
  ) then
    raise exception 'ROSTER_CONTAINS_NON_MEMBER';
  end if;

  insert into public.trips (group_id, name, entry_mode, created_by)
  values (p_group_id, p_name, p_entry_mode, v_actor)
  returning id into v_trip;

  insert into public.trip_members (trip_id, user_id)
  select v_trip, u from unnest(array_append(p_member_ids, v_actor)) u
  on conflict do nothing;

  -- The creator is always a leader, so a trip is never leaderless.
  -- Additional leaders must be on the roster.
  insert into public.trip_leaders (trip_id, user_id, appointed_by)
  select v_trip, u, v_actor
  from unnest(array_append(p_leader_ids, v_actor)) u
  where exists (select 1 from public.trip_members
                where trip_id = v_trip and user_id = u)
  on conflict do nothing;

  insert into public.trip_leader_log (trip_id, user_id, action, actor_id)
  select v_trip, l.user_id, 'appointed', v_actor
  from public.trip_leaders l where l.trip_id = v_trip;

  return v_trip;
end $$;

-- Closing is a soft state. It never freezes the ledger: corrections after a
-- trip closes must remain possible through the normal amendment path.
create or replace function close_trip(p_trip_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_group uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  select group_id into v_group from public.trips where id = p_trip_id;
  if not found then raise exception 'TRIP_NOT_FOUND'; end if;

  if not exists (select 1 from public.group_members
                 where group_id = v_group and user_id = v_actor) then
    raise exception 'NOT_A_MEMBER';
  end if;

  update public.trips
     set status = 'closed', ended_on = coalesce(ended_on, current_date)
   where id = p_trip_id;
end $$;
```

**Change to `add_expense`.** The signature gains an optional trailing parameter:

```sql
create or replace function add_expense(
  p_group_id    uuid,
  p_payer_id    uuid,
  p_total       bigint,
  p_description text,
  p_shares      jsonb,
  p_trip_id     uuid default null      -- ← added in v1.1
) returns uuid
```

Inside the function, three additions:

1. If `p_trip_id` is not null, verify the trip exists and belongs to `p_group_id`;
   raise `TRIP_NOT_IN_GROUP` otherwise.
2. **Enforce the trip's entry mode** (Feature 4.3):

```sql
  if p_trip_id is not null then
    select status, entry_mode into v_status, v_mode
    from public.trips where id = p_trip_id and group_id = p_group_id;

    if not found then raise exception 'TRIP_NOT_IN_GROUP'; end if;
    if v_status <> 'active' then raise exception 'TRIP_CLOSED'; end if;

    if v_mode = 'leaders_only'
       and not public.is_trip_leader(p_trip_id, v_actor) then
      raise exception 'LEADERS_ONLY_TRIP';
    end if;
  end if;
```

3. Set `trip_id` on both the `expenses` row and every `ledger_entries` row it emits.

**No validation, netting or locking logic changes.** The advisory lock remains keyed
on `group_id`, never on `trip_id` — trips are a reporting dimension, and locking at
trip granularity would permit two concurrent writes to the same underlying balance.

### 11.7 Supporting functions

```sql
-- Proposer withdraws their own pending proposal.
create or replace function cancel_proposal(p_proposal_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  update public.proposals
     set status = 'cancelled', resolved_at = now(),
         resolution_reason = 'Withdrawn by proposer'
   where id = p_proposal_id
     and proposer_id = v_actor      -- only the proposer, enforced here not in the UI
     and status = 'pending';

  if not found then raise exception 'CANNOT_CANCEL'; end if;
end $$;

-- Join a group by invite code.
create or replace function join_group(p_invite_code text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_group uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  select id into v_group from public.groups where invite_code = p_invite_code;
  if not found then raise exception 'INVALID_INVITE_CODE'; end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_group, v_actor, 'member')
  on conflict do nothing;

  return v_group;
end $$;

-- Create a group; creator becomes owner and first member.
create or replace function create_group(p_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_group uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  insert into public.groups (name, created_by) values (p_name, v_actor)
  returning id into v_group;

  insert into public.group_members (group_id, user_id, role)
  values (v_group, v_actor, 'owner');

  return v_group;
end $$;

-- Scheduled expiry sweep.
create or replace function expire_stale_proposals()
returns int
language plpgsql security definer set search_path = ''
as $$
declare v_count int;
begin
  with updated as (
    update public.proposals
       set status = 'expired', resolved_at = now(),
           resolution_reason = 'Expired before all parties responded'
     where status = 'pending' and expires_at < now()
    returning 1
  )
  select count(*) into v_count from updated;
  return v_count;
end $$;

select cron.schedule('expire-proposals', '0 * * * *',
                     $$ select expire_stale_proposals() $$);
```

---

## 12. SECURITY — Dedicated Section

> **This section is mandatory reading before any code is written, and must not be deferred to "later hardening." Every rule here is cheap to implement at the start and expensive to retrofit.**

### 12.1 The Supabase anon key: what it is and why it is not a breach

The Supabase **anon key** is shipped in the browser bundle. Anyone can open developer tools and read it. **This is by design and is not a vulnerability.**

The anon key is an **identifier, not a secret**. It tells Supabase which project a request belongs to. It is the same category of thing as a Stripe publishable key, a Firebase config object, or the site's own URL. Possessing it grants no data access whatsoever.

**The crucial point: no architecture makes the client trustworthy.**

| If you built... | The attacker would... |
|---|---|
| A Supabase web app | Read the anon key from the bundle |
| A custom Node/Express backend | `curl` the endpoints, or run mitmproxy against the official app and replay requests |
| A native Android APK | Decompile the APK in minutes and extract every endpoint |
| A native iOS app | Proxy the traffic and inspect every call |

"Hidden client code" is not a security property in any stack. The only question that has ever mattered is: **is authorization enforced on the server?**

Supabase simply makes this visible on day one instead of allowing the illusion of obscurity. In fact Row Level Security is *structurally safer* than route middleware: with Express, forgetting `requireAuth` on one new route creates a hole. With RLS the policy is attached to the table itself, so every possible access path goes through it. It cannot be forgotten on one route.

### 12.2 The one genuine catastrophe: the service role key

| Key | Exposure | Consequence |
|---|---|---|
| **anon key** | Public by design | None. Gated entirely by RLS. |
| **service_role key** | Must NEVER be public | **Total compromise.** Bypasses all RLS. Full read/write on every table for everyone. |

**Hard rules:**

- The `service_role` key must never appear in frontend source, in a commit, or in any `VITE_`-prefixed environment variable.
- **Vite inlines every `VITE_*` variable into the public bundle at build time.** A variable named `VITE_SUPABASE_SERVICE_KEY` is published to the world the moment it is built. This is the single most likely way this project gets compromised.
- The service role key belongs only inside Supabase Edge Functions or a server-side context. For this project's v1, it should not be needed at all.
- `.env` and `.env.local` must be in `.gitignore` from the first commit.
- If it is ever leaked, rotate it immediately in the Supabase dashboard.

```bash
# .env.local — the ONLY two variables the frontend may have
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...          # public by design — fine

# NEVER, UNDER ANY CIRCUMSTANCES:
# VITE_SUPABASE_SERVICE_KEY=...             # ← this publishes it to the internet
```

### 12.3 Why a user cannot rewrite their own ledger — plainly stated

Every request carries a login token that is **cryptographically signed by Supabase**. A user can read their own token, but cannot alter it to claim a different identity — changing a single character breaks the signature and the database rejects the request. The database therefore always knows, with certainty, who is asking.

Two rules then close the door completely:

**Rule 1 — Users have no write permission on the ledger at all.** Not a restricted permission. *None.* There is no `INSERT` policy, no `UPDATE` policy, no `DELETE` policy on `ledger_entries`. A policy that does not exist cannot be satisfied. A user who opens developer tools and attempts to insert "Rafi owes me 50,000 taka" receives a flat refusal. There is no cleverer request that works, because there is no permission to discover.

**Rule 2 — Functions never accept "who I am" as input.** A user may absolutely craft a request saying "approve proposal #47 as Rafi." The function ignores that claim entirely and reads the signed token instead. It sees the actual caller. Approving on someone else's behalf is impossible.

**Therefore the worst a determined attacker with developer tools can do is call the same functions the app already calls, as themselves.** They can approve their own proposals and read their own groups — exactly what the buttons already permit.

**What this does NOT protect against, stated honestly:** nobody can hack the arithmetic, but people can still *lie*. A user can add a genuine-looking expense for a dinner that never happened, and the system will faithfully record it. That is a social problem, not a security one, and it is handled by notification plus a dispute flow — not by cryptography. The database guarantees that the maths is correct and that everyone consented. It cannot guarantee the dinner happened.

### 12.4 Row Level Security policies

Supabase grants permissive defaults on the public schema. **These must be explicitly revoked.** Default-deny, then grant back only reads.

```sql
-- ═══ ENABLE RLS ON EVERY TABLE ═══
alter table profiles              enable row level security;
alter table groups                enable row level security;
alter table group_members         enable row level security;
alter table expenses              enable row level security;
alter table expense_shares        enable row level security;
alter table ledger_entries        enable row level security;
alter table proposals             enable row level security;
alter table proposal_participants enable row level security;
alter table trips                 enable row level security;
alter table trip_members          enable row level security;
alter table trip_presets          enable row level security;
alter table trip_leaders          enable row level security;
alter table trip_leader_log       enable row level security;
alter table entry_disputes        enable row level security;

-- ═══ STRIP PERMISSIVE DEFAULTS ═══
revoke all on all tables in schema public from anon, authenticated;

-- ═══ GRANT READ ONLY — writes go exclusively through RPC ═══
grant select on profiles, groups, group_members, expenses, expense_shares,
                ledger_entries, proposals, proposal_participants,
                trips, trip_members, trip_presets,
                trip_leaders, trip_leader_log, entry_disputes
  to authenticated;

-- ═══ LEADERSHIP — READ ONLY. Appointment goes through RPC only. ═══
-- Without this restraint a member could open the console and insert
-- themselves into trip_leaders, granting themselves unconsented write power.
create policy trip_leaders_read on trip_leaders for select to authenticated
using (exists (
  select 1 from trips t
  join group_members m on m.group_id = t.group_id
  where t.id = trip_leaders.trip_id and m.user_id = auth.uid()
));

create policy trip_leader_log_read on trip_leader_log for select to authenticated
using (exists (
  select 1 from trips t
  join group_members m on m.group_id = t.group_id
  where t.id = trip_leader_log.trip_id and m.user_id = auth.uid()
));

create policy disputes_read on entry_disputes for select to authenticated
using (exists (
  select 1 from expenses e
  join group_members m on m.group_id = e.group_id
  where e.id = entry_disputes.expense_id and m.user_id = auth.uid()
));

grant select on v_user_net, v_trip_net to authenticated;

-- ═══ TRIPS — read only; creation and closure go through RPC ═══
create policy trips_read on trips for select to authenticated
using (exists (
  select 1 from group_members m
  where m.group_id = trips.group_id and m.user_id = auth.uid()
));

create policy trip_members_read on trip_members for select to authenticated
using (exists (
  select 1 from trips t
  join group_members m on m.group_id = t.group_id
  where t.id = trip_members.trip_id and m.user_id = auth.uid()
));

-- Presets are a convenience with no financial effect, so direct writes are
-- permitted — but still scoped to the group, never ungated.
create policy trip_presets_read on trip_presets for select to authenticated
using (exists (
  select 1 from trips t
  join group_members m on m.group_id = t.group_id
  where t.id = trip_presets.trip_id and m.user_id = auth.uid()
));

create policy trip_presets_write on trip_presets for insert to authenticated
with check (exists (
  select 1 from trips t
  join group_members m on m.group_id = t.group_id
  where t.id = trip_presets.trip_id and m.user_id = auth.uid()
));

grant insert, delete on trip_presets to authenticated;

-- ═══ LEDGER: READ ONLY, SCOPED TO YOUR OWN GROUPS ═══
-- Note the deliberate ABSENCE of insert/update/delete policies.
create policy ledger_read on ledger_entries for select to authenticated
using (exists (
  select 1 from group_members m
  where m.group_id = ledger_entries.group_id and m.user_id = auth.uid()
));

-- ═══ GROUPS ═══
create policy groups_read on groups for select to authenticated
using (exists (
  select 1 from group_members m
  where m.group_id = groups.id and m.user_id = auth.uid()
));

create policy members_read on group_members for select to authenticated
using (exists (
  select 1 from group_members m2
  where m2.group_id = group_members.group_id and m2.user_id = auth.uid()
));

-- ═══ EXPENSES ═══
create policy expenses_read on expenses for select to authenticated
using (exists (
  select 1 from group_members m
  where m.group_id = expenses.group_id and m.user_id = auth.uid()
));

create policy shares_read on expense_shares for select to authenticated
using (exists (
  select 1 from expenses e
  join group_members m on m.group_id = e.group_id
  where e.id = expense_shares.expense_id and m.user_id = auth.uid()
));

-- ═══ PROPOSALS — read only; decisions go through respond_to_proposal() ═══
create policy proposals_read on proposals for select to authenticated
using (exists (
  select 1 from group_members m
  where m.group_id = proposals.group_id and m.user_id = auth.uid()
));

-- CRITICAL: no update policy here. Without this restraint a user could
-- open the console and set their own decision to 'approved'.
create policy participants_read on proposal_participants for select to authenticated
using (exists (
  select 1 from proposals p
  join group_members m on m.group_id = p.group_id
  where p.id = proposal_participants.proposal_id and m.user_id = auth.uid()
));

-- ═══ PROFILES — visible only to people who share a group with you ═══
create policy profiles_read on profiles for select to authenticated
using (
  id = auth.uid()
  or exists (
    select 1 from group_members a
    join group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = profiles.id
  )
);

create policy profiles_update_own on profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

-- ═══ EXECUTE GRANTS — the RPC layer ═══
grant execute on function
  create_group(text),
  join_group(text),
  add_expense(uuid, uuid, bigint, text, jsonb, uuid),
  propose_transfer(uuid, uuid, uuid, uuid, bigint, text),
  respond_to_proposal(uuid, boolean),
  cancel_proposal(uuid),
  net_owed(uuid, uuid, uuid),
  create_trip(uuid, text, uuid[], uuid[], text),
  close_trip(uuid),
  trip_net_positions(uuid),
  explain_balance(uuid, uuid, uuid),
  fmt_taka(bigint),
  is_trip_leader(uuid, uuid),
  add_trip_leader(uuid, uuid),
  remove_trip_leader(uuid, uuid),
  void_expense(uuid, text),
  propose_void(uuid, text),
  leader_record_settlement(uuid, uuid, uuid, bigint, text),
  raise_dispute(uuid, text)
to authenticated;
```

### 12.5 `SECURITY DEFINER` hygiene

Every `security definer` function runs with the privileges of its owner, bypassing RLS. Three mandatory precautions:

1. **`set search_path = ''` on every one.** Without it, an attacker who can create objects in a schema on the search path can hijack a function call. This is why every reference inside the functions above is schema-qualified (`public.ledger_entries`, not `ledger_entries`).
2. **Re-derive identity inside.** `auth.uid()`, always. Never a parameter. (Principle P4.)
3. **Re-check membership and participation inside.** Assume every call is hand-crafted and hostile, because some will be. Never rely on the UI having already checked.

### 12.6 Additional measures

| Area | Measure |
|---|---|
| Invite codes | Generated with `gen_random_bytes(9)` — cryptographically random, not sequential or guessable. Add a rotate-invite-code action so a leaked link can be killed. |
| Rate limiting | Supabase enforces defaults on auth endpoints. For RPC abuse, add a simple per-user proposal-creation cap if spam appears. |
| Input validation | Enforced by `CHECK` constraints at the column level *and* re-validated in functions. Never in the browser only. |
| Amount bounds | `amount_poisha > 0` as a column constraint. Consider an upper sanity bound (e.g. 10,000,000 poisha) to limit damage from mistyping. |
| Database linter | Run Supabase's built-in linter before launch; it flags tables with RLS disabled and `SECURITY DEFINER` views. |
| Auth settings | Enable leaked-password protection in the Supabase dashboard. Set a sensible JWT expiry. |
| Dependencies | `npm audit` before each deploy. Keep the dependency tree small. |
| Netlify | Enable HTTPS-only. Add security headers (`X-Frame-Options: DENY`, a basic CSP). |
| Account deletion | Provide a data-export and account-deletion path. Deleting a user with outstanding debts must be handled explicitly — soft-deactivate rather than cascade-delete, or the ledger loses integrity. |

### 12.7 Security acceptance tests — run these before writing any UI

Open the deployed app, sign in, open the browser console, and run each of the following. **Every one must fail.** Do not proceed to frontend work until all pass.

```js
// 1. Direct ledger insert — must fail with an RLS violation
await supabase.from('ledger_entries').insert({
  group_id: '<a group you belong to>',
  from_user: '<another member>',
  to_user: '<yourself>',
  amount_poisha: 9999999,
  source_type: 'expense',
  source_id: crypto.randomUUID()
});
// EXPECT: new row violates row-level security policy

// 2. Self-approve a proposal you are not part of — must fail
await supabase.from('proposal_participants')
  .update({ decision: 'approved' })
  .eq('proposal_id', '<any proposal>');
// EXPECT: zero rows affected / permission denied

// 3. Mutate an existing ledger entry — must fail
await supabase.from('ledger_entries')
  .update({ amount_poisha: 1 })
  .eq('id', '<any entry id>');
// EXPECT: permission denied (and the append-only trigger behind it)

// 4. Read another group's data — must return empty
await supabase.from('ledger_entries')
  .select('*')
  .eq('group_id', '<a group you do NOT belong to>');
// EXPECT: []

// 5. Approve on someone else's behalf via RPC — must fail
await supabase.rpc('respond_to_proposal', {
  p_proposal_id: '<a proposal where you are NOT a participant>',
  p_approve: true
});
// EXPECT: NOT_A_PENDING_PARTICIPANT

// 6. Create an expense in a group you do not belong to — must fail
await supabase.rpc('add_expense', {
  p_group_id: '<foreign group>', p_payer_id: '<anyone>',
  p_total: 100, p_description: 'x', p_shares: [], p_trip_id: null
});
// EXPECT: NOT_A_MEMBER

// 7. Explain a balance in a group you do not belong to — must fail
await supabase.rpc('explain_balance', {
  p_group_id: '<foreign group>', p_other: '<anyone>', p_trip_id: null
});
// EXPECT: NOT_A_MEMBER
//   The derivation exposes full spending history, so it needs the same
//   gate as the ledger itself. A read-only function is not a safe function.

// 8. Tag an expense onto a trip belonging to another group — must fail
await supabase.rpc('add_expense', {
  p_group_id: '<your group>', p_payer_id: '<you>',
  p_total: 100, p_description: 'x',
  p_shares: [{ user_id: '<you>', share: 100 }],
  p_trip_id: '<a trip in a DIFFERENT group>'
});
// EXPECT: TRIP_NOT_IN_GROUP

// 9. Make yourself a trip leader — must fail
//    This is the privilege-escalation test. If it succeeds, Section 12.8's
//    every guarantee is void.
await supabase.from('trip_leaders').insert({
  trip_id: '<any trip>', user_id: '<yourself>', appointed_by: '<yourself>'
});
// EXPECT: new row violates row-level security policy

// 10. Act as a leader on a trip where you are not one — must fail
await supabase.rpc('leader_record_settlement', {
  p_trip_id: '<a trip you do not lead>', p_debtor: '<someone>',
  p_creditor: '<someone else>', p_amount: 100, p_note: null
});
// EXPECT: NOT_A_TRIP_LEADER

// 11. Void an expense outside an active trip — must fail even if YOU created it.
//     There is no author self-void: direct voiding is leader-and-active-trip
//     only. Everywhere else, propose_void() requires unanimous consent.
await supabase.rpc('void_expense', {
  p_expense_id: '<an expense YOU created, with no trip>',
  p_reason: 'test'
});
// EXPECT: NOT_AUTHORIZED_TO_VOID

// 11b. Propose a void for an expense you are not part of — must fail
await supabase.rpc('propose_void', {
  p_expense_id: '<an expense where you are neither payer nor share-holder>',
  p_reason: 'test'
});
// EXPECT: NOT_INVOLVED_IN_EXPENSE

// 12. As a leader, settle more than the trip created — must fail
//     Verifies that leader authority cannot reach outside the trip.
await supabase.rpc('leader_record_settlement', {
  p_trip_id: '<a trip you DO lead>', p_debtor: '<member A>',
  p_creditor: '<member B>', p_amount: 99999999, p_note: null
});
// EXPECT: EXCEEDS_TRIP_BALANCE
```

Ten minutes of work, and it converts "I believe this is secure" into "I have verified this is secure."

---

### 12.8 Trip leaders — the one deliberate exception, stated plainly

Everywhere else in this system, a person's balance cannot change without their agreement. **Trip leaders are the single exception**, and that exception must be understood rather than discovered.

**What the exception actually is.** Inside an *active* trip, a leader can add, void, correct and settle entries affecting other members immediately, with no approval. A careless leader — or a compromised leader account — can therefore misstate what members owe each other within that trip. No cryptography prevents this. It is a trust decision, taken knowingly, because the alternative (asynchronous consent for every correction during a trip) produces an app nobody uses.

**What bounds it.** The exception is deliberately narrow, and each boundary is enforced in the database rather than the UI:

| Boundary | Enforcement |
|---|---|
| Trip-scoped | `leader_record_settlement` refuses amounts exceeding the balance *this trip* created. A leader cannot reach group debts from elsewhere. |
| Time-bounded | `is_trip_leader()` returns false once `status = 'closed'`. Authority lapses on close; corrections revert to consent. |
| No transfers | Leaders have no path to `propose_transfer`'s unilateral equivalent. Debt reassignment stays unanimous, always. Feature 2 is untouched. |
| No history rewriting | `void_expense` appends reversals. The `ledger_no_update` / `ledger_no_delete` triggers apply to leaders exactly as to everyone else. |
| Appointment is gated | `trip_leaders` has **no insert policy**. A user cannot grant themselves leadership from the console; only `add_trip_leader()` writes that table, and only an existing leader may call it. |
| Never leaderless | `remove_trip_leader` refuses to remove the last one. |

**Why appointment is the sensitive operation.** Leadership is the privilege-escalation surface in this system. If `trip_leaders` were client-writable, every guarantee above would be one console command away from collapse. This is the trip-level analogue of the service-role key: the table is read-only to clients, and the only write path checks `auth.uid()` against existing leadership.

**What remains, and is accepted.** A genuinely malicious leader can distort one trip's figures. The response is social, not technical — but it is supported technically: every action is attributed, affected members are notified, the derivation shows who did what and why, and nothing can be erased. The design makes misconduct visible and permanent rather than preventing it, which is the correct goal for a system explicitly built on friendship trust.

## 13. Frontend Architecture

### 13.1 Routes

| Route | Screen |
|---|---|
| `/` | Landing / sign in with Google |
| `/groups` | List of my groups, each with my net position |
| `/groups/:id` | Group dashboard — balances, recent activity, action buttons |
| `/groups/:id/add` | Add expense (equal or itemised split) |
| `/groups/:id/settle` | Suggested payments from the optimiser |
| `/groups/:id/transfer` | Build a transfer proposal |
| `/groups/:id/history` | Full immutable ledger history |
| `/groups/:id/trips` | Trips in this group — active and closed |
| `/trips/:id` | Trip dashboard — running total, trip balances, fast-add button |
| `/trips/:id/add` | Fast expense entry with roster and preset chips |
| `/trips/:id/close` | Trip-scoped settlement suggestions |
| `/trips/:id/leaders` | Leader management — appoint, remove, view the appointment log |
| `/explain/:groupId/:otherId` | Derivation view ("Why do I owe this?") |
| `/proposals` | My inbox — proposals awaiting my decision |
| `/proposals/:id` | Proposal detail with approve / reject |
| `/join/:code` | Invite link landing — sign in, then join |

### 13.2 Directory layout

```
src/
  lib/
    supabase.ts          // client init, anon key only
    money.ts             // poisha <-> taka formatting, splitEvenly()
    settle.ts            // the greedy settlement optimiser
    types.ts             // generated from the Supabase schema
  hooks/
    useGroups.ts
    useGroupLedger.ts
    useProposals.ts
    useRealtimeProposals.ts
  components/
    ui/                  // shadcn primitives
    BalanceCard.tsx
    ProposalCard.tsx
    TransferBuilder.tsx
    ExpenseForm.tsx
  routes/
  App.tsx
```

### 13.3 Key UI requirements

- **Transfer builder must be visual.** Show the before-and-after state explicitly: "Right now: Z owes you 30, you owe Y 20. After this: Z owes Y 20, Z owes you 10." Users will not approve what they do not understand, and comprehension is the product.
- **Proposal cards must show live approval state.** Who has approved, who has not, via a Realtime subscription.
- **`invalidated` must be explained in plain language**, never shown as a raw status string.
- **All money formatted as taka** (`৳ 1,234.50`), converted from poisha only at the display layer.
- **Bangla/English toggle** — can land late, but structure strings for it from the start.
- **Inbox badge** for pending proposals is the baseline notification mechanism, before any push infrastructure exists.
- **Every balance carries a "Why?" affordance** — small, unobtrusive, never expanded by default. Tapping it opens the derivation from `explain_balance()`.
- **Fast entry is an acceptance criterion, not a polish item.** Equal split, full roster, you paid, in under 10 seconds. Time it on a real phone.
- **"Entered by" is shown distinctly from "paid by"** on every expense, since on a trip one person typically records spending on everyone's behalf.
- **Leader actions are visibly labelled**, not silently applied — "added by Arif (trip leader)", "voided by Sami — wrong amount". Invisible authority is what erodes trust; visible authority is what the group agreed to.
- **A leader badge appears beside leaders' names** throughout the trip UI, so members always know who holds the power.
- **Non-leaders on a `leaders_only` trip** see the add button replaced by a short note explaining who to ask, never a dead control that errors on tap.
- **Every expense carries a quiet dispute affordance** ("This doesn't look right"), which notifies leaders without changing any balance.

### 13.4 Realtime

```typescript
supabase
  .channel(`group:${groupId}`)
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'proposals',
        filter: `group_id=eq.${groupId}` },
      () => queryClient.invalidateQueries({ queryKey: ['proposals', groupId] }))
  .subscribe();
```

Realtime is a convenience, not a correctness mechanism. Correctness lives entirely in the database.

---

## 14. Testing Strategy and Invariants

**This is the section most likely to be skipped and most expensive to skip.** AI coding agents generate excellent happy-path code and are notably weak at interleaved-execution bugs. The concurrency tests must be specified by the developer, not delegated.

### 14.1 The five invariants

Write a fuzz test that performs several thousand random operations (add expense, propose, approve, reject, expire, settle) across a group of 5–8 simulated users, interleaved, and asserts after every single operation:

| # | Invariant |
|---|---|
| **I1** | Across any group, the sum of all ledger entries nets to exactly zero. |
| **I2** | No `ledger_entry` exists whose `source_id` does not point to a real expense or an `approved` proposal. |
| **I3** | No proposal has ever reached `approved` more than once (exactly one set of entries per approved proposal). |
| **I4** | After a transfer commits, exactly three pairwise balances changed, each by exactly the transfer amount, and no fourth party's net position moved. |
| **I5** | No transfer ever causes a pairwise balance to cross zero — you cannot transfer 30 out of a 20 debt. |
| **I6** | For any pair, the final running total from `explain_balance()` equals `net_owed()` for that pair. The explanation can never disagree with the balance it explains. |
| **I7** | For any trip, `v_trip_net` sums to exactly zero across that trip's participants, and the sum of all trips' entries plus untagged entries equals the group total. Trip scoping never creates or destroys value. |
| **I8** | A voided expense contributes exactly zero to every balance: its original entries and their appended reversals cancel precisely. No expense is ever voided twice. |
| **I9** | Every leader-originated ledger entry traces to a user who was a leader of that trip, and the trip was `active`, at the moment the entry was written. No entry exists from a closed trip or a non-leader. |
| **I10** | No `trip_leaders` row exists that was not created by `create_trip` or `add_trip_leader`, and every one has a matching `trip_leader_log` entry. Leadership can never be self-granted. |

### 14.2 Concurrency tests (write these by hand)

| Scenario | Expected outcome |
|---|---|
| Two proposals spending the same underlying debt, both reaching final approval simultaneously | One `approved`, one `invalidated`. Never both approved. |
| Settlement commits while a transfer proposal on the same debt is awaiting its last approval | Transfer becomes `invalidated` with a clear reason. |
| The same user calls `respond_to_proposal` twice in rapid succession | Second call raises `NOT_A_PENDING_PARTICIPANT`. |
| A proposal expires between the second and third approval | Third approval returns `expired`, no entries written. |
| Two leaders void the same expense simultaneously | One succeeds, the other raises `ALREADY_VOIDED`. Never two sets of reversals. |
| A leader settles while another leader voids the underlying expense | Serialised by the group advisory lock. The resulting trip balance is never negative. |
| The last leader is removed while another removal is in flight | One succeeds, the other raises `CANNOT_REMOVE_LAST_LEADER`. A trip is never left leaderless. |
| A trip closes while a leader action is in flight | The action either completes before close or fails with `TRIP_CLOSED` / `NOT_A_TRIP_LEADER`. No leader write lands against a closed trip. |

### 14.3 Manual two-device testing

Two phones, two real Google accounts, one group. Deliberately race approvals against settlements. This finds things unit tests do not.

### 14.4 Test tooling

- **Database:** `pgTAP` or plain SQL assertion scripts run against a local Supabase instance.
- **Frontend logic:** Vitest for `money.ts` and `settle.ts` (pure functions, trivially testable, high value).
- **Security:** the Section 12.7 checklist, re-run before every deploy.

---

## 15. Build Order and Sequencing

**No durations, dates or estimates appear in this document by design.** What follows is a
*dependency order*: what must exist before what, and why. Phases are sequence, not schedule.
Work at whatever pace suits; the ordering constraints below are the part that matters, because
violating them creates rework or, worse, silent correctness holes.

### Phase 0 — Foundation (nothing else can start)

1. Supabase project created, Google OAuth configured.
2. **The complete schema from Section 8, in one migration** — including `trips`, `trip_members`,
   `trip_leaders`, `trip_presets` and the `trip_id` columns.
3. **All RLS policies from Section 12.4, plus the Section 12.7 security checklist verified passing.**

> **Why the whole schema lands at once.** `ledger_entries` is append-only. A `trip_id` column
> added later is permanently `NULL` for every entry written before it existed, so early
> real-world data could never be grouped into trips retroactively. Unused columns cost nothing;
> adding them late costs history.

> **Why security precedes all UI.** Every later phase writes code that assumes the database
> refuses unauthorized writes. If that assumption is only verified at the end, every screen
> built in between rests on a guess. The checklist is six console commands.

### Phase 1 — The substrate (Feature 1)

Depends on Phase 0.

- `create_group`, `join_group`, `add_expense` RPCs with SQL tests.
- Vite/React/Tailwind scaffold, auth flow, group list and creation.
- Group dashboard: balances from `v_user_net`, member list, invite link.
- Add-expense form with equal and itemised splits; `splitEvenly` unit-tested.
- History view. First Netlify deploy.

**Exit condition:** a group ledger that records expenses and derives correct balances.

### Phase 2 — The thesis (Features 2 and 2b)

Depends on Phase 1, because a transfer needs existing debts to transfer.

- `propose_transfer` with validation tests.
- `respond_to_proposal` — advisory locking, live re-validation, atomic commit.
- Expiry sweep, `cancel_proposal`, amendment and settlement payload paths.
- Transfer builder UI showing the before/after state visually.
- Proposal inbox, detail view, approve/reject.
- Realtime subscriptions for live approval status.

**Exit condition:** an end-to-end three-party transfer works between two real devices.

### Phase 3 — Breaking it (no new features)

Depends on Phase 2. **This phase is not optional and must not be merged into another.**

- Fuzz harness implementing invariants I1–I5.
- Every concurrency scenario in Section 14.2.
- Fix whatever surfaces.
- Settlement optimiser and suggested-payments UI.
- Error states, empty states, `invalidated` messaging.

**Exit condition:** a sustained, deliberate attempt to corrupt the ledger fails.

### Phase 4 — Trips and transparency (Feature 4)

Depends on Phase 3, because trips multiply the volume of ledger writes and should only be
pointed at an engine already proven under concurrent load.

- `create_trip`, `close_trip`, `add_trip_leader`, `remove_trip_leader`, `trip_net_positions`.
- `is_trip_leader` guard, and leader-authority enforcement inside `add_expense`.
- `void_expense` (leader, active trip) and `propose_void` (consent, everywhere else).
- The `void` branch of `respond_to_proposal`.
- Trip list, trip dashboard, leader management UI.
- **Fast entry**: roster defaults, preset chips, recent-set shortcuts, amount-first keypad.
- `explain_balance()` and `fmt_taka()`, with SQL tests asserting invariant **I6**.
- Derivation UI — the "Why?" affordance, collapsed by default, with rounding attribution.
- Trip-scoped settlement. Invariant **I7** and leader invariants **I8**–**I10** tested.
- Extend the Phase 3 fuzz harness to emit trip-tagged expenses and leader actions.

**Exit condition:** a real outing — actual people, actual money — is recorded and settled
correctly, and every figure in it can be explained.

### Phase 5 — Release readiness

Depends on Phase 4.

- PWA manifest, icons, install prompt, offline shell.
- Bangla strings, taka formatting pass, bKash/Nagad deep links.
- Mobile layout refinement at 390px; accessibility pass.
- Web Push (Android) plus email fallback Edge Function.
- Security checklist re-run, `npm audit`, Supabase linter, Netlify headers.
- Trial with a real friend group; fix what they find.

### Ordering rules that must not be bent

| Rule | Reason |
|---|---|
| Security checklist before any UI | Later code assumes the database refuses bad writes. Verify the assumption first. |
| Full schema in the first migration | Append-only data cannot be retroactively tagged. |
| Phase 3 before Phase 4 | Trips multiply write volume. Prove the engine under concurrency before increasing load on it. |
| Phase 3 is never folded into another phase | It produces no visible features, which makes it the first thing cut under pressure and the last thing that can safely be cut. |
| The explanation engine is never dropped | On a trip with forty small entries, being able to answer "why do I owe this?" is the difference between adoption and abandonment. |

**If scope must be reduced**, drop in this order: Phase 5 polish, then Feature 4's fast-entry
refinements (a slower form still produces correct data), then trip-scoped settlement. Never
Phase 3, and never the explanation engine.

An unpolished app that is correct is recoverable. A polished app that silently corrupts a ledger
is not — the group abandons it permanently and tells others.

---

## 16. Deployment

| Item | Detail |
|---|---|
| Frontend | Netlify, connected to the GitHub repo, auto-deploy on `main`. |
| Build | `npm run build` → `dist/` |
| SPA routing | `_redirects` file: `/*  /index.html  200` |
| Env vars | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` in Netlify UI. **Nothing else.** |
| Database | Supabase hosted. Migrations committed to `supabase/migrations/` and applied via the CLI. |
| OAuth redirect | Add the Netlify URL to Supabase Auth → URL Configuration, and to the Google Cloud OAuth consent screen. |
| Backups | Supabase free tier retains daily backups. Additionally export `ledger_entries` weekly — it is the only irreplaceable table. |
| Monitoring | Supabase dashboard logs. Add Sentry if errors become hard to reproduce. |
| Cost | $0. Optional custom domain ~$10/year. |

---

## 17. Out of Scope / Future Work

| Item | Notes |
|---|---|
| Non-member trip participants | See Feature 4.7 in Section 5. Blocked on a design answer for how someone who cannot consent holds a ledger position. The likely shape is a "managed member" wholly represented by a real member who consents on their behalf — which needs thought, not haste. |
| Offline-first | Service worker with a write queue. Raised in priority by Feature 4: trips happen in places with poor signal, and fast entry is worthless if it fails. Reassess after the first real-world trip trial. |
| Receipt photo attachment | Attach a photo to an expense as supporting evidence in the derivation view. Natural companion to the explanation engine; needs Supabase Storage plus a size policy. |
| Trip budget targets | Set an expected spend for a trip and track against it. Pure reporting over existing data. |
| Receipt OCR / NL input | The legitimate LLM use case. Parses to structured data; the deterministic engine still does all arithmetic. |
| Multi-hop transfer chains | A → B → C → D resolved in one proposal. The participant-derivation logic already generalises; the UI does not. |
| Recurring expenses | Rent, utilities, subscriptions. |
| Multi-currency | Requires rate storage and historical rates. |
| Native wrapper | Capacitor, if Play Store presence is ever wanted. No rewrite required. |
| Group archival | Closing out a group with outstanding balances. |
| Export | CSV / PDF statement of a group's full history. |

---

## 18. Glossary

| Term | Meaning |
|---|---|
| **Poisha** | Smallest currency unit. 1 taka = 100 poisha. All amounts stored as integer poisha. |
| **Ledger entry** | An immutable record that one person owes another a specific amount, with a traceable cause. |
| **Pairwise balance** | The net amount A owes B, computed by summing all entries between them in both directions. |
| **Net position** | A person's total across a group. Positive = owed money. Negative = owes money. |
| **Proposal** | A requested ledger change awaiting consent from everyone affected. |
| **Transfer** | Reassigning a debt to a different debtor or creditor, with consent. The product thesis. |
| **Amendment** | A two-party agreed correction to an existing balance. |
| **Settlement** | Recording that a debt has been paid in the real world. |
| **Invalidated** | A proposal that everyone approved, but which could no longer be applied because the underlying debt had changed. |
| **Trip** | A named, time-bounded scope over expenses within a group. A reporting dimension, never a separate ledger. |
| **Trip roster** | The default participant list for new expenses on a trip. A convenience; it restricts nothing. |
| **Preset** | A saved participant subset within a trip, for one-tap reuse when the same people keep sharing costs. |
| **Trip leader** | One of two or three members authorised to record, void, correct and settle within an active trip without anyone's approval. Authority is trip-scoped and lapses when the trip closes. |
| **Entry mode** | A per-trip setting: `leaders_only` (default) or `open`, controlling who may add expenses. |
| **Void** | Cancelling an expense by appending reversing ledger entries and marking the original. Never a deletion or an edit. Done directly by a leader inside an active trip; everywhere else by a `void` proposal requiring unanimous consent. |
| **Dispute** | A member's flag on an entry they believe is wrong. Notifies leaders and appears in the derivation; changes no balance. |
| **Derivation** | The ordered list of ledger entries that produce a balance, each with a plain-language cause. Surfaced by the "Why?" affordance. |
| **Rounding attribution** | Stating explicitly who absorbed the leftover poisha when an amount did not divide evenly. |
| **Advisory lock** | A PostgreSQL mechanism used here to serialise all ledger writes within a single group. |
| **RLS** | Row Level Security — PostgreSQL's per-row access control, the primary authorization mechanism in this project. |
| **anon key** | Supabase's public project identifier. Safe to publish. Grants nothing without RLS permission. |
| **service_role key** | Supabase's administrative key. Bypasses all RLS. Must never reach the browser. |

---

*End of document.*
