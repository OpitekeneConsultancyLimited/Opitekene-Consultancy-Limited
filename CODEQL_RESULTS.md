# CodeQL results

Date: 2026-11-07  
Status: **BLOCKED — no scan result exists for this candidate**

- A CodeQL workflow exists in the local candidate at `.github/workflows/codeql.yml`, but the CodeQL CLI is unavailable locally.
- The candidate is now on a non-production review branch. Its workflow only runs on pushes/pull requests targeting `main` (or scheduled/default-branch dispatch); the candidate push did not trigger it, and the workflow is not present on the default branch for manual dispatch. The CodeQL CLI is unavailable locally, so no analysis result exists for this exact candidate.
- Any CodeQL result on the production baseline would not be evidence for this candidate.
- No CodeQL alerts or clean-scan result are claimed.

## Closure

Run the CodeQL workflow on the immutable release-candidate commit (and retain the run URL, completion status, languages analyzed, alerts, and dispositions). Do not treat workflow-file presence as a scan pass. Resolve or formally disposition every critical/high result before approval.
