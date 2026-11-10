#!/usr/bin/env node
// EXT-1 harness for PDFs and phone photos.
//
//   node scripts/ext1-harness.mjs render            writes the 20 synthetic notices as
//                                                   .txt, .pdf and "phone photo" .jpg files to
//                                                   docs/challenge-assessment/samples/ (needs Edge)
//   node scripts/ext1-harness.mjs score [pdf|photo|text]
//                                                   reads each sample with the same provider chain
//                                                   the Worker uses and prints the 19/20 score.
//                                                   pdf/photo need ANTHROPIC_API_KEY in the shell
//                                                   (costs a few cents per run); nothing is sent
//                                                   without it.
//
// Real assessments added by the owner go in samples/real/<name>.(pdf|jpg) with a
// <name>.json holding { taxHead, principal, penalTax, interest, periodStart, periodEnd }.
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateSamples, scoreExtraction } from "../worker/challenge-samples.mjs";
import { readNotice } from "../worker/challenge/ai.mts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(root, "docs", "challenge-assessment", "samples");
const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

async function render() {
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  mkdirSync(dir, { recursive: true });
  for (const sample of generateSamples()) {
    writeFileSync(path.join(dir, `${sample.id}.txt`), sample.text);
    writeFileSync(path.join(dir, `${sample.id}.json`), JSON.stringify(sample.truth, null, 2));
    const html = `<html><body style="font:15px/1.6 'Courier New',monospace;padding:48px;color:#111"><pre style="white-space:pre-wrap">${escape(sample.text)}</pre></body></html>`;
    await page.setContent(html);
    await page.pdf({ path: path.join(dir, `${sample.id}.pdf`), format: "A4" });
    // A phone photo: slight rotation, uneven light, a little blur, JPEG.
    await page.setContent(`<html><body style="margin:0;background:#6b6257;display:grid;place-items:center;height:1200px">
      <div style="transform:rotate(${(Number(sample.id.slice(-2)) % 5) - 2}deg);background:linear-gradient(115deg,#fbfaf6,#e9e4d8);padding:40px;box-shadow:0 12px 30px #0007;filter:blur(0.4px) contrast(0.95)">
      <pre style="font:15px/1.6 'Courier New',monospace;color:#1d1d1d;margin:0;white-space:pre-wrap;width:720px">${escape(sample.text)}</pre></div></body></html>`);
    await page.screenshot({ path: path.join(dir, `${sample.id}-photo.jpg`), type: "jpeg", quality: 70 });
  }
  await browser.close();
  console.log(`Wrote 20 samples (txt, pdf, photo) to ${path.relative(root, dir)}`);
}

async function score(kind = "text") {
  const env = { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, GEMINI_API_KEY: process.env.GEMINI_API_KEY, CHALLENGE_GEMINI_PAID_TIER: process.env.CHALLENGE_GEMINI_PAID_TIER };
  if (kind !== "text" && !env.ANTHROPIC_API_KEY && env.CHALLENGE_GEMINI_PAID_TIER !== "true") {
    console.log("Set ANTHROPIC_API_KEY (or a paid-tier GEMINI_API_KEY with CHALLENGE_GEMINI_PAID_TIER=true) in this shell to score PDFs or photos.");
    process.exitCode = 2;
    return;
  }
  const items = generateSamples().map((s) => ({ id: s.id, truth: s.truth, file: kind === "pdf" ? `${s.id}.pdf` : kind === "photo" ? `${s.id}-photo.jpg` : null, text: s.text }));
  const realDir = path.join(dir, "real");
  if (existsSync(realDir)) {
    for (const name of readdirSync(realDir).filter((n) => /\.(pdf|jpe?g|png)$/i.test(n))) {
      const truthFile = path.join(realDir, name.replace(/\.[^.]+$/, ".json"));
      if (existsSync(truthFile)) items.push({ id: `real/${name}`, truth: JSON.parse(readFileSync(truthFile, "utf8")), file: path.join("real", name) });
    }
  }
  let passed = 0;
  for (const item of items) {
    let input;
    if (!item.file) input = { kind: "text", text: item.text };
    else {
      const bytes = new Uint8Array(readFileSync(path.join(dir, item.file)));
      const contentType = /\.pdf$/i.test(item.file) ? "application/pdf" : /\.png$/i.test(item.file) ? "image/png" : "image/jpeg";
      input = { kind: "file", bytes, contentType };
    }
    try {
      const result = await readNotice(input, env);
      const { pass, checks } = scoreExtraction(result.extraction, item.truth);
      if (pass) passed += 1;
      console.log(`${pass ? "PASS" : "FAIL"} ${item.id} via ${result.extraction.source}${pass ? "" : " " + JSON.stringify(checks)}`);
    } catch (error) {
      console.log(`FAIL ${item.id}: ${error.message}`);
    }
  }
  const needed = Math.ceil(items.length * 0.95);
  console.log(`EXT-1 (${kind}): ${passed}/${items.length} correct; pass mark ${needed}. ${passed >= needed ? "PASS" : "FAIL"}`);
  if (passed < needed) process.exitCode = 1;
}

const [mode, kind] = process.argv.slice(2);
if (mode === "render") await render();
else if (mode === "score") await score(kind);
else console.log("Usage: node scripts/ext1-harness.mjs render | score [text|pdf|photo]");
