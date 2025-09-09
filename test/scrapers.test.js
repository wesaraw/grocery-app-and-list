import { expect } from 'chai';
import { JSDOM } from 'jsdom';
import {
  scrapeAmazon,
  scrapeHannaford,
  scrapeRocheBros,
  scrapeShaws,
  scrapeStopAndShop,
  scrapeWalmart,
} from '../extension/scrapers/generated/index.js';

describe('store scrapers', () => {
  it('scrapes Amazon', () => {
    const dom = new JSDOM(`
      <div data-asin="1" data-component-type="s-search-result">
        <h2><a class="a-link-normal s-no-outline" href="/item"><span>Sample Amazon pack of 2 2 oz</span></a></h2>
        <span class="a-price"><span class="a-offscreen">$1.00</span></span>
        <span class="a-size-base a-color-secondary">$0.50/oz</span>
        <span class="a-size-base a-color-base">2 oz</span>
        <img class="s-image" src="img.jpg" />
      </div>
    `);
    const res = scrapeAmazon(dom.window.document);
    expect(res.length).to.equal(1);
    expect(res[0].priceNumber).to.equal(1);
    expect(res[0].packCount).to.equal(2);
  });

  it('scrapes Hannaford', () => {
    const dom = new JSDOM(`
      <div class="catalog-product" data-url="/prod">
        <a href="/prod"></a>
        <div class="productName"><span class="real-product-name">Hannaford Item 1 lb</span></div>
        <div class="overline text-truncate">1 lb</div>
        <div class="unitPriceDisplay">$1.00 / lb</div>
        <div class="priceCell"><span class="item-unit-price">$1.00</span></div>
        <img src="img.jpg" />
      </div>
    `);
    const res = scrapeHannaford(dom.window.document);
    expect(res.length).to.equal(1);
    expect(res[0].priceNumber).to.equal(1);
  });

  it('scrapes Roche Bros', () => {
    const dom = new JSDOM(`
      <div data-test-id="product-card">
        <a href="/rb"></a>
        <div data-test-id="product-card-title">RB Item 12 oz</div>
        <div data-test-id="product-card-size">12 oz</div>
        <div data-test-id="product-card-unit-price">$1.00/oz</div>
        <div data-test-id="product-card-price">$12.00</div>
        <img src="img.jpg" />
      </div>
    `);
    const res = scrapeRocheBros(dom.window.document);
    expect(res.length).to.equal(1);
    expect(res[0].priceNumber).to.equal(12);
  });

  it("scrapes Shaw's", () => {
    const dom = new JSDOM(`
      <div class="product-item-al-v2">
        <a data-qa="prd-itm-lk" href="/shaws"></a>
        <div data-qa="prd-itm-pttl">Shaws Item 3 ct</div>
        <div data-qa="prd-itm-sqty">3 ct</div>
        <div data-qa="prd-itm-upr">$0.33/ct</div>
        <div data-qa="prd-itm-prc">$1.00</div>
        <img data-qa="prd-itm-img" src="img.jpg" />
      </div>
    `);
    const res = scrapeShaws(dom.window.document);
    expect(res.length).to.equal(1);
    expect(res[0].priceNumber).to.equal(1);
  });

  it('scrapes Stop & Shop', () => {
    const dom = new JSDOM(`
      <li class="tile product-cell product-grid-cell">
        <a class="product-grid-cell_link" href="/stop"></a>
        <div class="product-grid-cell_price-container">
          <span class="sr-only">Stop Item 2 lb</span>
          <span class="product-grid-cell_price">$2.00</span>
        </div>
        <div class="product-grid-cell_unit-price">$1.00 / lb</div>
        <div class="product-grid-cell_size">2 lb</div>
        <img src="img.jpg" />
      </li>
    `);
    const res = scrapeStopAndShop(dom.window.document);
    expect(res.length).to.equal(1);
    expect(res[0].priceNumber).to.equal(2);
  });

  it('scrapes Walmart', () => {
    const dom = new JSDOM(`
      <div data-item-id="1">
        <div data-automation-id="product-title">Walmart Item 1 oz</div>
        <div data-automation-id="product-price">
          <span data-automation-id="price-characteristic">1</span>
          <span data-automation-id="price-mantissa">00</span>
        </div>
        <span data-testid="product-price-per-unit">$1.00/oz</span>
        <img data-testid="productTileImage" src="img.jpg" />
        <a href="/ip/item"></a>
      </div>
    `);
    const res = scrapeWalmart(dom.window.document);
    expect(res.length).to.equal(1);
    expect(res[0].priceNumber).to.equal(1);
  });
});
