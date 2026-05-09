# Cost Estimation

`codex-report` estimates what the local Codex token usage would have cost at
standard OpenAI API list prices. This is an experimental feature. It does not
read billing data from OpenAI and it is not an invoice.

## Data Source

The report reads local Codex session JSONL files from `~/.codex/sessions`.
Codex writes token accounting events with usage objects such as:

```json
{
  "total_token_usage": {
    "input_tokens": 1200000,
    "cached_input_tokens": 1100000,
    "output_tokens": 32000,
    "reasoning_output_tokens": 21000,
    "total_tokens": 1232000
  },
  "last_token_usage": {
    "input_tokens": 200000,
    "cached_input_tokens": 190000,
    "output_tokens": 4000,
    "reasoning_output_tokens": 2500,
    "total_tokens": 204000
  }
}
```

When `total_token_usage` is present, it is treated as the authoritative
cumulative total for that session. The report adds only the delta from the
previous cumulative snapshot. This avoids counting repeated `token_count`
events twice.

When only `last_token_usage` is present, the report falls back to adding that
event directly.

## Date Windows

Dates filter events, not whole session files. If a session starts yesterday and
continues today, `--from today` should count only today's additional token
usage.

To do that correctly, out-of-range cumulative snapshots still update the
parser's baseline state. They do not contribute to the report. For example:

```text
yesterday 23:55 total_token_usage = 1,000,000
today     09:00 total_token_usage = 1,200,000
```

For `--from today`, the report counts `200,000` tokens, not `1,200,000`.

## Model Attribution

Token usage is attributed to the active model from the nearest preceding
`turn_context` event. Costs are grouped by that model name.

If a model is not in the built-in price table, its tokens are reported as
unpriced and excluded from the estimated dollar total.

## Pricing Formula

Prices are stored as USD per 1 million tokens for each known model:

```text
cost =
  uncached_input_tokens * input_price
+ cached_input_tokens   * cached_input_price
+ output_tokens         * output_price
```

`cached_input_tokens` is clamped so it can never exceed `input_tokens`.
`uncached_input_tokens` is calculated as:

```text
input_tokens - cached_input_tokens
```

The displayed `input` value includes both cached and uncached input. For cost
sanity checks, the important split is:

```text
uncached input + cached input + output
```

## Reasoning Tokens

Reasoning level does not change the price table directly. It can only affect
cost indirectly by changing how many tokens the model uses.

Codex logs expose `reasoning_output_tokens` as a sub-count of output tokens.
OpenAI API pricing bills reasoning tokens as output tokens, so
`reasoning_output_tokens` is not added separately. Adding it on top of
`output_tokens` would double-count.

## What The Estimate Is Not

The estimate is not the actual cost of your ChatGPT or Codex subscription.
Subscription quota, usage dashboard charts, included usage, credits, discounts,
batch pricing, regional processing differences, and non-token tool charges are
not included.

The estimate answers a narrower question:

```text
If these local Codex token logs were billed at standard OpenAI API list prices,
what would the approximate token cost be?
```
