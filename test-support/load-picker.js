'use strict';

// Loads content/picker.js the way Chrome does: as a plain script evaluated in a
// page window. The file is an IIFE that assigns its instance to
// globalThis.__FRAMEOFREFERENCE_PICKER__, so the harness reads it back off the
// window rather than importing anything. Nothing in the extension is
// restructured into modules — ES modules are not usable as MV3 content scripts.

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PICKER_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'content', 'picker.js'), 'utf8');

// Creates a fresh jsdom window, evaluates picker.js inside it, and returns the
// picker instance together with the window and document it is bound to.
function loadPicker({ html = '<!doctype html><html><body></body></html>', url = 'https://example.com/' } = {}) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });

  // jsdom does not implement CSS.escape, which picker.js relies on when building
  // id and class selectors. Chrome provides it natively, so supply the spec
  // algorithm here rather than changing the extension to work around a gap in
  // the test environment.
  if (!dom.window.CSS || typeof dom.window.CSS.escape !== 'function') {
    dom.window.CSS = Object.assign({}, dom.window.CSS, { escape: cssEscape });
  }

  installInnerText(dom.window);

  dom.window.eval(PICKER_SOURCE);

  const picker = dom.window.__FRAMEOFREFERENCE_PICKER__;
  if (!picker) {
    throw new Error('picker.js did not publish __FRAMEOFREFERENCE_PICKER__');
  }

  return { picker, window: dom.window, document: dom.window.document, dom };
}

// Minimal CSS.escape, sufficient for the identifiers these tests produce.
function cssEscape(value) {
  const text = String(value);
  let result = '';

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const code = text.charCodeAt(index);

    if (code === 0) {
      result += '\uFFFD';
    } else if (index === 0 && code >= 0x30 && code <= 0x39) {
      result += `\\${code.toString(16)} `;
    } else if (/[A-Za-z0-9_-]/.test(char) || code >= 0x80) {
      result += char;
    } else {
      result += `\\${char}`;
    }
  }

  return result;
}

// Tags whose boundaries Chrome renders as a line break inside innerText.
const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'div', 'dd', 'dl', 'dt', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'hr', 'li', 'main', 'nav', 'ol', 'option', 'p', 'pre', 'section',
  'table', 'td', 'th', 'tr', 'ul'
]);

// jsdom implements no layout, so it has no innerText at all. Without this the
// picker's `element.innerText || element.textContent` always takes the
// textContent branch, and the tests silently stop covering the path Chrome
// actually runs — which is where the label for an unlabelled element comes from.
//
// This is an approximation, not a layout engine: it reproduces the two
// behaviours that change a label's value, namely that hidden subtrees are
// dropped and that block boundaries become separators.
function installInnerText(window) {
  const isRendered = (element) => {
    if (element.hasAttribute('hidden')) {
      return false;
    }

    const style = (element.getAttribute('style') || '').replace(/\s+/g, '').toLowerCase();
    return !style.includes('display:none') && !style.includes('visibility:hidden');
  };

  const collect = (node) => {
    let text = '';

    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        text += child.nodeValue;
        continue;
      }

      if (child.nodeType !== 1 || !isRendered(child)) {
        continue;
      }

      const isBlock = BLOCK_TAGS.has(child.tagName.toLowerCase());
      text += isBlock ? `\n${collect(child)}\n` : collect(child);
    }

    return text;
  };

  Object.defineProperty(window.Element.prototype, 'innerText', {
    configurable: true,
    get() {
      return isRendered(this) ? collect(this) : '';
    }
  });
}

module.exports = { loadPicker };