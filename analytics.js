const TARGET_PROFIT_USD = 500;   // profit goal / lock level
const STOP_LOSS_USD = -60;       // pull if we lose this much

const slope = s => { if (s.length < 2) return 0; const n = s.length, mx = (n - 1) / 2,
  my = s.reduce((a, b) => a + b, 0) / n; let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (i - mx) * (s[i] - my); den += (i - mx) ** 2; } return num / (den || 1); };
const estimatePeak = (s, d = 0.6) => { if (s.length < 3) return s.at(-1) || 0;
  const b = s.length >= 5 ? s.at(-5) : s[0]; return s.at(-1) * (1 + ((s.at(-1) - b) / (b || 1)) * d); };
const health = s => { if (s.length < 3) return "flat"; const v = slope(s.slice(-5));
  return v > 0.001 ? "up" : v < -0.001 ? "down" : "flat"; };
const fallingStreak = s => { let n = 0; for (let i = s.length - 1; i > 1; i--) { if (s[i] < s[i - 1]) n++; else break; } return n; };

function decide(samples, entry, current, peakProfit = 0) {
  const profit = current - entry, h = health(samples);
  const head = (estimatePeak(samples) - current) / (current || 1);

  // 1. losing too much -> get out
  if (profit <= STOP_LOSS_USD) return [true, `lost too much ($${profit.toFixed(0)})`];

  // 2. was above $500, fell back under -> lock it in
  if (peakProfit >= TARGET_PROFIT_USD && profit < TARGET_PROFIT_USD)
    return [true, `fell back under $${TARGET_PROFIT_USD} (was $${peakProfit.toFixed(0)})`];

  // 3. above target + still climbing with room -> hold
  if (profit >= TARGET_PROFIT_USD && h === "up" && head > 0.15)
    return [false, `up $${profit.toFixed(0)}, still climbing`];

  // 4. near the estimated peak -> sell at the top
  if (profit >= TARGET_PROFIT_USD && head <= 0.15)
    return [true, `near estimated peak at $${profit.toFixed(0)}`];

  // 5. momentum faded above target -> sell
  if (profit >= TARGET_PROFIT_USD && h !== "up")
    return [true, `momentum faded at $${profit.toFixed(0)}`];

  // 6. chart dying, no recovery -> sell
  if (h === "down" && fallingStreak(samples) >= 4 && head < 0.05)
    return [true, `chart dying at $${profit.toFixed(0)}`];

  return [false, `holding ($${profit.toFixed(0)}, ${h})`];
}
module.exports = { decide, TARGET_PROFIT_USD };
