// Прості SVG-графіки без бібліотек: стовпчики (зокрема stacked) і горизонтальні смуги.
(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const tooltip = () => document.getElementById('tooltip');

  function el(tag, attrs = {}, parent) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function compact(n) {
    if (n == null) return '—';
    const abs = Math.abs(n);
    if (abs >= 1e6) return (n / 1e6).toFixed(abs >= 1e7 ? 0 : 1).replace('.0', '') + 'M';
    if (abs >= 1e3) return (n / 1e3).toFixed(abs >= 1e4 ? 0 : 1).replace('.0', '') + 'K';
    return String(Math.round(n));
  }

  function niceMax(max, ticks = 4) {
    if (max <= 0) return { top: ticks, step: 1 };
    const raw = max / ticks;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw);
    return { top: step * ticks, step };
  }

  function showTooltip(evt, html) {
    const tip = tooltip();
    tip.innerHTML = html;
    tip.hidden = false;
    const pad = 12;
    const { innerWidth: w, innerHeight: h } = window;
    const r = tip.getBoundingClientRect();
    let x = evt.clientX + pad;
    let y = evt.clientY + pad;
    if (x + r.width > w - 8) x = evt.clientX - r.width - pad;
    if (y + r.height > h - 8) y = evt.clientY - r.height - pad;
    tip.style.left = Math.max(8, x) + 'px';
    tip.style.top = Math.max(8, y) + 'px';
  }
  function hideTooltip() { tooltip().hidden = true; }

  function tooltipHtml(title, rows) {
    return `<div class="tooltip__title">${escapeHtml(title)}</div>` + rows.map((r) =>
      `<div class="tooltip__row"><span>${r.color ? `<i style="background:${r.color}"></i>` : ''}${escapeHtml(r.name)}</span><b>${escapeHtml(r.value)}</b></div>`
    ).join('');
  }

  // Шлях стовпчика: 4px заокруглення зверху, квадратний біля осі
  function barPath(x, y, w, h, round) {
    if (h <= 0) return '';
    const r = round ? Math.min(4, w / 2, h) : 0;
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  /**
   * labels: ['28.10', ...]
   * series: [{ name, color, values: [number|null] }] — у stacked-режимі знизу вгору
   * format: (n) => string, для tooltip
   */
  function columnChart(container, { labels, series, format = String, height = 220 }) {
    container.innerHTML = '';
    if (!labels.length || series.every((s) => s.values.every((v) => v == null))) {
      container.innerHTML = '<p class="empty">Немає даних за цей період</p>';
      return;
    }
    const width = Math.max(280, container.clientWidth);
    const m = { top: 8, right: 4, bottom: 24, left: 36 };
    const iw = width - m.left - m.right;
    const ih = height - m.top - m.bottom;
    const totals = labels.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] || 0), 0));
    const { top, step } = niceMax(Math.max(...totals));
    const y = (v) => m.top + ih - (v / top) * ih;

    const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, height, role: 'img' }, container);

    for (let v = 0; v <= top + 1e-9; v += step) {
      el('line', { class: v === 0 ? 'baseline' : 'gridline', x1: m.left, x2: width - m.right, y1: y(v), y2: y(v) }, svg);
      const t = el('text', { x: m.left - 6, y: y(v) + 4, 'text-anchor': 'end' }, svg);
      t.textContent = compact(v);
    }

    const band = iw / labels.length;
    const bw = Math.max(2, Math.min(24, band * 0.62));
    const labelEvery = Math.ceil(labels.length / Math.max(1, Math.floor(iw / 48)));

    labels.forEach((label, i) => {
      const x = m.left + band * i + (band - bw) / 2;
      let acc = 0;
      const nonZero = series.map((s, si) => ((s.values[i] || 0) > 0 ? si : -1)).filter((si) => si >= 0);
      const topIdx = nonZero[nonZero.length - 1];
      series.forEach((s, si) => {
        const v = s.values[i] || 0;
        if (v <= 0) return;
        const y0 = y(acc);
        const y1 = y(acc + v);
        // 2px розрив кольором поверхні між сегментами
        const gap = acc > 0 ? 2 : 0;
        el('path', { d: barPath(x, y1, bw, y0 - y1 - gap, si === topIdx), fill: s.color }, svg);
        acc += v;
      });

      if (i % labelEvery === 0) {
        const t = el('text', { x: m.left + band * i + band / 2, y: height - 6, 'text-anchor': 'middle' }, svg);
        t.textContent = label;
      }

      const hit = el('rect', { class: 'hit', x: m.left + band * i, y: m.top, width: band, height: ih, rx: 4 }, svg);
      const rows = series.map((s) => ({ name: s.name, color: s.color, value: s.values[i] == null ? '—' : format(s.values[i]) }));
      if (series.length > 1) rows.push({ name: 'Разом', value: format(totals[i]) });
      hit.addEventListener('mousemove', (e) => showTooltip(e, tooltipHtml(label, rows)));
      hit.addEventListener('mouseleave', hideTooltip);
    });
  }

  /** items: [{ label, value }] — горизонтальні смуги, відсортовані за спаданням */
  function barList(container, items, { format = String, color = 'var(--series-1)' } = {}) {
    container.innerHTML = '';
    const rows = items.filter((d) => d.value != null);
    if (!rows.length) {
      container.innerHTML = '<p class="empty">Немає даних за цей період</p>';
      return;
    }
    const max = Math.max(...rows.map((d) => d.value), 1);
    const list = document.createElement('div');
    list.className = 'bars';
    rows.sort((a, b) => b.value - a.value).forEach((d) => {
      const row = document.createElement('div');
      row.className = 'bar-row';
      row.innerHTML = `
        <span class="bar-row__label" title="${escapeHtml(d.label)}">${escapeHtml(d.label)}</span>
        <span class="bar-row__track"><span class="bar-row__fill" style="width:${(d.value / max) * 100}%;background:${color}"></span></span>
        <span class="bar-row__value">${escapeHtml(format(d.value))}</span>`;
      list.appendChild(row);
    });
    container.appendChild(list);
  }

  /** Табличний вигляд графіка (доступність і точні цифри) */
  function dataTable(container, { labels, series, format = String, labelHeader = 'Дата' }) {
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const head = `<tr><th>${escapeHtml(labelHeader)}</th>${series.map((s) => `<th class="num">${escapeHtml(s.name)}</th>`).join('')}</tr>`;
    const body = labels.map((l, i) =>
      `<tr><td>${escapeHtml(l)}</td>${series.map((s) => `<td class="num">${s.values[i] == null ? '—' : escapeHtml(format(s.values[i]))}</td>`).join('')}</tr>`
    ).join('');
    wrap.innerHTML = `<table class="table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
    container.appendChild(wrap);
  }

  window.MolaCharts = { columnChart, barList, dataTable, compact, escapeHtml };
})();
