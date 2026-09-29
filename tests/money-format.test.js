/* KPI and chart money (owner, 2026-09-29): "some hostel warden asked for whole
   number" — KPI cards show whole rupees up to 9,999,999 and millions from ten
   million; charts switch to millions from one million so a donut's centre
   never breaks. Tables keep fmtCompact()'s two decimals.

     node tests/money-format.test.js */
'use strict';

const assert = require('assert');
const { fmtKpi, fmtChart, moneyValue } = require('../renderer/src/utils.js');

let passed = 0, failed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

console.log('\nKPI and chart money');

ok('a KPI is a whole number — no ".00"', () => {
  assert.strictEqual(fmtKpi(14000), '14,000');
  assert.strictEqual(fmtKpi(0), '0');
  assert.strictEqual(fmtKpi(476500.4), '476,500');
});

ok('exact up to 9,999,999', () => {
  assert.strictEqual(fmtKpi(9999999), '9,999,999');
  assert.strictEqual(fmtKpi(1250000), '1,250,000');
});

ok('millions from ten million, trailing zeros trimmed', () => {
  assert.strictEqual(fmtKpi(10000000), '10M');
  assert.strictEqual(fmtKpi(12345678), '12.35M');
  assert.strictEqual(fmtKpi(125000000), '125M');
});

ok('billions and trillions stay', () => {
  assert.strictEqual(fmtKpi(1240000000), '1.24B');
  assert.strictEqual(fmtKpi(2e12), '2T');
});

ok('negatives keep their sign; a rounded-away fraction is not "-0"', () => {
  assert.strictEqual(fmtKpi(-54000), '-54,000');
  assert.strictEqual(fmtKpi(-12345678), '-12.35M');
  assert.strictEqual(fmtKpi(-0.2), '0');
});

ok('junk reads as 0', () => {
  assert.strictEqual(fmtKpi(undefined), '0');
  assert.strictEqual(fmtKpi('abc'), '0');
});

ok('charts: whole below a million, millions from one million', () => {
  assert.strictEqual(fmtChart(999999), '999,999');
  assert.strictEqual(fmtChart(1000000), '1M');
  assert.strictEqual(fmtChart(9999999), '10M');
  assert.strictEqual(fmtChart(2450000), '2.45M');
});

ok('a compact moneyValue (every KPI card) uses the KPI rule and keeps the exact title', () => {
  const html = moneyValue(12345678, { compact: true });
  assert.ok(/<span class="money-amt">12\.35M<\/span>/.test(html), html);
  assert.ok(/title="Rs\. 12,345,678"/.test(html), html);
  assert.ok(/<span class="money-amt">54,000<\/span>/.test(moneyValue(54000, { compact: true })));
});

console.log('\n  ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
