# 2026 amendments register

What the 2026 amending Acts change, as gathered from the web on 11 November 2026. The data is in migration `20261112000500_amendments_2026.sql` (table `legislation_amendments`). It is served at `GET /api/legislation/amendments` and shown in the Knowledge Centre under "Changes made in 2026". The AI assistant also cites it, as `[A#]` entries.

**Every record is unverified.** The enacted Acts, their Act numbers and their Gazette references could not be found online. Each record therefore gives both the Bill's figure and the figure reported as enacted. When the two differ, the record is flagged and TaxComp does not choose between them.

## Sources

| Weight | Source | What it gives |
| --- | --- | --- |
| Primary (Bill text) | Parliament of Uganda, "Tax Bills 2026" (`https://www.parliament.go.ug/page/tax-bills-2026`). The Bills are published as Bills Supplement No. 2 to the Uganda Gazette No. 33, Vol. CXIX, 27 March 2026. Parliament's `robots.txt` allows these paths. | The Bills as introduced: clause by clause, with chapter numbers and commencement clauses. Parliament changed some figures before passing them. |
| Secondary | EY Tax Alert "Uganda issues Tax Amendment Acts for 2026", 11 June 2026 | The enacted figures as reported, and assent on 18 May 2026 for the VAT, Stamp Duty, Tax Procedures Code, External Trade and Lotteries and Gaming Acts. |
| Secondary | PwC Uganda "Significant developments"; Dentons "Global tax guide: Uganda"; alfredhabaasa.com "Uganda 2026/27 tax and economic outlook" | These corroborate the VAT threshold (300 million), the fuel and cement excise rates, and the return of the Income Tax and Excise Bills. |
| Not read | URA notice "Effective date of the Income Tax (Amendment) Act, 2026 and the Excise Duty (Amendment) Act, 2026" | ura.go.ug dropped the connection. The notice's title is recorded; nothing is taken from its content. |
| Not used | ULII | Its terms forbid AI use. |
| Not read | Kampala Associated Advocates alert on the Income Tax (Amendment) Act, 2026 | The fetch was refused. Only what search results quoted is recorded (re-passed 4 August, assent 20 August 2026), and that only in the law register note. |

The summaries are TaxComp's own words. Figures are given as printed. No statutory wording is stored.

## Contents

53 changes in 8 instruments:

| Instrument | Bill | Changes | Status in the register |
| --- | --- | --- | --- |
| Income Tax (Amendment) Act, 2026 (Cap. 338) | No. 6 | 21 | EY (June) said it was not yet assented. KAA reports assent on 20 August 2026. The owner's brief gives returned 14 July and assent 20 August 2026. |
| Value Added Tax (Amendment) Act, 2026 (Cap. 344) | No. 8 | 9 | Assent on 18 May 2026 (reported) |
| Excise Duty (Amendment) Act, 2026 (Cap. 336) | No. 7 | 10 | Kept as "passed": assent not confirmed |
| Stamp Duty (Amendment) Act, 2026 (Cap. 339) | No. 4 | 4 | Assent on 18 May 2026 (reported) |
| Tax Procedures Code (Amendment) Act, 2026 (Cap. 343) | No. 5 | 4 | Assent on 18 May 2026 (reported) |
| Lotteries and Gaming (Amendment) Act, 2026 (Cap. 334) | No. 10 | 1 | Assent on 18 May 2026 (reported) |
| External Trade (Amendment) Act, 2026 (Cap. 69) | No. 3 | 2 | Assent on 18 May 2026 (reported) |
| Traffic and Road Safety (Amendment) Bill, 2026 (Cap. 347) | No. 9 | 2 | Bill only: no report of its passing found |

Evidence labels:

- **Bill and report (43 records):** the change is in the Bill and reported as enacted.
- **Bill only (8 records):** the change is in the Bill but not mentioned in any report, so it may have been dropped. These are:
  - ITA s.20(1)(ba), non-business assets;
  - ITA s.36(6a), the 0.5% minimum tax on long-carried losses;
  - ITA s.130(3), 6% withholding on purchases of non-business assets;
  - ITA s.150A, foreign-source income;
  - VAT s.28(6)(f), software;
  - Stamp Duty item 63(a), where the rate is not legible in the PDF;
  - both Traffic Bill changes.
- **Report only (1 record):** reported as enacted but not in the Bill. This is TPC s.47D, the 2025 interest and penalty waiver.

## Conflicts (not resolved)

| Record | Published Bill | Reported as enacted |
| --- | --- | --- |
| VAT s.7(2), registration threshold | UGX 250,000,000 | UGX 300,000,000 (EY, Dentons, Habaasa) |
| Excise, cement (item 7) | UGX 1,000 per 50 kg | UGX 750 per 50 kg (EY, PwC) |
| Excise, sugar (item 9) | UGX 300 per kg | UGX 200 per kg (EY) |
| Stamp duty, motorcycle registration or transfer (item 67) | UGX 50,000 | UGX 30,000 (EY) |
| TPC s.47D, waiver of interest and penalties | Not in the Bill | Reported. EY gives both 30 June 2027 and 30 June 2026 as the payment deadline. |

Other points checked against the owner's brief:

- **VAT Act chapter.** The brief says "Cap. 349". The VAT Bill cites the **Value Added Tax Act, Cap. 344**, which agrees with the 2024 revised edition.
- **"Excise Duty (Amendment) Act 22".** No source gives an Act number for any 2026 amendment.
- **Stamp Duty, Lotteries and Gaming, and External Trade.** These are now in the law register, and their changes are in the register.
- **PAYE bands.** The Bill's Schedule 4 Part I bands match TaxComp's FY 2026/27 calculator. In annual figures they are nil to 4.02m, 20% to 4.92m, 25% to 5.82m, 30% to 120m, and an extra 10% above 120m. EY reports the same bands as enacted.

## Database effects

- **Law register (`law_statutes`).**
  - Added the principal Acts `eta` (External Trade Act, Cap. 69) and `trsa` (Traffic and Road Safety Act, Cap. 347).
  - Added the amending instruments `sda-amendment-2026`, `lga-amendment-2026`, `eta-amendment-2026` and `trsa-amendment-2026`.
  - Appended a dated "Web check" note to `ita-`, `vata-`, `eda-` and `tpca-amendment-2026`. Their status and dates are unchanged.
- **Legislative database.**
  - The 2024 versions of the six amended Acts in the database (ITA, VAT, Excise, Stamp Duty, TPC, Lotteries and Gaming) are now marked **Requires amendment review**, unless a reviewer had already changed their status.
  - New coverage gaps record that the External Trade and Traffic and Road Safety Acts are not in the database.
- **History.** Every record is logged in `legislation_history` (entity type `amendment`). A re-run never overwrites a record that a reviewer has changed.

## Verifying a record

In the Challenge an Assessment reviewer workspace, go to Legislation verification and open "2026 amendments register". A reviewer can mark a record under review. Only a legal approver can mark it **verified**, and only with a link to the enacted Act and a note saying which figure the Act contains. That is also the place to settle a conflict. The change is logged and audited.

The API is `POST /api/challenge/review/legislation/amendments/{id}/status` with `{status, note, officialSourceUrl}`.

## Still needed

- The enacted 2026 Acts as gazetted, from UPPC Entebbe or URA's tax laws page. They are needed to settle the five conflicts, confirm or remove the eight Bill-only changes, and record Act numbers, assent dates and Gazette references.
- The Stamp Duty item 63(a) rate and the last entry of the Traffic Bill's environment levy, read from the PDFs by a person.
- An amended edition (FY 2026/27) of the affected Acts' section headings. Wording comes only from the official text.
