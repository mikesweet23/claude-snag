# Site Snag

A simple, offline-first web app (PWA) for site surveys and snagging. No sign-in, no server. Everything is stored on the device.

## What it does

- **Surveys** hold the site name, address, surveyor name, date (defaults to today), client/project ref and general notes.
- **Photos.** Take a photo or pick several from the library. Each photo becomes a snag item.
- **Mark-up.** Draw arrows, freehand lines, boxes, circles and text labels on a photo, in 6 colours and 3 line sizes, with undo. The original photo is kept, so you can edit the mark-up again later.
- **Write-up** for each photo: location or area, comments, **who to action** (one-tap names, add your own), **action by date** (Today, Tomorrow, 1 week, 2 weeks, 1 month, or pick a date), priority, and Open/Complete status.
- **PDF report (A4):**
  - Optional summary page with survey details, actions grouped by person and an item schedule.
  - Then **2 photos per page**, each with its write-up beside it: location, a highlighted "Who to action / Action by" box, and comments.
  - Overdue dates show in red. Each page has a header with the site and date, and a footer with the surveyor and page numbers.
  - You can make a PDF for one person only (for example, just the Electrician's items) and choose whether to leave out completed items.
  - **Save PDF** downloads the file. **Share** opens the phone's share sheet (email, WhatsApp, Files, and so on).
- **Settings:** company name for the PDF header, default surveyor name, the list of people to assign actions to, and **backup/restore** to a file (use this to move surveys between devices).

## Running it

It's plain HTML, CSS and JS with no build step. Serve the folder over HTTP:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

To use it on phones, host the folder on any HTTPS static host. The service worker (offline mode) and "Add to Home Screen" need HTTPS. The simplest option is **GitHub Pages**: repo **Settings → Pages → Deploy from branch**, then pick the branch and `/ (root)`.

Installing:
- **iPhone/iPad (Safari):** Share → *Add to Home Screen*.
- **Android (Chrome):** use the *Install app* button on the home screen, or menu → *Install app*.

## Notes

- Data lives in the browser's IndexedDB on each device. Deleting the app or clearing site data erases it, so use **Settings → Back up all** regularly.
- Photos are resized to 1600px on import to keep storage and PDF sizes small (roughly 40KB per page).
- When you change any files, bump `VERSION` in `sw.js` so installed copies pick up the update.
- PDFs are generated on the device with [jsPDF](https://github.com/parallax/jsPDF) (MIT), which is vendored in `vendor/`.

## Testing

`tests/e2e.mjs` is an end-to-end Playwright test. It creates a survey, adds three photos, marks one up, assigns people and dates, exports the PDF, and checks the data is still there after a reload.

```bash
python3 -m http.server 8080 &
node tests/e2e.mjs   # screenshots + PDF written to test-output/
```

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell |
| `app.js` | All app logic: storage, screens, mark-up editor, PDF builder, backup |
| `styles.css` | Styles |
| `sw.js` | Service worker (offline cache) |
| `manifest.webmanifest`, `icons/` | PWA install metadata and icons |
| `vendor/jspdf.umd.min.js` | PDF library |
