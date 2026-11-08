# CodeQL results

Date: 2026-11-08  
Status: **REMEDIATION IN PROGRESS — RC5 findings require a fresh scan**

- CodeQL workflow run [42452241675](https://github.com/OpitekeneConsultancyLimited/Opitekene-Consultancy-Limited/actions/runs/42452241675) completed successfully on RC3 commit `b95244a9bdb0409e54a41f51289708bab3416855` for Python and JavaScript/TypeScript.
- The run reported four alerts: `js/insecure-randomness` (high) in `authentication.js`; `js/bad-tag-filter` (high) in `worker/efris.test.mjs`; and `py/http-response-splitting` (medium) in each of `get_taxcomp.py` and `opitekene_tax_consultancy.py`.
- RC4 run [42453594732](https://github.com/OpitekeneConsultancyLimited/Opitekene-Consultancy-Limited/actions/runs/42453594732) completed successfully but reported two remaining high polynomial-regex alerts and two medium response-splitting alerts in the Python launchers. The two JavaScript alerts from RC3 are fixed.
- RC5 replaces regex MIME validation with a fixed extension-to-content-type allowlist so request paths cannot affect response-header values. Unit coverage checks injection-shaped paths and valid types. RC5 scan and alert-state verification are pending.
- RC4 upgrades CodeQL actions to v4 and pins the runner to Ubuntu 24.04. No clean scan is claimed until the RC5 run completes and the repository alert states are checked.

## Closure

Run CodeQL on the immutable RC5 commit, verify that the remaining Python alerts are fixed or accurately dispositioned, and retain the run URL and alert state. Resolve all high/critical findings before approval. Independent vulnerability/dependency scanning remains separately outstanding.
