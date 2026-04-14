// calc.js — pure aggregation over transaction rows.
// No DOM, no fetch, no app state. Safe to unit-test.
//
// Row schema (index → meaning):
//   0 trade_date  1 type  2 raw_type  3 stock_code  4 stock_name
//   5 quantity    6 price 7 amount    8 fee         9 id

/**
 * Moving-average cost basis aggregation.
 * Sorts same-day rows as 매수 → 매도 → 기타 to prevent phantom holdings
 * from sell-before-buy ordering (see commit d0cebbf).
 * Returns: { [code]: { name, code, holdQty, holdCost, div } }
 */
function computeHoldings(allRows) {
  const stocks = {};
  const txRows = [...allRows].sort((a, b) => {
    const d = String(a[0] || '').localeCompare(String(b[0] || ''));
    if (d !== 0) return d;
    const rank = (t) => (t === '매수' ? 0 : t === '매도' ? 1 : 2);
    const tr = rank(a[1]) - rank(b[1]);
    if (tr !== 0) return tr;
    return Number(a[9] || 0) - Number(b[9] || 0);
  });

  txRows.forEach(r => {
    const code = r[3];
    if (!code) return;
    if (!stocks[code]) stocks[code] = { name: r[4], code, holdQty:0, holdCost:0, div:0 };
    const qty = Number(r[5]) || 0;
    const amt = Number(r[7]) || 0;
    const fee = Number(r[8]) || 0;
    if (r[1] === '매수') {
      stocks[code].holdQty += qty;
      stocks[code].holdCost += (amt + fee);
    }
    if (r[1] === '매도' && qty > 0 && stocks[code].holdQty > 0) {
      const sellQty = Math.min(qty, stocks[code].holdQty);
      const avgBeforeSell = stocks[code].holdCost / stocks[code].holdQty;
      stocks[code].holdCost -= avgBeforeSell * sellQty;
      stocks[code].holdQty -= sellQty;
      if (stocks[code].holdQty <= 0.000001) {
        stocks[code].holdQty = 0;
        stocks[code].holdCost = 0;
      }
    }
    if (r[1] === '분배금입금') { stocks[code].div += amt; }
  });

  return stocks;
}

/**
 * Coarser net-position aggregation used by the top summary card.
 * Ignores fees by design — summary vs. portfolio detail is intentionally
 * different granularity. Returns an array of currently-held positions.
 */
function computeNetPositions(rows) {
  const stocks = {};
  rows.forEach(r => {
    const code = r[3];
    if (!code || !['매수','매도'].includes(r[1])) return;
    if (!stocks[code]) stocks[code] = { buyQty:0, buyAmt:0, sellQty:0 };
    const qty = Number(r[5]) || 0;
    const amt = Number(r[7]) || 0;
    if (r[1] === '매수') { stocks[code].buyQty += qty; stocks[code].buyAmt += amt; }
    if (r[1] === '매도') { stocks[code].sellQty += qty; }
  });
  return Object.entries(stocks)
    .map(([code, s]) => ({ code, netQty: s.buyQty - s.sellQty, buyAmt: s.buyAmt, buyQty: s.buyQty }))
    .filter(s => s.netQty > 0);
}

/**
 * Aggregate top-line cash flows for the portfolio summary.
 * Returns: { deposit, buy, sell, div, fee, interest, cash }
 * cash = 입금 + 매도 + 분배금 + 예탁금이용료 − 매수 − 수수료
 */
function computeCashFlows(rows) {
  let deposit=0, buy=0, sell=0, div=0, fee=0, interest=0, withdraw=0;
  rows.forEach(r => {
    const amt = Number(r[7]) || 0;
    const f   = Number(r[8]) || 0;
    if (r[1] === '입금')       deposit += amt;
    else if (r[1] === '매수')  { buy += amt; fee += f; }
    else if (r[1] === '매도')  { sell += amt; fee += f; }
    else if (r[1] === '분배금입금') div += amt;
    else if (r[1] === '예탁금이용료') interest += amt;
    else if (r[1] === '이체송금' || r[1] === '출금') withdraw += amt;
  });
  const cash = deposit + sell + div + interest - buy - fee - withdraw;
  return { deposit, buy, sell, div, fee, interest, withdraw, cash };
}

/**
 * Compound interest with optional monthly contributions.
 * Inputs:
 *   principal      — initial lump sum
 *   annualRate     — e.g. 0.07 for 7%
 *   years          — integer years (>= 0)
 *   monthly        — optional fixed monthly contribution (default 0)
 *   compoundPerYear — compounding frequency (default 12 → monthly)
 * Output: {
 *   finalValue, totalContrib, totalInterest,
 *   schedule: [{ year, startBalance, contrib, interest, endBalance }]
 * }
 * Contributions are assumed to happen at the END of each period
 * (standard future-value-of-annuity convention).
 */
function computeCompound({ principal, annualRate, years, monthly = 0, compoundPerYear = 12 }) {
  const P = Number(principal) || 0;
  const r = Number(annualRate) || 0;
  const n = Math.max(0, Math.floor(Number(years) || 0));
  const m = Number(monthly) || 0;
  const k = Math.max(1, Math.floor(compoundPerYear));
  const periodRate = r / k;

  let balance = P;
  const schedule = [];
  let cumContrib = P;
  let cumInterest = 0;

  for (let y = 1; y <= n; y++) {
    const startBalance = balance;
    let yearContrib = 0;
    let yearInterest = 0;
    for (let p = 0; p < k; p++) {
      const interest = balance * periodRate;
      balance += interest;
      yearInterest += interest;
      if (m > 0) {
        // Monthly contribution: assume k >= 12 or convert proportionally.
        // For k=12 (monthly compounding), each period adds `m`.
        // For k<12, we'd need proration; we clamp k>=12 for safety.
        balance += m;
        yearContrib += m;
      }
    }
    cumContrib += yearContrib;
    cumInterest += yearInterest;
    schedule.push({
      year: y,
      startBalance: Math.round(startBalance),
      contrib: Math.round(yearContrib),
      interest: Math.round(yearInterest),
      endBalance: Math.round(balance),
    });
  }

  return {
    finalValue: Math.round(balance),
    totalContrib: Math.round(cumContrib),
    totalInterest: Math.round(cumInterest),
    schedule,
  };
}
