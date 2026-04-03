# Pokemon Scanner App

A lightweight browser app that lets you:

- choose which camera to use
- capture a live frame
- scan the image for a Pokemon name with OCR
- load that Pokemon's stats, types, abilities, height, and weight

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

- The app uses the browser camera APIs, `Tesseract.js` from a CDN for OCR, and the public PokeAPI for Pokemon data.
- Scanning works best when the Pokemon name is clearly visible in the camera frame.
- If one camera does not work well, switch to another in the dropdown and restart the preview.
