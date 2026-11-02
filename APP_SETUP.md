# Install TaxComp as an app

TaxComp is an installable Progressive Web App (PWA). It uses the same site
code and calculators and does not require an app-store account or a separate
native mobile codebase.

## Install or download TaxComp

- Open the official TaxComp site: <https://opitekeneconsultancylimited.github.io/Opitekene-Consultancy-Limited/>.
- Select **Install TaxComp** on the home page to open the installation prompt or
  device-specific instructions.
- On a phone, a **Get TaxComp on your phone** bar stays at the bottom of the
  screen so people can install it at any time.
- **Android:** open the site in Chrome, tap the three-dot menu, then choose
  **Install app** or **Add to Home screen**. The **Install TaxComp** button
  opens these steps if Chrome does not offer a direct install prompt.
- **iPhone or iPad:** open the site in Safari, tap **Share**, scroll down, then
  choose **Add to Home Screen**. Other iPhone browsers may need you to open the
  page in Safari first.
- **Windows or Mac:** open the site in Chrome or Edge, open the browser menu,
  then choose **Install app**. Some browser versions also show an install icon
  in the address bar.
- **No APK download or app-store account is needed.** TaxComp is installed
  directly from its official HTTPS website. Installation and use are free.
- **Run the local copy:** from the project folder run `py run_taxcomp.py`, then
  use the browser's install menu at `http://127.0.0.1:8000/`. Keep the server
  running while using this local installation.

The app shell and tax calculators are cached for offline use after the first
successful visit. Open-ended AI chat requires an internet connection and a
configured Cloudflare Worker and Gemini API key. Case links and external tax
sources also require an internet connection.

The audit-readiness and tax health-check workspaces are available in the app.
Checklist statuses and the optional tax period are saved in browser storage on
the current device only. Avoid entering confidential details. Users can clear
each workspace, or download or print its checklist report. These educational
prompts do not assess legal compliance or replace current URA guidance or
professional advice.

The site also includes supplied year-of-income 2024 company-tax and withholding
worked examples. Their calculations check arithmetic only; the tax treatments
and cited historical law are not independently validated and are not current
filing advice.

## Extract a tax-law PDF

To extract text from a text-based PDF into searchable text, page-by-page JSON
Lines, and a source-hash manifest, install `pypdf` and run:

```powershell
py -3 -m pip install pypdf
py -3 capture_compendium.py "C:\path\to\laws-of-uganda.pdf"
```

By default, the script creates a `laws-of-uganda_extracted` folder beside the
PDF. Use `--output-dir "C:\path\to\output"` to choose another location. Pages
without extractable text may need OCR; the extraction does not preserve page
layout. The source PDF is read locally and is not uploaded.

The PWA is not published to Google Play or Apple's App Store. GitHub Pages
serves it over HTTPS, which is required for installation outside localhost.
