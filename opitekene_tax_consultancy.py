"""Run the Opitekene Tax Consultancy website from a single Python script without a project folder.

Copy this file to another computer, open it in VS Code, and run:
    py opitekene_tax_consultancy.py

The script downloads the public Opitekene Tax Consultancy site into memory and serves it locally.
It does not create a project folder. Internet access is needed each
time the script starts. Press Ctrl+C in the terminal to stop the server.
"""

from functools import partial
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import PurePosixPath
from threading import Timer
from urllib.error import URLError
from urllib.parse import unquote, urlsplit
from urllib.request import Request, urlopen
import argparse
import json
import mimetypes
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

    .main-nav {
      display: none !important;
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

    input,
    select,
    textarea,
    button {
      max-width: 100% !important;
      width: 100% !important;
      box-sizing: border-box !important;
    }

    table,
    thead,
    tbody,
    tr,
    th,
    td {
      display: block !important;
      width: 100% !important;
    }

    .worked-example-table-wrap {
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

PROJECT_URL = (
    "https://codeload.github.com/"
    "OpitekeneConsultancyLimited/OpitekeneconsTax/zip/refs/heads/main"
)
DOWNLOAD_LIMIT = 100 * 1024 * 1024
EXTRACTED_LIMIT = 250 * 1024 * 1024
FILE_LIMIT = 2_000
HOST = "127.0.0.1"


def download_archive():
    request = Request(
        PROJECT_URL,
        headers={"User-Agent": "TaxComp-single-file-Python-launcher"},
    )
    try:
        with urlopen(request, timeout=60) as response:
            data = response.read(DOWNLOAD_LIMIT + 1)
    except (URLError, TimeoutError) as error:
        raise RuntimeError(
            "Could not download TaxComp. Check this computer's internet "
            "connection and try again."
        ) from error

    if len(data) > DOWNLOAD_LIMIT:
        raise RuntimeError("The TaxComp download is larger than the allowed limit.")
    return data


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

    if "index.html" not in files:
        raise RuntimeError("The downloaded project does not contain index.html.")
    return files


def apply_branding(site_files):
    if "index.html" not in site_files:
        return

    html = site_files["index.html"].decode("utf-8", errors="replace")
    html = re.sub(r"<title>.*?</title>", f"<title>{APP_NAME}</title>", html, flags=re.IGNORECASE | re.DOTALL)
    html = html.replace("TaxComp", APP_NAME)
    html = html.replace("taxcomp", "opitekene tax solutions")
    html = html.replace("TaxComp Uganda", APP_NAME)
    html = html.replace("opitekene tax solutions-192.png", "taxcomp-192.png")
    html = html.replace("opitekene tax solutions-180.png", "taxcomp-180.png")
    html = html.replace("taxcomp-192.png", "taxcomp-192.png")
    html = html.replace("taxcomp-180.png", "taxcomp-180.png")
    html = html.replace("<meta name=\"apple-mobile-web-app-title\" content=\"TaxComp\">", f'<meta name="apple-mobile-web-app-title" content="{APP_NAME}">')
    html = html.replace('name="application-name" content="TaxComp"', f'name="application-name" content="{SEARCH_NAME}"')
    html = html.replace('content="TaxComp Uganda | Tax calculators"', f'content="{APP_NAME} | Tax calculators"')

    if "<meta name=\"description\"" in html:
        html = re.sub(
            r'<meta name="description" content="[^"]*">',
            f'<meta name="description" content="{APP_NAME} offers tax guidance, calculators, advisory services, and compliance support for Ugandan businesses and taxpayers.">',
            html,
            count=1,
            flags=re.IGNORECASE,
        )
    else:
        html = html.replace("</head>", f'<meta name="description" content="{APP_NAME} offers tax guidance, calculators, advisory services, and compliance support for Ugandan businesses and taxpayers.">\n</head>', 1)

    seo = (
        f'<meta name="keywords" content="{SEARCH_NAME}, Opitekene Tax Solutions, Uganda tax advisory, tax calculator, tax consultancy, tax compliance">\n'
        f'<meta property="og:title" content="{APP_NAME}">\n'
        f'<meta property="og:site_name" content="{APP_NAME}">\n'
        f'<meta property="og:description" content="{APP_NAME} offers practical tax guidance, calculators, and advisory support for Uganda.">\n'
        f'<meta name="application-name" content="{SEARCH_NAME}">\n'
        f'<meta name="robots" content="index, follow">\n'
    )
    if "<meta name=\"keywords\"" not in html:
        html = html.replace("</head>", f"{seo}</head>", 1)

    site_files["index.html"] = html.encode("utf-8")

    if "manifest.webmanifest" in site_files:
        manifest = json.loads(site_files["manifest.webmanifest"].decode("utf-8", errors="replace"))
        manifest["name"] = APP_NAME
        manifest["short_name"] = SEARCH_NAME
        manifest["description"] = f"{APP_NAME} offers tax guidance, calculators, and advisory support for Ugandan taxpayers and businesses."
        if "icons" in manifest:
            for icon in manifest["icons"]:
                if "taxcomp-192" in icon.get("src", "") or "taxcomp-180" in icon.get("src", ""):
                    continue
                if "name" in icon:
                    icon["name"] = APP_NAME
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


def make_handler(site_files):
    class TaxCompHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            self._serve()

        def do_HEAD(self):
            self._serve(send_body=False)

        def _serve(self, send_body=True):
            raw_path = unquote(urlsplit(self.path).path)
            path = raw_path.lstrip("/") or "index.html"
            requested_path = PurePosixPath(path)
            if requested_path.is_absolute() or ".." in requested_path.parts or "\\" in path:
                self.send_error(404)
                return

            normalized_path = requested_path.as_posix()
            if normalized_path.endswith("/"):
                normalized_path += "index.html"
            content = site_files.get(normalized_path)
            if content is None and raw_path.endswith("/"):
                content = site_files.get(normalized_path)
            if content is None:
                self.send_error(404)
                return

            content_type = mimetypes.guess_type(normalized_path)[0] or "application/octet-stream"
            if normalized_path.endswith(".webmanifest"):
                content_type = "application/manifest+json"

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
            f"Try again with: py {__file__.split('/')[-1]} --port 0"
        ) from error


if __name__ == "__main__":
    main()
