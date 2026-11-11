// Word (.docx) support for Challenge an Assessment, in the browser, with no
// library and no upload to a converter (decisions D-07, D-13):
//   packToDocx(pack)   -> Uint8Array of an editable .docx (uncompressed ZIP)
//   readDocxText(buf)  -> Promise<string> text of an uploaded .docx notice
(function challengeDocx(root) {
  "use strict";

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  /** ZIP with stored (uncompressed) entries. files: [{ name, data: Uint8Array }]. */
  function zipStore(files) {
    const encoder = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    for (const file of files) {
      const name = encoder.encode(file.name);
      const crc = crc32(file.data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // UTF-8 names
      local.setUint16(8, 0, true); // stored
      local.setUint32(14, crc, true);
      local.setUint32(18, file.data.length, true);
      local.setUint32(22, file.data.length, true);
      local.setUint16(26, name.length, true);
      chunks.push(new Uint8Array(local.buffer), name, file.data);
      const entry = new DataView(new ArrayBuffer(46));
      entry.setUint32(0, 0x02014b50, true);
      entry.setUint16(4, 20, true);
      entry.setUint16(6, 20, true);
      entry.setUint16(8, 0x0800, true);
      entry.setUint32(16, crc, true);
      entry.setUint32(20, file.data.length, true);
      entry.setUint32(24, file.data.length, true);
      entry.setUint16(28, name.length, true);
      entry.setUint32(42, offset, true);
      central.push(new Uint8Array(entry.buffer), name);
      offset += 30 + name.length + file.data.length;
    }
    const centralSize = central.reduce((sum, part) => sum + part.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    const parts = [...chunks, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let at = 0;
    for (const part of parts) { out.set(part, at); at += part.length; }
    return out;
  }

  const xml = (text) => String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const run = (text, { bold = false, italic = false, size } = {}) =>
    `<w:r><w:rPr>${bold ? "<w:b/>" : ""}${italic ? "<w:i/>" : ""}${size ? `<w:sz w:val="${size}"/>` : ""}</w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
  const para = (inner, { style, keepNext = false, pageBreakBefore = false } = {}) =>
    `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${keepNext ? "<w:keepNext/>" : ""}${pageBreakBefore ? "<w:pageBreakBefore/>" : ""}</w:pPr>${inner}</w:p>`;

  function table(t) {
    const cell = (text, header) => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${para(run(text, { bold: header }))}</w:tc>`;
    const rows = [t.headers.map((h) => cell(h, true)), ...t.rows.map((r) => r.map((c) => cell(c, false)))]
      .map((cells) => `<w:tr>${cells.join("")}</w:tr>`).join("");
    return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`).join("")}</w:tblBorders></w:tblPr>${rows}</w:tbl>`;
  }

  function documentXml(pack) {
    const body = [];
    if (pack.provisionalNotice) body.push(para(run(pack.provisionalNotice, { italic: true })));
    pack.documents.forEach((doc, index) => {
      body.push(para(run(doc.title, { bold: true, size: 32 }), { style: "Heading1", keepNext: true, pageBreakBefore: index > 0 }));
      for (const block of doc.blocks) {
        if (block.heading) body.push(para(run(block.heading, { bold: true, size: 26 }), { style: "Heading2", keepNext: true }));
        for (const p of block.paragraphs || []) {
          body.push(para(run(p.text)));
          if (p.citations && p.citations.length) {
            body.push(para(run(`Source: ${p.citations.map((c) => (c.sourceUrl ? `${c.label} (${c.sourceUrl})` : c.label)).join("; ")}`, { italic: true, size: 18 })));
          }
        }
        for (const b of block.bullets || []) body.push(para(run(`• ${b}`)));
        if (block.table) { body.push(table(block.table)); body.push(para("")); }
      }
    });
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  }

  function packToDocx(pack) {
    const enc = new TextEncoder();
    return zipStore([
      { name: "[Content_Types].xml", data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>') },
      { name: "_rels/.rels", data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>') },
      { name: "word/document.xml", data: enc.encode(documentXml(pack)) },
    ]);
  }

  /** Text of word/document.xml in a .docx (stored or deflated entry). */
  async function readDocxText(buffer) {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i -= 1) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("This is not a Word (.docx) file.");
    const count = view.getUint16(eocd + 10, true);
    let at = view.getUint32(eocd + 16, true);
    const decoder = new TextDecoder();
    for (let n = 0; n < count; n += 1) {
      if (view.getUint32(at, true) !== 0x02014b50) break;
      const method = view.getUint16(at + 10, true);
      const compressed = view.getUint32(at + 20, true);
      const nameLength = view.getUint16(at + 28, true);
      const extraLength = view.getUint16(at + 30, true);
      const commentLength = view.getUint16(at + 32, true);
      const localOffset = view.getUint32(at + 42, true);
      const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
      if (name === "word/document.xml") {
        const localName = view.getUint16(localOffset + 26, true);
        const localExtra = view.getUint16(localOffset + 28, true);
        const start = localOffset + 30 + localName + localExtra;
        let data = bytes.subarray(start, start + compressed);
        if (method === 8) {
          const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
          data = new Uint8Array(await new Response(stream).arrayBuffer());
        } else if (method !== 0) throw new Error("This Word file uses a format TaxComp cannot read. Save it as PDF instead.");
        let text = decoder.decode(data)
          .replace(/<w:tab\/>/g, "\t").replace(/<w:br\/>/g, "\n").replace(/<\/w:p>\s*<\/w:tc>/g, " | ").replace(/<\/w:tr>/g, "\n").replace(/<\/w:p>/g, "\n");
        // Strip tags until none are left, so a nested "<<x>y>" cannot survive one pass.
        for (let previous = ""; previous !== text;) { previous = text; text = text.replace(/<[^<>]*>/g, ""); }
        return text
          .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
          .replace(/ \| \n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
      }
      at += 46 + nameLength + extraLength + commentLength;
    }
    throw new Error("No document text was found in this Word file.");
  }

  const api = Object.freeze({ crc32, zipStore, packToDocx, readDocxText });
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TaxCompDocx = api;
})(typeof window !== "undefined" ? window : globalThis);
