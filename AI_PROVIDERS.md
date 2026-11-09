# AI providers for web research

TaxComp's live web research (the site search boxes, Premium chat research and the
advisor) uses **Anthropic Claude Opus 5.5 with Claude's web search tool**. If Claude is
unavailable, out of credit or declines a request, it falls back automatically to
**Google Gemini with Google Search grounding**, and then to TaxComp's reviewed local notes.

| | Claude (primary) | Gemini (backup) |
|---|---|---|
| Model | `claude-opus-5-5` | `GEMINI_MODEL` in `wrangler.toml` |
| Web search | `web_search_20260318`, up to 3 searches per question, Uganda time zone | Google Search grounding |
| Worker secret | `ANTHROPIC_API_KEY` | `GEMINI_API_KEY` |
| Effort | site search `low`, chat and advisor `medium` | n/a |
| Code | `worker/claude-research.mjs` | `callGemini` in `worker/index.mjs` |

Citations: every web statement carries a numbered source link. Anthropic requires
citations to be shown when its output is displayed to users; the search panels and the
chat do this.

Refusal fallback: Claude requests send `fallbacks: "default"` (beta
`server-side-fallback-2026-07-01`). If Opus 5.5 declines, the API re-runs the request on
another Claude model in the same call; if that also declines, Gemini is tried.

## Cost (Anthropic list prices, checked 2026-11-09)
* Claude Opus 5.5: US$4 per million input tokens, US$20 per million output tokens.
* Web search: US$10 per 1,000 searches (failed searches are not billed). Search results
  Claude reads count as input tokens.
* Rough estimate: US$0.05 to 0.10 per site search. Site search is free for every
  visitor and unlimited apart from 8 requests per minute per visitor, so **set a
  monthly spend limit** (step 3 below).

## Setup (owner)
1. Create an account at <https://console.anthropic.com> for Opitekene Consultancy
   Limited and add credits or a card (Billing).
2. Create an API key (Settings → API keys), then store it in the Worker yourself.
   Wrangler prompts for the value; paste it there, never in chat or a file:
   ```powershell
   cd "C:\Users\fubaf\OneDrive\Desktop\TAX COMP\TaxComp-Prototype"
   npx wrangler@4.158.0 secret put ANTHROPIC_API_KEY
   ```
3. Set a monthly spend limit (Settings → Limits) and email alerts. The API stops at
   the limit instead of billing past it, and TaxComp then falls back to Gemini or
   local notes.
4. Make sure web search is allowed for the organization (Settings → Capabilities); it
   is on by default.
5. Deploy the Worker: `npx wrangler@4.158.0 deploy`.

Gemini as backup works once its key's billing is on (Google AI Studio → API keys →
set up billing). Without it, the backup step is skipped.

## Checking it works
`npx wrangler@4.158.0 tail taxcomp-uganda-chat` shows `Claude API request failed`
with a reason (`authentication`, `rate_limited`, `invalid_request`, `unavailable`)
when Claude cannot answer, and Gemini's errors (for example
`RESOURCE_EXHAUSTED`) when the backup fails.
