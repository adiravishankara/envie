function computeLineDiff(beforeText, afterText) {
  const beforeLines = (beforeText || '').split(/\r?\n/);
  const afterLines = (afterText || '').split(/\r?\n/);
  const m = beforeLines.length;
  const n = afterLines.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (beforeLines[i - 1] === afterLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const rows = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && beforeLines[i - 1] === afterLines[j - 1]) {
      rows.unshift({ type: 'unchanged', before: beforeLines[i - 1], after: afterLines[j - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rows.unshift({ type: 'added', before: null, after: afterLines[j - 1] });
      j--;
    } else {
      rows.unshift({ type: 'removed', before: beforeLines[i - 1], after: null });
      i--;
    }
  }

  return rows;
}

function hasDiffChanges(diffRows) {
  return diffRows.some((r) => r.type !== 'unchanged');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeLineDiff, hasDiffChanges };
}

if (typeof window !== 'undefined') {
  window.computeLineDiff = computeLineDiff;
  window.hasDiffChanges = hasDiffChanges;
}
