# Privacy notes: Challenge an Assessment

These notes are for the owner to check against Uganda's **Data Protection and Privacy Act, 2019** (and its 2021 Regulations). They describe what the code does. They are not a legal opinion.

## What is collected

| Data | Where it is kept | Who can see it |
|---|---|---|
| Assessment notices and supporting documents (PDF, photos, Word, spreadsheets, text) | Supabase Storage, private bucket `assessment-documents`, under `<user id>/<case id>/<document id>` | The owner of the case. An Opitekene reviewer, only when the case is assigned to them. |
| Figures read from the notice, confirmed values, dates, the user's answers and the checklist | Supabase Postgres, `taxcomp.challenge_*` tables | The same people |
| Audit trail (who viewed, changed or downloaded what, and when) | `taxcomp.challenge_audit_log` (append-only) | Administrators. It holds no document contents. |
| Consent record (version and time) | `taxcomp.challenge_consents` | Administrators |

- **Region:** Supabase project `xbooviddjkikcbccfcnw` is in **eu-west-1 (Ireland)**. Personal data therefore leaves Uganda. Check the Act's conditions for transfer outside Uganda, and say so in the privacy policy if required.
- **Access:** browsers never query the database or storage directly. The Worker checks the user's Supabase sign-in on every request and returns only their own cases, or for a reviewer only the cases assigned to them (see `rls-audit.md`).
- **Retention:** cases are kept **until the user deletes them**. One button removes the case rows and every stored file; the audit entry remains. **Owner decision needed:** whether to add automatic deletion after a period of inactivity, which the Act's minimisation and retention principles may call for. It is not built.
- **Logs:** the Worker logs only error names and outcomes (for example `provider: claude, outcome: timeout`), never document text or figures.
- **Offline cache:** the service worker never caches API responses. Case data and documents come from the Worker on another origin and anything under `/api/` is fetched from the network, so they never enter the offline cache.

## AI providers

| Provider | When it is used | Training on customer data | Region | Status |
|---|---|---|---|---|
| **Anthropic Claude** (`claude-opus-5-5`, Messages API) | When the user asks TaxComp to read a notice (PDF, photo or text) | Anthropic's commercial API terms say API inputs and outputs are not used to train models by default. | Anthropic processes API traffic in the US and other regions it uses. | **`ANTHROPIC_API_KEY` is not set in production**, so this path is not live yet. |
| **Google Gemini** (paid tier only) | Backup reader, **only** if the Worker variable `CHALLENGE_GEMINI_PAID_TIER=true` is set | Google's API terms let it use **unpaid**-tier data to improve its products; paid-tier data is not used that way. The code therefore refuses to send documents to Gemini unless the owner confirms a paid tier. | Google | Off by default. |
| TaxComp's built-in reader | Pasted text and Word files when no AI provider answers | No third party is involved | Cloudflare Worker | Live |

**Owner to check:**
1. Accept Anthropic's commercial terms and data processing addendum for the API key you create. Set a spend limit.
2. Only set `CHALLENGE_GEMINI_PAID_TIER=true` if the Gemini key is on a paid (billed) tier, with Google's data processing terms accepted.
3. ULII content is never sent to an AI model: ULII's robots.txt sets `ai-input=no`.

## Consent screen (shown before the first upload)

The screen states what is stored, where, who can see it, how AI reading works, how long data is kept and how to delete it. Acceptance is recorded with the consent version (`2026-11-10`). Changing the text in a way that matters should come with a new `CONSENT_VERSION` in `worker/challenge/api.mts`, so users are asked again.

## Items for the owner

- [ ] The data transfer outside Uganda (Supabase EU, Anthropic US) is covered in the privacy policy.
- [ ] A retention period decision is made (see Retention above).
- [ ] Registration with the Personal Data Protection Office, if Opitekene is not already registered.
- [ ] Reviewers are told about their confidentiality obligations; their access is logged.
- [ ] The privacy policy text in `#privacy` is reviewed by a lawyer. It is updated for uploads, and the Terms of service are still marked "being prepared".
