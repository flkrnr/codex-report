# Cost Estimation

`codex-report` estimates what local Codex and Claude Code token usage would
have cost at standard model API list prices. This is an experimental feature. It does not
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

The table contains standard text-token prices in USD per 1 million tokens.
The original entries were checked on 2026-08-15 against the official
[OpenAI API pricing documentation](https://developers.openai.com/api/docs/pricing)
and model pages, including [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol),
[Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra), and
[Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna).

GPT-6 pricing and GPT-5.6 Sol pricing were checked on 2026-09-24 against the
official model pages for [Astra](https://developers.openai.com/api/docs/models/gpt-6-astra),
[Sol](https://developers.openai.com/api/docs/models/gpt-6-sol),
[Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), and
[GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol).

| Model names | Input | Cached input | Output |
| --- | ---: | ---: | ---: |
| `gpt-6-astra` | $10.00 | $1.00 | $50.00 |
| `gpt-6.1-sol` | $2.00 | $0.10 | $10.00 |
| `gpt-6-sol` | $2.00 | $0.20 | $10.00 |
| `gpt-6-luna` | $0.10 | $0.01 | $0.50 |
| `gpt-5.6`, `gpt-5.6-sol` | $4.00 | $0.40 | $20.00 |
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

GPT-6.1 Sol pricing was checked on 2026-09-30 against its
[official model page](https://developers.openai.com/api/docs/models/gpt-6.1-sol).

The unsuffixed `gpt-5.6` alias uses GPT-5.6 Sol pricing.
OpenAI lists GPT-5.6 Sol's promotional pricing as available at least through
2026-11-21. The report applies this built-in table to all selected usage,
including older sessions; it does not reconstruct historical prices.

### Estimated aliases

`gpt-reserve` is estimated using the `gpt-5.6-luna` rates above and included in
the total. Both report formats label this assumption as
`estimated: gpt-reserve ≈ gpt-5.6-luna`, even when the row is outside `--top`.
This is an API-equivalent estimate, not an additional subscription charge or
a separately published Reserve API price. OpenAI describes
[Luna Reserve](https://help.openai.com/en/articles/20001499-luna-reserve-in-codex-and-chatgpt-work)
as additional GPT-5.6 Luna usage; the `gpt-reserve` mapping is also visible in
[reported Codex protocol data](https://github.com/openai/codex/issues/45132).
The alias may need updating if OpenAI changes its underlying model.
`codex-auto-review` remains unpriced.

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

GPT-6 and GPT-5.6 estimates use standard processing prices. The report can identify many
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

## Claude Code estimates

Claude Code reads local `~/.claude/projects/**/*.jsonl` transcripts (or
`CLAUDE_CONFIG_DIR/projects`). Usage is per assistant request, not a cumulative
session counter. Split response fragments can repeat the same request usage.
The adapter deduplicates requests and retains their latest meaningful usage
snapshot before calculating costs. Replayed history and parent/subagent copies
are reconciled before date filtering.

Claude's `input_tokens` field excludes cache reads and writes. The report
normalizes inclusive input as:

```text
input_tokens + cache_read_input_tokens + cache_creation_input_tokens
```

Reported cached input means cache reads. Cache writes are exposed separately,
with the recorded one-hour subset. The formula becomes:

```text
uncached_input * input_price
+ cache_reads * cached_input_price
+ five_minute_or_unknown_writes * cache_write_price
+ one_hour_writes * cache_write_1h_price
+ output * output_price
```

All terms are divided by 1,000,000. Known cache-write durations come from
`usage.cache_creation.ephemeral_1h_input_tokens` and
`ephemeral_5m_input_tokens`. Writes with no duration breakdown use the
five-minute price and are explicitly identified as an assumption in terminal
and JSON reports. Thinking tokens are part of output and are not added twice.

The Claude table was verified on 2026-10-05 against the official
[Anthropic pricing table](https://platform.claude.com/docs/en/about-claude/pricing).
Prices below are USD per million tokens:

| Model family | Input | Cache read | 5m write | 1h write | Output |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fable/Mythos 5.1 | 10 | 0.25 | 12.50 | 20 | 50 |
| Opus 5.5 | 4 | 0.20 | 5 | 8 | 20 |
| Sonnet 5/5.5 | 2 | 0.20 | 2.50 | 4 | 10 |
| Fable/Mythos 5 | 10 | 1 | 12.50 | 20 | 50 |
| Opus 4.5/4.6/4.7/4.8/5 | 5 | 0.50 | 6.25 | 10 | 25 |
| Opus 4/4.1 | 15 | 1.50 | 18.75 | 30 | 75 |
| Sonnet 4/4.5/4.6 | 3 | 0.30 | 3.75 | 6 | 15 |
| Haiku 4.5 | 1 | 0.10 | 1.25 | 2 | 5 |
| Haiku 3.5 | 0.80 | 0.08 | 1 | 1.60 | 4 |

Known model IDs with dated `-YYYYMMDD` or `@YYYYMMDD` snapshots use the
corresponding base-model price. Other deployment IDs/unknown models stay
unpriced. Estimates use the current built-in table for all historical events.
They exclude speed premiums, geography/long-context modifiers, platform-specific
rates, web-search/server-tool fees, and subscription billing. These remain
standard Anthropic API-equivalent estimates even when a different API host is
recorded; no cloud billing data or credentials are read.
