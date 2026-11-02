# TaxComp chat setup

When the secure endpoint is connected, the chat sends the question to a
Cloudflare Worker. Gemini can use Google Search grounding to find current public
web sources, alongside the relevant reviewed TaxComp notes and cases. The
answer includes links to sources returned by Google Search. Without the
endpoint, the browser can only search its bundled TaxComp notes and cannot
browse the web. The Gemini API key must never be added to the site or committed
to this repository.

Web search can improve currency and provide citations, but it does not
guarantee accuracy or completeness, and the assistant does not monitor laws
continuously. Prefer cited primary authorities, check effective dates, and
confirm important positions with URA or a qualified Ugandan tax adviser.
Never enter confidential personal or business data.

## Deploy the secure Gemini endpoint

1. Create a Cloudflare account and enable Workers, then install Node.js if it is
   not already installed.
2. Create a Gemini API key in Google AI Studio. Google Search grounding is
   enabled in the Worker using Gemini's built-in `google_search` tool; no
   separate search API key is needed. Check current Gemini pricing and
   grounding terms. Do not send the key in chat, email, or a source file.
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
   The Worker logs only the upstream Gemini HTTP status on provider errors; it
   does not log the API key or provider response body.

6. In `index.html`, set the `taxcomp-chat-endpoint` meta tag's `content` to the
   deployed Worker URL followed by `/chat`, for example:

   ```html
   <meta name="taxcomp-chat-endpoint" content="https://taxcomp-uganda-chat.example-subdomain.workers.dev/chat">
   ```

   Replace the example hostname with the URL Wrangler reports, then publish the
   updated site.

The Worker restricts browser calls to the TaxComp GitHub Pages origin, limits
each IP address to eight requests per minute, limits questions and response
size, retrieves relevant curated TaxComp notes for Uganda tax questions, and
does not store chat history. It asks Gemini to use Google Search for current
tax information and prioritise official sources. The Worker validates
grounding links as HTTPS and returns only source metadata; it never exposes
the Gemini key to the browser. Search results and AI-generated answers can
still be wrong or out of date, so verify primary sources and effective dates.

## Before enabling public AI replies

- Check Gemini's current terms, data handling and pricing for your account.
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
