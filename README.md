# Pokemon TCG Scanner App

A lightweight browser app that lets you:

- choose which camera to use
- capture a live frame
- scan the image for Pokemon TCG card text with OCR
- detect Pokemon, Trainer, and Energy cards
- show set info, attacks, rules, and card metadata
- show market pricing from TCGplayer and Cardmarket when available

## How to run it

Camera access usually needs `http://localhost` or `https`, so run it from a local server instead of opening the file directly.

From `c:\Users\Galax\.codex\pokemon-scanner-app`:

```powershell
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Notes

- The app uses the browser camera APIs, `Tesseract.js` from a CDN for OCR, and the public Pokemon TCG API for card data.
- Scanning works best when the card name and card number are clearly visible in the camera frame.
- If one camera does not work well, switch to another in the dropdown and restart the preview.
- Price fields depend on what the Pokemon TCG API has for that specific card, so some cards may show more market data than others.
