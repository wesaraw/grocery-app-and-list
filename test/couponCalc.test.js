import { expect } from 'chai';
import { applyCoupon, findCoupon } from '../extension/utils/coupon.js';

describe('coupon calculations', () => {
  it('applies percent discount', () => {
    const coupon = { type: 'percent', value: 10 };
    expect(applyCoupon(10, coupon)).to.be.closeTo(9, 0.001);
  });

  it('applies fixed amount off', () => {
    const coupon = { type: 'fixedOff', value: 2 };
    expect(applyCoupon(5, coupon)).to.be.closeTo(3, 0.001);
  });

  it('applies fixed price override', () => {
    const coupon = { type: 'fixedPrice', value: 4 };
    expect(applyCoupon(10, coupon)).to.equal(4);
  });

  it('finds matching coupon by store and week', () => {
    const coupons = [
      { itemId: '1', type: 'percent', value: 10, startWeek: 1, endWeek: 5, store: 'ALL', version: 1 },
      { itemId: '1', type: 'fixedOff', value: 1, startWeek: 6, endWeek: 10, store: 'Walmart', version: 1 }
    ];
    const found = findCoupon(coupons, '1', 'Walmart', 7);
    expect(found).to.deep.equal(coupons[1]);
  });
});
