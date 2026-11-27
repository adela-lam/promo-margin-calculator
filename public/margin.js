// Promo margin maths. Pure functions, shared by the page and the tests.
//
// Contribution per unit = price - product cost - variable cost per order.
// An offer lowers contribution per unit, so the promo has to sell more units
// (and cover any fixed promo costs) to earn the same profit as not running it.

export const OFFER_TYPES = {
  percent: '% off',
  dollar: '$ off',
  gift: 'Free gift',
};

export function unitEconomics({ price, unitCost, variableCost = 0 }) {
  const contribution = price - unitCost - variableCost;
  return { price, contribution, marginRate: price > 0 ? contribution / price : 0 };
}

// Price the customer pays and contribution per unit once the offer is applied.
export function applyOffer(product, offer) {
  const { price, unitCost, variableCost = 0 } = product;
  let salePrice = price, extraCost = 0;
  if (offer.type === 'percent') salePrice = price * (1 - offer.value / 100);
  else if (offer.type === 'dollar') salePrice = price - offer.value;
  else if (offer.type === 'gift') extraCost = offer.giftCost || 0;
  const contribution = salePrice - unitCost - variableCost - extraCost;
  const customerSaving = offer.type === 'gift' ? (offer.giftValue || 0) : price - salePrice;
  return { salePrice, contribution, customerSaving, perceivedDiscount: price > 0 ? customerSaving / price : 0 };
}

// Units the promo must sell, and the sales lift that represents, to match
// the profit you'd make without it.
export function breakEven(product, offer, { baselineUnits, fixedCost = 0 }) {
  const base = unitEconomics(product);
  const promo = applyOffer(product, offer);
  if (promo.contribution <= 0) return { possible: false, unitsNeeded: Infinity, liftNeeded: Infinity, base, promo };
  const unitsNeeded = (baselineUnits * base.contribution + fixedCost) / promo.contribution;
  return { possible: true, unitsNeeded, liftNeeded: unitsNeeded / baselineUnits - 1, base, promo };
}

// Profit and revenue if the promo delivers a given sales lift (0.3 = +30%).
export function scenario(product, offer, { baselineUnits, fixedCost = 0, lift }) {
  const base = unitEconomics(product);
  const promo = applyOffer(product, offer);
  const units = baselineUnits * (1 + lift);
  const baselineProfit = baselineUnits * base.contribution;
  const profit = units * promo.contribution - fixedCost;
  const baselineRevenue = baselineUnits * product.price;
  const revenue = units * promo.salePrice;
  return {
    units, profit, baselineProfit, profitChange: profit - baselineProfit,
    revenue, baselineRevenue, revenueChange: revenue - baselineRevenue,
  };
}

// Deepest % discount that still breaks even if sales rise by `lift`.
// Solves (1+L)*Q*(P(1-d) - C - V) - F = Q*(P - C - V) for d.
export function maxAffordableDiscount(product, { baselineUnits, fixedCost = 0, lift }) {
  const { price, unitCost, variableCost = 0 } = product;
  const base = unitEconomics(product);
  const neededPrice = (baselineUnits * base.contribution + fixedCost) / ((1 + lift) * baselineUnits) + unitCost + variableCost;
  return Math.max(0, 1 - neededPrice / price);
}

// Break-even lift for a range of % discounts.
export function ladder(product, opts, depths = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]) {
  return depths.map(d => ({ depth: d, ...breakEven(product, { type: 'percent', value: d }, opts) }));
}
