// EXT-1 (text harness): the built-in reader on 20 synthetic notices must get
// principal, penal tax, interest and period right in at least 19 of 20 before
// any user correction. PDF and phone-photo runs need an AI key: see
// scripts/ext1-harness.mjs and docs/challenge-assessment/test-guide.md.
import test from "node:test";
import assert from "node:assert/strict";
import { readNoticeText } from "./challenge/extract.mts";
import { generateSamples, scoreExtraction } from "./challenge-samples.mjs";

test("EXT-1: built-in reader passes at least 19 of 20 synthetic notices", () => {
  const results = generateSamples().map((sample) => ({ id: sample.id, ...scoreExtraction(readNoticeText(sample.text), sample.truth) }));
  const failed = results.filter((r) => !r.pass);
  assert.ok(results.length === 20);
  assert.ok(failed.length <= 1, `failed: ${JSON.stringify(failed)}`);
});