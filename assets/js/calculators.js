/* ============================================================
   Shree Capital — financial calculators
   Everything runs client side; no data leaves the browser.
   ============================================================ */
(function (window) {
  'use strict';

  var inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  var inr2 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

  /** Format a number as Indian rupees, e.g. 1234567 -> "₹12,34,567". */
  function money(value) {
    if (!isFinite(value) || value < 0) value = 0;
    return '₹' + inr.format(Math.round(value));
  }

  /** Short form for large amounts: 12,34,567 -> "₹12.35 L". */
  function moneyShort(value) {
    if (!isFinite(value) || value < 0) value = 0;
    if (value >= 1e7) return '₹' + inr2.format(value / 1e7) + ' Cr';
    if (value >= 1e5) return '₹' + inr2.format(value / 1e5) + ' L';
    return money(value);
  }

  function clamp(value, min, max) {
    if (isNaN(value)) return min;
    return Math.min(Math.max(value, min), max);
  }

  /**
   * Equated monthly instalment.
   * @param {number} principal loan amount
   * @param {number} annualRate rate in percent per annum
   * @param {number} months tenure in months
   */
  function emi(principal, annualRate, months) {
    if (principal <= 0 || months <= 0) return 0;
    var i = annualRate / 12 / 100;
    if (i === 0) return principal / months;
    var f = Math.pow(1 + i, months);
    return (principal * i * f) / (f - 1);
  }

  /** Loan amount affordable for a given EMI. */
  function principalFromEmi(payment, annualRate, months) {
    if (payment <= 0 || months <= 0) return 0;
    var i = annualRate / 12 / 100;
    if (i === 0) return payment * months;
    return (payment * (1 - Math.pow(1 + i, -months))) / i;
  }

  /**
   * Fixed deposit maturity with compounding.
   * @param {number} principal deposit
   * @param {number} annualRate percent per annum
   * @param {number} months tenure
   * @param {number} freq compounding periods per year (1, 2 or 4)
   */
  function fdMaturity(principal, annualRate, months, freq) {
    if (principal <= 0 || months <= 0) return principal;
    var f = freq || 1;
    var r = annualRate / 100 / f;
    return principal * Math.pow(1 + r, f * (months / 12));
  }

  /**
   * Recurring deposit maturity, quarterly compounding.
   * Each instalment earns interest for the months remaining after it is paid.
   */
  function rdMaturity(instalment, annualRate, months) {
    if (instalment <= 0 || months <= 0) return 0;
    var q = annualRate / 100 / 4;
    var total = 0;
    for (var k = 1; k <= months; k++) {
      var held = months - k + 1;          // months this instalment stays invested
      total += instalment * Math.pow(1 + q, held / 3);
    }
    return total;
  }

  /** Monthly payout for the Monthly Income Scheme. */
  function misIncome(principal, annualRate) {
    if (principal <= 0) return 0;
    return (principal * annualRate) / 100 / 12;
  }

  window.SCCalc = {
    money: money,
    moneyShort: moneyShort,
    clamp: clamp,
    emi: emi,
    principalFromEmi: principalFromEmi,
    fdMaturity: fdMaturity,
    rdMaturity: rdMaturity,
    misIncome: misIncome
  };
})(window);
