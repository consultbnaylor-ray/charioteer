-- Additive. Keeps the Expo ticket (id, status, error code) for each message push, so a push that
-- Expo accepts but never reaches a phone can be traced through Expo's receipts.
-- No message text, no token values. Service role only, like the rest of message_push_log.
alter table public.message_push_log add column if not exists tickets jsonb;
