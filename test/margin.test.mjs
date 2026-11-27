import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unitEconomics, applyOffer, breakEven, scenario, maxAffordableDiscount, ladder } from '../public/margin.js';

const product = { price: 120, unitCost: 48, variableCost: 8 };
const opts = { baselineUnits: 1000, fixedCost: 2000 };
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('contribution and margin', () => {
  const u = unitEconomics(product);
  close(u.contribution, 64);           // 120 - 48 - 8
  close(u.marginRate, 64 / 120);
});

test('20% off: break-even needs +65% units (worked example in the README)', () => {
  const r = breakEven(product, { type: 'percent', value: 20 }, opts);
  close(r.promo.salePrice, 96);
  close(r.promo.contribution, 40);     // 96 - 48 - 8
  close(r.unitsNeeded, 1650);          // (1000*64 + 2000) / 40
  close(r.liftNeeded, 0.65);
  // reverse check: at 1,650 units the promo earns exactly the baseline profit
  const s = scenario(product, { type: 'percent', value: 20 }, { ...opts, lift: 0.65 });
  close(s.profit, s.baselineProfit);
});

test('classic no-fixed-cost rule: lift = d / (m - d)', () => {
  const p = { price: 100, unitCost: 50 };
  const r = breakEven(p, { type: 'percent', value: 20 }, { baselineUnits: 100 });
  close(r.liftNeeded, 0.2 / (0.5 - 0.2));
});

test('$ off and free gift offers', () => {
  close(applyOffer(product, { type: 'dollar', value: 25 }).contribution, 39);
  const g = applyOffer(product, { type: 'gift', giftCost: 12, giftValue: 40 });
  close(g.salePrice, 120);
  close(g.contribution, 52);
  close(g.customerSaving, 40);
});

test('an offer that wipes out contribution can never break even', () => {
  const r = breakEven(product, { type: 'percent', value: 60 }, opts); // 48 - 56 < 0
  assert.equal(r.possible, false);
});

test('max affordable discount is the inverse of break-even', () => {
  const d = maxAffordableDiscount(product, { ...opts, lift: 0.65 });
  close(d, 0.20, 1e-9);
  const p = { price: 100, unitCost: 50 };
  close(maxAffordableDiscount(p, { baselineUnits: 1, lift: 2 / 3 }), 0.5 * (2 / 3) / (1 + 2 / 3));
});

test('ladder rises with depth', () => {
  const l = ladder(product, opts);
  for (let i = 1; i < l.length; i++) if (l[i].possible) assert.ok(l[i].liftNeeded > l[i - 1].liftNeeded);
});
