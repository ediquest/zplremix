# ZPLRemix

Web app (React + TypeScript) for previewing ZPL labels and importing ZPL from ZIP archives.

## Current foundation (`v0.1` base)

- Textarea for raw input.
- Automatic detection:
  - plain ZPL
  - base64
  - base64 + gzip
- Extraction of `^XA ... ^XZ` labels.
- Canvas preview with extended ZPL renderer (`^FO`, `^FT`, `^FW`, `^A0`, `^FD`, `^GB`, `^BY`, `^BC`, `^B3`, `^BQ`).
- ZIP import and scan (`xml`, `txt`, `zpl`, `prn`, `json`).

## Run

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. In GitHub go to `Settings -> Pages`.
3. In `Build and deployment`, set `Source` to `GitHub Actions`.
4. Push to `master` (or run the workflow manually from `Actions`).

Workflow file: `.github/workflows/deploy-pages.yml`

## Next implementation targets

- Extend renderer coverage (`^CF`, image commands, better element metrics and exact barcode specs).
- Add label element editing and ZPL back-sync.
- Add drag & drop label builder.
