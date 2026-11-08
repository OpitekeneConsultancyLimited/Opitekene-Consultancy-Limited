import unittest

from get_taxcomp import response_content_type as get_taxcomp_content_type
from opitekene_tax_consultancy import (
    archive_candidates,
    find_index_path,
    response_content_type as consultancy_content_type,
)


class SmartLauncherTests(unittest.TestCase):
    def test_archive_candidates_include_live_repo(self):
        urls = archive_candidates()
        self.assertTrue(
            any(
                "Opitekene-Consultancy-Limited" in url and "/zip/refs/heads/main" in url
                for url in urls
            )
        )

    def test_find_index_path_prefers_root_index(self):
        files = {"index.html": "root", "docs/index.html": "nested"}
        self.assertEqual(find_index_path(files), "index.html")

    def test_find_index_path_accepts_nested_docs_index(self):
        files = {"docs/index.html": "nested"}
        self.assertEqual(find_index_path(files), "docs/index.html")

    def test_response_content_type_rejects_header_injection(self):
        malicious_path = "page.html\r\nX-Injected: yes"
        self.assertEqual(consultancy_content_type(malicious_path), "application/octet-stream")
        self.assertEqual(get_taxcomp_content_type(malicious_path), "application/octet-stream")
        self.assertEqual(consultancy_content_type("index.html"), "text/html")
        self.assertEqual(get_taxcomp_content_type("site.css"), "text/css")
        self.assertEqual(consultancy_content_type("manifest.webmanifest"), "application/manifest+json")


if __name__ == "__main__":
    unittest.main()
