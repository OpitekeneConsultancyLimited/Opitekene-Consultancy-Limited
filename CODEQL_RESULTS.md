# CodeQL results

Date: 2026-11-07  
Status: **BLOCKED — no scan result exists for this candidate**

- A CodeQL workflow exists in the local candidate at `.github/workflows/codeql.yml`, but the CodeQL CLI is unavailable locally.
- The candidate changes have not yet been pushed to a review branch at the time these results were prepared; therefore no Actions analysis result is available for this exact source.
- The baseline CodeQL workflow, if any, is not evidence for the current uncommitted candidate.
- No CodeQL alerts or clean-scan result are claimed.

## Closure

Run the CodeQL workflow on the immutable release-candidate commit (and retain the run URL, completion status, languages analyzed, alerts, and dispositions). Do not treat workflow-file presence as a scan pass. Resolve or formally disposition every critical/high result before approval.
