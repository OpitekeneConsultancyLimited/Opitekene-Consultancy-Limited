# TaxComp chat setup

When the secure endpoint is connected, the chat sends the question to a
Cloudflare Worker. The Worker uses Gemini with Google Search grounding only
when the configured key, model and API tier support it. If live grounded
research is unavailable, the Worker returns matching TaxComp local notes and
clearly says that no live research was performed. Source labels distinguish
local notes, listed URA references, live web research, client documents and
AI-generated interpretation. Uploaded documents are not supported. Legal
metadata absent from a note is displayed as not recorded; notes without a
verification date are marked Unverified and require further verification.
Without the endpoint, the browser can only search its bundled TaxComp notes.
The Gemini API key must never be added to the site or committed to this
repository.

Web search can improve currency and provide citations, but it does not
guarantee accuracy or completeness, and the assistant does not monitor laws
continuously. Prefer cited primary authorities, check effective dates, and
confirm important positions with URA or a qualified Ugandan tax adviser.
Never enter confidential personal or business data.

## Deploy the secure Gemini endpoint

1. Create a Cloudflare account and enable Workers, then install Node.js if it is
   not already installed.
2. Create a Gemini API key in Google AI Studio. The Worker checks Google's
   `v1beta/models` listing when its configured model is not found and retries
   only with a listed model that supports `generateContent`. It uses the
   built-in `google_search` tool; no separate search API key is needed. Check
   current Gemini pricing and grounding terms. Do not send the key in chat,
   email, or a source file.
3. In PowerShell, change to the repository root (the directory containing
   `wrangler.toml`) and authenticate:

   ```powershell
   npx wrangler login
   ```

4. Save the API key as a Cloudflare Worker secret:

   ```powershell
   npx wrangler secret put GEMINI_API_KEY
   ```

   Paste the key only into the secure prompt opened by Wrangler.

5. Deploy the Worker:

   ```powershell
   npx wrangler deploy
   ```

   The Wrangler config enables Worker Observability at a 100% sampling rate.
   Persistent logs include a redacted provider error message, HTTP status,
   model and classification, but never the API key, user question or provider
   response body. Responses identify their source through
   `X-TaxComp-Answer-Source`; provider failures include only the numeric
   upstream status in `X-Gemini-Upstream-Status`.

6. In `index.html`, set the `taxcomp-chat-endpoint` meta tag's `content` to the
   deployed Worker URL followed by `/chat`, for example:

   ```html
   <meta name="taxcomp-chat-endpoint" content="https://taxcomp-uganda-chat.example-subdomain.workers.dev/chat">
   ```

   Replace the example hostname with the URL Wrangler reports, then publish the
   updated site.

The Worker restricts browser calls to the TaxComp GitHub Pages origin, limits
each IP address to eight requests per minute, validates request size and
content, and does not store chat history. It retries only transient upstream
failures, then falls back to relevant curated TaxComp notes rather than
returning an ungrounded Gemini answer. The fallback says that no live search
was performed, identifies missing legal metadata, and links its local sources.
Freshness is Recently reviewed (0–90 days), Review due (91–180 days), Outdated
(over 180 days), or Unverified when no valid verification date is recorded.
Notes should only receive a verification date after a human checks the
underlying legislation or publication.

### Opt-in unanswered-question research queue

The Cloudflare D1 database `taxcomp-unanswered-questions` stores only a
question explicitly submitted with the unchecked research-consent box, and
only when the fallback cannot verify the answer. Stored questions expire
after 90 days; a daily Worker schedule removes expired rows. Do not enter
confidential information. Administrators can inspect and delete questions at
`https://taxcomp-uganda-chat.omaratomdenis1.workers.dev/admin`.

Before enabling storage or dashboard access, set a strong, private Worker
secret from the project directory:

```powershell
npx wrangler secret put ADMIN_DASHBOARD_TOKEN
```

Enter the token only in Wrangler's secure prompt and keep it in a password
manager. The dashboard API requires this token and does not store it in the
browser. Without the secret, question logging stays disabled and the chat
reports that a requested save failed.

The consultation link opens an email draft to Opitekene; it never sends
automatically. Users should remove confidential details before sending.
Questions, local notes and AI-generated interpretations can still be wrong or
out of date; verify primary sources, provisions and effective dates.

## Before enabling public AI replies

- Check Gemini's current terms, data handling and pricing for your account.
- Google Search grounding availability and pricing depend on the Gemini API
  tier. The free tier may not provide API grounding; this Worker does not
  activate billing or trials and retains the local-note fallback instead.
- Configure and monitor Gemini quotas/billing limits before publishing the
  Worker URL. Per-IP rate limiting helps but does not prevent all automated
  usage or guarantee a spending ceiling.
- Keep the chat's privacy warning. Do not promise that Google does not retain
  or process prompts; users should not enter TINs, payment credentials,
  account numbers or confidential documents.
- The assistant uses a manually curated knowledge set, not a live legislation
  feed. Update both `tax-advisory.js` and `worker/knowledge.mjs` when reviewed
  tax guidance or case summaries change.

## Tests

From the `tax-estimator` directory:

```powershell
node --test .\tax-calculator.test.js .\tax-advisory.test.js .\tax-chat.test.js .\worker\index.test.mjs
```
