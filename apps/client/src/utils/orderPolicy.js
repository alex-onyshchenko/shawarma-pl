export const LIMITS = { perProduct: 5, totalItems: 10, cashMax: 500 };
export function maxAdditional(cart, productId) {
  const total = cart.reduce((sum, item) => sum + item.quantity, 0);
  const same = cart.filter(item => item.product.id === productId).reduce((sum, item) => sum + item.quantity, 0);
  return Math.max(0, Math.min(LIMITS.perProduct - same, LIMITS.totalItems - total));
}
