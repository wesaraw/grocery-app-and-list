# Chrome Extension Build & Loading

The `extension/` folder contains the unpacked Chrome extension built from this repository's source code. The files here are generated; do not edit them directly.

## Build the extension

From the repository root:

```bash
npm install
npm run build
```

This installs dependencies (if needed) and writes the compiled extension into the `extension/` directory.

## Load in Chrome

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked** and choose the `extension/` folder.

## Notes

- All npm commands must be run from the repository root. The `extension/` directory has no `package.json`, so `npm install` or `npm run build` executed there will fail.
- Re-run the build any time source files change to refresh the extension output.
