// calc.js — pure aggregation over transaction rows.
// No DOM, no fetch, no app state. Safe to unit-test.
//
// Row schema (index → meaning):
//   0 trade_date  1 type  2 raw_type  3 stock_code  4 stock_name
//   5 quantity    6 price 7 amount    8 fee         9 id

// Stock-grouping key: prefer stock_code, fall back to stock_name so that
// DC/IRP rows (which have no code for historical symbols) can still be
// aggregated. Returns empty string → caller skips the row.
function stockKey(row) {
  const code = row[3];
  if (code) return String(code);
  const name = row[4];
  if (name) return 'name:' + String(name);
  return '';
}

/**
 * Moving-average cost basis aggregation.
 * Sorts same-day rows as 매수 → 매도 → 기타 to prevent phantom holdings
 * from sell-before-buy ordering (see commit d0cebbf).
 * Returns: { [key]: { name, code, holdQty, holdCost, div } }
 * where key is the stock_code when available, otherwise 'name:<name>'.
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
    const key = stockKey(r);
    if (!key) return;
    if (!stocks[key]) stocks[key] = { name: r[4], code: r[3] || '', holdQty:0, holdCost:0, div:0 };
    const qty = Number(r[5]) || 0;
    const amt = Number(r[7]) || 0;
    const fee = Number(r[8]) || 0;
    if (r[1] === '매수') {
      stocks[key].holdQty += qty;
      stocks[key].holdCost += (amt + fee);
    }
    if (r[1] === '매도' && qty > 0 && stocks[key].holdQty > 0) {
      const sellQty = Math.min(qty, stocks[key].holdQty);
      const avgBeforeSell = stocks[key].holdCost / stocks[key].holdQty;
      stocks[key].holdCost -= avgBeforeSell * sellQty;
      stocks[key].holdQty -= sellQty;
      if (stocks[key].holdQty <= 0.000001) {
        stocks[key].holdQty = 0;
        stocks[key].holdCost = 0;
      }
    }
    if (r[1] === '분배금입금') { stocks[key].div += amt; }
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
    if (!['매수','매도'].includes(r[1])) return;
    const key = stockKey(r);
    if (!key) return;
    if (!stocks[key]) stocks[key] = { code: r[3] || '', name: r[4] || '', buyQty:0, buyAmt:0, sellQty:0 };
    const qty = Number(r[5]) || 0;
    const amt = Number(r[7]) || 0;
    if (r[1] === '매수') { stocks[key].buyQty += qty; stocks[key].buyAmt += amt; }
    if (r[1] === '매도') { stocks[key].sellQty += qty; }
  });
  return Object.entries(stocks)
    .map(([key, s]) => ({ code: s.code, name: s.name, netQty: s.buyQty - s.sellQty, buyAmt: s.buyAmt, buyQty: s.buyQty }))
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
 * Compound interest with flexible contribution schedules.
 *
 * Inputs:
 *   principal     — initial lump sum
 *   annualRate    — e.g. 0.07 for 7%
 *   years         — integer years (ignored if `months` provided)
 *   months        — explicit period length in months (preferred)
 *   monthly       — [legacy] fixed monthly contribution; shorthand for
 *                   a single contributions segment covering the whole period
 *   contributions — [new] array of segments, each:
 *                     { from: startYearInclusive,
 *                       to:   endYearInclusive,
 *                       freq: 'day' | 'month' | 'year',
 *                       amount: krw }
 *                   Segments must not overlap (enforced upstream).
 *   startYear     — calendar year of month index 0 (used when contributions
 *                   reference calendar years). Default 0.
 *   startMonth    — 0-11 calendar month of index 0 (default 0). Used so that
 *                   schedule entries align to December calendar-year ends.
 *
 * Engine always compounds monthly. The schedule emits one entry per December
 * calendar-year end (or the final partial year if the period ends mid-year).
 * Each schedule entry exposes `year` (1-indexed relative) AND `calYear`
 * (absolute calendar year = startYear + floor((startMonth + monthIdx) / 12)).
 *
 * Output: {
 *   finalValue, totalContrib, totalInterest,
 *   schedule: [{ year, calYear, startBalance, contrib, interest, endBalance }]
 * }
 */
function computeCompound({ principal, annualRate, years, months, monthly, contributions, startYear, startMonth }) {
  const P = Number(principal) || 0;
  const r = Number(annualRate) || 0;
  let totalMonths;
  if (Number.isFinite(Number(months))) {
    totalMonths = Math.max(0, Math.floor(Number(months)));
  } else {
    totalMonths = Math.max(0, Math.floor(Number(years) || 0)) * 12;
  }
  const periodRate = r / 12;

  // Build effective segments. Legacy `monthly` param collapses to a single
  // all-years segment. An empty array means zero contributions.
  let segs;
  if (Array.isArray(contributions) && contributions.length > 0) {
    segs = contributions.map(c => ({
      from: Number(c.from) || 0,
      to:   Number(c.to)   || 0,
      freq: String(c.freq || 'month'),
      amount: Number(c.amount) || 0,
    }));
  } else if (Number.isFinite(Number(monthly)) && Number(monthly) > 0) {
    segs = [{ from: -Infinity, to: Infinity, freq: 'month', amount: Number(monthly) }];
  } else {
    segs = [];
  }

  // Given a calendar year, sum the monthly-equivalent contribution from all
  // active segments. Day/year frequencies are normalised to month.
  function monthlyForYear(y) {
    let total = 0;
    for (const s of segs) {
      if (y < s.from || y > s.to) continue;
      if (s.freq === 'month')     total += s.amount;
      else if (s.freq === 'year') total += s.amount / 12;
      else if (s.freq === 'day')  total += s.amount * 30.4375;
    }
    return total;
  }

  const sY = Number.isFinite(Number(startYear)) ? Number(startYear) : 0;
  const sM = Number.isFinite(Number(startMonth)) ? Math.max(0, Math.min(11, Math.floor(Number(startMonth)))) : 0;

  let balance = P;
  const schedule = [];
  let cumContrib = P;
  let cumInterest = 0;

  let yearStartBalance = P;
  let yearContrib = 0;
  let yearInterest = 0;

  for (let i = 0; i < totalMonths; i++) {
    const absMonth = sM + i;          // total months since sY January
    const calYear  = sY + Math.floor(absMonth / 12);
    const calMonth = ((absMonth % 12) + 12) % 12;
    const m = segs.length ? monthlyForYear(calYear) : 0;

    const interest = balance * periodRate;
    balance += interest;
    yearInterest += interest;
    cumInterest += interest;

    if (m > 0) {
      balance += m;
      yearContrib += m;
      cumContrib += m;
    }

    const isYearEnd = (calMonth === 11);      // December
    const isLast = (i === totalMonths - 1);
    if (isYearEnd || isLast) {
      schedule.push({
        year: schedule.length + 1,
        calYear,
        startBalance: Math.round(yearStartBalance),
        contrib: Math.round(yearContrib),
        interest: Math.round(yearInterest),
        endBalance: Math.round(balance),
      });
      yearStartBalance = balance;
      yearContrib = 0;
      yearInterest = 0;
    }
  }

  return {
    finalValue: Math.round(balance),
    totalContrib: Math.round(cumContrib),
    totalInterest: Math.round(cumInterest),
    schedule,
  };
}

/**
 * Averaging-down (물타기) calculator.
 * Given a current holding (avgPrice × currentQty) and a planned
 * additional buy (addQty × addPrice), compute the resulting position
 * and, if currentMarketPrice is provided, the unrealized P/L.
 *
 * Inputs: { avgPrice, currentQty, addQty, addPrice, currentMarketPrice? }
 * Output: {
 *   newAvgPrice, newQty, newTotalCost,
 *   currentCost, addCost,
 *   marketValue?, unrealizedPnl?, unrealizedRate?
 * }
 */
function computeAverageDown({ avgPrice, currentQty, addQty, addPrice, currentMarketPrice }) {
  const a = Number(avgPrice) || 0;
  const q = Number(currentQty) || 0;
  const na = Number(addQty) || 0;
  const np = Number(addPrice) || 0;

  const currentCost = a * q;
  const addCost = np * na;
  const newQty = q + na;
  const newTotalCost = currentCost + addCost;
  const newAvgPrice = newQty > 0 ? newTotalCost / newQty : 0;

  const out = {
    newAvgPrice,
    newQty,
    newTotalCost,
    currentCost,
    addCost,
  };

  const mkt = Number(currentMarketPrice);
  if (Number.isFinite(mkt) && mkt > 0) {
    const marketValue = mkt * newQty;
    const unrealizedPnl = marketValue - newTotalCost;
    const unrealizedRate = newTotalCost > 0 ? (unrealizedPnl / newTotalCost * 100) : 0;
    out.marketValue = marketValue;
    out.unrealizedPnl = unrealizedPnl;
    out.unrealizedRate = unrealizedRate;
  }

  return out;
}
