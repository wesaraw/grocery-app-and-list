import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';
import beautifyPkg from 'js-beautify';
const { html: beautify } = beautifyPkg;

const RAW_DIR = path.join('test', 'raw-pages');
const CLEAN_DIR = path.join('test', 'clean-pages');
fs.mkdirSync(CLEAN_DIR, { recursive: true });

/**
 * Sanitize a single HTML file.
 * @param {string} file
 */
function sanitizeFile(file) {
  const html = fs.readFileSync(file, 'utf8');
  const savedMatch = html.match(/<!--\s*saved from url=\([^)]*\)(https?:\/\/[^\s>]+)\s*-->/i);
  let host = '';
  if (savedMatch) {
    try {
      host = new URL(savedMatch[1]).hostname.replace(/^www\./, '');
    } catch {}
  }

  const SELECTORS = {
  'amazon.com': 'div[data-asin][data-component-type="s-search-result"]',
  'walmart.com': '[data-item-id],[data-testid="list-view"]',
  'hannaford.com': '.catalog-product',
  'stopandshop.com': '.product-item-al-v2',
  'shaws.com': '.product-item-al-v2',
  'rochebros.com': '[data-product-id]'
};

  const selector = SELECTORS[host];

  const dom = new JSDOM(html);
  const { document } = dom.window;
  document.querySelectorAll('script, style, link[rel="stylesheet"]').forEach(el => el.remove());

  const walker = document.createTreeWalker(document, dom.window.NodeFilter.SHOW_COMMENT);
  const comments = [];
  while (walker.nextNode()) {
    comments.push(walker.currentNode);
  }
  comments.forEach(node => node.parentNode.removeChild(node));

  let outputHtml;
  if (selector) {
    const nodes = document.querySelectorAll(selector);
    const frag = document.createElement('div');
    nodes.forEach(node => frag.appendChild(node.cloneNode(true)));
    outputHtml = beautify(frag.innerHTML, { indent_size: 2 });
  } else {
    outputHtml = beautify(dom.serialize(), { indent_size: 2 });
  }

  const outPath = path.join(CLEAN_DIR, path.basename(file) + '.clean.html');
  fs.writeFileSync(outPath, outputHtml);
  console.log(`Wrote ${outPath}`);
}

const input = process.argv[2];
if (input) {
  sanitizeFile(input);
} else {
  const files = fs.readdirSync(RAW_DIR)
    .filter(f => f.endsWith('.html'))
    .map(f => path.join(RAW_DIR, f));
  if (files.length === 0) {
    console.error(`No HTML files found in ${RAW_DIR}`);
    process.exit(1);
  }
  files.forEach(f => sanitizeFile(f));
}

