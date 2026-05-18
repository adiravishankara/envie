function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function highlightEnvLine(line) {
  if (!line) return '<span class="line-empty">&nbsp;</span>';
  const trimmed = line.trim();
  if (trimmed.startsWith('#')) {
    return `<span class="tok-comment">${escapeHtml(line)}</span>`;
  }
  const match = line.match(/^([^=]+)=(.*)$/);
  if (!match) return escapeHtml(line);
  return `<span class="tok-key">${escapeHtml(match[1])}</span>=<span class="tok-value">${escapeHtml(match[2])}</span>`;
}

function renderDiffPanel(lines, side) {
  return lines
    .map((row) => {
      const type = row.type;
      const text = side === 'before' ? row.before : row.after;
      const lineClass = `diff-line line-${type}`;
      if (type === 'removed' && side === 'after') {
        return `<div class="${lineClass} line-empty-side"><span class="line-empty">&nbsp;</span></div>`;
      }
      if (type === 'added' && side === 'before') {
        return `<div class="${lineClass} line-empty-side"><span class="line-empty">&nbsp;</span></div>`;
      }
      return `<div class="${lineClass}">${highlightEnvLine(text ?? '')}</div>`;
    })
    .join('');
}

function renderCodeComparison(container, options) {
  const { filename, revealSecrets = false, maskFn, diffRows } = options;

  const displayDiff = diffRows.map((row) => {
    if (row.type === 'unchanged') {
      const line = row.before;
      const display = revealSecrets ? line : maskFn(line || '');
      return { type: 'unchanged', before: display, after: display };
    }
    if (row.type === 'modified') {
      return {
        type: 'modified',
        before: revealSecrets ? row.before : maskFn(row.before || ''),
        after: revealSecrets ? row.after : maskFn(row.after || '')
      };
    }
    if (row.type === 'removed') {
      return {
        type: 'removed',
        before: revealSecrets ? row.before : maskFn(row.before || ''),
        after: null
      };
    }
    if (row.type === 'added') {
      return {
        type: 'added',
        before: null,
        after: revealSecrets ? row.after : maskFn(row.after || '')
      };
    }
    return row;
  });

  container.innerHTML = `
    <div class="code-comparison">
      <div class="code-comparison-grid">
        <div class="code-panel code-panel-before">
          <div class="code-panel-header">
            <span class="code-panel-file">${escapeHtml(filename)}</span>
            <span class="code-panel-label">before</span>
          </div>
          <pre class="code-panel-body">${renderDiffPanel(displayDiff, 'before')}</pre>
        </div>
        <div class="code-comparison-vs">VS</div>
        <div class="code-panel code-panel-after">
          <div class="code-panel-header">
            <span class="code-panel-file">${escapeHtml(filename)}</span>
            <span class="code-panel-label">after</span>
          </div>
          <pre class="code-panel-body">${renderDiffPanel(displayDiff, 'after')}</pre>
        </div>
      </div>
    </div>
  `;

  const panels = container.querySelectorAll('.code-panel-body');
  if (panels.length === 2) {
    panels[0].addEventListener('scroll', () => {
      panels[1].scrollTop = panels[0].scrollTop;
    });
    panels[1].addEventListener('scroll', () => {
      panels[0].scrollTop = panels[1].scrollTop;
    });
  }
}

if (typeof window !== 'undefined') {
  window.renderCodeComparison = renderCodeComparison;
}
