import unittest

from opitekene_tax_consultancy import archive_candidates, find_index_path


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


if __name__ == "__main__":
    unittest.main()
