(function () {
  const { columnChart, barList, dataTable, compact, escapeHtml } = window.MolaCharts;
  const cfg = window.MOLA_CONFIG;

  const CHANNELS = { telegram: 'Telegram', instagram: 'Instagram', viber: 'Viber', website: 'Сайт' };
  const SOURCE_NAMES = { bot_platform: 'Платформа бота', keycrm: 'KeyCRM', onec: '1С (вивантаження)' };
  const STATUS_LABELS = {
    done: 'Готово', in_progress: 'В роботі', todo: 'Заплановано',
    connected: 'Підключено', not_connected: 'Не підключено', error: 'Помилка',
  };
  const STATUS_CLASS = { connected: 'done', not_connected: 'todo', error: 'error' };

  const state = { metrics: null, roadmap: [], days: 30, tableMode: {} };

  try {
    const saved = Number(localStorage.getItem('period'));
    if ([7, 14, 30].includes(saved)) state.days = saved;
  } catch (e) {}

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const money = new Intl.NumberFormat('uk-UA', { style: 'currency', currency: cfg.currency, maximumFractionDigits: 0 });
  const int = new Intl.NumberFormat('uk-UA');
  const shortDate = (iso) => { const [, m, d] = iso.split('-'); return `${d}.${m}`; };

  // ---- агрегати ----

  const sum = (rows, pick) => {
    const vals = rows.map(pick).filter((v) => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const dialogsOf = (d) => (d.channels ? Object.values(d.channels).reduce((a, b) => a + (b || 0), 0) : null);

  function aggregate(rows) {
    const dialogs = sum(rows, dialogsOf);
    const ai = sum(rows, (d) => d.ai_resolved);
    const handoffs = sum(rows, (d) => d.handoffs);
    const weighted = sum(rows, (d) => (d.response_sec != null && dialogsOf(d) != null ? d.response_sec * dialogsOf(d) : null));
    return {
      dialogs,
      handoffs,
      aiRate: ai != null && handoffs != null && ai + handoffs > 0 ? ai / (ai + handoffs) : null,
      orders: sum(rows, (d) => d.orders),
      revenue: sum(rows, (d) => d.revenue),
      newClients: sum(rows, (d) => d.new_clients),
      blocked: sum(rows, (d) => d.blocked),
      responseSec: weighted != null && dialogs ? weighted / dialogs : null,
    };
  }

  function periods() {
    const daily = state.metrics.daily;
    return {
      current: daily.slice(-state.days),
      previous: daily.slice(-state.days * 2, -state.days),
    };
  }

  // ---- рендер ----

  function deltaText(cur, prev, { upIsGood = true, points = false } = {}) {
    if (cur == null || prev == null) return { text: '', cls: '' };
    let diff;
    let text;
    if (points) {
      diff = (cur - prev) * 100;
      text = `${diff >= 0 ? '+' : '−'}${Math.abs(diff).toFixed(1)} п.п.`;
    } else {
      if (prev === 0) return { text: '', cls: '' };
      diff = ((cur - prev) / prev) * 100;
      text = `${diff >= 0 ? '+' : '−'}${Math.abs(diff).toFixed(0)}%`;
    }
    if (Math.abs(diff) < 0.5) return { text: `без змін до попередніх ${state.days} дн.`, cls: '' };
    const good = upIsGood == null ? null : (diff > 0) === upIsGood;
    return { text: `${text} до попередніх ${state.days} дн.`, cls: good == null ? '' : good ? 'tile__delta--good' : 'tile__delta--bad' };
  }

  function renderHero(cur, prev) {
    const value = document.getElementById('hero-value');
    const delta = document.getElementById('hero-delta');
    const note = document.getElementById('hero-note');
    value.textContent = cur.aiRate == null ? '—' : `${Math.round(cur.aiRate * 100)}%`;
    const d = deltaText(cur.aiRate, prev.aiRate, { points: true });
    delta.textContent = d.text;
    delta.className = `tile__delta ${d.cls}`;
    note.textContent = cur.aiRate == null
      ? 'Зʼявиться після підключення платформи бота.'
      : `${int.format(cur.dialogs)} діалогів за ${state.days} дн., ${int.format(cur.handoffs)} з них передано менеджеру.`;
  }

  function renderTiles(cur, prev) {
    const botMissing = 'Платформа бота не підключена';
    const crmMissing = 'KeyCRM не підключено';
    const tiles = [
      { label: 'Діалоги', value: cur.dialogs, prev: prev.dialogs, fmt: (v) => int.format(v), up: true, missing: botMissing },
      { label: 'Передано менеджеру', value: cur.handoffs, prev: prev.handoffs, fmt: (v) => int.format(v), up: false, missing: botMissing },
      { label: 'Замовлення від бота', value: cur.orders, prev: prev.orders, fmt: (v) => int.format(v), up: true, missing: crmMissing },
      { label: 'Виручка від бота', value: cur.revenue, prev: prev.revenue, fmt: (v) => money.format(v), up: true, missing: crmMissing },
      { label: 'Нові картки клієнтів', value: cur.newClients, prev: prev.newClients, fmt: (v) => int.format(v), up: true, missing: crmMissing },
      { label: 'Перша відповідь, сер.', value: cur.responseSec, prev: prev.responseSec, fmt: formatSeconds, up: false, missing: botMissing },
      { label: 'Заблоковані атаки на бота', value: cur.blocked, prev: prev.blocked, fmt: (v) => int.format(v), up: null, missing: botMissing },
    ];
    document.getElementById('tiles').innerHTML = tiles.map((t) => {
      const d = deltaText(t.value, t.prev, { upIsGood: t.up });
      return `<div class="tile">
        <p class="tile__label">${escapeHtml(t.label)}</p>
        <p class="tile__value">${t.value == null ? '—' : escapeHtml(t.fmt(t.value))}</p>
        ${t.value == null
          ? `<p class="tile__note">${escapeHtml(t.missing)}</p>`
          : `<p class="tile__delta ${d.cls}">${escapeHtml(d.text)}</p>`}
      </div>`;
    }).join('');
  }

  function formatSeconds(s) {
    if (s < 60) return `${Math.round(s)} с`;
    const m = Math.floor(s / 60);
    const r = Math.round(s % 60);
    return r ? `${m} хв ${r} с` : `${m} хв`;
  }

  function renderDialogs(rows) {
    const labels = rows.map((d) => shortDate(d.date));
    const series = [
      { name: 'Закрив AI', color: css('--series-1'), values: rows.map((d) => d.ai_resolved) },
      { name: 'Передано менеджеру', color: css('--series-2'), values: rows.map((d) => d.handoffs) },
    ];
    document.getElementById('dialogs-legend').innerHTML = series
      .map((s) => `<span><i style="background:${s.color}"></i>${escapeHtml(s.name)}</span>`).join('');
    const box = document.getElementById('dialogs-chart');
    const fmt = (v) => int.format(v);
    if (state.tableMode.dialogs) dataTable(box, { labels, series, format: fmt });
    else columnChart(box, { labels, series, format: fmt });
  }

  function renderOrders(rows) {
    const labels = rows.map((d) => shortDate(d.date));
    const series = [{ name: 'Замовлення', color: css('--series-1'), values: rows.map((d) => d.orders) }];
    const box = document.getElementById('orders-chart');
    const fmt = (v) => int.format(v);
    if (state.tableMode.orders) {
      dataTable(box, {
        labels,
        series: [...series, { name: 'Виручка', values: rows.map((d) => d.revenue) }],
        format: (v) => (v > 999 ? money.format(v) : int.format(v)),
      });
    } else {
      columnChart(box, { labels, series, format: fmt });
    }
  }

  function renderChannels(rows) {
    const items = Object.entries(CHANNELS).map(([key, label]) => ({
      label,
      value: sum(rows, (d) => (d.channels ? d.channels[key] ?? 0 : null)),
    }));
    barList(document.getElementById('channels-chart'), items, { format: (v) => int.format(v) });
  }

  function renderTopics() {
    const items = (state.metrics.topics || []).slice(0, 8).map((t) => ({ label: t.label, value: t.count }));
    barList(document.getElementById('topics-chart'), items, { format: (v) => int.format(v) });
  }

  function statusBadge(status) {
    const cls = STATUS_CLASS[status] || status;
    return `<span class="status status--${escapeHtml(cls)}"><span class="status__dot" aria-hidden="true"></span>${escapeHtml(STATUS_LABELS[status] || status)}</span>`;
  }

  function renderRoadmap() {
    document.getElementById('roadmap').innerHTML = state.roadmap.map((r) => `
      <li>${statusBadge(r.status)}<span>${escapeHtml(r.title)}</span>
      ${r.note ? `<span class="note">${escapeHtml(r.note)}</span>` : ''}</li>`).join('')
      || '<li class="muted">Немає етапів</li>';
  }

  function renderSources() {
    const sources = state.metrics.sources || {};
    document.getElementById('sources').innerHTML = Object.entries(SOURCE_NAMES).map(([key, name]) => {
      const s = sources[key] || { status: 'not_connected' };
      return `<li><div><div>${escapeHtml(name)}${s.name ? ` · ${escapeHtml(s.name)}` : ''}</div>
        ${s.note ? `<div class="muted">${escapeHtml(s.note)}</div>` : ''}</div>${statusBadge(s.status)}</li>`;
    }).join('');
  }

  function renderHandoffs() {
    const rows = (state.metrics.handoffs || []).slice(0, 10);
    const tbody = document.querySelector('#handoffs tbody');
    tbody.innerHTML = rows.length
      ? rows.map((h) => `<tr>
          <td>${escapeHtml(new Date(h.time).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}</td>
          <td>${escapeHtml(CHANNELS[h.channel] || h.channel)}</td>
          <td>${escapeHtml(h.reason)}</td></tr>`).join('')
      : '<tr><td colspan="3" class="muted">Поки немає передач</td></tr>';
  }

  function renderFreshness() {
    const m = state.metrics;
    const when = new Date(m.generated_at);
    const ageMin = Math.round((Date.now() - when) / 60000);
    const ago = ageMin < 60 ? `${ageMin} хв тому` : ageMin < 1440 ? `${Math.round(ageMin / 60)} год тому` : `${Math.round(ageMin / 1440)} дн. тому`;
    document.getElementById('freshness').textContent =
      `Оновлено ${when.toLocaleString('uk-UA', { dateStyle: 'medium', timeStyle: 'short' })} (${ago})`;
    document.getElementById('demo-banner').hidden = m.mode !== 'demo';
  }

  function render() {
    if (!state.metrics) return;
    const { current, previous } = periods();
    const cur = aggregate(current);
    const prev = previous.length === current.length ? aggregate(previous) : {};
    renderFreshness();
    renderHero(cur, prev);
    renderTiles(cur, prev);
    renderDialogs(current);
    renderOrders(current);
    renderChannels(current);
    renderTopics();
    renderRoadmap();
    renderSources();
    renderHandoffs();
    document.querySelectorAll('.segmented button').forEach((b) => {
      b.setAttribute('aria-checked', String(Number(b.dataset.days) === state.days));
    });
  }

  // ---- події ----

  document.querySelectorAll('.segmented button').forEach((b) => b.addEventListener('click', () => {
    state.days = Number(b.dataset.days);
    try { localStorage.setItem('period', String(state.days)); } catch (e) {}
    render();
  }));

  document.querySelectorAll('[data-toggle-table]').forEach((b) => b.addEventListener('click', () => {
    const key = b.closest('[data-chart]').dataset.chart;
    state.tableMode[key] = !state.tableMode[key];
    b.textContent = state.tableMode[key] ? 'Графік' : 'Таблиця';
    render();
  }));

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const root = document.documentElement;
    const isDark = root.dataset.theme
      ? root.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = isDark ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch (e) {}
    render();
  });

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 120);
  });

  // ---- завантаження ----

  async function loadJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res.json();
  }

  Promise.all([loadJson(cfg.metricsUrl), loadJson(cfg.roadmapUrl).catch(() => [])])
    .then(([metrics, roadmap]) => {
      state.metrics = metrics;
      state.roadmap = roadmap;
      render();
    })
    .catch((err) => {
      const banner = document.getElementById('error-banner');
      banner.textContent = `Не вдалося завантажити дані: ${err.message}`;
      banner.hidden = false;
      document.getElementById('freshness').textContent = 'Дані недоступні';
    });
})();
