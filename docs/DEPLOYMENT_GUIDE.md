# Deployment Guide

Nothing is deployed yet. This document is the target process; each step is verified in the phase that introduces it.

## 1. Prerequisites (to be done by you — credentials cannot be invented)

| Item | Needed by | Status |
|---|---|---|
| Dedicated git repo + GitHub remote (ADR-001, OD-01) | Phase 01 | ❌ |
| Supabase account; projects `dukaan-saathi-dev`, `-staging`, `-prod` in Mumbai region | Phase 01/02 | ❌ (a Supabase connector is available in this environment; project creation has cost implications → needs your approval) |
| Docker Desktop (local Supabase + pgTAP) | Phase 01 | ❌ not installed |
| Supabase CLI (as dev dependency `supabase` via npx) | Phase 01 | ❌ |
| Expo account + EAS CLI login | Phase 01 (builds from Phase 04) | ❌ |
| SMS provider with DLT registration (OD-02) | before pilot | ❌ |
| Sentry org + projects | Phase 01 | ❌ |
| Google Play developer account | Phase 14 | ❌ |
| Admin hosting account (OD-14) | Phase 11 | ❌ |
| Payment provider account (OD-05) | Phase 12 | ❌ |
| Privacy policy + terms (OD-12) | before pilot | ❌ |

## 2. Environments and configuration

| Variable | mobile | admin | edge | secret? |
|---|---|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ✅ | — | no |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ✅ | — | no (public) |
| `EXPO_PUBLIC_SENTRY_DSN` | ✅ | ✅ | ✅ | no |
| `EXPO_PUBLIC_APP_ENV` | ✅ | — | — | no |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ never | ❌ never | ✅ (auto-injected) | **yes** |
| `PAYMENT_WEBHOOK_SECRET`, provider keys | — | — | ✅ | yes |
| `CRON_SHARED_SECRET` | — | — | ✅ (Vault) | yes |

## 3. Database release

1. Migration PR → CI runs reset + pgTAP on a clean DB.
2. Merge → GitHub Action `supabase db push` to **staging** (needs `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`).
3. Smoke tests against staging.
4. Manual approval → `supabase db push` to **production**. Take a manual backup marker before destructive changes.
5. Migrations must be backward compatible with the currently released app (expand → migrate → contract over two releases).

## 4. Edge Functions

`supabase functions deploy <name> --project-ref <ref>`; secrets via `supabase secrets set`. Same staging → prod flow.

## 5. Mobile release

- `eas.json` profiles: `development` (dev client), `preview` (internal APK, staging), `production` (AAB, prod).
- `runtimeVersion` policy: `fingerprint` (native changes ⇒ new runtime ⇒ store build required).
- JS-only fixes: `eas update --channel production` after staging verification; never ship DB-incompatible JS.
- Store: `eas submit -p android` to internal testing → closed testing (pilot shops) → production.
- Bump `app.min_supported_version` in platform config only after the new version is broadly available.

## 6. Admin release

Build `next build` in CI; deploy to staging on merge, production on tag. Environment variables per §2.

## 7. Backups and recovery

- Production: Supabase daily backups + **PITR add-on** (paid) enabled before pilot.
- Weekly logical dump (`supabase db dump`) to an encrypted off-platform location (GitHub Action, retention 90 days).
- Storage buckets: weekly sync of private buckets to off-platform storage.
- **Restore drill** before pilot (Phase 14): restore to a scratch project, run integrity checks (ledger vs projection), record time taken.
- Device-side: unsynced outbox survives app restarts; app update keeps SQLite (migrations forward-only).

## 8. Monitoring and incident response

- Sentry: mobile crashes, JS errors, admin errors, Edge Function errors; alert on new issues and error-rate spikes.
- Supabase: database health, slow queries (`pg_stat_statements`), Auth logs, advisors (security + performance) checked weekly.
- Business health job (daily): sync quarantine count, needs_review rate, projection drift, failed webhooks → Slack/email.
- Incident runbook: triage → kill switch / maintenance banner if needed → fix → postmortem in `docs/incidents/`.
- Data breach: contain, assess affected shops, notify per DPDP obligations (legal review OD-12), document.
