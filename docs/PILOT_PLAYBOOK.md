# Pilot Playbook — 10 shops (BL-1404)

## 1. Choosing the shops
Mix: 4 kirana, 2 general stores, 2 medical / cosmetics, 1 hardware, 1 dairy or vegetables. At least 3 with no
existing billing software, 2 that use a notebook for udhaar, 2 with a helper (cashier), 2 in areas with weak mobile
data. Each owner agrees to 4 weeks, a weekly 10-minute call and to keep their notebook in parallel for week 1.

## 2. Before day 1 (per shop)
1. Production shop exists (owner signs up in the app); plan **free_trial** is automatic. In the admin panel set the
   `pilot` flag overrides you want (e.g. voice on) with reason "Pilot".
2. Ask for photos of the item list or rate card → **Onboarding** queue; our team prepares the import; the owner
   commits it on day 1 with you.
3. Owner's and helpers' phones: install from the Play closed-testing link; sign in; accept terms; register device.

## 3. Day 1 visit (60–90 minutes)
- Commit the prepared items; fix 5 prices together.
- Five real bills with the owner: keypad bill, product bill, UPI, udhaar, return.
- Turn on airplane mode and bill once, so they see it is safe offline.
- Show Help & support and the WhatsApp contact on the plan screen.
- Leave the one-page card (Hindi): how to bill, how to collect udhaar, who to call.

## 4. Weeks 1–4
| When | What | Who |
|---|---|---|
| Daily | Admin dashboard → System health; bills to review; tickets waiting > 24 h | Support |
| Day 2, 7 | Call: anything confusing? Compare notebook udhaar with the app | Pilot lead |
| Weekly | Metrics below, per shop; write `docs/pilot/week-N.md` | Pilot lead |
| Week 4 | Interview (20 min): keep using? would pay? what is missing? | Pilot lead |

## 5. What we measure
- Bills per day per shop, share by keypad / product / voice; offline bills and how long they waited.
- Bills needing review; voids and returns; udhaar balance per shop vs the notebook.
- Crashes (Sentry), support tickets per shop, time to first reply.
- Voice: share of voice lines changed before "Add to bill".
- Day-close cash difference.

## 6. Stop / pause rules
Pause new shops and fix first if any of these happens: a bill total or udhaar balance is wrong; a bill is lost
(never reaches the server); a shop cannot bill for more than 15 minutes because of the app. Use the kill switch for
the feature involved and the maintenance banner if needed (SUPPORT_RUNBOOK.md).
