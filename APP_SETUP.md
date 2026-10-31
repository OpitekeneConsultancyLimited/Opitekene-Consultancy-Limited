# Install TaxComp as an app

TaxComp is an installable Progressive Web App (PWA). It uses the same site
code and calculators and does not require an app-store account or a separate
native mobile codebase.

## Install

- **Android or desktop Chrome/Edge:** open the TaxComp site over HTTPS (or
  `http://localhost` for local testing). Use the site's **Install app** button
  when offered, or the browser's Install app menu.
- **iPhone or iPad:** open the HTTPS site in Safari, tap **Share**, then choose
  **Add to Home Screen**.
- **Run the local copy:** from the project folder run `py run_taxcomp.py`, then
  use the browser's install menu at `http://127.0.0.1:8000/`. Keep the server
  running while using this local installation.

The app shell and tax calculators are cached for offline use after the first
successful visit. Open-ended AI chat requires an internet connection and a
configured Cloudflare Worker and Gemini API key. Case links and external tax
sources also require an internet connection.

The PWA is not published to Google Play or Apple's App Store. GitHub Pages
serves it over HTTPS, which is required for installation outside localhost.
