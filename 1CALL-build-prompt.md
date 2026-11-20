# Build Prompt: 1CALL – "One Message. Thousands of Calls."

> Paste everything below into your AI coding assistant (or hand it to a developer).

---

## Role and goal

You are a senior full-stack mobile engineer. Build **1CALL**, a **phone app** (Android first, iOS second) that lets organisations in Kenya (churches, schools, NGOs, businesses, campaign offices) **record one voice message and broadcast it as automated phone calls to thousands of contacts**. Customers pay for prepaid call credits with **M-Pesa STK Push**.

The HTML prototype I am attaching is the reference for screens, flows, wording, colours and business rules. Rebuild it as a production-quality mobile app.

**Tech stack (required):**

- **Mobile app:** React Native with **Expo** (managed workflow, EAS Build), **JavaScript only (no TypeScript)**
- **Backend:** **Node.js** (LTS) with **Express**, JavaScript (ES modules)
- **Database:** PostgreSQL with Prisma ORM (JavaScript client)
- **Jobs / queues:** Redis + BullMQ (campaign dialing, retries, scheduled campaigns)
- **Voice provider:** Africa's Talking Voice API, behind a provider interface so it can be swapped (e.g. Twilio)
- **Payments:** Safaricom **M-Pesa Daraja** STK Push (Lipa Na M-Pesa Online)
- **Audio storage:** S3-compatible object storage; server converts uploads with **ffmpeg**
- **Auth:** email + password, **Argon2id** hashing, JWT access token (15 min) + rotating refresh token, stored on device with `expo-secure-store`

## Project structure

```
1call/
  apps/mobile/          # Expo React Native app (JavaScript)
  apps/api/             # Node.js + Express API (JavaScript)
  apps/api/prisma/      # schema.prisma, migrations, seed.js
  apps/worker/          # BullMQ workers (dialer, retries, scheduler)
  docker-compose.yml    # postgres, redis, minio, api, worker
  .env.example
  README.md
```

## Global requirement: MOCK MODE

Ship with `MOCK_MODE=true` by default. In mock mode:

- No real calls are placed. The worker **simulates** call outcomes (≈55% answered, of which ~90% "message played"; ≈25% unanswered; ≈10% busy; ≈10% failed) at a steady pace so the live progress screen visibly updates.
- No real M-Pesa charges. The payment screen shows two buttons: "Mock: customer enters PIN" and "Mock: customer cancels", which hit a **server-side mock callback**. The plan still activates **only on the server**, never from the app.
- The app shows a persistent orange banner on every screen: **"MOCK MODE – no real phone calls and no real M-Pesa payments."**

Real integrations are switched on per provider with env vars (`VOICE_PROVIDER=africastalking`, `MPESA_ENV=sandbox|production`).

## Branding and design

- Logo: orange circle (`#f58220`) with a white phone handset, wordmark **1CALL** in heavy white type.
- Tagline: "One Message. Thousands of Calls."
- Colours (light): background `#f4f6fb`, card `#ffffff`, text `#0f1b3d`, muted `#5b6785`, border `#dfe4f0`, primary `#0b3a8f`, accent `#f58220`, success `#128a4b`, danger `#c62828`, warning `#9a5b00` on `#fff4e0`.
- Colours (dark): background `#0b1226`, card `#131c36`, text `#e8ecf7`, muted `#9aa6c4`, border `#25304f`, primary `#3b73e6`, accent `#ff9a3c`, success `#3ecf8e`, danger `#ff6b6b`, warning `#ffc266` on `#3a2a10`.
- Follow the system light/dark setting. Rounded cards (12px), rounded buttons (8px), large orange primary call-to-action buttons.
- Navigation: **bottom tab bar** (React Navigation) with Dashboard, Contacts, Record, Campaigns, Account. "Account" holds Subscription, Payments, and (for admins) Admin. Respect safe areas.
- Accessible: minimum 44pt touch targets, screen-reader labels, respects "reduce motion".

## Screens (mobile)

### 1. Sign in / Sign up / Forgot password

- Email, password, "Sign in". Links to create account and reset password.
- Sign-up collects organisation name, contact name, email, phone, password; sends an email verification link.
- Users with role `admin` see the Admin area.

### 2. Dashboard

- Stat tiles: Available credits (credits minus reserved), Contacts, Answered calls, Unanswered, Failed, Completed campaigns, Active campaigns.
- "Campaign history" grouped bar chart (green = answered, orange = unanswered) plus a table: campaign, answered, unanswered, failed. Use `react-native-svg` (or Victory Native).
- Big orange button **START A VOICE BROADCAST** → campaign wizard.
- Pull to refresh.

### 3. Contacts

- Note at top: "Only upload people you are authorised to contact. Consent is recorded for every import."
- **Import** by: pasting numbers (one per line, optional `name,number`), choosing a **CSV or Excel (.xlsx)** file (`expo-document-picker`; parse on the server), or **picking from phone contacts** (`expo-contacts`, with permission prompt).
- Group name field (default "Campaign Contacts").
- **Preview import** shows counts of valid / duplicate / invalid and the first rows with status colours.
- Consent source dropdown: `web_form`, `sms_optin`, `event_signup`, `paper_form`, `existing_customer`.
- Required checkbox: "I confirm these people agreed to receive voice calls from me and I may contact them." Button "Add N contacts" disabled until there are valid rows.
- **All contacts** list: search by name or number, filter by group, status badge ("Consent on file" green / "Opted out" red), swipe or button to delete. Paginate / infinite scroll (FlatList).

**Phone normalisation (implement identically on client for preview and on server as the source of truth):**

- Strip spaces, dashes, dots, parentheses.
- `07XXXXXXXX` / `01XXXXXXXX` → `+2547XXXXXXXX` / `+2541XXXXXXXX`
- `2547…` / `2541…` (12 digits) → add `+`
- `+2547…` / `+2541…` → keep
- Other valid E.164 international numbers (`+` then 8–15 digits) → keep
- Anything else → invalid. Duplicates are checked against the account's existing contacts and within the same import.

### 4. Record Voice

- Big timer (m:ss), state label (Ready / ● Recording with pulsing red dot / Paused / Recording ready).
- Buttons: Record, Pause, Resume, Stop, Record again. Use `expo-audio` (or `expo-av`) with microphone permission; show a clear error if permission is denied and point to the upload option.
- After recording: playback, "Name this recording" field, required checkbox **"This message says clearly who is calling."**, Save / Discard.
- Or **upload** an existing MP3, WAV or M4A file.
- Server converts audio to the provider's format (e.g. 8 kHz mono WAV / MP3), stores it, records duration. Warn if longer than 30 seconds (billing unit).
- "Saved recordings" list: name, duration, play, delete.

### 5. Voice Campaigns – 4-step wizard

Step indicator: **1. Recipients · 2. Message · 3. Details · 4. Review**.

1. **Recipients:** choose a contact group. Show "N contacts · X opted out and will be skipped · **Y** will be called". Next disabled if Y = 0.
2. **Message:** choose a saved recording with preview playback; link to Record Voice if none.
3. **Details:** campaign name; type (`informational`, `transactional`, `promotional`, `political`) — promotional/political show a warning that they need account verification and **admin approval**; when: "Start immediately" or "Schedule for later" (date-time picker); checkbox (on by default) **"Offer 'press 9 to stop receiving calls' after the message"**. Info text: "Calls are placed between 08:00 and 19:00 East Africa Time. Unanswered calls are retried once."
4. **Review:** table of campaign name, recording, recipients, estimated credits (maximum = recipients), available credits (red if insufficient), restrictions ("Opt-out on · 08:00–19:00 · max 2 attempts"). Note: "1 credit is charged per answered call of up to 30 seconds. Unanswered, busy and failed calls are not charged." Orange **START VOICE BROADCAST** button, disabled unless there are recipients, a recording, enough credits and a name.

**Confirmation modal** before launch: summary plus two required checkboxes:

- "These contacts agreed to receive these calls and I have the right to contact them."
- "My message names who is calling and is lawful, truthful and not harassing."

**Live campaign screen:** campaign name, status (RUNNING / PAUSED / COMPLETED / CANCELLED / PENDING APPROVAL / SCHEDULED), "X of Y processed", progress bar, tiles: Answered, Message played, Unanswered, Busy, Failed, Credits used. Buttons: Pause, Resume, Cancel, New campaign. Updates live via **Socket.IO** (fall back to polling every 3 s). Note that "Answered" is shown separately from "Message played".

Also a **campaign list** with status and a detail screen with per-call results and CSV export.

### 6. Subscription

- Current plan, expiry date, available credits.
- Plan cards (loaded from the API, only active plans): name, price in KES, credits, validity days, max recipients per campaign, concurrent calls, "Choose".
- Seed plans: Starter KES 1,000 / 500 credits / 30 days / 500 max / 5 concurrent; Basic 3,500 / 2,000 / 30 / 2,000 / 10; Professional 8,000 / 5,000 / 30 / 5,000 / 20; Business 14,000 / 10,000 / 60 / 10,000 / 30; Enterprise 60,000 / 50,000 / 90 / 50,000 / 60.

### 7. Payments

- Selected plan and price, M-Pesa phone number field (numeric keypad), orange "PAY KES X" button. Validate a Kenyan number.
- After tapping Pay: "Check your phone" screen telling the user to enter their M-Pesa PIN; poll payment status until succeeded / failed / timeout.
- Payment history: date, plan, amount, status (green / red / amber), M-Pesa receipt.

### 8. Admin (role `admin` only, enforced on the server)

Tabs:

- **Overview:** total revenue, today, this month, this year, active subscriptions, pending payments, failed payments; platform activity (calls made, active campaigns, credits consumed, telecom spend, failed call %); most popular plans.
- **Users:** customer name and email, plan, credits, status; Suspend / Activate; grant bonus credits (with reason, logged).
- **Plans:** edit name, price, credits, days, max campaign size, concurrent calls, active toggle; add and delete plans.
- **Approvals:** pending promotional/political campaigns with org, type, recipient count, recording playback; Approve / Reject (with reason).
- **Payments:** all payments with customer column.

## Backend (Node.js + Express)

### Data model (Prisma)

- `Organization` (name, verified, status active/suspended)
- `User` (org, name, email, phone, passwordHash, role `owner|member|admin`, emailVerifiedAt)
- `Plan` (name, priceKes, credits, days, maxRecipients, concurrency, active)
- `Subscription` (org, plan, startsAt, expiresAt)
- `CreditLedger` (org, delta, reason `purchase|campaign_reserve|campaign_release|call_charge|bonus|refund`, refId) — **balance = sum of ledger; never store a mutable balance only**
- `ContactGroup`, `Contact` (org, group, name, phoneE164, consentSource, consentAt, importId), unique (org, phoneE164, group)
- `ContactImport` (org, user, counts, consent declaration accepted, timestamp, IP)
- `Suppression` (org, phoneE164, source `press9|manual|admin`, createdAt) — also a **global** suppression list
- `Recording` (org, name, storageKey, durationSec, identifiesCaller boolean)
- `Campaign` (org, name, groupId, recordingId, category, scheduledAt, optOutEnabled, status, totals, approval fields, declarations accepted)
- `CallAttempt` (campaign, contact, attemptNo, providerCallId, status `queued|ringing|answered|played|unanswered|busy|failed`, durationSec, creditsCharged)
- `Payment` (org, plan, amountKes, phone, status `pending|succeeded|failed`, merchantRequestId, checkoutRequestId, mpesaReceipt, rawCallback)
- `AuditLog` (actor, action, target, details)

### API endpoints (REST, JSON, `/api/v1`)

- Auth: `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/verify-email`, `/auth/forgot-password`, `/auth/reset-password`, `GET /me`
- Dashboard: `GET /dashboard`
- Contacts: `GET /contacts?q=&group=&page=`, `POST /contacts/import/preview` (text or file), `POST /contacts/import/commit`, `DELETE /contacts/:id`, `GET /groups`
- Recordings: `GET /recordings`, `POST /recordings` (multipart), `DELETE /recordings/:id`, `GET /recordings/:id/url` (short-lived signed URL)
- Campaigns: `GET /campaigns`, `POST /campaigns/estimate`, `POST /campaigns`, `GET /campaigns/:id`, `POST /campaigns/:id/pause|resume|cancel`, `GET /campaigns/:id/calls.csv`
- Plans / billing: `GET /plans`, `GET /subscription`, `POST /payments/stk-push`, `GET /payments/:id`, `GET /payments`
- Webhooks (no JWT, verified): `POST /webhooks/mpesa/callback`, `POST /webhooks/voice/events`, `POST /webhooks/voice/dtmf`
- Mock only: `POST /mock/mpesa/:paymentId/complete|cancel`
- Admin: `GET /admin/overview`, `GET/PATCH /admin/users`, `POST /admin/users/:id/bonus`, `CRUD /admin/plans`, `GET /admin/approvals`, `POST /admin/approvals/:id`, `GET /admin/payments`

### Business rules (must be enforced server-side)

1. **Credits:** 1 credit per answered call, per started 30 seconds of message (a ≤30 s message = 1 credit). Unanswered, busy and failed calls cost nothing.
2. **Reservation:** on launch, reserve credits = recipients × credits-per-call. Reject if available < required. On each answered call, convert reserved to charged; on completion/cancel, release the rest. All in DB transactions.
3. **Suppression:** skip numbers on the org's or global suppression list at launch **and again just before dialing**.
4. **Press 9 opt-out:** if enabled, after the message play "Press 9 to stop receiving calls from <org>". DTMF 9 adds the number to the org's suppression list immediately.
5. **Calling hours:** only dial 08:00–19:00 Africa/Nairobi. Calls outside the window wait for the next window.
6. **Retries:** unanswered/busy → one retry after ~30 minutes (max 2 attempts).
7. **Concurrency:** limit simultaneous calls per org to the plan's `concurrency`; global limit from env.
8. **Plan limits:** recipients per campaign ≤ plan `maxRecipients`; subscription must be active (not expired); suspended orgs cannot launch.
9. **Approval:** `promotional` and `political` campaigns go to `pending_approval` and only start after an admin approves; org must be verified.
10. **Payments:** credits and subscription are granted **only** by the verified M-Pesa callback (or the mock callback in mock mode), matching `CheckoutRequestID` and amount, idempotent (process each callback once). Never trust the app to say a payment succeeded.
11. **Consent:** imports require the declaration checkbox; store consent source, timestamp, user and IP. Recordings require the "says who is calling" confirmation.
12. **Audit log** for logins, imports, deletions, launches, approvals, plan edits, bonus credits, suspensions.

### Security

- Argon2id, rate limiting on auth and payment endpoints (`express-rate-limit`), `helmet`, CORS locked down, input validation with `zod` (JS) on every endpoint.
- Role-based access middleware; every query scoped by `orgId`.
- Verify webhooks (M-Pesa: allowlist Safaricom IPs + shared secret path token; voice: provider signature/secret).
- Secrets only in env vars; never in the mobile bundle.
- Signed, expiring URLs for audio.
- Data protection: comply with Kenya's Data Protection Act 2019 (consent records, deletion on request, export).

## Testing and quality

- Backend: Jest + Supertest for auth, phone normalisation, import, credit reservation/charging/release, suppression, calling-hours scheduler, approval flow, payment callback idempotency.
- Mobile: Jest + React Native Testing Library for the wizard, import preview, and payment screens.
- ESLint + Prettier. Seed script creating a demo account (`demo@1call.example`), an admin (`admin@1call.example`), 120 sample contacts in 3 groups (Customers, Church Members, Parents) with 3 opted out, the 5 plans, and sample campaign history and payments.

## Delivery phases

1. Monorepo, Docker Compose, DB schema, seed, auth (API + mobile sign-in/up).
2. Contacts import/list + Recordings (record, upload, convert, play).
3. Campaign wizard, credit ledger, mock dialer worker, live progress via Socket.IO, dashboard.
4. Subscription, mock M-Pesa flow, payment history, admin area.
5. Real voice provider integration (Africa's Talking), press-9 opt-out, retries, calling hours.
6. Real M-Pesa Daraja STK Push (sandbox → production), EAS builds for Android/iOS, store listing assets.

After each phase: run tests, update README with setup steps (`docker compose up`, `npx prisma migrate dev`, `npm run seed`, `npx expo start`), and list what is mocked.

## Acceptance criteria

- A new user can sign up, verify email, import contacts, record a message, buy a plan (mock), launch a broadcast, watch live progress, and see results on the dashboard — all on a phone.
- Opted-out numbers are never called. Credits never go negative. Payments activate plans only via server callback.
- Promotional/political campaigns do not start until an admin approves.
- App works in light and dark mode on small Android phones (360 dp wide) without horizontal scrolling.
