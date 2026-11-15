# Trying the app with demo data

A local copy of HishebNama with a realistic set of groups, expenses and requests. It runs entirely on your machine and needs no Supabase project or Google account.

## How to start

1. Start **Docker Desktop** and wait until it says it's running.
2. In the project folder, run:

   ```bash
   npm install
   npm run demo
   ```

The first run downloads PostgreSQL and PostgREST and loads the demo data. After that it reuses the same data, including anything you change.

To throw your changes away and start from fresh demo data, run:

```bash
npm run demo:reset
```

Stop it with **Ctrl+C**.

### Without Docker

If PostgreSQL is installed on your machine (any version from 16 up), run this instead:

```bash
npm run dev:local          # keeps data between runs
npm run dev:local:reset    # starts from fresh demo data
```

It creates its own database cluster in `.local/pgdata` on port 54329, so an existing PostgreSQL service is left alone. On the first run it downloads PostgREST into `.local/postgrest`. It looks for PostgreSQL in `PG_BIN`, then on `PATH`, then in `C:\Program Files\PostgreSQL`. Delete `.local` to remove everything it created.

Live updates between two browser windows don't work locally, with or without Docker: there is no Realtime server. Switching back to a tab or reloading shows the latest data.

## Where to go

| What | Address |
|---|---|
| Sign in (pick a demo user) | http://localhost:54341 |
| The app | http://localhost:5173 |

There are no passwords. The sign-in page lists every demo user; click one to sign in as them. To be two people at once, open a private window and pick someone else there.

The terminal also prints the invite link for each group, which is handy for trying the "join a group" flow as Tania.

## Who to sign in as

| User | Sign-in email | Groups | Tours | Good for trying |
|---|---|---|---|---|
| Arif | arif@test.local | Hall 3 Friends, Flat 4B, Office Lunch | Cox’s Bazar (owner) | Owner of Hall 3 Friends. Confirm a payment. Manage tour expenses. |
| Sami | sami@test.local | Hall 3 Friends, Office Lunch, Badminton Club | Cox’s (leader), Bandarban (owner) | Badminton owner; tour leader on Cox’s; Bandarban owner. |
| Rafi | rafi@test.local | Hall 3 Friends, Badminton Club | Both tours | Transfer + cancellation to approve; tour balances. |
| Nadia | nadia@test.local | Hall 3 Friends, Flat 4B | Cox’s Bazar | Flat 4B owner; payment to confirm; tour member. |
| Imran | imran@test.local | Hall 3 Friends, Office Lunch, Badminton Club | Cox’s Bazar | Office Lunch owner; inbox + tour balances. |
| Mitu | mitu@test.local | Flat 4B, Office Lunch, Badminton Club | Both tours | Payment sent; cancellation to approve; tour member. |
| Joya | joya@test.local | Flat 4B, Office Lunch | none | Correction waiting; create/join a tour from empty. |
| Tania | tania@test.local | none | none | Empty states. Join Cox’s with PIN **11223344**, or join a group via invite link. |

## What's in the data

- **Home (global ledger):** pairwise balances across all outing expenses **and** consent-based claims. Sign in as Arif to see Joya’s approved ৳500 claim mixed with group debts. Imran has a pending claim from Sami in Inbox.
- **4 outing groups:** Hall 3 Friends, Flat 4B, Office Lunch and Badminton Club (expenses still write the global ledger).
- **About 40 expenses** over the last five weeks. Most are split equally; some are entered item by item. One duplicate was cancelled by agreement.
- **Requests in every state:**
  - Approved, declined and withdrawn ones in the history.
  - Waiting now: payments, a transfer, a correction, a cancellation, plus Sami→Imran Home claim.
- **2 tours** (Tours tab — **separate**; never affect Home):
  - **Cox’s Bazar Tour** — PIN `11223344`. Arif owns it; Sami is a secondary leader. Six members, equal-split and individual-bill expenses.
  - **Bandarban Weekend** — PIN `99887766`. Sami owns it with Rafi and Mitu.
- **The guided product tour** starts the first time each user opens the app. Replay from **Me → Replay app tour**.

## Good to know

- This is demo-only. The sign-in page stands in for Google, and the data lives in a Docker container named `hn-demo-pg` (or in `.local/pgdata` without Docker).
- Nothing here touches a real Supabase project, and you should never deploy it.
