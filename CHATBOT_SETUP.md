# TaxComp chat setup

The chat UI currently answers from TaxComp's reviewed guidance and case notes in
the browser and can open the corresponding tax calculator when a guidance note
matches. Open-ended Gemini replies remain disabled until a Cloudflare Worker
and Gemini API key are configured. The API key must never be added to the site
or committed to this repository.

The chat is not a substitute for a tax professional and cannot safely resolve
every fact-specific tax question. It only uses TaxComp's reviewed knowledge
notes; it is not connected to a live legislation feed. Use the calculators for
arithmetic, verify eligibility and assumptions, and confirm complex positions
with URA or a qualified Ugandan tax adviser.

## Deploy the secure Gemini endpoint

1. Create a Cloudflare account and enable Workers, then install Node.js if it is
   not already installed.
2. Create a Gemini API key in Google AI Studio. Do not send the key in chat,
   email, or a source file.
3. In PowerShell, change to the `tax-estimator` directory and authenticate:

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

6. In `index.html`, set the `taxcomp-chat-endpoint` meta tag's `content` to the
   deployed Worker URL followed by `/chat`, for example:

   ```html
   <meta name="taxcomp-chat-endpoint" content="https://taxcomp-uganda-chat.example-subdomain.workers.dev/chat">
   ```

   Replace the example hostname with the URL Wrangler reports, then publish the
   updated site.

The Worker restricts browser calls to the TaxComp GitHub Pages origin, limits
each IP address to eight requests per minute, limits questions and response
size, retrieves only relevant curated TaxComp notes, and does not store chat
history. Its Gemini key is sent in a request header and is never returned to
the browser. The browser also validates source links before displaying them.

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
