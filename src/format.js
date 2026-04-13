// format.js — pure display formatters. No DOM, no state.

/**
 * 한국 ETF 이름을 표시용으로 짧게 다듬는다.
 * "KODEX 미국S&P500 증권상장지수투자신탁[주식]" → "KODEX 미국S&P500"
 * 운용사 프리픽스(미래에셋/삼성/KB)를 제거하고 최대 25자까지.
 */
function shortenName(name) {
  return (name || '')
    .replace(/증권상장지수투자신탁.*/, '')
    .replace(/미래에셋 |삼성 |KB /, '')
    .trim()
    .substring(0, 25);
}
