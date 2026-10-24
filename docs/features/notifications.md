# Feature: Notifications

Status: Planned · Phase: 06 (push token + daily summary), 07 (low stock), 09 (sync failures), 11 (templates/announcements), 12 (subscription) · Requirements: FR-20

## Purpose
Tell owners/managers what needs attention, without spamming and without sending anything to their customers automatically.

## Mobile
- `NotificationRepository` → `rpc register_push_token`, `from('notifications')` (in-app inbox), mark read.
- `core/notifications` wraps `expo-notifications` (permission request, token, foreground handler, tap routing via route guards).
- Settings: per-kind opt-out (daily summary, low stock, udhaar digest).

## Server
- `notifications` rows created by jobs/RPCs; `send-notifications` Edge Function (pg_cron every 5 min) sends queued ones via Expo Push, handles receipts and invalid tokens.
- Templates from `notification_templates` (allow-listed placeholders, localized); missing template → bundled default.
- Quiet hours: 22:00–07:00 shop time, except critical announcements.

## Kinds
`daily_summary` (21:00), `low_stock_digest` (09:00), `udhaar_digest` (weekly), `sync_attention`, `subscription_expiring`, `onboarding_ready`, `ticket_reply`, `announcement`.

## Acceptance criteria
- [ ] Owner receives the daily summary in their language; cashier does not.
- [ ] Tapping a notification opens the right screen only if the user has access.
