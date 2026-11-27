import { OFFER_TYPES, unitEconomics, applyOffer, breakEven, scenario, maxAffordableDiscount, ladder } from './margin.js';

const $ = s => document.querySelector(s);
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const COLORS = [css('--s1'), css('--s2'), css('--s3')];
const LETTERS = ['A', 'B', 'C'];
const money = (n, dp = 0) => (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const signed = n => (n >= 0 ? '+' : '−') + money(Math.abs(n)).replace('$', '$');
const pct = (n, dp = 0) => (n * 100).toFixed(dp) + '%';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const DEFAULTS = {
  price: 120, unitCost: 48, variableCost: 8, baselineUnits: 1000, fixedCost: 2000, ladderLift: 30,
  offers: [
    { type: 'percent', value: 20, giftCost: 12, giftValue: 40, lift: 30 },
    { type: 'dollar', value: 25, giftCost: 12, giftValue: 40, lift: 30 },
    { type: 'gift', value: 0, giftCost: 12, giftValue: 40, lift: 30 },
  ],
};
let state = structuredClone(DEFAULTS);

// --- state <-> URL (so a scenario can be shared) ---------------------------
function readHash() {
  try { const s = JSON.parse(decodeURIComponent(atob(location.hash.slice(1)))); if (s && s.offers) state = { ...structuredClone(DEFAULTS), ...s }; } catch { /* use defaults */ }
}
function writeHash() { history.replaceState(null, '', '#' + btoa(encodeURIComponent(JSON.stringify(state)))); }

const product = () => ({ price: +state.price || 0, unitCost: +state.unitCost || 0, variableCost: +state.variableCost || 0 });
const opts = () => ({ baselineUnits: Math.max(1, +state.baselineUnits || 1), fixedCost: +state.fixedCost || 0 });
const offerOf = o => ({ type: o.type, value: +o.value || 0, giftCost: +o.giftCost || 0, giftValue: +o.giftValue || 0 });
const offerName = o => o.type === 'percent' ? `${+o.value || 0}% off` : o.type === 'dollar' ? `${money(+o.value || 0)} off` : `Free gift (${money(+o.giftValue || 0)} value)`;

// --- product inputs -----------------------------------------------------------
['price', 'unitCost', 'variableCost', 'baselineUnits', 'fixedCost', 'ladderLift'].forEach(id => {
  const el = $('#' + id);
  el.addEventListener('input', () => { state[id] = el.value; update(); });
});

// --- offer cards ----------------------------------------------------------------
function buildOffers() {
  $('#offers').innerHTML = state.offers.map((o, i) => `
    <div class="offer" data-i="${i}">
      <div class="offer-h"><i style="background:${COLORS[i]}"></i>Offer ${LETTERS[i]}</div>
      <div class="field"><label for="type${i}">Offer type</label><div class="inp"><select id="type${i}" data-k="type">${Object.entries(OFFER_TYPES).map(([k, v]) => `<option value="${k}" ${o.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
      <div class="row2 v-pd"${o.type === 'gift' ? ' hidden' : ''}>
        <div class="field"><label for="value${i}">${o.type === 'percent' ? 'Discount' : 'Amount off'}</label><div class="inp">${o.type === 'dollar' ? '<span>$</span>' : ''}<input id="value${i}" data-k="value" type="number" min="0" step="any" value="${esc(o.value)}">${o.type === 'percent' ? '<span class="suf">%</span>' : ''}</div></div>
        <div class="field"><label for="lift${i}">Expected sales lift</label><div class="inp"><input id="lift${i}" data-k="lift" type="number" min="0" step="1" value="${esc(o.lift)}"><span class="suf">%</span></div></div>
      </div>
      <div class="v-gift"${o.type === 'gift' ? '' : ' hidden'}>
        <div class="row2">
          <div class="field"><label for="gv${i}">Gift value to customer</label><div class="inp"><span>$</span><input id="gv${i}" data-k="giftValue" type="number" min="0" step="any" value="${esc(o.giftValue)}"></div></div>
          <div class="field"><label for="gc${i}">Gift cost to you</label><div class="inp"><span>$</span><input id="gc${i}" data-k="giftCost" type="number" min="0" step="any" value="${esc(o.giftCost)}"></div></div>
        </div>
        <div class="field" style="margin-top:10px"><label for="liftg${i}">Expected sales lift</label><div class="inp"><input id="liftg${i}" data-k="lift" type="number" min="0" step="1" value="${esc(o.lift)}"><span class="suf">%</span></div></div>
      </div>
      <div class="out" id="out${i}"></div>
    </div>`).join('');
  $('#offers').querySelectorAll('[data-k]').forEach(el => {
    const card = el.closest('.offer'); const i = +card.dataset.i; const k = el.dataset.k;
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
      state.offers[i][k] = el.value;
      if (k === 'type') { if (el.value === 'percent' && +state.offers[i].value > 90) state.offers[i].value = 20; buildOffers(); }
      if (k === 'lift') card.querySelectorAll('[data-k="lift"]').forEach(x => { if (x !== el) x.value = el.value; });
      update();
    });
  });
}

function update() {
  const p = product(), o = opts(), u = unitEconomics(p);
  $('#unit-strip').innerHTML = `<span>Earns <b>${money(u.contribution, 2)}</b> per sale</span><span>Contribution margin <b>${pct(u.marginRate, 1)}</b></span><span>Profit with no promo <b>${money(o.baselineUnits * u.contribution)}</b></span>`;

  state.offers.forEach((raw, i) => {
    const off = offerOf(raw); const lift = (+raw.lift || 0) / 100;
    const be = breakEven(p, off, o); const sc = scenario(p, off, { ...o, lift });
    const out = $('#out' + i);
    if (u.contribution <= 0) { out.innerHTML = '<div class="line">This product already loses money on each sale before any offer.</div>'; return; }
    if (!be.possible) { out.innerHTML = `<div><div class="big">Never</div><div class="lbl">breaks even</div></div><span class="verdict bad">✕ Loses money on every sale</span><div class="line">At ${esc(offerName(raw))} each sale earns ${money(be.promo.contribution, 2)}, so selling more only adds losses.</div>`; return; }
    const good = sc.profitChange >= 0; const close = Math.abs(sc.profitChange) < 0.02 * sc.baselineProfit;
    out.innerHTML = `
      <div><div class="big">+${pct(be.liftNeeded)}</div><div class="lbl">sales lift needed to break even (${Math.ceil(be.unitsNeeded).toLocaleString('en-CA')} units)</div></div>
      <span class="verdict ${close ? 'meh' : good ? 'good' : 'bad'}">${close ? '≈ Roughly breaks even' : good ? '✓ Makes money' : '✕ Loses money'} at +${+raw.lift || 0}%</span>
      <div class="line">Profit <b>${signed(sc.profitChange)}</b> vs. no promo · Revenue <b>${signed(sc.revenueChange)}</b></div>
      <div class="line">Each sale earns <b>${money(be.promo.contribution, 2)}</b> instead of ${money(u.contribution, 2)}${raw.type === 'gift' ? ` · customer gets ${money(off.giftValue)} of value for ${money(off.giftCost)} of your margin` : ''}</div>`;
  });

  renderChart(); renderLadder(); writeHash();
}

// --- chart: profit change vs lift ------------------------------------------------
const tip = $('#tip');
function showTip(html, x, y) { tip.innerHTML = html; tip.hidden = false; const r = tip.getBoundingClientRect(); let l = x + 14, t = y + 14; if (l + r.width > innerWidth - 8) l = x - r.width - 14; if (t + r.height > innerHeight - 8) t = y - r.height - 14; tip.style.left = Math.max(8, l) + 'px'; tip.style.top = Math.max(8, t) + 'px'; }

function renderChart() {
  const p = product(), o = opts(), el = $('#chart');
  const offers = state.offers.map((raw, i) => ({ raw, i, off: offerOf(raw), lift: (+raw.lift || 0) / 100, be: breakEven(p, offerOf(raw), o) }));
  $('#legend').innerHTML = offers.map(x => `<span style="display:inline-flex;align-items:center;gap:7px"><i style="background:${COLORS[x.i]}"></i>Offer ${LETTERS[x.i]}: ${esc(offerName(x.raw))}</span>`).join('');
  const finite = offers.filter(x => x.be.possible).map(x => x.be.liftNeeded);
  const maxL = Math.min(3, Math.max(1, ...offers.map(x => x.lift * 1.2), ...finite.map(v => v * 1.25)));
  const W = Math.max(320, el.clientWidth || 900), H = W < 560 ? 250 : 320, m = { t: 14, r: 16, b: 34, l: W < 560 ? 58 : 72 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const fn = (x, L) => scenario(p, x.off, { ...o, lift: L }).profitChange;
  const ys = offers.flatMap(x => [fn(x, 0), fn(x, maxL)]);
  let yMin = Math.min(0, ...ys), yMax = Math.max(0, ...ys);
  const span = yMax - yMin || 1; const step = niceStep(span / 4);
  yMin = Math.floor(yMin / step) * step; yMax = Math.ceil(yMax / step) * step;
  const X = L => m.l + (L / maxL) * iw, Y = v => m.t + ih - ((v - yMin) / (yMax - yMin)) * ih;
  let g = '';
  for (let v = yMin; v <= yMax + 1e-9; v += step) g += `<g class="grid"><line x1="${m.l}" x2="${m.l + iw}" y1="${Y(v)}" y2="${Y(v)}" ${Math.abs(v) < 1e-9 ? 'style="stroke:#b9ae9f;stroke-width:1.5"' : ''}/></g><g class="axis"><text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end">${v === 0 ? '$0' : compact(v)}</text></g>`;
  const xStep = maxL > 2 ? 0.5 : maxL > 1 ? 0.25 : 0.2;
  for (let L = 0; L <= maxL + 1e-9; L += xStep) g += `<g class="axis"><text x="${X(L)}" y="${H - 12}" text-anchor="middle">+${Math.round(L * 100)}%</text></g>`;
  for (const x of offers) g += `<line x1="${X(0)}" y1="${Y(fn(x, 0))}" x2="${X(maxL)}" y2="${Y(fn(x, maxL))}" stroke="${COLORS[x.i]}" stroke-width="2" stroke-linecap="round"/>`;
  for (const x of offers) {
    if (x.be.possible && x.be.liftNeeded <= maxL) g += `<circle cx="${X(x.be.liftNeeded)}" cy="${Y(0)}" r="5" fill="${COLORS[x.i]}" stroke="#fff" stroke-width="2"/>`;
    if (x.lift <= maxL) g += `<circle cx="${X(x.lift)}" cy="${Y(fn(x, x.lift))}" r="5" fill="#fff" stroke="${COLORS[x.i]}" stroke-width="2.5"/>`;
  }
  g += `<line id="xh" y1="${m.t}" y2="${m.t + ih}" stroke="#b9ae9f" stroke-dasharray="3 3" visibility="hidden"/><rect id="hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"/>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Profit change versus sales lift for each offer">${g}</svg><p class="card-sub" style="margin-top:8px">● filled dot = break-even point · ○ ring = your expected lift</p>`;
  const svg = el.querySelector('svg'), xh = svg.querySelector('#xh');
  svg.querySelector('#hit').addEventListener('pointermove', e => {
    const r = svg.getBoundingClientRect(); const sx = (e.clientX - r.left) * (W / r.width);
    const L = Math.max(0, Math.min(maxL, ((sx - m.l) / iw) * maxL)); const Ls = Math.round(L * 100) / 100;
    xh.setAttribute('x1', X(Ls)); xh.setAttribute('x2', X(Ls)); xh.setAttribute('visibility', 'visible');
    showTip(`<b>At +${Math.round(Ls * 100)}% sales</b>` + offers.map(x => `<div class="row"><span><i style="background:${COLORS[x.i]}"></i>Offer ${LETTERS[x.i]}</span><span>${signed(fn(x, Ls))}</span></div>`).join(''), e.clientX, e.clientY);
  });
  svg.querySelector('#hit').addEventListener('pointerleave', () => { xh.setAttribute('visibility', 'hidden'); tip.hidden = true; });
}
function niceStep(raw) { const p = 10 ** Math.floor(Math.log10(raw)); const n = raw / p; return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p; }
function compact(v) { const a = Math.abs(v); const s = a >= 1e6 ? (a / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : a >= 1e3 ? (a / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K' : a.toFixed(0); return (v < 0 ? '−$' : '+$') + s; }

// --- ladder ------------------------------------------------------------------------
function renderLadder() {
  const p = product(), o = opts();
  const rows = ladder(p, o);
  const maxShown = Math.max(1, ...rows.filter(r => r.possible).map(r => Math.min(r.liftNeeded, 3)));
  $('#ladder').innerHTML = `<thead><tr><th>Discount</th><th>Sales lift needed</th><th style="width:40%"></th></tr></thead><tbody>${rows.map(r => `<tr>
    <td class="num"><b>${r.depth}% off</b></td>
    <td class="num">${r.possible ? '+' + pct(r.liftNeeded) : '<span class="muted">Can\'t break even</span>'}</td>
    <td>${r.possible ? `<span class="bar ${r.liftNeeded > 1 ? 'over' : ''}" style="width:${Math.min(100, (Math.min(r.liftNeeded, 3) / maxShown) * 100)}%"></span>` : ''}</td></tr>`).join('')}</tbody>`;
  const L = (+state.ladderLift || 0) / 100;
  const d = maxAffordableDiscount(p, { ...o, lift: L });
  $('#afford').textContent = (d * 100).toFixed(1) + '% off';
  $('#afford-note').innerHTML = d <= 0 ? 'At this lift, even a small discount doesn\'t cover your promo spend.' : `Go deeper than ${(d * 100).toFixed(1)}% and a +${Math.round(L * 100)}% sales lift earns less than not running the promo. Bars in pink need sales to more than double.`;
}

// --- share link ----------------------------------------------------------------------
$('#share').addEventListener('click', async () => { writeHash(); try { await navigator.clipboard.writeText(location.href); $('#share').textContent = 'Link copied'; } catch { $('#share').textContent = 'Copy the address bar'; } setTimeout(() => { $('#share').textContent = 'Copy link to these numbers'; }, 2000); });

// --- init ------------------------------------------------------------------------------
readHash();
['price', 'unitCost', 'variableCost', 'baselineUnits', 'fixedCost', 'ladderLift'].forEach(id => { $('#' + id).value = state[id]; });
buildOffers(); update();
let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(renderChart, 150); });
