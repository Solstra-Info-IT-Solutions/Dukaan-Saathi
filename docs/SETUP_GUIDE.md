# Setup Guide — from zero to a demo phone, then to real shops

Follow the stages in order. **Stage 1 is enough to install the app on your phone and show it to clients.** Stages
2–4 are for real shops and the Play Store.

**Rule for every step:** send me only what the "Send me" line says. **Never paste in chat:** passwords, one-time
codes, the Supabase `service_role` key, the database password, access tokens or API secrets. Where a secret is
needed, I tell you exactly where to paste it yourself (GitHub, Supabase or Expo settings).

---

## Stage 1 — Demo on your phone (about 1–2 hours, free)

Uses the development backend that already exists (`dukaan-saathi-dev`).

### Step 1.1 — Let email sign-in codes work (5 min)
1. Open https://supabase.com/dashboard → project **dukaan-saathi-dev**.
2. **Authentication → Emails → Templates → Magic Link**.
3. In the message body make sure this appears: `Your code is {{ .Token }}` (keep the rest). Save.
4. **Authentication → Sign In / Providers → Email**: Email enabled.

**Send me:** "1.1 done".

### Step 1.2 — Expo account (10 min)
1. Create a free account at https://expo.dev/signup (use the company email).
2. On this computer, open the Terminal panel in this app and run:
   ```bash
   npx eas-cli@latest login
   ```
   Type your Expo email and password **in the terminal** (not in chat).

**Send me:** "1.2 done" and your Expo username (not the password). I then link the project (`eas init`), set the
dev backend values for the preview build and start the build.

### Step 1.3 — An Android phone for the demo
Any Android 10+ phone. Settings → allow installing apps from your browser ("Install unknown apps") — only for this
test build.

**Send me:** phone model and Android version.

### Step 1.4 — Install
I send you an Expo link (and QR code) for the **preview** APK. Open it on the phone → download → install → open
**Dukaan Saathi** → sign in with **Email** → enter the code from your inbox.

### Step 1.5 — Demo data (optional, recommended)
**Send me:** the shop name and type to show clients (e.g. "Sharma Kirana Store, kirana") and the email you signed in
with. I fill that shop with realistic items (with Hindi names), customers with udhaar and a week of bills, so the
reports and udhaar screens look alive in a demo.

### Step 1.6 — Admin panel for your team (on this computer)
```bash
npm run dev --workspace @ds/admin
```
Then open http://localhost:3000. **Send me:** the email address that should be the first super admin. You set its
password through the email link Supabase sends; on first sign-in you set up an authenticator app (Google
Authenticator or Microsoft Authenticator).

**After Stage 1 you can:** bill by keypad, scan barcodes, speak a bill in Hindi, give udhaar, work offline, see
reports, and show the admin panel.

---

## Stage 2 — Your brand and contacts (1 day; needed for marketing)

### Step 2.1 — Domain and website
Buy a domain (e.g. dukaansaathi.in) from any registrar. A one-page site is enough to start (Google Sites, Carrd,
or tell me and I build a simple one). It must later host the privacy policy and terms pages.

**Send me:** the domain.

### Step 2.2 — WhatsApp Business number for support and sales
A separate SIM with WhatsApp Business. **Send me:** the number (+91…) and your support hours. I put it in the app's
plan screen ("Message us on WhatsApp").

### Step 2.3 — App name, logo and colours
**Send me:** the final app name, a square logo (PNG 1024×1024, transparent background if possible) and your brand
colour(s). I update the app icon, splash screen and colours.

### Step 2.4 — Legal text (start now; it takes the longest)
Give [legal/PRIVACY_POLICY_DRAFT.md](legal/PRIVACY_POLICY_DRAFT.md) and [legal/TERMS_DRAFT.md](legal/TERMS_DRAFT.md)
to a lawyer familiar with India's DPDP Act. Publish the final pages on your website.

**Send me:** the two page URLs (https) and a version name (e.g. 2026-11). The Google Play listing requires the
privacy policy URL.

---

## Stage 3 — Production for real shops (1–3 weeks, paid)

### Step 3.1 — Production Supabase (~US$25/month for Pro; PITR backups extra)
1. In the Supabase dashboard create two projects in **Mumbai (ap-south-1)**: `dukaan-saathi-staging` (free is fine)
   and `dukaan-saathi-prod` (Pro plan; turn on **Point-in-Time Recovery** under Database → Backups).
2. Save each project's database password in your password manager (not in chat).

**Send me:** both project URLs and **publishable (anon)** keys (Project Settings → API). These two are public by
design.

### Step 3.2 — GitHub environments (so deploys never need secrets in chat)
1. Supabase → Account → **Access Tokens** → generate one named "github-deploy".
2. GitHub → repository **Dukaan-Saathi** → Settings → **Environments** → create `staging` and `production`.
3. In each environment add:
   - Secret `SUPABASE_ACCESS_TOKEN` = the token from 1
   - Secret `SUPABASE_DB_PASSWORD` = that project's database password
   - Variable `SUPABASE_PROJECT_REF` = the project ref (the part before `.supabase.co` in the URL)
4. For `production` tick **Required reviewers** and add yourself.

**Send me:** "3.2 done". I then run **Actions → Deploy database** for staging, check it, then production (you
approve).

### Step 3.3 — SMS sign-in for India (1–2 weeks, start early)
Shopkeepers sign in with their phone number; India requires DLT registration for SMS.
1. Register your company as a **Principal Entity** on a DLT portal (e.g. Jio TrueConnect or Airtel DLT; needs PAN,
   GST or incorporation certificate, and a letter of authorisation).
2. Register a **sender ID / header** (6 letters, e.g. DKSATH) and a **content template** like:
   `{#var#} is your Dukaan Saathi login code. Do not share it with anyone.`
3. Create an account with an SMS provider Supabase supports (Twilio Verify, MessageBird, Vonage or Textlocal; for
   MSG91 we use a small hook) and link your DLT entity ID, header and template ID there.
4. Paste the provider credentials yourself in Supabase → Authentication → **Phone** provider (prod project).

**Send me:** the provider's name and "3.3 done". I test the sign-in flow with you.

### Step 3.4 — Host the admin panel (free to start)
1. Create an account at https://vercel.com with your GitHub account → **Add New Project** → import
   `Dukaan-Saathi` → Root directory `apps/admin`.
2. Environment variables: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (production values).
3. Optional: add `admin.<your-domain>` under Domains.

**Send me:** the admin URL.

### Step 3.5 — Crash reports (free tier)
Create an account at https://sentry.io → two projects: React Native ("dukaan-saathi-app") and Next.js
("dukaan-saathi-admin").

**Send me:** both **DSN** values (they are meant to be public). I connect them.

### Step 3.6 — Payments for plans (when you start charging)
Razorpay business account (KYC takes a few days) → Subscriptions → create plans matching the app's plans.
Paste the webhook secret yourself in Supabase → Edge Functions → Secrets as `RAZORPAY_WEBHOOK_SECRET`.

**Send me:** "3.6 done" and your plan prices. Until then your team assigns plans in the admin panel.

---

## Stage 4 — Google Play (2–4 weeks including Google's checks)

### Step 4.1 — Developer account (US$25 once)
https://play.google.com/console/signup — choose **Organisation** if you have a registered company (needs a D-U-N-S
number, free from Dun & Bradstreet, ~1–2 weeks). A **personal** account must run a closed test with **at least 12
testers for 14 days** before the app can go public — plan your pilot shops for that.

**Send me:** "4.1 done".

### Step 4.2 — The app in Play Console
1. Create app → name, default language Hindi or English, App, Free.
2. **App content:** privacy policy URL (Step 2.4); data safety form (I give you the answers — the privacy draft
   lists them); target audience 18+; ads: no.
3. Store listing: short and full description (I can write them in Hindi and English), screenshots (I can capture
   them from the demo shop), feature graphic 1024×500.
4. Create a **service account** for uploads (Play Console → Setup → API access) and upload its JSON key yourself to
   Expo (expo.dev → project → Credentials → Android → Google Service Account). Never send the JSON in chat.

**Send me:** "4.2 done". I build the production bundle; **you upload the first one by hand** (Play requires it);
after that I submit updates with `eas submit`.

### Step 4.3 — Closed testing for pilot shops
Play Console → Testing → Closed testing → add the pilot owners' Gmail addresses → share the opt-in link.

---

## Quick reference — what to send me

| Step | Send me | Never send |
|---|---|---|
| 1.1 | "done" | — |
| 1.2 | Expo username | Expo password |
| 1.3 | Phone model | — |
| 1.5 | Demo shop name and type, your sign-in email | Codes |
| 1.6 | Super admin email | Its password |
| 2.1–2.3 | Domain, WhatsApp number, logo, colours | — |
| 2.4 | Privacy and terms URLs, version | — |
| 3.1 | Project URLs, publishable keys | DB passwords, service_role keys |
| 3.2 | "done" | Access token |
| 3.3 | Provider name | Provider keys |
| 3.4 | Admin URL | — |
| 3.5 | Sentry DSNs | Sentry auth tokens |
| 3.6 | Plan prices | Razorpay keys, webhook secret |
| 4.x | "done" | Service-account JSON |
