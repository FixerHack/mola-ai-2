(function () {
  const STATUS_LABELS = { done: 'Готово', in_progress: 'В роботі', todo: 'Заплановано' };
  const state = { roadmap: null, filter: 'all' };

  try {
    const saved = localStorage.getItem('filter');
    if (saved === 'all' || saved === 'open') state.filter = saved;
  } catch (e) {}

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function countBy(tasks) {
    const c = { done: 0, in_progress: 0, todo: 0 };
    for (const t of tasks) c[t.status] = (c[t.status] || 0) + 1;
    return c;
  }

  function statusBadge(status) {
    return `<span class="status status--${escapeHtml(status)}"><span class="status__dot" aria-hidden="true"></span>${escapeHtml(STATUS_LABELS[status] || status)}</span>`;
  }

  // Статус етапу виводимо з його задач
  function stageStatus(c, total) {
    if (c.done === total) return 'done';
    if (c.done > 0 || c.in_progress > 0) return 'in_progress';
    return 'todo';
  }

  function renderSummary(stages) {
    const all = stages.flatMap((s) => s.tasks);
    const c = countBy(all);
    const pct = all.length ? Math.round((c.done / all.length) * 100) : 0;
    document.getElementById('hero-value').textContent = `${c.done} з ${all.length}`;
    document.getElementById('hero-meter').style.width = `${pct}%`;
    document.getElementById('counts').innerHTML = [
      ['in_progress', c.in_progress],
      ['todo', c.todo],
      ['done', c.done],
    ].map(([s, n]) => `<div><dt>${statusBadge(s)}</dt><dd>${n}</dd></div>`).join('');
  }

  function renderStages(stages) {
    document.getElementById('stages').innerHTML = stages.map((stage) => {
      const c = countBy(stage.tasks);
      const total = stage.tasks.length;
      const tasks = state.filter === 'open' ? stage.tasks.filter((t) => t.status !== 'done') : stage.tasks;
      const list = tasks.length
        ? tasks.map((t) => `<li class="task task--${escapeHtml(t.status)}">
            ${statusBadge(t.status)}
            <span class="task__title">${escapeHtml(t.title)}</span>
            ${t.note ? `<span class="task__note">${escapeHtml(t.note)}</span>` : ''}
          </li>`).join('')
        : '<li class="muted">Усі задачі етапу виконані</li>';
      return `<article class="card stage">
        <header class="stage__head">
          <div>
            <h2>${escapeHtml(stage.title)}</h2>
            ${stage.note ? `<p class="muted">${escapeHtml(stage.note)}</p>` : ''}
          </div>
          ${statusBadge(stageStatus(c, total))}
        </header>
        <div class="stage__progress">
          <div class="meter" aria-hidden="true"><span class="meter__fill" style="width:${total ? (c.done / total) * 100 : 0}%"></span></div>
          <span class="muted">${c.done} / ${total}</span>
        </div>
        <ul class="tasks">${list}</ul>
      </article>`;
    }).join('');
  }

  function render() {
    if (!state.roadmap) return;
    const { stages, updated } = state.roadmap;
    document.getElementById('freshness').textContent = updated
      ? `Оновлено ${new Date(updated).toLocaleDateString('uk-UA', { dateStyle: 'long' })}`
      : '';
    renderSummary(stages);
    renderStages(stages);
    document.querySelectorAll('.segmented button').forEach((b) => {
      b.setAttribute('aria-checked', String(b.dataset.filter === state.filter));
    });
  }

  document.querySelectorAll('.segmented button').forEach((b) => b.addEventListener('click', () => {
    state.filter = b.dataset.filter;
    try { localStorage.setItem('filter', state.filter); } catch (e) {}
    render();
  }));

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const root = document.documentElement;
    const isDark = root.dataset.theme
      ? root.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = isDark ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch (e) {}
  });

  fetch('data/roadmap.json', { cache: 'no-store' })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((roadmap) => {
      state.roadmap = roadmap;
      render();
    })
    .catch((err) => {
      const banner = document.getElementById('error-banner');
      banner.textContent = `Не вдалося завантажити етапи: ${err.message}`;
      banner.hidden = false;
      document.getElementById('freshness').textContent = 'Дані недоступні';
    });
})();
