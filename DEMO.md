# Trying the app with demo data

A local copy of HishebNama with a realistic set of groups, expenses, trips and requests. It runs entirely on your machine and needs no Supabase project or Google account.

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

## Where to go

| What | Address |
|---|---|
| Sign in (pick a demo user) | http://localhost:54341 |
| The app | http://localhost:5173 |

There are no passwords. The sign-in page lists every demo user; click one to sign in as them. To be two people at once, open a private window and pick someone else there.

The terminal also prints the invite link for each group, which is handy for trying the "join a group" flow as Tania.

## Who to sign in as

| User | Sign-in email | Groups | Good for trying |
|---|---|---|---|
| Arif | arif@test.local | Hall 3 Friends, Flat 4B, Office Lunch | Group owner and trip leader. Has a payment to confirm. |
| Sami | sami@test.local | Hall 3 Friends, Office Lunch, Badminton Club | On the Cox's Bazar trip but not a leader, so he sees "ask a leader". Sent a transfer. |
| Rafi | rafi@test.local | Hall 3 Friends, Badminton Club | Trip leader: record payments, void and re-enter. Has a cancellation to approve. |
| Nadia | nadia@test.local | Hall 3 Friends, Flat 4B | Owner of Flat 4B. Questioned the jet ski expense. Has a payment to confirm. |
| Imran | imran@test.local | Hall 3 Friends, Office Lunch, Badminton Club | Owner of Office Lunch. Has requests to approve. |
| Mitu | mitu@test.local | Flat 4B, Office Lunch, Badminton Club | Sent a payment. Has a cancellation to approve. |
| Joya | joya@test.local | Flat 4B, Office Lunch | Has a correction waiting for her approval. |
| Tania | tania@test.local | none | The empty state, creating a group, and joining with an invite link. |

## What's in the data

- **4 groups:** Hall 3 Friends, Flat 4B, Office Lunch and Badminton Club.
- **About 40 expenses** over the last five weeks. Most are split equally; some are entered item by item.
- **Trips:**
  - Cox's Bazar Tour is in progress. Only leaders can add to it. It has a voided and re-entered expense, a questioned expense, and a payment recorded by a leader.
  - Sylhet Weekend is closed.
- **Requests in every state:**
  - Approved, declined and withdrawn ones in the history.
  - Six waiting right now: payments, a transfer, a correction and a cancellation.
- **The guided tour** starts the first time each user opens the app in a browser. Replay it from **Me → Replay app tour**.

## Good to know

- This is demo-only. The sign-in page stands in for Google, and the data lives in a Docker container named `hn-demo-pg`.
- Nothing here touches a real Supabase project, and you should never deploy it.
