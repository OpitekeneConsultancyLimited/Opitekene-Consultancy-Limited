# CodeQL results

Date: 2026-11-08  
Status: **PASSED on RC7 — independent security/dependency review remains blocked**

- CodeQL workflow run [42452241675](https://github.com/OpitekeneConsultancyLimited/Opitekene-Consultancy-Limited/actions/runs/42452241675) completed successfully on RC3 commit `b95244a9bdb0409e54a41f51289708bab3416855` for Python and JavaScript/TypeScript.
- The run reported four alerts: `js/insecure-randomness` (high) in `authentication.js`; `js/bad-tag-filter` (high) in `worker/efris.test.mjs`; and `py/http-response-splitting` (medium) in each of `get_taxcomp.py` and `opitekene_tax_consultancy.py`.
- RC4 run [42453594732](https://github.com/OpitekeneConsultancyLimited/Opitekene-Consultancy-Limited/actions/runs/42453594732) completed successfully but reported two remaining high polynomial-regex alerts and two medium response-splitting alerts in the Python launchers. The two JavaScript alerts from RC3 are fixed.
- RC5 replaces regex MIME validation with a fixed extension-to-content-type allowlist so request paths cannot affect response-header values. Unit coverage checks injection-shaped paths and valid types.
- RC7 run [42460331340](https://github.com/OpitekeneConsultancyLimited/Opitekene-Consultancy-Limited/actions/runs/42460331340) completed successfully for Python and JavaScript/TypeScript on commit `bad850a7780d2d3d681571fef945bc517e22fa9d`.
- The GitHub alert API reports all six historical findings fixed and **zero open alerts** for the release-candidate branch.
- RC7's candidate validation run [42460331350](https://github.com/OpitekeneConsultancyLimited/Opitekene-Consultancy-Limited/actions/runs/42460331350) also passed. RC4 upgraded CodeQL actions to v4 and pins the runner to Ubuntu 24.04. A clean CodeQL result is not proof of zero vulnerabilities and does not replace dependency scanning, DAST, or independent review.

## Closure

For later candidate commits, rerun CodeQL and check the alert state. Resolve all high/critical findings before approval. Independent vulnerability/dependency scanning remains separately outstanding.
