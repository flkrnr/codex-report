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

## Built-In Prices

The table contains standard text-token prices in USD per 1 million tokens. It
was last checked on 2026-08-15 against the official
[OpenAI API pricing documentation](https://developers.openai.com/api/docs/pricing)
and model pages, including [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol),
[Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra), and
[Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna).

| Model names | Input | Cached input | Output |
| --- | ---: | ---: | ---: |
| `gpt-5.6`, `gpt-5.6-sol` | $5.00 | $0.50 | $30.00 |
| `gpt-5.6-terra` | $2.00 | $0.20 | $12.00 |
| `gpt-5.6-luna` | $0.20 | $0.02 | $1.20 |
| `gpt-5.5` | $5.00 | $0.50 | $30.00 |
| `gpt-5.4` | $2.50 | $0.25 | $15.00 |
| `gpt-5.4-mini` | $0.75 | $0.075 | $4.50 |
| `gpt-5.4-nano` | $0.20 | $0.02 | $1.25 |
| `gpt-5.3-codex`, `gpt-5.2-codex`, `gpt-5.2`, `gpt-5.2-chat-latest` | $1.75 | $0.175 | $14.00 |
| `gpt-5.1-codex-max`, `gpt-5.1-codex`, `gpt-5.1`, `gpt-5-codex`, `gpt-5` | $1.25 | $0.125 | $10.00 |
| `gpt-5.1-codex-mini`, `gpt-5-mini` | $0.25 | $0.025 | $2.00 |
| `codex-mini-latest` | $1.50 | $0.375 | $6.00 |

The unsuffixed `gpt-5.6` alias uses GPT-5.6 Sol pricing.

## Pricing Formula

Prices are stored as USD per 1 million tokens for each known model:

```text
cost =
  (uncached_input_tokens / 1,000,000) * input_price
+ (cached_input_tokens   / 1,000,000) * cached_input_price
+ (output_tokens         / 1,000,000) * output_price
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

GPT-5.6 estimates use standard processing prices. The report can identify many
Fast-mode turns from local `service_tier` settings, but the cost estimate does
not apply Fast-mode pricing. Cache writes and individual requests over the
272K-input-token long-context threshold are also not identified reliably.
Fast-mode premiums, 1.25x cache-write pricing, and long-context multipliers are
therefore not included.

The estimate answers a narrower question:

```text
If these local Codex token logs were billed at standard OpenAI API list prices,
what would the approximate token cost be?
```
