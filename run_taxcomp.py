"""Run the TaxComp website locally with Python's standard library.

Usage: py run_taxcomp.py
Stop the local server with Ctrl+C.
"""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
from threading import Timer
import webbrowser


HOST = "127.0.0.1"
PORT = 8000
PROJECT_DIR = Path(__file__).resolve().parent
SITE_URL = f"http://{HOST}:{PORT}/"


def main():
    parser = argparse.ArgumentParser(description="Run the TaxComp website locally.")
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Start the local server without opening a browser window.",
    )
    args = parser.parse_args()

    handler = partial(SimpleHTTPRequestHandler, directory=str(PROJECT_DIR))
    try:
        server = ThreadingHTTPServer((HOST, PORT), handler)
    except OSError as error:
        raise SystemExit(
            f"Could not start TaxComp at {SITE_URL}. "
            "The port may already be in use; close the other server and try again."
        ) from error

    print(f"TaxComp is running at {SITE_URL}")
    print("Press Ctrl+C to stop the server.")
    if not args.no_browser:
        Timer(1, webbrowser.open, args=(SITE_URL,)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping TaxComp.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
