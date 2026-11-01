"""Extract every page of a text-based PDF into searchable text and JSON Lines.

Example:
    py -3 -m pip install pypdf
    py -3 capture_compendium.py "laws-of-uganda.pdf"
"""

import argparse
import hashlib
import json
import sys
import tempfile
from pathlib import Path


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def temporary_path(directory: Path, suffix: str) -> Path:
    with tempfile.NamedTemporaryFile(
        mode="wb",
        prefix=".compendium-",
        suffix=suffix,
        dir=directory,
        delete=False,
    ) as temporary:
        return Path(temporary.name)


def capture(pdf_path: Path, output_dir: Path):
    try:
        from pypdf import PdfReader
    except ImportError as error:
        raise RuntimeError(
            "Missing dependency. Install it with: "
            "py -3 -m pip install pypdf"
        ) from error

    if not pdf_path.is_file():
        raise FileNotFoundError("PDF does not exist: {}".format(pdf_path))

    output_dir.mkdir(parents=True, exist_ok=True)

    stem = pdf_path.stem
    text_path = output_dir / (stem + ".extracted.txt")
    pages_path = output_dir / (stem + ".pages.jsonl")
    manifest_path = output_dir / (stem + ".manifest.json")

    temporary_files = [
        temporary_path(output_dir, ".txt.tmp"),
        temporary_path(output_dir, ".jsonl.tmp"),
        temporary_path(output_dir, ".json.tmp"),
    ]

    total_characters = 0
    blank_pages = 0

    try:
        reader = PdfReader(str(pdf_path), strict=False)

        if reader.is_encrypted:
            raise RuntimeError(
                "The PDF is encrypted. Decrypt it with an authorized tool first."
            )

        page_count = len(reader.pages)

        with (
            temporary_files[0].open(
                "w", encoding="utf-8", newline="\n"
            ) as text_out,
            temporary_files[1].open(
                "w", encoding="utf-8", newline="\n"
            ) as pages_out,
        ):
            for page_number, page in enumerate(reader.pages, start=1):
                try:
                    text = page.extract_text() or ""
                except Exception as error:
                    raise RuntimeError(
                        "Could not extract page {}: {}".format(page_number, error)
                    ) from error

                total_characters += len(text)
                if not text.strip():
                    blank_pages += 1

                text_out.write("\n\n===== PAGE {} =====\n".format(page_number))
                text_out.write(text)
                if not text.endswith("\n"):
                    text_out.write("\n")

                pages_out.write(
                    json.dumps(
                        {"page": page_number, "text": text},
                        ensure_ascii=False,
                    )
                    + "\n"
                )

        manifest = {
            "source_file": pdf_path.name,
            "source_sha256": sha256_file(pdf_path),
            "page_count": page_count,
            "total_extracted_characters": total_characters,
            "pages_without_extractable_text": blank_pages,
            "text_output": text_path.name,
            "page_records_output": pages_path.name,
            "extraction_method": "pypdf page text extraction",
            "note": (
                "Pages without extractable text may be scanned images and need OCR. "
                "Extraction does not preserve original page layout."
            ),
        }

        with temporary_files[2].open(
            "w", encoding="utf-8", newline="\n"
        ) as manifest_out:
            json.dump(manifest, manifest_out, ensure_ascii=False, indent=2)
            manifest_out.write("\n")

        for temporary, destination in zip(
            temporary_files, (text_path, pages_path, manifest_path)
        ):
            temporary.replace(destination)

        return text_path, pages_path, manifest_path, page_count, blank_pages

    finally:
        for temporary in temporary_files:
            if temporary.exists():
                temporary.unlink()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Extract all pages of a PDF into searchable text and page records."
    )
    parser.add_argument("pdf", type=Path, help="Path to the source PDF")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Output folder (default: <PDF name>_extracted beside the PDF)",
    )
    args = parser.parse_args()

    output_dir = args.output_dir or args.pdf.parent / (
        args.pdf.stem + "_extracted"
    )

    try:
        text_path, pages_path, manifest_path, page_count, blank_pages = capture(
            args.pdf, output_dir
        )
    except (OSError, RuntimeError) as error:
        print("Error: {}".format(error), file=sys.stderr)
        return 1

    print("Extracted {} pages.".format(page_count))
    print("Searchable text: {}".format(text_path))
    print("Page-by-page JSONL: {}".format(pages_path))
    print("Manifest: {}".format(manifest_path))

    if blank_pages:
        print(
            "Warning: {} page(s) had no extractable text; OCR may be needed.".format(
                blank_pages
            ),
            file=sys.stderr,
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
