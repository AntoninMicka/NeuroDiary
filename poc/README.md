# NeuroDiary PoC

This folder contains a zero-dependency prototype of the NeuroDiary offline diary.

## What is implemented

- daily diary for a selected date
- medication list with time and dose
- hourly symptom matrix
- local persistence in `localStorage`
- demo seed data for quick exploration

## How to run

Open `index.html` directly in a browser, or serve the folder with any static file server.

Example:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173/poc/`.
