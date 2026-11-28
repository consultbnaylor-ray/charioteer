# AI fallback and spend warning

Not deployed from this repo. Ben reviews the migration and sets the secrets.

## When xAI cannot answer

Every edge function that calls xAI maps 402 (no balance or spending limit), 429, 5xx, 401/403 (key not accepted), a timeout and a dropped call to one code, `ai_unavailable`, with a `reason` of `billing`, `rate_limit`, `server`, `timeout`, `network` or `key`.
None of these costs the person a credit: each function checks the allowance first and counts only after a usable answer.

| Function | What the person gets |
| --- | --- |
| thumos-chat | "Thumos is resting right now. Try again a bit later." plus the helpline line. The `done` event carries `code: ai_unavailable`. |
| estimate-meal | Photo: 503 `ai_unavailable`, "Meal reading is resting right now. Logging by hand still works. Try again a bit later." Text: the on-device estimate. |
| gratitude-reflect, health-plan | The built-in note, summary or plan, plus a one-line notice with the same code. |
| thumos-voice-token | 503 `ai_unavailable`, "Voice is resting right now. Text chat still works. Try again a bit later." |

The phone still reads the older `provider_billing` code, so an older server and a newer app agree.

## Spend log

`ai_spend_log` stores one row per answered call: function, plan tier, model, input, output and cached prompt tokens, and the cost.
The cost is `usage.cost_in_usd_ticks` from xAI (1 USD = 10^10 ticks). If it is missing, tokens times the rate card (cached tokens at the cached rate), with an unknown model priced high.
No user id, prompt, reply or photo is stored, and only the service role can read it.
Realtime voice is billed by minute to the phone's own connection and is not logged here. Voice is off for launch.

## Prompt cache

xAI caches a matching prefix from the start of `messages`. The static instructions go in the first system message, with nothing personal, no date and no stats in front of them. Turn-specific instructions and CONTEXT go in a second system message. Each function sets `prompt_cache_key` (for example `charioteer:thumos-chat`) so later calls for that feature land on the same cache server. A retry note is appended only to the second system message, so the cached prefix does not change.

## Spend warning

`ai-spend-check` compares month-to-date spend (UTC month, as xAI bills) with a budget and sends Ben a push at 70% and 90%, once each.
It reads xAI's Management API when `XAI_MANAGEMENT_KEY` and `XAI_TEAM_ID` are set, and the log otherwise.

Secrets: `AI_SPEND_CHECK_SECRET`, `AI_MONTHLY_BUDGET_USD`, `AI_SPEND_ALERT_USER_ID` (Ben's user id; the push goes to his registered devices). Optional: `XAI_MANAGEMENT_KEY`, `XAI_TEAM_ID`.

Schedule it hourly with a POST to `/functions/v1/ai-spend-check` and the header `x-ai-spend-secret`.

Set the budget to the credit loaded each month. The warning is about spend against that budget, not the live balance.
