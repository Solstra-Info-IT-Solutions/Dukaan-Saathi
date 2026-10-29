# Phase 14 — Full Regression, Android Builds, Deployment, Real-Shop Pilot

Status: **Prepared — the remaining steps need your accounts and the pilot shops** · Date: 2026-10-29 ·
Spec: [../DEPLOYMENT_GUIDE.md](../DEPLOYMENT_GUIDE.md)

Everything that can be built and checked without external accounts is done. What is left is creating the
production project, the Play listing, publishing the legal text and visiting the shops — those need you.

## What was built

### 1. Regression (BL-1401)
- `npm run verify` runs the whole automated suite in one command: format, typecheck, lint, every unit test
  (mobile, admin, contracts, domain-core) and the database pre-check. CI additionally runs pgTAP, concurrency and
  the 100 000-bill load check on real Supabase.
- [../RELEASE_CHECKLIST.md](../RELEASE_CHECKLIST.md): builds, an 18-journey manual regression on three phones
  (low-end / mid / recent, Hindi and English, TalkBack and 200 % font included), admin checks, go / no-go and
  rollback.

### 2. Android builds and store (BL-1402)
- `apps/mobile/eas.json`: **development** (dev client APK), **preview** (internal APK, staging), **production**
  (AAB, version code auto-incremented by EAS, remote app version), submit to the Play **internal** track as a draft.
  Backend URL and publishable key come from EAS environment variables per environment (never the service key).
- `expo-dev-client ~58.0.17` installed (needed for the native modules: speech, camera, SQLite).

### 3. Deployment
- `.github/workflows/deploy-database.yml` (manual): choose staging or production; checks that the environment has
  `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_REF`; links, shows a dry run, pushes
  migrations and deploys every Edge Function. Protect the production environment with a required reviewer.
- `supabase/config.toml`: `payment-webhook` without JWT check (the provider signs instead); `admin-invite-operator`
  with it.

### 4. Privacy policy and terms in the app (BL-1403)
- Platform config `legal` `{ version, privacyUrl, termsUrl }` (https links, checked by the database); returned by
  `get_client_config` once published.
- After sign-in, a user who has not accepted the published version sees only **Privacy policy and terms**: read
  either document, **I have read and accept** (`accept_terms`, stored on the profile with the time, audited
  `profile.terms_accepted`), or sign out. Nothing is asked until a version is published; offline never blocks.
- **More → Privacy & terms** shows the links and when the user accepted.
- Drafts for your lawyer: [../legal/PRIVACY_POLICY_DRAFT.md](../legal/PRIVACY_POLICY_DRAFT.md) (what the app
  actually collects, where, why, retention) and [../legal/TERMS_DRAFT.md](../legal/TERMS_DRAFT.md).

### 5. Pilot and support (BL-1404, BL-1405)
- [../PILOT_PLAYBOOK.md](../PILOT_PLAYBOOK.md): choosing 10 shops, preparation, the day-1 visit, the 4-week routine,
  what to measure, stop / pause rules.
- [../SUPPORT_RUNBOOK.md](../SUPPORT_RUNBOOK.md): daily routine, common problems with checks and fixes, incident
  severities with first steps (kill switch, maintenance), what support must never do.

## Database (applied to `dukaan-saathi-dev`)
| Migration | Content |
|---|---|
| `20261029100820_p14_legal_consent` | `profiles.terms_version`, `terms_accepted_at`; config key `legal` (+ validation); `get_client_config` with `legal`; `get_my_consent`, `accept_terms` |

## Tests executed (2026-10-29)
| Suite | Result |
|---|---|
| `npm run verify` | ✅ format, typecheck, lint; mobile **556 / 556**, admin **37 / 37**, contracts **30 / 30**, domain-core **77 / 77**; DB pre-check **458 / 458** |
| admin `next build` | ✅ |
| `expo-doctor` | ⚠️ one check: 10 Expo packages have newer SDK 58 patch versions — run `npx expo install --check` and the full suite before the first store build (RELEASE_CHECKLIST.md §2) |
| DB pre-check (PGlite) | **458 / 458** assertions (new `021_legal_consent` 9) |
| CI on real Supabase | RESULT_CI |

**Database (021):** no links before publishing and nothing to accept; https required; super admin publishes; apps
get the links; old version refused; current accepted; acceptance audited.
**App:** consent needed only for a published, unaccepted version; gate shows the terms until accepted, opens the
documents, allows sign-out; More shows the accepted version and date; More list per role includes Privacy & terms.

## Acceptance criteria
- [~] Full automated suite green (above); manual checklist on 3 real devices — **needs the phones**.
- [ ] Production Supabase + admin deployed; Play closed testing live — **needs the production project, admin
  hosting (OD-14), Expo/EAS login and a Google Play developer account**. The workflow and EAS profiles are ready.
- [~] Privacy policy and terms live — in-app flow done; **legal text needs your lawyer and a website** (OD-12).
- [ ] 10 pilot shops onboarded with support runbook — playbook and runbook ready; **the shops are yours to choose**.

## Decisions (DECISIONS.md)
ADR-076 legal documents on the web, accepted once per version in the app · ADR-077 manual, reviewed deployment
workflow per environment · ADR-078 EAS builds with remote app versions; production goes to the internal track first.

## Steps for you, in order
1. Create Supabase projects `dukaan-saathi-staging` and `dukaan-saathi-prod` (paid plan with PITR for prod); add
   GitHub environments `staging` and `production` with the secrets and variable above; run **Deploy database** for
   staging, then production.
2. In production: first super admin (insert into `platform_admins`), email template with `{{ .Token }}`, SMS
   provider with DLT templates (OD-02), `support.contact`, `app.latest_version`.
3. Host the admin panel (OD-14) with `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. `npx eas-cli@latest login`, `npx eas-cli@latest init` in `apps/mobile`, set EAS environment variables, build
   `preview` for the test phones, run [../RELEASE_CHECKLIST.md](../RELEASE_CHECKLIST.md).
5. Google Play developer account → app `in.dukaansaathi.app` → upload the first production AAB by hand (Play needs
   one manual upload), then `eas submit`; closed testing list with the pilot owners' emails.
6. Lawyer finalises the privacy policy and terms → publish on the website → set `legal` in Platform config.
7. Sentry DSN for crash reports (not wired yet — say the word and it is the first Phase 15 task).
8. Follow [../PILOT_PLAYBOOK.md](../PILOT_PLAYBOOK.md).

## Known limitations (Phase 14)
- No crash reporting yet (Sentry needs a DSN); no restore drill yet (needs production with PITR).
- Legal texts are drafts; consent records the version, not the full text (the website keeps old versions).
- Play listing assets (screenshots, description, data-safety form) are not prepared.

## Recommended next phase
After the pilot starts: Phase 15 — post-launch (crash reporting, pilot feedback, notification templates, payment
provider).
