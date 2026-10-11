# engagement_tracker

A minimalist, pink checklist and budget tracker for Areef & Amyra's majlis tunang (3 April 2027), and the kahwin, coming soon.

- `index.html`: landing page
- `tunang.html`: engagement checklist
- `data/tunang.js`: names, date, theme, bajet, the Google Sheet link (`sheetUrl`), and the starting list of categories and items
- `js/app.js`: shared checklist and budget engine
- `css/style.css`: styles; change `--accent` to retheme
- `apps-script/Code.gs`: the Google Apps Script that connects the page to a Google Sheet

## Where the data lives

- **With a Google Sheet connected** (`sheetUrl` set): the Sheet is the live data. Every change on the page is saved
  to it, and everyone opening the page sees the same thing. Saving needs the passcode; without it the page is view-only.
  Setup: [GOOGLE_SHEET_SETUP.md](GOOGLE_SHEET_SETUP.md).
- **Without** (`sheetUrl: ''`): changes are saved in your browser only. Use **Backup** / **Restore** to move them.

## Run locally

Open `index.html` in a browser (or use VS Code Live Server). No build step.

## Publish (GitHub Pages)

Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`.

## Add the wedding checklist

Copy `data/tunang.js` to `data/kahwin.js` (change `id`, `title`, items, and use a new Google Sheet), copy `tunang.html`
to `kahwin.html` pointing at the new data file, then turn the "Coming soon" card in `index.html` into a link.
