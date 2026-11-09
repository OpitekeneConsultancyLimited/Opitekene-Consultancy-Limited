"""Run the Opitekene Tax Solutions website from a single Python script without a project folder.

Copy this file to another computer, open it in VS Code, and run:
    py opitekene_tax_consultancy.py

The script downloads the public Opitekene Tax Solutions site into memory and serves it locally.
It does not create a project folder. Internet access is needed each
time the script starts. Press Ctrl+C in the terminal to stop the server.
"""

from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path, PurePosixPath
from threading import Timer
from urllib.error import URLError
from urllib.parse import unquote, urlsplit
from urllib.request import Request, urlopen
import argparse
import json
import re
import stat
import webbrowser
import zipfile


APP_NAME = "Opitekene Tax Solutions"
SEARCH_NAME = "Opitekene_tax_Solutions"
MOBILE_FIX_CSS = """
<style id="opitekene-mobile-fixes">
  @media (max-width: 768px) {
    html, body {
      overflow-x: hidden;
      width: 100%;
      min-width: 0;
      max-width: 100%;
    }

    body {
      font-size: 15px;
    }

    .site-header,
    .site-footer,
    .estimator-section,
    .international-tax-section,
    .worked-examples-section,
    .audit-health-section,
    .advisory-section,
    .tax-chat-section,
    .case-law-section,
    .info-section,
    .disclaimer,
    .law-updates,
    .other-heads,
    .payment-section,
    .hero,
    .page-shell,
    .main-grid,
    .section-grid,
    .site-header-inner,
    .site-footer-inner {
      width: min(100% - 20px, 560px) !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }

    .site-header {
      height: auto !important;
      padding: 10px 0 !important;
    }

    /* Keep navigation usable on phones: one swipeable row instead of hiding it. */
    .main-nav {
      display: flex !important;
      flex-wrap: nowrap !important;
      gap: 8px !important;
      max-width: 100% !important;
      overflow-x: auto !important;
      -webkit-overflow-scrolling: touch;
      padding-bottom: 4px !important;
    }

    .main-nav a {
      flex: 0 0 auto !important;
      white-space: nowrap !important;
    }

    .hero {
      min-height: auto !important;
      padding: 28px 16px !important;
    }

    .hero h1 {
      font-size: clamp(2rem, 10vw, 3rem) !important;
      letter-spacing: -1.2px !important;
      line-height: 1.08 !important;
    }

    .hero-copy,
    .hero-content,
    .hero-actions,
    .action-row,
    .calculator-row,
    .field-row,
    .info-steps,
    .feature-grid,
    .stat-grid,
    .question-grid,
    .audit-health-controls,
    .tax-links-grid,
    .result-grid,
    .support-grid,
    .details-grid {
      display: grid !important;
      grid-template-columns: 1fr !important;
      width: 100% !important;
      max-width: 100% !important;
      gap: 12px !important;
    }

    .hero-actions,
    .action-row,
    .calculator-row,
    .field-row {
      flex-direction: column !important;
    }

    .primary-button,
    .secondary-button,
    .button,
    .cta-button,
    .header-link,
    .header-cta,
    .tax-link {
      width: 100% !important;
      max-width: 100% !important;
      white-space: normal !important;
      text-align: center !important;
    }

    .hero-visual,
    .hero-art,
    .orb,
    .orbit-one,
    .orbit-two,
    .art-card,
    .hero-illustration {
      display: none !important;
    }

    .estimator-card,
    .tax-card,
    .info-card,
    .feature-card,
    .other-head-card,
    .question-card,
    .support-card,
    .audit-health-workspace,
    .tax-chat-section,
    .case-law-card,
    .advisory-card {
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      box-sizing: border-box !important;
    }

    input:not([type="checkbox"]):not([type="radio"]),
    select,
    textarea,
    button {
      max-width: 100% !important;
      width: 100% !important;
      box-sizing: border-box !important;
    }

    /* Tables keep their row/column layout and scroll sideways when too wide. */
    table {
      display: block !important;
      max-width: 100% !important;
      overflow-x: auto !important;
      -webkit-overflow-scrolling: touch;
    }

    .worked-example-table-wrap {
      max-width: 100% !important;
      overflow-x: auto !important;
    }
  }

  @media (max-width: 420px) {
    .hero {
      padding: 22px 14px !important;
    }

    .header-brand {
      font-size: 0.95rem !important;
    }

    .header-link {
      font-size: 11px !important;
    }
  }
</style>
"""

DOWNLOAD_LIMIT = 100 * 1024 * 1024
EXTRACTED_LIMIT = 250 * 1024 * 1024
FILE_LIMIT = 2_000
HOST = "127.0.0.1"


def archive_candidates():
    repo_names = [
        "Opitekene-Consultancy-Limited",
        "OpitekeneconsTax",
    ]
    branches = ["main", "master"]
    urls = []
    for repo_name in repo_names:
        for branch in branches:
            urls.append(
                f"https://codeload.github.com/OpitekeneConsultancyLimited/{repo_name}/zip/refs/heads/{branch}"
            )
    return urls


def find_index_path(files):
    if "index.html" in files:
        return "index.html"

    preferred = ["docs/index.html", "site/index.html", "public/index.html"]
    for candidate in preferred:
        if candidate in files:
            return candidate

    for candidate in sorted(files):
        if candidate.lower().endswith("index.html"):
            return candidate
    return None


def download_archive():
    last_error = None
    for project_url in archive_candidates():
        request = Request(
            project_url,
            headers={"User-Agent": "TaxComp-single-file-Python-launcher"},
        )
        try:
            with urlopen(request, timeout=60) as response:
                data = response.read(DOWNLOAD_LIMIT + 1)
            if len(data) > DOWNLOAD_LIMIT:
                raise RuntimeError("The TaxComp download is larger than the allowed limit.")
            return data
        except (URLError, TimeoutError) as error:
            last_error = error
            continue

    raise RuntimeError(
        "Could not download TaxComp. Check this computer's internet "
        "connection and try again."
    ) from last_error


def load_site(archive_data):
    files = {}
    total_size = 0

    try:
        with zipfile.ZipFile(BytesIO(archive_data)) as archive:
            members = archive.infolist()
            if len(members) > FILE_LIMIT:
                raise RuntimeError("The TaxComp archive contains too many files.")

            roots = {
                PurePosixPath(member.filename).parts[0]
                for member in members
                if PurePosixPath(member.filename).parts
            }
            if len(roots) != 1:
                raise RuntimeError("The TaxComp download has an unexpected layout.")

            root = next(iter(roots))
            for member in members:
                archive_path = PurePosixPath(member.filename)
                if (
                    archive_path.is_absolute()
                    or ".." in archive_path.parts
                    or "\\" in member.filename
                    or not archive_path.parts
                    or archive_path.parts[0] != root
                ):
                    raise RuntimeError("The TaxComp archive contains an unsafe path.")
                if len(archive_path.parts) == 1 or member.is_dir():
                    continue

                file_type = member.external_attr >> 16
                if stat.S_ISLNK(file_type):
                    raise RuntimeError("The TaxComp archive contains a symbolic link.")

                relative_path = PurePosixPath(*archive_path.parts[1:]).as_posix()
                total_size += member.file_size
                if total_size > EXTRACTED_LIMIT or len(files) >= FILE_LIMIT:
                    raise RuntimeError("The TaxComp archive exceeds extraction limits.")

                with archive.open(member) as source:
                    content = source.read(member.file_size + 1)
                if len(content) != member.file_size:
                    raise RuntimeError("A file in the TaxComp archive has an invalid size.")
                files[relative_path] = content
    except zipfile.BadZipFile as error:
        raise RuntimeError("GitHub returned an invalid TaxComp archive.") from error

    index_path = find_index_path(files)
    if index_path is None:
        raise RuntimeError("The downloaded project does not contain index.html.")
    if index_path != "index.html":
        files["index.html"] = files[index_path]
    return files


# Splits HTML into markup (comments, <script>/<style> blocks, tags) and the text
# between them. With a capturing group, re.split puts markup at odd indices.
_MARKUP = re.compile(
    r"(<!--.*?-->|<script\b.*?</script\s*>|<style\b.*?</style\s*>|<[^>]*>)",
    flags=re.IGNORECASE | re.DOTALL,
)


def replace_visible_text(html, old, new):
    """Replace text that users see, never tag names, attributes, scripts or styles.

    This keeps hooks such as <meta name="taxcomp-chat-endpoint"> and icon file
    names intact, which the site's JavaScript and manifest depend on.
    """
    parts = _MARKUP.split(html)
    for index in range(0, len(parts), 2):
        parts[index] = parts[index].replace(old, new)
    return "".join(parts)


def set_meta(html, attribute, key, content):
    """Set <meta {attribute}="{key}" content="..."> in place, or add it to <head>."""
    tag = f'<meta {attribute}="{escape(key)}" content="{escape(content)}">'
    pattern = re.compile(
        rf"<meta\b[^>]*\s{attribute}\s*=\s*[\"']{re.escape(key)}[\"'][^>]*>",
        flags=re.IGNORECASE,
    )
    html, count = pattern.subn(lambda _match: tag, html, count=1)
    if count == 0:
        html = html.replace("</head>", f"{tag}\n</head>", 1)
    return html


def apply_branding(site_files):
    if "index.html" not in site_files:
        return

    description = (
        f"{APP_NAME} offers tax guidance, calculators, advisory services, "
        "and compliance support for Ugandan businesses and taxpayers."
    )

    html = site_files["index.html"].decode("utf-8", errors="replace")
    html = re.sub(
        r"<title>.*?</title>",
        lambda _match: f"<title>{escape(APP_NAME)}</title>",
        html,
        count=1,
        flags=re.IGNORECASE | re.DOTALL,
    )
    # Longest phrase first so "TaxComp Uganda" does not become "<name> Uganda".
    html = replace_visible_text(html, "TaxComp Uganda", APP_NAME)
    html = replace_visible_text(html, "TaxComp", APP_NAME)

    for attribute, key, content in (
        ("name", "description", description),
        ("name", "application-name", SEARCH_NAME),
        ("name", "apple-mobile-web-app-title", APP_NAME),
        ("name", "keywords", f"{SEARCH_NAME}, {APP_NAME}, Uganda tax advisory, tax calculator, tax consultancy, tax compliance"),
        ("name", "robots", "index, follow"),
        ("property", "og:title", APP_NAME),
        ("property", "og:site_name", APP_NAME),
        ("property", "og:description", description),
    ):
        html = set_meta(html, attribute, key, content)

    site_files["index.html"] = html.encode("utf-8")

    if "manifest.webmanifest" in site_files:
        try:
            manifest = json.loads(site_files["manifest.webmanifest"].decode("utf-8", errors="replace"))
        except ValueError:
            print("Warning: manifest.webmanifest is not valid JSON; leaving it unchanged.")
            return
        if isinstance(manifest, dict):
            manifest["name"] = APP_NAME
            manifest["short_name"] = SEARCH_NAME
            manifest["description"] = description
            site_files["manifest.webmanifest"] = json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")


def apply_mobile_fixes(site_files):
    if "index.html" not in site_files:
        return

    html = site_files["index.html"].decode("utf-8", errors="replace")
    if "opitekene-mobile-fixes" in html:
        return

    marker = "</head>"
    if marker in html:
        html = html.replace(marker, f"{MOBILE_FIX_CSS}{marker}", 1)
    else:
        html = f"{MOBILE_FIX_CSS}{html}"
    site_files["index.html"] = html.encode("utf-8")


def response_content_type(path):
    suffix = PurePosixPath(path).suffix.lower()
    if suffix == ".webmanifest":
        return "application/manifest+json"
    if suffix in {".html", ".htm"}:
        return "text/html"
    if suffix == ".css":
        return "text/css"
    if suffix in {".js", ".mjs"}:
        return "application/javascript"
    if suffix == ".json":
        return "application/json"
    if suffix == ".xml":
        return "application/xml"
    if suffix == ".svg":
        return "image/svg+xml"
    if suffix == ".png":
        return "image/png"
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".gif":
        return "image/gif"
    if suffix == ".webp":
        return "image/webp"
    if suffix == ".ico":
        return "image/x-icon"
    if suffix == ".woff2":
        return "font/woff2"
    if suffix == ".woff":
        return "font/woff"
    if suffix == ".pdf":
        return "application/pdf"
    return "application/octet-stream"


def make_handler(site_files):
    class TaxCompHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            self._serve()

        def do_HEAD(self):
            self._serve(send_body=False)

        def _serve(self, send_body=True):
            path = unquote(urlsplit(self.path).path).lstrip("/")
            # Decide on the directory index before PurePosixPath drops the trailing slash.
            if path == "" or path.endswith("/"):
                path += "index.html"
            requested_path = PurePosixPath(path)
            if requested_path.is_absolute() or ".." in requested_path.parts or "\\" in path:
                self.send_error(404)
                return

            normalized_path = requested_path.as_posix()
            content = site_files.get(normalized_path)
            if content is None:
                self.send_error(404)
                return

            content_type = response_content_type(normalized_path)

            self.send_response(200)
            self.send_header("Content-Type", f"{content_type}; charset=utf-8"
                             if content_type.startswith(("text/", "application/javascript"))
                             else content_type)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if send_body:
                self.wfile.write(content)

    return TaxCompHandler


def start_site(site_files, port):
    handler = make_handler(site_files)
    try:
        server = ThreadingHTTPServer((HOST, port), handler)
    except OSError:
        if port != 0:
            print(f"Port {port} is unavailable. Retrying on a free port automatically...")
            server = ThreadingHTTPServer((HOST, 0), handler)
        else:
            raise
    url = f"http://{HOST}:{server.server_port}/"
    print(f"{APP_NAME} is running at {url}")
    print("The website is being served from memory; no project folder was created.")
    print("Keep this terminal open while using the site. Press Ctrl+C to stop.")
    Timer(1, webbrowser.open, args=(url,)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print(f"\nStopping {APP_NAME}.")
    finally:
        server.server_close()


def main():
    parser = argparse.ArgumentParser(
        description=f"Download and run {APP_NAME} without creating a project folder."
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Local web-server port (default: 8000; use 0 to pick any free port automatically).",
    )
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error("port must be between 0 and 65535")

    print(f"Downloading {APP_NAME} from its public GitHub repository...")
    try:
        site_files = load_site(download_archive())
    except (RuntimeError, OSError) as error:
        raise SystemExit(f"{APP_NAME} could not start: {error}") from error

    apply_branding(site_files)
    apply_mobile_fixes(site_files)
    print(f"Loaded {len(site_files)} website files into memory.")
    try:
        start_site(site_files, args.port)
    except OSError as error:
        raise SystemExit(
            f"Could not start the local website on port {args.port}. "
            f"Try again with: py {Path(__file__).name} --port 0"
        ) from error


if __name__ == "__main__":
    main()