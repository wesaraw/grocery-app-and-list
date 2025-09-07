export function applyCoupon(price, coupon) {
  if (!coupon) return price;
  switch (coupon.type) {
    case 'percent':
      return price * (1 - coupon.value / 100);
    case 'fixedOff':
      return Math.max(0, price - coupon.value);
    case 'fixedPrice':
      return coupon.value;
    default:
      return price;
  }
}

export function findCoupon(coupons = [], itemId, store, week) {
  return coupons.find(
    c =>
      c.itemId === itemId &&
      (c.store === 'ALL' || c.store === store) &&
      week >= c.startWeek &&
      week <= c.endWeek
  );
}
