# How TaxComp AI uses the legislative database

The AI routes are `/chat` (the assistant) and `/advisor` (the evidence-first advisor, which the site's chat tries first). Both retrieve legislation from the database before answering. The code is `retrieveLegislation()`, `legislationEvidence()`, `legislationSummary()` and `checkCitations()` in `worker/challenge/legislation.mts`.

## Workflow

| Step | What happens |
| --- | --- |
| 1. Receive the question | The question is validated and checked to be a tax question. |
| 2. Identify the subject | `subjectTerms()` keeps the subject words and maps plain phrasing to statutory terms ("where … supplied" becomes "place of supply"). `lawHint()` maps a named tax to its law (for example VAT → the VAT Act). |
| 3. Search the database | Full-text search over section headings (`search_tsv`), within the hinted law first. An explicit "section 80" is a number search. |
| 4. Retrieve sections | Up to 4 matches, plus up to 3 related provisions of the best match (confirmed or inferred relations). |
| 5. Jurisdiction and edition | Uganda only. The edition is the one covering the user's tax period (FY start date), or the latest earlier one with a warning. Later amendment Acts from the Law Register are listed. |
| 6. Wording | Included only if held. Its status says whether it is verified. None is held at present. |
| 7. Build the answer | The model receives an evidence block of `[L#]` entries with their citations, status and rules. Without a model (no key, no consent or no Premium), `legislationSummary()` gives a factual summary. |
| 8. Cite | `[L#]` markers become citations, for example "(Income Tax Act (Cap. 338), s.80)". |
| 9. Uncertainty | The answer states that only headings are held, the edition and its date warning, the later amendments, the coverage gaps that match the question, and that facts are needed to apply a provision. |

## Rules the model is given

These rules are in both the system instruction and the evidence block:

- Cite Uganda legislation only from the `[L#]` entries.
- A heading does not give a section's conditions, rates or effect, so do not state them from a heading.
- Never quote or paraphrase statutory wording that is not supplied. Say whether supplied wording is verified.
- Say when a provision is unverified or from an older edition, and mention the later amendments.
- Do not apply another country's law as Uganda law. Ask for facts when they matter.

## Enforcement after the model answers

`checkCitations()` finds every "section N", "s. N" or "regulation N" in the answer. A number that was not retrieved is listed in `legislation.citationCheck.unmatched`, and the answer gets a note: "TaxComp could not match section N to its legislative database … treat it as unverified." `verificationRequired` is set whenever any retrieved provision is unverified.

## Evidence levels shown to users

| Level | Meaning |
| --- | --- |
| Verified legislation with full wording | Verified section with verified wording. |
| Wording held but not verified | Wording entered but not yet verified. |
| Verified structure only | The heading is verified; no wording is held. |
| Unverified structure only | The current state of all 701 sections. |
| Not in TaxComp's legislative database | A coverage gap (for example Local Service Tax, customs, treaties). |

## Example behaviour (tested in `worker/legislation.test.mjs`)

- **"What is a foreign tax credit in Uganda?"**
  - Retrieves Income Tax Act s.80, and s.88 International agreements (inferred).
  - Says only headings are held and it cannot state the conditions.
  - Lists the Income Tax (Amendment) Act, 2026, as not captured.
  - Warns that the FY 2024/25 edition may not show the law in force today.
- **"How are international payments taxed in Uganda?"** Retrieves s.82, with related s.137. The answer contains no rate.
- **"Where are services supplied for VAT purposes?"** Retrieves VAT Act s.16, Place of supply of services, and says the facts of the transaction are needed.
- **A model answer citing an unretrieved "Section 77"** gets flagged.
- **A question about Local Service Tax** reports the coverage gap.

## Also using the database

- **Guided international answers** (`intl-tax-reasoning.js`) cite sections retrieved through `/api/legislation/{law}/sections`.
- **The Knowledge Centre search box** adds tax-Act results from `/api/legislation/search`.
