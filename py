"""Run the TaxComp website from a single Python script without a project folder.

Copy this file to another computer, open it in VS Code, and run:
    py get_taxcomp.py

The script downloads the public TaxComp site into memory and serves it locally.
It does not create a TaxComp project folder. Internet access is needed each
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
import mimetypes
import stat
import webbrowser
import zipfile


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
    server = ThreadingHTTPServer((HOST, port), handler)
    url = f"http://{HOST}:{server.server_port}/"
    print(f"TaxComp is running at {url}")
    print("The website is being served from memory; no project folder was created.")
    print("Keep this terminal open while using the site. Press Ctrl+C to stop.")
    Timer(1, webbrowser.open, args=(url,)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping TaxComp.")
    finally:
        server.server_close()


def main():
    parser = argparse.ArgumentParser(
        description="Download and run TaxComp without creating a project folder."
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Local web-server port (default: 8000; use 0 for an available port).",
    )
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error("port must be between 0 and 65535")

    print("Downloading TaxComp from its public GitHub repository...")
    try:
        site_files = load_site(download_archive())
    except (RuntimeError, OSError) as error:
        raise SystemExit(f"TaxComp could not start: {error}") from error

    print(f"Loaded {len(site_files)} website files into memory.")
    try:
        start_site(site_files, args.port)
    except OSError as error:
        raise SystemExit(
            f"Could not start the local website on port {args.port}. "
            "Try again with: py get_taxcomp.py --port 0"
        ) from error


if __name__ == "__main__":
    main()
    