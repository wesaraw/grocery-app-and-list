import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';
import beautifyPkg from 'js-beautify';
const { html: beautify } = beautifyPkg;

const mappings = [
  { input: "Search Results toilet paper _ Shaw's.html", selector: 'product-item-al-v2', output: 'test/samples/shaws-toilet-paper.html' },
  { input: "Search Results Dentastixs _ Shaw's.html", selector: 'product-item-al-v2', output: 'test/samples/shaws-dentastixs.html' },
  { input: 'Bounty Paper Towels - Walmart.com.html', selector: '[data-item-id], [data-testid="list-view"]', match: /12\s*Double\s*Rolls/i, output: 'test/samples/walmart-bounty.html' },
  { input: "'pepsi' _ Hannaford Supermarket.html", selector: '.catalog-product', match: /Pepsi Zero Sugar/i, output: 'test/samples/hannaford-pepsi.html' }
];

mappings.forEach(({ input, selector, match, output }) => {
  try {
    const html = fs.readFileSync(input, 'utf8');
    const dom = new JSDOM(html);
    let el;
    if (match) {
      const all = dom.window.document.querySelectorAll(selector);
      el = Array.from(all).find(e => match.test(e.textContent));
    } else {
      el = dom.window.document.querySelector(selector);
    }
    if (!el) {
      console.warn(`Selector ${selector} not found in ${input}`);
      return;
    }
    const snippet = beautify(el.outerHTML, { indent_size: 2 });
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, snippet);
    console.log(`Wrote ${output}`);
  } catch (err) {
    console.error(`Failed to process ${input}:`, err.message);
  }
});
