# 1CALL — One Message. Thousands of Calls.

Record one voice message and broadcast it as automated phone calls to thousands of contacts. Built for Kenyan churches, schools, NGOs, businesses and campaign offices. Customers buy prepaid call credits with M-Pesa STK Push.

| Part                            | Tech                                                                     | Folder            |
| ------------------------------- | ------------------------------------------------------------------------ | ----------------- |
| Mobile app (Android first, iOS) | React Native + Expo SDK 58, JavaScript                                   | `apps/mobile`     |
| API                             | Node.js 22 + Express 5, Prisma (PostgreSQL), Socket.IO                   | `apps/api`        |
| Worker                          | BullMQ on Redis (dialer, retries, scheduled campaigns)                   | `apps/worker`     |
| Shared rules                    | Phone normalisation, credits, calling hours (used by app **and** server) | `packages/shared` |

> **MOCK MODE is on by default** (`MOCK_MODE=true`). No real calls and no real M-Pesa charges. Every app screen shows an orange banner saying so.

---

## Quick start

### Option A: Docker (Postgres, Redis, MinIO, API, worker)

```bash
cp .env.example .env
docker compose up --build          # API on http://localhost:4000, migrations run on start
docker compose exec api sh -c "cd apps/api && node prisma/seed.js"
```

### Option B: local Node (no Docker)

Requirements: Node 22+ and PostgreSQL 14+. Redis is optional. Without `REDIS_URL` the API runs the dialer in-process, and without `S3_BUCKET` audio is stored in `apps/api/uploads` and served through signed URLs.

```bash
npm install                        # all workspaces (approve install scripts if npm asks)
cp .env.example .env               # set DATABASE_URL; clear REDIS_URL / S3_BUCKET if you don't have them
npm run migrate                    # = npx prisma migrate dev (uses the root .env)
npm run seed                       # WARNING: wipes and re-seeds the database
npm run dev:api                    # http://localhost:4000
npm run dev:worker                 # only when REDIS_URL is set
```

### The mobile app

```bash
cd apps/mobile
npx expo start                     # scan the QR code with Expo Go, or press "a" for an Android emulator
```

The app finds the API automatically in development (the computer running Metro, port 4000). For a real phone on Wi-Fi, set `EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:4000` in `.env` or in `apps/mobile/.env`. The Android emulator uses `http://10.0.2.2:4000`.

### Demo accounts (from the seed)

| Email                  | Password      | What you get                                                                                                     |
| ---------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------- |
| `demo@1call.example`   | `Demo1234!`   | Verified church org, Basic plan, 120 contacts in 3 groups (3 opted out), a recording, 4 past campaigns, payments |
| `admin@1call.example`  | `Admin1234!`  | Platform admin (Account → Admin)                                                                                 |
| `school@1call.example` | `School1234!` | Unverified org with no plan, to test the verification and approval rules                                         |

### Walkthrough (the acceptance path)

Sign up → **Mock: open verification link** → sign in → Contacts: paste numbers → Preview → tick consent → Add → Record: record or upload, name it, tick "says who is calling", Save → Account → Subscription → Choose → PAY → **Mock: customer enters PIN** → Campaigns → START A VOICE BROADCAST → 4 steps → confirm both declarations → watch live progress → Dashboard.

> Calls are only placed **08:00–19:00 East Africa Time**. Outside that window campaigns show RUNNING with 0 processed and start dialing at 08:00. Unanswered and busy numbers are retried after 30 minutes (`RETRY_DELAY_SEC`), so a campaign stays RUNNING until its retries finish. For quick demos, lower `RETRY_DELAY_SEC` (e.g. `60`).

---

## Tests and quality

```bash
npm run test:server                # shared rules + API (Jest + Supertest against a real Postgres)
npm test -w @1call/mobile          # app (Jest + React Native Testing Library)
npm run lint                       # ESLint
npm run format                     # Prettier
```

API tests start an **embedded PostgreSQL** automatically (no setup needed), or use `TEST_DATABASE_URL` if you set it. Coverage:

- auth (Argon2id, email verification, refresh-token rotation and reuse detection, password reset)
- phone normalisation, CSV/Excel import, consent records
- credit reservation, charging and release, including concurrent launches (no overspend)
- suppression at launch and again just before dialing, press 9
- calling hours, retries, concurrency, pause/resume/cancel, scheduled campaigns
- approval flow, payment callback idempotency, amount mismatch, mock M-Pesa, admin

Mobile tests cover the campaign wizard, the import preview and the payment screens.

---

## How it works

### Credits (business rules 1 & 2)

The balance is **always the sum of `CreditLedger` rows**. There is no balance column.

| Event                                     | Ledger rows                                                     |
| ----------------------------------------- | --------------------------------------------------------------- |
| Plan purchased (verified callback only)   | `purchase +credits`                                             |
| Campaign launched                         | `campaign_reserve −(recipients × creditsPerCall)`               |
| Call answered                             | `call_charge −c` and `campaign_release +c` (reserved → charged) |
| Campaign completed / cancelled / rejected | `campaign_release +remaining reservation`                       |
| Admin bonus                               | `bonus +n` (reason logged)                                      |

`creditsPerCall = ceil(messageSeconds / 30)` (minimum 1). Launch locks the organisation row (`SELECT … FOR UPDATE`) and checks `available ≥ required` in the same transaction, so credits can never go negative.

### Dialing engine (`apps/api/src/engine`)

Every `DIALER_TICK_MS`, one tick (a BullMQ job scheduler, or a timer without Redis):

1. Promotes scheduled campaigns whose time has come.
2. Fails calls the provider never reported on (`RING_TIMEOUT_SEC`).
3. Stops if outside 08:00–19:00 Africa/Nairobi.
4. For each running campaign, claims queued attempts with `FOR UPDATE SKIP LOCKED` (safe with several workers). It respects the plan's `concurrency` per organisation and `GLOBAL_CALL_CONCURRENCY`, re-checks org and global suppression lists, then dials.

Outcomes go through `handleCallResult`, which is idempotent. It charges credits, schedules one retry for unanswered/busy calls, records press-9 opt-outs, updates totals and publishes progress to Socket.IO. The app falls back to polling every 3 s.

### Payments

`POST /payments/stk-push` only creates a pending payment. The plan and credits are granted **only** in `handleStkCallback`. It runs from the Daraja callback, verified by a secret path token plus the Safaricom IP allow-list in production, or from the server-side mock endpoints. It matches the `CheckoutRequestID` and the amount, and processes each payment exactly once under a row lock.

### Voice provider

`apps/api/src/providers/voice/index.js` defines the interface. `mock.js` simulates outcomes (≈55% answered, of which ~90% played; ≈25% unanswered; ≈10% busy; ≈10% failed). `africastalking.js` places real calls and builds the `<Play>` / `<GetDigits>` XML for press-9. To add Twilio, implement the same shape and register it.

---

## What is mocked (and how to switch it off)

| Integration | In mock mode                                                                                                                | To go live                                                                                                                                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Voice calls | Simulated outcomes in the dialer, at a steady pace                                                                          | `MOCK_MODE=false`, `VOICE_PROVIDER=africastalking`, `AT_USERNAME`, `AT_API_KEY`, `AT_PHONE_NUMBER`. Set the AT voice callback URL to `{PUBLIC_API_URL}/api/v1/webhooks/voice/events?token={VOICE_WEBHOOK_SECRET}` |
| M-Pesa      | STK push returns fake IDs; the app shows "Mock: customer enters PIN / cancels", which call `/api/v1/mock/mpesa/:id/complete | cancel`. These build a Safaricom-format callback and run it through the real handler                                                                                                                              | `MOCK_MODE=false`, `MPESA_ENV=sandbox` (then `production`), `MPESA_CONSUMER_KEY/SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, a public `PUBLIC_API_URL`. Mock endpoints disappear automatically |
| Email       | Printed to the API console; the app offers "Mock: open verification link"                                                   | Set `SMTP_URL`                                                                                                                                                                                                    |
| Storage     | Local folder + HMAC-signed URLs when `S3_BUCKET` is empty                                                                   | Set the `S3_*` vars (MinIO in Docker, or AWS S3 / R2)                                                                                                                                                             |

Callbacks from Safaricom and Africa's Talking must reach your API over the internet. Use a tunnel such as ngrok in development.

---

## API (`/api/v1`)

Auth: `POST /auth/register|login|refresh|logout|verify-email|forgot-password|reset-password|resend-verification`, `GET /me`, `GET /me/export` (Data Protection Act export) ·
Dashboard: `GET /dashboard` ·
Contacts: `GET /contacts?q=&group=&page=`, `POST /contacts/import/preview` (text or multipart file), `POST /contacts/import/commit`, `DELETE /contacts/:id`, `GET /groups` ·
Recordings: `GET/POST /recordings`, `DELETE /recordings/:id`, `GET /recordings/:id/url` ·
Campaigns: `GET/POST /campaigns`, `POST /campaigns/estimate`, `GET /campaigns/:id`, `GET /campaigns/:id/calls`, `GET /campaigns/:id/calls.csv`, `POST /campaigns/:id/pause|resume|cancel` ·
Billing: `GET /plans`, `GET /subscription`, `POST /payments/stk-push`, `GET /payments`, `GET /payments/:id` ·
Webhooks: `POST /webhooks/mpesa/callback/:token`, `POST /webhooks/voice/events`, `POST /webhooks/voice/dtmf` ·
Mock: `POST /mock/mpesa/:paymentId/complete|cancel` ·
Admin: `GET /admin/overview`, `GET /admin/users`, `PATCH /admin/users/:orgId`, `POST /admin/users/:orgId/bonus`, CRUD `/admin/plans`, `GET /admin/approvals`, `POST /admin/approvals/:id`, `GET /admin/payments` ·
`GET /config` (public: mock flags and banner text).

## Security

Argon2id; 15-minute JWT access tokens plus rotating refresh tokens (hashed in the DB, reuse revokes the family) in `expo-secure-store`; `helmet`; locked-down CORS; `express-rate-limit` on auth, payments and webhooks; zod validation on every endpoint; role middleware, with every query scoped by `orgId`; webhook secrets compared in constant time; CSV export guarded against formula injection; signed, expiring audio URLs; secrets only in server env vars. An audit log records logins, imports, deletions, launches, approvals, plan edits, bonus credits and suspensions.

## Building the apps (EAS)

```bash
cd apps/mobile
npx eas login && npx eas build:configure
npm run build:android              # eas build -p android (profiles in eas.json)
npm run build:ios
```

Set the production API URL in `eas.json` (`EXPO_PUBLIC_API_URL`). `assets/icon.png` is a generated placeholder of the 1CALL mark. Replace it with final artwork before store submission.

## Notes and known limits

- **Duplicates on import** are checked against the existing contacts **in the target group** (and within the import). The same person may be in two groups. The dialer never calls the same number twice within one campaign, because a campaign targets one group.
- Credits do not expire when a plan expires. A new purchase extends the plan from the later of now and the current expiry.
- Telecom spend in the admin overview is an estimate (`VOICE_COST_KES_PER_MIN` × answered minutes).
- Phase 6 store listing assets (screenshots, descriptions) are not included.
