# CodeQL results

Date: 2026-11-07  
Status: **BLOCKED — no scan result exists for this candidate**

- A CodeQL workflow exists in the local candidate at `.github/workflows/codeql.yml`, but the CodeQL CLI is unavailable locally.
- The candidate CodeQL workflow now includes pushes to `release-candidate/**`, in addition to `main`. No successful analysis result on the final candidate revision has yet been confirmed. The CodeQL CLI is unavailable locally.
- Any CodeQL result on the production baseline would not be evidence for this candidate.
- No CodeQL alerts or clean-scan result are claimed.

## Closure

Run the CodeQL workflow on the immutable release-candidate commit (and retain the run URL, completion status, languages analyzed, alerts, and dispositions). Do not treat workflow-file presence as a scan pass. Resolve or formally disposition every critical/high result before approval.
