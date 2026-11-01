import hashlib
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

import capture_compendium


class FakePage:
    def __init__(self, text):
        self.text = text

    def extract_text(self):
        return self.text


class FakePdfReader:
    pages = [FakePage("Section 1 — Income tax"), FakePage("")]
    is_encrypted = False

    def __init__(self, path, strict=False):
        self.path = path
        self.strict = strict


class EncryptedPdfReader(FakePdfReader):
    is_encrypted = True


class BrokenPage:
    def extract_text(self):
        raise ValueError("invalid page stream")


class BrokenPdfReader:
    pages = [BrokenPage()]
    is_encrypted = False

    def __init__(self, path, strict=False):
        pass


class CaptureCompendiumTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.root = Path(self.temporary_directory.name)
        self.pdf_path = self.root / "laws.pdf"
        self.pdf_path.write_bytes(b"test-pdf-placeholder")
        self.output_dir = self.root / "extracted"

    def use_pdf_reader(self, reader):
        return patch.dict(
            sys.modules,
            {"pypdf": types.SimpleNamespace(PdfReader=reader)},
        )

    def test_extracts_text_jsonl_and_a_hash_manifest(self):
        with self.use_pdf_reader(FakePdfReader):
            text_path, pages_path, manifest_path, page_count, blank_pages = (
                capture_compendium.capture(self.pdf_path, self.output_dir)
            )

        self.assertEqual(page_count, 2)
        self.assertEqual(blank_pages, 1)
        self.assertIn("===== PAGE 1 =====\nSection 1 — Income tax", text_path.read_text(encoding="utf-8"))
        records = [
            json.loads(line)
            for line in pages_path.read_text(encoding="utf-8").splitlines()
        ]
        self.assertEqual(
            records,
            [
                {"page": 1, "text": "Section 1 — Income tax"},
                {"page": 2, "text": ""},
            ],
        )
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        self.assertEqual(manifest["page_count"], 2)
        self.assertEqual(manifest["pages_without_extractable_text"], 1)
        self.assertEqual(
            manifest["source_sha256"],
            hashlib.sha256(self.pdf_path.read_bytes()).hexdigest(),
        )
        self.assertEqual(list(self.output_dir.glob(".compendium-*")), [])

    def test_rejects_encrypted_pdf_without_leaving_outputs(self):
        with self.use_pdf_reader(EncryptedPdfReader):
            with self.assertRaisesRegex(RuntimeError, "encrypted"):
                capture_compendium.capture(self.pdf_path, self.output_dir)

        self.assertEqual(list(self.output_dir.glob("*.extracted.txt")), [])
        self.assertEqual(list(self.output_dir.glob(".compendium-*")), [])

    def test_reports_page_extraction_errors_and_cleans_temporary_files(self):
        with self.use_pdf_reader(BrokenPdfReader):
            with self.assertRaisesRegex(RuntimeError, "Could not extract page 1"):
                capture_compendium.capture(self.pdf_path, self.output_dir)

        self.assertEqual(list(self.output_dir.glob("*.extracted.txt")), [])
        self.assertEqual(list(self.output_dir.glob(".compendium-*")), [])

    def test_missing_source_pdf_is_reported(self):
        with self.use_pdf_reader(FakePdfReader):
            with self.assertRaisesRegex(FileNotFoundError, "PDF does not exist"):
                capture_compendium.capture(self.root / "missing.pdf", self.output_dir)


if __name__ == "__main__":
    unittest.main()
