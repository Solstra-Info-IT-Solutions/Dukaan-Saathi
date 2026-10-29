# Release Checklist (BL-1401, BL-1402)

Use for every release that goes to pilot shops. Tick in the release PR; keep the filled copy in
`docs/releases/<version>.md`.

## 1. Automated (must be green)
- [ ] `npm run verify` locally: format, typecheck, lint, all unit tests (mobile, admin, contracts, domain-core), DB
      pre-check.
- [ ] CI on the release commit: both jobs green, including pgTAP on real Supabase, the `create_sale` concurrency
      checks and the load check (p95 < 150 ms at 100 000 bills; read the notice for the number).
- [ ] Supabase security and performance advisors on staging: nothing new beyond the justified list in
      [phases/PHASE_13_HARDENING.md](phases/PHASE_13_HARDENING.md) §6.

## 2. Builds
- [ ] `npx expo-doctor` clean (for the first build: `npx expo install --check` to take the SDK 58 patch updates, then
      `npm run verify` again).
- [ ] Version bumped in `apps/mobile/app.json` (`expo.version`); EAS sets the Android version code (remote).
- [ ] `npx eas-cli@latest build -p android --profile preview` (APK, staging backend) installed on the test phones.
- [ ] `npx eas-cli@latest build -p android --profile production` (AAB) → `npx eas-cli@latest submit -p android
      --profile production` to the internal track; promote to closed testing (pilot shops) after §3.
- [ ] EAS environment variables set per environment (`EXPO_PUBLIC_SUPABASE_URL`,
      `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; never the service key).

## 3. Manual regression on 3 phones
Phones: one low-end (≤ 3 GB RAM, Android 10–11), one mid (Android 13–14), one recent (Android 15+). Language: run
once in Hindi, once in English. Tick per phone (L / M / R).

| # | Journey | L | M | R |
|---|---|---|---|---|
| 1 | Sign in with phone OTP; create a shop; second phone joins as cashier by invitation | | | |
| 2 | Accept privacy policy and terms (first sign-in after publishing) | | | |
| 3 | Add 5 items by hand, import 50 by CSV, scan a barcode | | | |
| 4 | Quick bill (keypad), product bill, split payment (cash + UPI), receipt share on WhatsApp | | | |
| 5 | Voice bill in Hindi ("do kilo aata aur ek Maggi") → review → add → pay | | | |
| 6 | Udhaar bill, repayment, reminder message | | | |
| 7 | Airplane mode: 3 bills, an udhaar bill, a customer; back online → all sent, numbers in order | | | |
| 8 | Void within the window; return with stock back | | | |
| 9 | Expense with photo; day close with cash count | | | |
| 10 | Stock count, supplier purchase, stock report | | | |
| 11 | Reports 7 days; export (plan with export) | | | |
| 12 | Help: ask a question; reply from the admin panel arrives | | | |
| 13 | Plan screen; locked module opens the plan | | | |
| 14 | Update gate: set `app.min_supported_version` above the build on staging → update screen; set back | | | |
| 15 | Maintenance with `blocksWrites` on staging → banner, saving refused, reads work; turn off | | | |
| 16 | TalkBack on: complete journey 4 by voice output only | | | |
| 17 | Font size 200 %: billing, payment and udhaar screens still usable | | | |
| 18 | Kill and reopen the app mid-bill; low battery saver on; slow 3G network profile | | | |

## 4. Admin panel
- [ ] Sign in with MFA; dashboard and System health show green jobs.
- [ ] Shop search, plan assignment with reason, override, flag override — each appears in the audit log.
- [ ] Onboarding: photos open, CSV upload, send to owner; owner commits in the app.

## 5. Go / no-go
- [ ] No open P1 bug (data loss, wrong totals, cannot bill) and no P2 without a workaround in the support runbook.
- [ ] Database migrations applied to production with the **Deploy database** workflow (dry run read first).
- [ ] `app.latest_version` set after the build is live; `app.min_supported_version` raised only when most pilot
      phones have updated (DEPLOYMENT_GUIDE.md §5).
- [ ] Rollback ready: previous AAB on the track, flags to switch off, maintenance banner text prepared.
