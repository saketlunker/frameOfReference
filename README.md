# Frame of Reference

A Chromium extension to refer UX elements for agent context. Point at any UI element and copy a compact, exact reference to your clipboard. Then paste it into your LLM and ask for the change you want.

**3 steps, no setup, low token cost.**

1. Click the extension icon
2. Click the element you mean
3. Paste into your LLM

## What gets copied

```text
# Frame of Reference (UI element reference)
Path: /#search (page route)
Target: combobox "Query mode" (selected element)
Exact: example.com##button[aria-label="Query mode"] (CSS selector)
Region: search "Query input" (parent container)
```

Each line serves a purpose: `Path` gives page context, `Target` describes what you selected, `Exact` is a precise CSS pinpoint, and `Region` shows the surrounding container. A `Locator` fallback only appears when the CSS selector is too complex.

When supported by Chrome and the paste target, the clipboard also includes a cropped screenshot of the selected element alongside the text reference. If rich clipboard image copy is unavailable, the extension preserves the text-only copy path.

Screenshots include only the visible part of the selected element. If the page scrolls, resizes, or moves the element during capture, the extension copies text only rather than attaching a mismatched image. Fully off-screen elements, large targets, iframe contents, and pinch-zoomed pages also use text-only copy. Cancelling or restarting the picker discards unfinished captures.

## Install

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder (contains `manifest.json` at root)
5. Pin Frame of Reference in the toolbar

## Usage

1. Click the Frame of Reference icon
2. Hover until the right element is highlighted (red border + grey overlay)
3. Use `ArrowUp`/`ArrowDown` to widen or narrow the selection
4. Click or press `Enter` to copy
5. Press `Esc` to cancel

**Keyboard shortcut:** `Alt+Shift+F` toggles the picker. If another extension uses that combo, remap it at `chrome://extensions/shortcuts`.

## How it works

- Scores the full element stack under your cursor to pick the most useful target
- Promotes interactive elements (buttons, inputs, links) over raw text nodes
- Prefers surrounding UI blocks (cards, panels) when you hover plain text
- Traverses open shadow roots and accessible iframes
- Strips tracking params (`utm_*`, `fbclid`, etc.) from the copied path
- No build step, no dependencies at runtime

## Project layout

```
manifest.json      Chromium extension manifest (MV3)
background.js      Service worker
content/picker.js  Core picker logic (single IIFE)
icons/             Extension icons (SVG + PNGs)
test/              Node test-runner suite (devDependencies only)
test-support/      Test harnesses for the picker and the service worker
```

## Tests

The shipped extension has no build step and no runtime dependencies — "Load unpacked" works straight from a clone. Tests are the only thing that needs `npm`, and they live entirely in devDependencies.

```bash
npm install
npm test
```

The suite loads `content/picker.js` into a jsdom window and reads the picker instance off `globalThis.__FRAMEOFREFERENCE_PICKER__`, exactly as Chrome does. `background.js` is loaded the same way — evaluated against a stubbed `chrome` global, with its listeners captured and driven directly. Neither file is restructured to make it testable.

jsdom has no layout engine, so the harness supplies the two things the picker depends on and jsdom lacks: `CSS.escape`, and a `innerText` that drops hidden subtrees the way Chrome's does. Element rects are stubbed per test where size matters.

## Limitations

- Does not run on `chrome://` pages
- Closed shadow roots are inaccessible
- Cross-origin iframe access depends on browser permissions
- Requires a pointer device (mouse, trackpad, or touchscreen) to select elements

## License

MIT
