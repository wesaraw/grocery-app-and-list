import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadHtmlFixture(file) {
  const htmlPath = path.join(__dirname, '..', 'extension', 'ui', file);
  const html = readFileSync(htmlPath, 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.DOMParser = dom.window.DOMParser;
  window.scrollTo = () => {};
}

// Initialize with an empty DOM so modules can import without fixtures when needed
const { window } = new JSDOM('', { url: 'http://localhost' });
global.window = window;
global.document = window.document;
global.DOMParser = window.DOMParser;
window.scrollTo = () => {};

global.loadHtmlFixture = loadHtmlFixture;
