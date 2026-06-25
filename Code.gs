// i hope this works
// new bits: fx rates you can set by date (admin tab), and cam partner deals
// where the cam gets 25% of the owner's commission. paste the whole thing into
// the apps script editor then deploy a new version, the /exec url doesn't change

const SS_ID = '1SV2wcfhSLSIVmPLfFkPyHv94NL54qb5xfucp_F71s18';

// 1. rep configuration
//    `tiers` is an optional per-rep override. when set it replaces the
//    region/level default in getTierRate. used for reps on bespoke plans

const REPS = {
  // AE1 ─────────────────────────────────────────────────────────────────────
  'Joe Marshall':            {level:'AE1', region:'AUS',   currency:'AUD'},
  'Jack Eagle':              {level:'AE1', region:'UK',    currency:'GBP'},
  'Jay Hudon':               {level:'AE1', region:'CAN',   currency:'CAD'},
  'Kevin Craig':             {level:'AE1', region:'CAN',   currency:'CAD'},
  'John Yienger':            {level:'AE1', region:'US TX', currency:'USD',
    tiers:[[336000,.005],[420000,.011],[462000,.020],[546000,.025],[630000,.030]]},
  'Tyler Givens':            {level:'AE1', region:'US NY', currency:'USD',
    tiers:[[302400,.002],[340200,.005],[378000,.014],[415800,.016],[453600,.018],[491400,.020]]},
  'Brandon Brown':           {level:'AE1', region:'CAN',   currency:'CAD'},
  'Brett Robinson':          {level:'AE1', region:'US TX', currency:'USD'},
  'Connor Harper':           {level:'AE1', region:'US NY', currency:'USD'},
  'Jett Laws':               {level:'AE1', region:'US TX', currency:'USD',
    tiers:[[302400,.002],[340200,.005],[378000,.014],[415800,.016],[453600,.018],[491400,.020]]},
  'Branson Wilson':          {level:'AE1', region:'US TX', currency:'USD'},
  'Peter Holt':              {level:'AE1', region:'CAN',   currency:'CAD'},
  'Reuben Zuidhof':          {level:'AE1', region:'CAN',   currency:'CAD'},
  'Sam Quennell':            {level:'AE1', region:'AUS',   currency:'AUD'},
  'Adam Morgan':             {level:'AE1', region:'US NY', currency:'USD'},
  'Grace Aicardi':           {level:'AE1', region:'AUS',   currency:'AUD'},
  'Anton Weininger':         {level:'AE1', region:'UK',    currency:'GBP'},
  'Nik Balashov':            {level:'AE1', region:'UK',    currency:'GBP'},
  'Harm Magis':              {level:'AE1', region:'UK',    currency:'GBP'},
  'Megan Scholz':            {level:'AE1', region:'AUS',   currency:'AUD'},
  'Alex Kretowicz':          {level:'AE1', region:'CAN',   currency:'CAD'},
  // AE2 ─────────────────────────────────────────────────────────────────────
  'Harry Steele':            {level:'AE2', region:'AUS',   currency:'AUD'},
  'Joshua Cherry':           {level:'AE2', region:'CAN',   currency:'CAD'},
  'Lachie Topp':             {level:'AE2', region:'UK',    currency:'GBP'},
  'Ryan Lenz':               {level:'AE2', region:'US NY', currency:'USD'},
  'Kyle Harms':              {level:'AE2', region:'CAN',   currency:'CAD'},
  // CAM ─────────────────────────────────────────────────────────────────────
  'Alex DeRenzis':           {level:'CAM', region:'CAN',   currency:'CAD'},
  'Graeme Hodson-Walker':    {level:'CAM', region:'CAN',   currency:'CAD'},
  'Natasha Lewis':           {level:'CAM', region:'US NY', currency:'USD'},
  'Ella Horner':             {level:'CAM', region:'AUS',   currency:'AUD'},
  'Grace Randell':           {level:'CAM', region:'AUS',   currency:'AUD'},
  'Halle Smith':             {level:'CAM', region:'US TX', currency:'USD'},
  'Ragan Sims':              {level:'CAM', region:'US TX', currency:'USD'},
  'Kyle McCulloch':          {level:'CAM', region:'US NY', currency:'USD'},
  'Danielle Celentano':      {level:'CAM', region:'CAN',   currency:'CAD'},
  'Rachelle Sampson':        {level:'CAM', region:'CAN',   currency:'CAD'},
  'Kathryn Nicholson-Brown': {level:'CAM', region:'UK',    currency:'GBP'},
  'Nicole Murphy':           {level:'CAM', region:'CAN',   currency:'CAD'},
  'Marta Menendez':          {level:'CAM', region:'UK',    currency:'GBP'},
  // special ─────────────────────────────────────────────────────────────────
  'Marcus De Verteuil':      {level:'SPECIAL', region:'CAN',   currency:'CAD'},
  'Geddes Carrington':       {level:'MANAGER', region:'US TX', currency:'USD'},
};

// share of the deal owner's base commission paid to a CAM partnership owner
const PARTNER_SHARE = 0.25;

// normalise inconsistent name spellings coming from hubspot and QB
const OWNER_MAP = {
  'josh cherry':         'Joshua Cherry',
  'marcus de verteuil':  'Marcus De Verteuil',
  'jett (phillip) laws': 'Jett Laws',
};

function cleanOwner(raw) {
  if (!raw) return null;
  const s = String(raw).replace('(Deactivated User)', '').trim();
  return OWNER_MAP[s.toLowerCase()] || s;
}

// canonical YYYY-MM-DD string from anything sheets might hand back (Date,
// ISO string, partial string, junk). single point of truth so date filters
// in calculate and getPayout never end up comparing "Wed Nov 26" to "2026-05-01"
// head melt fuck this never trying this again why is it so hard
function toIso(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) {
    if (isNaN(v)) return '';
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (isNaN(d)) return '';
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

// last day of a "YYYY Qn" close quarter string. Q1=31 Mar, Q2=30 Jun,
// Q3=30 Sep, Q4=31 Dec. needed for accelerator deferral: the accel rate
// for a quarter isn't known until that quarter has ended, so accel pays
// at max(payment_date, end-of-close-quarter)
function endOfQuarter(closeQuarter) {
  if (!closeQuarter) return '';
  const m = String(closeQuarter).match(/^(\d{4})\s+Q([1-4])$/);
  if (!m) return '';
  const y = m[1];
  const q = parseInt(m[2], 10);
  const endMonth = q * 3;
  const endDay   = (endMonth === 3 || endMonth === 12) ? 31 : 30;
  return `${y}-${String(endMonth).padStart(2,'0')}-${endDay}`;
}

// canonical string id from sheets values. sheets returns numeric-looking
// values as Number even when the source was a string, so every Map keyed
// on hubspot_id or invoice_number has to coerce on BOTH the build and lookup
// sides or the lookups silently miss. single helper, used everywhere.
function sid(v) {
  if (v == null || v === '') return '';
  return String(v).trim();
}

// 1b. fx rates, finally not just one number you have to remember to change
// rates are USD per 1 unit, same as the old app (CAD 0.74 means 1 CAD = 0.74 USD).
// each row is a currency + the date it starts from. converting on a given day
// uses the latest rate dated on or before that day, so you can fix old rates or
// set a new one from a date going forward and both just work. USD is always 1.

const FX_H        = ['currency', 'effective_date', 'rate'];
const DEFAULT_FX  = {USD: 1, CAD: 0.74, AUD: 0.65, GBP: 1.26, EUR: 1.08};
const FX_SEED_DATE = '2025-01-01';   // baseline so pre-history dates still resolve

// seed the FxRates sheet with the legacy defaults the first time it's used so
// the app never has zero rates. user can then edit/add dated rates freely.
function seedFxIfEmpty() {
  if (readAll('FxRates').length) return;
  const seed = Object.keys(DEFAULT_FX)
    .filter(c => c !== 'USD')
    .map(c => ({currency: c, effective_date: FX_SEED_DATE, rate: DEFAULT_FX[c]}));
  writeAll('FxRates', FX_H, seed);
}

// normalised + validated rate rows
function getFxRatesRaw() {
  seedFxIfEmpty();
  return readAll('FxRates')
    .map(r => ({
      currency:       String(r.currency || '').toUpperCase().trim(),
      effective_date: toIso(r.effective_date),
      rate:           Number(r.rate) || 0,
    }))
    .filter(r => r.currency && r.currency !== 'USD' && r.effective_date && r.rate > 0);
}

// build {CCY: [{effective_date, rate}, ...]} sorted ascending by date
function fxIndex() {
  const idx = {};
  getFxRatesRaw().forEach(r => { (idx[r.currency] = idx[r.currency] || []).push(r); });
  Object.keys(idx).forEach(c => idx[c].sort((a, b) => a.effective_date.localeCompare(b.effective_date)));
  return idx;
}

// USD-per-unit rate for a currency on a given iso date
function rateAt(idx, ccy, isoDate) {
  ccy = String(ccy || 'USD').toUpperCase();
  if (ccy === 'USD') return 1;
  const arr = idx[ccy];
  if (!arr || !arr.length) return DEFAULT_FX[ccy] || 1;
  const d = isoDate || '9999-12-31';
  let chosen = arr[0].rate;                         // before all history: use earliest
  for (const r of arr) { if (r.effective_date <= d) chosen = r.rate; else break; }
  return chosen;
}

// convert an amount from src to dst using the rates in effect on isoDate
function convertFx(idx, amount, src, dst, isoDate) {
  amount = Number(amount) || 0;
  if (!amount) return 0;
  src = String(src || 'USD').toUpperCase();
  dst = String(dst || 'USD').toUpperCase();
  if (src === dst) return amount;
  const usd     = amount * rateAt(idx, src, isoDate);
  const dstRate = rateAt(idx, dst, isoDate);
  return dstRate ? usd / dstRate : 0;
}

// api: list all stored rates, sorted for display
function getFxRates() {
  return getFxRatesRaw().sort((a, b) =>
    a.currency.localeCompare(b.currency) || a.effective_date.localeCompare(b.effective_date));
}

// api: add or update a rate (composite key currency|effective_date)
function setFxRate(currency, effective_date, rate) {
  const cur = String(currency || '').toUpperCase().trim();
  const d   = toIso(effective_date);
  const rt  = Number(rate);
  if (cur === 'USD')          throw new Error('USD is the base currency and is always 1');
  if (!cur)                   throw new Error('currency required');
  if (!d)                     throw new Error('valid effective date required');
  if (!(rt > 0))              throw new Error('rate must be a positive number');
  seedFxIfEmpty();
  const rows = readAll('FxRates').map(r => ({
    currency:       String(r.currency || '').toUpperCase().trim(),
    effective_date: toIso(r.effective_date),
    rate:           Number(r.rate) || 0,
  })).filter(r => r.currency && r.effective_date && r.rate > 0);
  const map = new Map(rows.map(r => [`${r.currency}|${r.effective_date}`, r]));
  map.set(`${cur}|${d}`, {currency: cur, effective_date: d, rate: rt});
  writeAll('FxRates', FX_H, [...map.values()]);
  return {rates: getFxRates()};
}

// api: delete one rate by (currency, effective_date)
function deleteFxRate(currency, effective_date) {
  const cur = String(currency || '').toUpperCase().trim();
  const d   = toIso(effective_date);
  const rows = readAll('FxRates').filter(r =>
    !(String(r.currency || '').toUpperCase().trim() === cur && toIso(r.effective_date) === d));
  writeAll('FxRates', FX_H, rows);
  return {rates: getFxRates()};
}

// 2. commission rates
// i have a dream that one day this won't be hard coded

// channel detection from sales_channel field
const CHANNEL_RULES = [
  ['dealer',   ['dealer','architect','rfp','tender']],
  ['outbound', ['outbound']],
  ['return',   ['return','expansion','customer']],
];

function detectChannel(raw) {
  if (!raw) return 'inbound';
  const s = String(raw).toLowerCase();
  for (const [ch, kws] of CHANNEL_RULES) {
    if (kws.some(k => s.includes(k))) return ch;
  }
  return 'inbound';
}

// {region: {channel: rate}} rates as decimals
// values match per-rep master trackers as of may 2026
// note: every region's outbound spec says 5/6% on first deal and any second
// deal within six months, then drops to the return rate. we do not track
// customer history so outbound always pays the full outbound rate here
const AE1_RATES = {
  'CAN':   {inbound:.020, return:.020, outbound:.050, dealer:.010},
  'UK':    {inbound:.020, return:.020, outbound:.050, dealer:.010},
  'US TX': {inbound:.020, return:.020, outbound:.060, dealer:.010},
  'US NY': {inbound:.020, return:.020, outbound:.060, dealer:.010},
  'AUS':   {inbound:.015, return:.015, outbound:.050, dealer:.010},
};
const AE2_RATES = {
  'AUS':   {inbound:.015, return:.030, outbound:.050, dealer:.010},
  'CAN':   {inbound:.020, return:.030, outbound:.050, dealer:.010},
  'US TX': {inbound:.020, return:.020, outbound:.060, dealer:.010},
  'US NY': {inbound:.020, return:.020, outbound:.060, dealer:.010},
  'UK':    {inbound:.020, return:.020, outbound:.060, dealer:.010},
};
const CAM_RATES  = {inbound:0, return:0, outbound:.010, dealer:0};
// marcus has bespoke rates
const SPECIAL_RATES = {
  'Marcus De Verteuil': {inbound:.020, return:.020, outbound:.050, dealer:0},
};

function getCommRate(name, level, region, channel) {
  if (level === 'MANAGER')   return 0;
  if (SPECIAL_RATES[name])   return SPECIAL_RATES[name][channel] || 0;
  if (level === 'CAM')       return CAM_RATES[channel]             || 0;
  if (level === 'AE2')       return (AE2_RATES[region] || {})[channel] || 0;
  if (level === 'AE1')       return (AE1_RATES[region] || {})[channel] || 0;
  return 0;
}

// 3. quarterly accelerator tiers
//    tier is set quarterly by total booth_items_revenue closed in that quarter
//    but the resulting accelerator amount is paid monthly as cash lands.
//    a rep-level override on REPS[name].tiers replaces the region default

const AE1_TIERS = {
  'CAN':   [[273600,.002],[307800,.005],[342000,.014],[376200,.016],[410400,.018],[444600,.020]],
  'AUS':   [[288000,.002],[324000,.005],[360000,.012],[396000,.014],[432000,.018],[468000,.020]],
  'UK':    [[180000,.002],[202500,.005],[225000,.014],[247500,.016],[270000,.018],[292500,.020]],
  'US TX': [[252000,.002],[283500,.005],[315000,.012],[346500,.016],[378000,.018],[409500,.022]],
  'US NY': [[360000,.002],[405000,.005],[450000,.018],[495000,.024],[540000,.026],[585000,.030]],
};
const AE2_TIERS = {
  'AUS':   [[288000,.002],[324000,.005],[360000,.012],[396000,.014],[432000,.018],[468000,.020]],
  'CAN':   [[364800,.002],[410400,.005],[456000,.014],[501600,.018],[547200,.020],[592800,.022]],
  'UK':    [[270000,.002],[303750,.005],[337500,.015],[371250,.017],[405000,.019],[438750,.021]],
  'US TX': [[391200,.002],[440100,.005],[489000,.014],[537900,.018],[586800,.020],[635700,.022]],
  'US NY': [[391200,.002],[440100,.005],[489000,.014],[537900,.018],[586800,.020],[635700,.022]],
};
const CAM_TIERS = {
  'UK':    [[360000,.002],[405000,.004],[450000,.017],[495000,.019],[540000,.021],[585000,.022]],
  'CAN':   [[500000,.010],[562500,.0125],[625000,.015],[687500,.0175],[750000,.020],[812500,.0225]],
  'US NY': [[500000,.010],[562500,.0125],[625000,.015],[687500,.0175],[750000,.020],[812500,.0225]],
  'US TX': [[500000,.015],[562500,.0175],[625000,.020],[687500,.0225],[750000,.025],[812500,.0275]],
  'AUS':   [[500000,.0075],[562500,.010],[625000,.0125],[687500,.015],[750000,.0175],[812500,.020]],
};

function getTierRate(name, level, region, attainment) {
  const cfg = REPS[name];
  let tiers = cfg && cfg.tiers;
  if (!tiers) {
    if (level === 'AE1')      tiers = AE1_TIERS[region] || [];
    else if (level === 'AE2') tiers = AE2_TIERS[region] || [];
    else if (level === 'CAM') tiers = CAM_TIERS[region] || [];
    else return 0;
  }
  let rate = 0;
  for (const [thresh, r] of tiers) {
    if (attainment >= thresh) rate = r;
    else break;
  }
  return rate;
}

// 4. spreadsheet helpers

function ss()       { return SpreadsheetApp.openById(SS_ID); }
function sh(name)   { const s=ss(); return s.getSheetByName(name) || s.insertSheet(name); }

function readAll(name) {
  const sheet = sh(name);
  const vals  = sheet.getDataRange().getValues();
  if (vals.length < 2) return [];
  const hdrs = vals[0];
  return vals.slice(1).map(row => {
    const o = {};
    hdrs.forEach((h, i) => { o[h] = (row[i] === '' || row[i] == null) ? null : row[i]; });
    return o;
  });
}

function writeAll(name, hdrs, rows) {
  const sheet = sh(name);
  sheet.clearContents();
  if (!rows.length) { sheet.getRange(1,1,1,hdrs.length).setValues([hdrs]); return; }
  const data = [hdrs, ...rows.map(r => hdrs.map(h => r[h] == null ? '' : r[h]))];
  sheet.getRange(1, 1, data.length, hdrs.length).setValues(data);
}

// merge new rows into existing by key, preserving fields not present in new rows
function upsert(name, hdrs, newRows, key) {
  const existing = readAll(name);
  const map = new Map(existing.map(r => [sid(r[key]), r]));
  newRows.forEach(r => map.set(sid(r[key]), {...(map.get(sid(r[key])) || {}), ...r}));
  writeAll(name, hdrs, [...map.values()]);
}

function appendLog(source, fname, imported, matched, flagged) {
  const sheet = sh('ImportLog');
  if (!sheet.getLastRow()) sheet.appendRow(['timestamp','source','file','imported','matched','flagged']);
  sheet.appendRow([new Date().toISOString(), source, fname, imported, matched, flagged]);
}

// 5. importers, if you ever get an error and it shows you this DO NOT FUCK WITH IT PLEASE and just dm me (nathan) and i'll fix it

const DEAL_H = [
  'hubspot_id','deal_name','owner','currency','close_date','close_quarter',
  'sales_channel','booth_items_revenue','invoice_total','paid_total',
  'invoice_status','paid_date','invoice_numbers','booth_missing','partnership_owner',
];
const INV_H = ['invoice_number','deal_id','source','customer_name','invoice_date','gross_amount','status','is_credit_note'];
const PAY_H = ['pay_id','invoice_number','payment_date','amount','source'];

function importHubspot(records) {
  const deals = records.map(r => ({
    hubspot_id:          sid(r.hubspot_id),
    deal_name:           r.deal_name           || '',
    owner:               cleanOwner(r.owner)   || '',
    currency:            r.currency            || 'USD',
    close_date:          toIso(r.close_date),
    close_quarter:       r.close_quarter       || '',
    sales_channel:       r.sales_channel       || '',
    booth_items_revenue: Number(r.booth_items_revenue) || 0,
    invoice_total:       Number(r.invoice_total)       || 0,
    paid_total:          Number(r.paid_total)          || 0,
    invoice_status:      r.invoice_status      || '',
    paid_date:           toIso(r.paid_date),
    invoice_numbers:     r.invoice_numbers     || '',
    booth_missing:       !!r.booth_missing,
    // normalise the partnership owner name too so it can be matched against REPS
    partnership_owner:   cleanOwner(r.partnership_owner) || '',
  }));
  // hubspot is the master source of truth for deals so replace rather than
  // upsert, otherwise old broken imports keep their rows forever
  writeAll('Deals', DEAL_H, deals);
  const matched = matchInvoicesToDeals();
  appendLog('hubspot', 'hubspot_deals.csv', deals.length, matched, 0);
  return {imported: deals.length, matched};
}

function importQB(invoices, payments, source) {
  // upsert invoices, preserve any existing deal_id links. both sides of the
  // dedup map go through sid() or sheets returning numbers vs new rows being
  // strings creates duplicate keys and the sheet doubles on every reimport
  const existing = readAll('Invoices');
  const inv_map  = new Map(existing.map(i => [sid(i.invoice_number), i]));
  invoices.forEach(inv => {
    const key  = sid(inv.invoice_number);
    const prev = inv_map.get(key);
    inv_map.set(key, {
      invoice_number: key,
      deal_id:        sid(prev && prev.deal_id),
      source,
      customer_name:  inv.customer_name || '',
      invoice_date:   toIso(inv.invoice_date),
      gross_amount:   Number(inv.gross_amount) || 0,
      status:         'open',
      is_credit_note: Number(inv.gross_amount) < 0,
    });
  });
  writeAll('Invoices', INV_H, [...inv_map.values()]);

  // replace payments for this source, keep all others
  const other_pays = readAll('Payments').filter(p => p.source !== source);
  const new_pays   = [];
  payments.forEach(pay => {
    (pay.invoice_numbers || []).forEach(n => {
      const pd = toIso(pay.payment_date);
      new_pays.push({
        pay_id:         `${source}|${n}|${pd}`,
        invoice_number: sid(n),
        payment_date:   pd,
        amount:         Number(pay.amount) || 0,
        source,
      });
    });
  });
  writeAll('Payments', PAY_H, [...other_pays, ...new_pays]);

  const matched = matchInvoicesToDeals();
  appendLog(source, source+'.csv', invoices.length, new_pays.length, 0);
  return {invoices: invoices.length, payments: new_pays.length, matched};
}

// xero Account Transactions report importer. parser-side has already matched each
// raw payment event to an invoice by (customer + reference) with balance
// tracking, so we just write what we receive.
function importXero(invoices, payments, source) {
  const existing = readAll('Invoices');
  const inv_map  = new Map(existing.map(i => [sid(i.invoice_number), i]));

  invoices.forEach(inv => {
    const key  = sid(inv.invoice_number);
    const prev = inv_map.get(key);
    inv_map.set(key, {
      invoice_number: key,
      deal_id:        sid(prev && prev.deal_id),
      source,
      customer_name:  inv.customer_name || '',
      invoice_date:   toIso(inv.invoice_date),
      gross_amount:   Number(inv.gross_amount) || 0,
      status:         '',
      is_credit_note: !!inv.is_credit_note,
    });
  });

  // replace payments for this source, keep all others intact
  const other_pays = readAll('Payments').filter(p => p.source !== source);
  const new_pays   = payments.map((p, i) => {
    const pd = toIso(p.payment_date);
    return {
      pay_id:         `${source}|${p.invoice_number}|${pd}|${i}`,
      invoice_number: sid(p.invoice_number),
      payment_date:   pd,
      amount:         Number(p.amount) || 0,
      source,
    };
  });

  writeAll('Invoices', INV_H, [...inv_map.values()]);
  writeAll('Payments', PAY_H, [...other_pays, ...new_pays]);

  const matched = matchInvoicesToDeals();
  appendLog(source, source+'.csv', invoices.length, new_pays.length, 0);
  return {invoices: invoices.length, payments: new_pays.length, matched};
}

// 6. invoice > deal matching
// matches on numeric invoice number stripped of all non-digit characters

function matchInvoicesToDeals() {
  const deals    = readAll('Deals');
  const invoices = readAll('Invoices');

  // build map: stripped numeric key → hubspot_id (string)
  const inv_to_deal = new Map();
  deals.forEach(d => {
    if (!d.invoice_numbers) return;
    String(d.invoice_numbers).split(',').forEach(raw => {
      const n = raw.trim().replace(/\D/g,'');
      if (n) inv_to_deal.set(n, sid(d.hubspot_id));
    });
  });

  let matched = 0;
  invoices.forEach(inv => {
    if (sid(inv.deal_id)) return;
    const n = String(inv.invoice_number || '').replace(/\D/g,'');
    const hit = inv_to_deal.get(n);
    if (hit) { inv.deal_id = hit; matched++; }
  });

  writeAll('Invoices', INV_H, invoices);
  return matched;
}

// 7. calculation engine
// runs fresh on every import, rebuilds Attainment and CommissionLines.
// CommissionLines stores invoice/customer fields too so the monthly payout
// PDF can render the apr26-style invoice table without re-querying everything
//
// new columns on the line for the fx + partner stuff:
//   currency   - what currency the amounts are in (the deal currency).
//                getPayout converts to the rep's currency / USD from here.
//   is_partner - true if this is a cam 25% partner line
//   partner_of - on a partner line, the deal owner it came off
//   share      - 1 for a normal line, 0.25 for a cam partner line

const CL_H  = ['cl_id','rep_name','deal_id','pay_id','period','payment_date',
                'invoice_number','invoice_date','customer_name','currency',
                'cash_landed','booth_payable','comm_rate','commission','accel_rate',
                'accelerator','close_quarter','is_partner','partner_of','share'];
const ATT_H = ['rep_name','close_quarter','total_booth','tier_rate','deal_count'];

// build a CAM partnership-override line, or null when the deal doesn't qualify.
// qualifies only when the partnership owner is a CAM in REPS and is not the
// deal owner. amounts are in the DEAL currency; getPayout converts to the
// CAM's own currency at the payment-date FX rate.
function buildPartnerLine(deal, baseId, period, payDate, invNo, invDate, custName,
                          booth_pay, ownerCommRate, ownerCommission) {
  const partner = cleanOwner(deal.partnership_owner);
  if (!partner || partner === deal.owner) return null;
  const pcfg = REPS[partner];
  if (!pcfg || pcfg.level !== 'CAM') return null;
  return {
    cl_id:          'P_' + baseId,
    rep_name:       partner,
    deal_id:        sid(deal.hubspot_id),
    pay_id:         baseId ? ('P_' + baseId) : '',
    period,
    payment_date:   payDate,
    invoice_number: invNo  || '',
    invoice_date:   invDate || '',
    customer_name:  custName || '',
    currency:       deal.currency || 'USD',
    cash_landed:    0,                              // not the CAM's sale; informational only
    booth_payable:  booth_pay,                      // shown so the 25% math reconciles
    comm_rate:      ownerCommRate * PARTNER_SHARE,  // effective rate for the report
    commission:     ownerCommission * PARTNER_SHARE,
    accel_rate:     0,                              // partner never earns accelerator
    accelerator:    0,
    close_quarter:  deal.close_quarter,
    is_partner:     true,
    partner_of:     deal.owner,
    share:          PARTNER_SHARE,
  };
}

function calculateAll() {
  const deals    = readAll('Deals');
  const invoices = readAll('Invoices');
  const payments = readAll('Payments');

  // every map key goes through sid() so a number from sheets and a string
  // from the parser become the same key. THIS WAS THE BUG: dealMap used to
  // build with raw d.hubspot_id (number) but the lookup was String(inv.deal_id),
  // so every payment-driven lookup missed and all NA commission lines got dropped
  const dealMap  = new Map(deals.map(d    => [sid(d.hubspot_id),    d]));
  const invMap   = new Map(invoices.map(i => [sid(i.invoice_number), i]));

  // attainment (total booth revenue per rep per quarter from deal close date)
  // note: only the deal OWNER accrues attainment. a CAM partnership override
  // does not add to the CAM's quota — they didn't close the deal.
  const attMap = new Map();
  deals.forEach(d => {
    if (!d.booth_items_revenue || !d.close_quarter || !d.owner) return;
    const cfg = REPS[d.owner];
    if (!cfg) return;
    const k = `${d.owner}|${d.close_quarter}`;
    const c = attMap.get(k) || {owner:d.owner, quarter:d.close_quarter, total:0, count:0};
    c.total += Number(d.booth_items_revenue) || 0;
    c.count++;
    attMap.set(k, c);
  });

  const attainment = [];
  attMap.forEach(({owner, quarter, total, count}) => {
    const cfg  = REPS[owner]; if (!cfg) return;
    const rate = getTierRate(owner, cfg.level, cfg.region, total);
    attainment.push({rep_name:owner, close_quarter:quarter, total_booth:total, tier_rate:rate, deal_count:count});
  });
  writeAll('Attainment', ATT_H, attainment);

  const attLookup = new Map(attainment.map(a => [`${a.rep_name}|${a.close_quarter}`, a.tier_rate]));

  // commission lines from payment records
  const lines       = [];
  const pairedDeals = new Set();

  payments.forEach(pay => {
    const invKey = sid(pay.invoice_number);
    const inv    = invMap.get(invKey);
    if (!inv || !sid(inv.deal_id)) return;
    const deal = dealMap.get(sid(inv.deal_id));
    if (!deal || !deal.owner) return;

    const cfg = REPS[deal.owner]; if (!cfg) return;
    const inv_total = Number(deal.invoice_total) || 0; if (!inv_total) return;

    const amount      = Number(pay.amount) || 0;
    const booth       = Number(deal.booth_items_revenue) || 0;
    // proportion of invoice paid, capped ±2 to handle partial/split payments gracefully
    const prop        = Math.min(Math.max(amount / inv_total, -2), 2);
    const booth_pay   = booth * prop;
    const channel     = detectChannel(deal.sales_channel);
    const comm_rate   = getCommRate(deal.owner, cfg.level, cfg.region, channel);
    const accel_rate  = attLookup.get(`${deal.owner}|${deal.close_quarter}`) || 0;
    const payDate     = toIso(pay.payment_date);
    const period      = payDate.slice(0, 7);
    const ownerComm   = booth_pay * comm_rate;
    const invDate     = toIso(inv.invoice_date);
    const custName    = inv.customer_name || '';

    lines.push({
      cl_id:          pay.pay_id,
      rep_name:       deal.owner,
      deal_id:        sid(deal.hubspot_id),
      pay_id:         pay.pay_id,
      period,
      payment_date:   payDate,
      invoice_number: invKey,
      invoice_date:   invDate,
      customer_name:  custName,
      currency:       deal.currency || 'USD',
      cash_landed:    amount,
      booth_payable:  booth_pay,
      comm_rate,
      commission:     ownerComm,
      accel_rate,
      accelerator:    booth_pay * accel_rate,
      close_quarter:  deal.close_quarter,
      is_partner:     false,
      partner_of:     '',
      share:          1,
    });
    pairedDeals.add(sid(deal.hubspot_id));

    // CAM partnership override (25% of owner commission), if applicable
    const pLine = buildPartnerLine(deal, pay.pay_id, period, payDate, invKey, invDate, custName,
                                   booth_pay, comm_rate, ownerComm);
    if (pLine) lines.push(pLine);
  });

  // fallback: deals with paid_total on HubSpot but no payment rows in QB/Xero.
  // no invoice reference so invoice_number / customer come from hubspot only
  deals.forEach(d => {
    const dealId = sid(d.hubspot_id);
    if (pairedDeals.has(dealId)) return;
    const payDate = toIso(d.paid_date);
    if (!payDate || !d.paid_total || !d.invoice_total || !d.owner) return;
    const cfg = REPS[d.owner]; if (!cfg) return;
    const inv_total = Number(d.invoice_total); if (!inv_total) return;

    const amount     = Number(d.paid_total);
    const booth      = Number(d.booth_items_revenue) || 0;
    const prop       = Math.min(Math.max(amount / inv_total, -2), 2);
    const booth_pay  = booth * prop;
    const channel    = detectChannel(d.sales_channel);
    const comm_rate  = getCommRate(d.owner, cfg.level, cfg.region, channel);
    const accel_rate = attLookup.get(`${d.owner}|${d.close_quarter}`) || 0;
    const period     = payDate.slice(0, 7);
    const firstInv   = String(d.invoice_numbers || '').split(',')[0].trim();
    const ownerComm  = booth_pay * comm_rate;
    const baseId     = `hs_${dealId}`;

    lines.push({
      cl_id:          baseId,
      rep_name:       d.owner,
      deal_id:        dealId,
      pay_id:         '',
      period,
      payment_date:   payDate,
      invoice_number: firstInv,
      invoice_date:   '',
      customer_name:  '',
      currency:       d.currency || 'USD',
      cash_landed:    amount,
      booth_payable:  booth_pay,
      comm_rate,
      commission:     ownerComm,
      accel_rate,
      accelerator:    booth_pay * accel_rate,
      close_quarter:  d.close_quarter,
      is_partner:     false,
      partner_of:     '',
      share:          1,
    });

    const pLine = buildPartnerLine(d, baseId, period, payDate, firstInv, '', '',
                                   booth_pay, comm_rate, ownerComm);
    if (pLine) lines.push(pLine);
  });

  writeAll('CommissionLines', CL_H, lines);
  return {lines: lines.length, attainment: attainment.length};
}

// 8. payout generation
// commission and accelerator are paid on different schedules. commission pays
// in the month the payment lands. accelerator can't pay until the deal's
// close quarter has ended (because the tier rate for that quarter isn't
// known until then). so on each line:
//   commission_pay_date = payment_date
//   accelerator_pay_date = max(payment_date, end of close quarter)
// for any deal that closed in a prior quarter the rate is locked, so accel
// pays alongside commission. for a deal in its still-active close quarter,
// accel defers to the end-of-quarter true-up.
// returns one entry per configured rep, including reps with zero activity
// in the period so monthly reports can show every region with a complete
// roster.
//
// fx: each line is stored in its deal currency. we convert it to (a) the rep's
// own currency for the per-region payout and (b) USD for the "all" view, both at
// the rate in effect on the pay date (payment_date for commission, accel pay
// date for accelerator).

function getPayout(start_date, end_date) {
  const lines   = readAll('CommissionLines');
  const deals   = readAll('Deals');
  const idx     = fxIndex();
  // sid() on both sides so dealMap.get(l.deal_id) always finds its record
  // regardless of whether sheets returned the id as number or string
  const dealMap = new Map(deals.map(d => [sid(d.hubspot_id), d]));

  // look up previously saved payouts for this exact range
  const period_key = `${start_date}_${end_date}`;
  const paid    = readAll('Payouts');
  const paidMap = new Map(
    paid.filter(p => p.period === period_key).map(p => [p.rep_name, Number(p.amount)])
  );

  const repMap = new Map();

  lines.forEach(l => {
    if (!l.rep_name || !l.payment_date) return;
    // toIso protects against sheets handing back a Date object instead of a string
    const pd = toIso(l.payment_date);
    if (!pd) return;

    const cfg = REPS[l.rep_name] || {};
    const tgt = cfg.currency || 'USD';      // currency this rep is paid in
    const src = sid(l.currency) || tgt;     // currency the line is stored in

    // accelerator deferral. for a payment landing inside its deal's own
    // (still-active) close quarter, the accelerator portion gets pushed to
    // the last day of that quarter. for payments on deals whose close
    // quarter has already ended, the rate is locked and accel pays with
    // commission. legacy lines with no close_quarter just behave like the
    // rate is already known and pay together
    const eoq = endOfQuarter(l.close_quarter);
    const accelDate = eoq && eoq > pd ? eoq : pd;

    const commInRange  = pd        >= start_date && pd        <= end_date;
    const accelInRange = accelDate >= start_date && accelDate <= end_date;
    if (!commInRange && !accelInRange) return;

    let cur = repMap.get(l.rep_name);
    if (!cur) {
      cur = {rep_name:l.rep_name, commission:0, accelerator:0,
             usd_commission:0, usd_accelerator:0, deals:[]};
      repMap.set(l.rep_name, cur);
    }

    const rawComm  = Number(l.commission)  || 0;
    const rawAccel = Number(l.accelerator) || 0;
    // converted to the rep's own currency
    const commission  = convertFx(idx, rawComm,  src, tgt, pd);
    const accelerator = convertFx(idx, rawAccel, src, tgt, accelDate);
    // converted to USD for the consolidated view
    const usdComm     = convertFx(idx, rawComm,  src, 'USD', pd);
    const usdAccel    = convertFx(idx, rawAccel, src, 'USD', accelDate);

    if (commInRange)  { cur.commission     += commission; cur.usd_commission  += usdComm; }
    if (accelInRange) { cur.accelerator    += accelerator; cur.usd_accelerator += usdAccel; }

    // accel-only true-ups with zero accel (sub-threshold reps) would just be
    // visual noise so skip the row entirely. totals were updated above (+= 0)
    if (!commInRange && accelerator === 0) return;

    const deal        = dealMap.get(sid(l.deal_id)) || {};
    const dealCcy     = sid(deal.currency) || src;
    const deal_total  = convertFx(idx, Number(deal.invoice_total) || 0, dealCcy, tgt, pd);
    const cash        = convertFx(idx, Number(l.cash_landed) || 0, src, tgt, pd);
    const goods_full  = convertFx(idx, Number(deal.booth_items_revenue) || 0, dealCcy, tgt, pd);
    const booth_pay   = convertFx(idx, Number(l.booth_payable) || 0, src, tgt, pd);
    const accelOnly   = accelInRange && !commInRange;
    const isPartner   = l.is_partner === true || l.is_partner === 'true';

    // on accel-only true-up rows the cash / commission / booth_payable
    // columns zero out, because that money was already shown in last month's
    // report. the report's totals row would otherwise double-count
    cur.deals.push({
      deal_name:         deal.deal_name || l.deal_id,
      deal_id:           sid(l.deal_id),
      payment_date:      pd,
      invoice_number:    l.invoice_number || '',
      invoice_date:      toIso(l.invoice_date),
      customer_name:     l.customer_name || '',
      sales_channel:     deal.sales_channel || '',
      cash_landed:       commInRange ? cash : 0,
      deal_total,
      payment_pct:       commInRange && deal_total ? cash / deal_total : 0,
      goods_value_full:  goods_full,
      booth_payable:     commInRange ? booth_pay : 0,
      comm_rate:         commInRange ? (Number(l.comm_rate) || 0) : 0,
      commission:        commInRange  ? commission  : 0,
      accel_rate:        Number(l.accel_rate) || 0,
      accelerator:       accelInRange ? accelerator : 0,
      close_quarter:     l.close_quarter,
      partnership_owner: deal.partnership_owner || '',
      accel_only:        accelOnly,
      // partnership override metadata for display / reporting
      is_partner:        isPartner,
      partner_of:        l.partner_of || '',
      orig_currency:     src,
      orig_commission:   commInRange ? rawComm : 0,
    });
  });

  // iterate every configured rep so zero-activity reps appear with a 0 total.
  // also include any rep that somehow has commission lines but isn't in REPS,
  // as a safety net (shouldn't happen but worth catching)
  const repNames = new Set([...Object.keys(REPS), ...repMap.keys()]);
  const result = [];
  repNames.forEach(rep_name => {
    const cfg  = REPS[rep_name] || {};
    const ccy  = cfg.currency || 'USD';
    const data = repMap.get(rep_name) || {commission:0, accelerator:0,
                                          usd_commission:0, usd_accelerator:0, deals:[]};
    const already_paid = paidMap.get(rep_name) || 0;
    result.push({
      rep_name,
      level:           cfg.level    || '',
      region:          cfg.region   || '',
      currency:        ccy,
      commission:      data.commission,
      accelerator:     data.accelerator,
      total:           data.commission + data.accelerator,
      already_paid,
      // USD equivalents for the consolidated "All" view + headline metrics.
      // already_paid has no per-line date so it converts at the period end.
      usd_commission:  data.usd_commission,
      usd_accelerator: data.usd_accelerator,
      usd_total:       data.usd_commission + data.usd_accelerator,
      usd_already_paid: convertFx(idx, already_paid, ccy, 'USD', end_date),
      deals:           data.deals,
    });
  });

  result.sort((a, b) => a.region.localeCompare(b.region) || a.rep_name.localeCompare(b.rep_name));
  return result;
}

// 9. payout logging

const POUT_H = ['payout_id','rep_name','period','amount','currency','notes','created_at'];

function savePayouts(period, entries) {
  // upsert by rep, not by whole period. keep other periods, and keep this
  // period's rows for reps not in this save. so you can mark paid one region
  // tab at a time without nuking the other regions (the old way wiped them).
  // amount 0 means clear that rep's row for the period.
  const submitted = new Set((entries || []).map(e => e.rep_name));
  const existing = readAll('Payouts').filter(p =>
    p.period !== period || !submitted.has(p.rep_name));
  const news = (entries || [])
    .filter(e => Number(e.amount) > 0)   // amount 0 clears that rep's row for the period
    .map(e => ({
      payout_id:  `${e.rep_name}|${period}`,
      rep_name:   e.rep_name,
      period,
      amount:     Number(e.amount),
      currency:   e.currency || 'USD',
      notes:      e.notes    || '',
      created_at: new Date().toISOString(),
    }));
  writeAll('Payouts', POUT_H, [...existing, ...news]);
}

// 10. admin helpers

function getUnlinked() {
  const invoices = readAll('Invoices');
  const payments = readAll('Payments');
  const paidSet  = new Set(payments.map(p => sid(p.invoice_number)));
  // invoices that have been paid but are not yet linked to a deal
  return invoices.filter(i => !sid(i.deal_id) && paidSet.has(sid(i.invoice_number)));
}

function linkInvoice(invoice_number, hubspot_id) {
  const invoices = readAll('Invoices');
  const inv_key  = sid(invoice_number);
  invoices.forEach(i => { if (sid(i.invoice_number) === inv_key) i.deal_id = sid(hubspot_id); });
  writeAll('Invoices', INV_H, invoices);
  // recalculate immediately so the linked invoice flows through
  return calculateAll();
}

function getMissingBooth() {
  const deals = readAll('Deals');
  return deals.filter(d =>
    (Number(d.booth_items_revenue) === 0 || d.booth_missing) &&
    Number(d.invoice_total) > 0
  );
}

// 11. api routing, god i wish we could do it all by api

function doGet(e) {
  try {
    const action = e.parameter.action;
    let data;
    if      (action === 'payout')     data = getPayout(e.parameter.start_date, e.parameter.end_date);
    else if (action === 'history')    data = readAll('Payouts');
    else if (action === 'unlinked')   data = getUnlinked();
    else if (action === 'deals')      data = readAll('Deals');
    else if (action === 'attainment') data = readAll('Attainment');
    else if (action === 'missing')    data = getMissingBooth();
    else if (action === 'fx_rates')   data = getFxRates();
    else return jsonOut({ok:false, error:'unknown action: '+action});
    return jsonOut({ok:true, data});
  } catch(err) {
    return jsonOut({ok:false, error:err.message});
  }
}

function doPost(e) {
  try {
    const body   = JSON.parse(e.postData.contents);
    const action = body.action;
    let result;
    if      (action === 'import_hubspot') result = importHubspot(body.data);
    else if (action === 'import_qb')      result = importQB(body.invoices, body.payments, body.source);
    else if (action === 'import_xero')    result = importXero(body.invoices, body.payments, body.source);
    else if (action === 'calculate')      result = calculateAll();
    else if (action === 'save_payouts')   { savePayouts(body.period, body.entries); result = {}; }
    else if (action === 'link_invoice')   result = linkInvoice(body.invoice_number, body.hubspot_id);
    else if (action === 'set_fx_rate')    result = setFxRate(body.currency, body.effective_date, body.rate);
    else if (action === 'delete_fx_rate') result = deleteFxRate(body.currency, body.effective_date);
    else return jsonOut({ok:false, error:'unknown action: '+action});
    return jsonOut({ok:true, ...result});
  } catch(err) {
    return jsonOut({ok:false, error:err.message});
  }
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
