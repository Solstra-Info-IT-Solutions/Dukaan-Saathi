# Support Runbook (BL-1405)

For our support team during the pilot. Every action in the admin panel asks for a reason and is audited.

## 1. Daily routine (10 minutes)
1. Admin → **Dashboard → System health**: both jobs ran today and succeeded; nothing waiting over 24 h.
2. **Support** queue: reply to "Waiting for us", most urgent first. Use an internal note for anything the shop
   should not see.
3. **Onboarding** queue: pick up "New" requests.

## 2. Common problems
| Shop says | Check | Fix |
|---|---|---|
| "Bills are not sent" (sync chip shows waiting) | Phone online? App's Sync screen: quarantined items and their reason | Retry from Sync; if "member deactivated" or "device revoked", fix membership/device in the shop page |
| "Bill needs review" | Shop page → bills to review count; the bill's reason (price, stock, credit limit, clock) | Explain; the owner approves in the app. Nothing to fix on our side unless the reason is wrong |
| "Can't add more items / staff / phones" | Shop page → *What this shop has* (limit and usage) | Upgrade the plan, or a temporary override with an end date and reason |
| "App says please update" | `app.min_supported_version` in Platform config vs their version (shop page → phones) | Send the Play link; offline bills are kept and sent after the update |
| "Saving is paused" | Platform config → `maintenance` | Expected during maintenance; give the end time |
| "Too many tries" | System health → rate limit hits | Wait for the window (≤ 1 hour); if a real need, tell the team to raise the rule |
| "Voice doesn't understand" | Shop page → flags (`voice_billing`) and plan (`voice.billing`) | Ask them to type the words; owner's corrections teach aliases |
| "Lost phone" | Shop page → Phones | Revoke the device; the owner signs in on the new phone |
| "Helper left" | Shop page → Members | Owner removes them in the app, or deactivate here with a reason |

## 3. Incidents
| Severity | Example | First 15 minutes |
|---|---|---|
| P1 | Wrong totals, lost bills, nobody can bill | Tell the pilot lead and engineering; if a feature causes it, **kill switch** in Feature flags; if writes must stop, maintenance with `blocksWrites` (reads keep working) |
| P2 | One feature broken for many shops | Kill switch for that flag; announcement (warning) explaining the workaround |
| P3 | One shop, workaround exists | Ticket with internal note; fix in the next release |

After a P1/P2: write `docs/incidents/YYYY-MM-DD-<name>.md` (what happened, impact, timeline, cause, what we change).

## 4. Never
- Never ask a shop for their OTP or password.
- Never change prices, bills or ledger entries for a shop; the owner does it in the app.
- Never share one shop's data with another, or a customer's phone number outside the shop.
