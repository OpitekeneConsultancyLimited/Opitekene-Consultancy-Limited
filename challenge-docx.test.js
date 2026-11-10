// The DOCX writer produces a valid ZIP that the DOCX reader (and Word) can open.
const test = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const { crc32, packToDocx, readDocxText, zipStore } = require("./challenge-docx.js");

test("crc32 matches zlib", () => {
  const data = new TextEncoder().encode("TaxComp Challenge an Assessment");
  assert.equal(crc32(data), zlib.crc32(data));
});

test("pack round-trips through the writer and the reader, with escaping and tables", async () => {
  const pack = {
    provisionalNotice: "Provisional: rules pending legal review",
    documents: [
      { id: "objection-letter", title: "Notice of objection", draft: true, blocks: [
        { heading: "Grounds & figures", paragraphs: [{ text: "URA <figure> differs: UGX 1,000", citations: [{ label: "Tax Procedures Code Act", sourceUrl: "https://ulii.org/x" }] }] },
        { table: { headers: ["Item", "Amount"], rows: [["Principal tax", "UGX 5,000,000"]] } },
      ] },
      { id: "evidence-checklist", title: "Evidence checklist", draft: false, blocks: [{ bullets: ["Supplier invoices"] }] },
    ],
  };
  const bytes = packToDocx(pack);
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034b50, "starts with a ZIP local header");
  const text = await readDocxText(bytes.buffer);
  assert.match(text, /Notice of objection/);
  assert.match(text, /Grounds & figures/);
  assert.match(text, /URA <figure> differs: UGX 1,000/);
  assert.match(text, /Source: Tax Procedures Code Act \(https:\/\/ulii\.org\/x\)/);
  assert.match(text, /Principal tax \| UGX 5,000,000/);
  assert.match(text, /• Supplier invoices/);
});

test("reads a deflated .docx entry (as Word saves it)", async () => {
  const docXml = '<w:document><w:body><w:p><w:r><w:t>Principal tax: UGX 18,400,000</w:t></w:r></w:p><w:p><w:r><w:t>Interest &amp; penalty</w:t></w:r></w:p></w:body></w:document>';
  const deflated = zlib.deflateRawSync(Buffer.from(docXml));
  const stored = zipStore([{ name: "word/document.xml", data: new Uint8Array(deflated) }]);
  // Mark the entry as deflated (method 8) in both headers, as Word would write it.
  const view = new DataView(stored.buffer);
  view.setUint16(8, 8, true);
  const central = stored.length - 22 - (46 + "word/document.xml".length);
  view.setUint16(central + 10, 8, true);
  const text = await readDocxText(stored.buffer);
  assert.equal(text, "Principal tax: UGX 18,400,000\nInterest & penalty");
  await assert.rejects(readDocxText(new Uint8Array([1, 2, 3]).buffer), /not a Word/);
});
