#!/usr/bin/env node
// Збирає агреговані метрики для дашборду у site/data/metrics.json.
//
//   node scripts/collect-metrics.mjs          — живі дані з KeyCRM і платформи бота
//                                               (без жодного налаштованого джерела — демо)
//   node scripts/collect-metrics.mjs --demo   — згенерувати демо-дані
//
// Змінні оточення (у GitHub — Settings → Secrets and variables → Actions):
//   KEYCRM_API_KEY           ключ KeyCRM OpenAPI (Налаштування → API)
//   KEYCRM_BOT_SOURCE_IDS    id джерел замовлень, які створює бот, через кому
//   BOT_METRICS_URL          JSON з метриками платформи бота (формат — див. README)
//   BOT_METRICS_TOKEN        Bearer-токен для BOT_METRICS_URL, якщо потрібен
//   BOT_PLATFORM_NAME        назва платформи для дашборду, напр. "MyChatBot"
//   ONEC_LAST_IMPORT         дата останнього вивантаження з 1С, напр. 2026-11-02
//
// У файл потрапляють тільки агрегати: жодних імен, телефонів чи текстів повідомлень.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../site/data/metrics.json');
const DAYS = 60; // 30 днів поточного періоду + 30 для порівняння
const CHANNELS = ['telegram', 'instagram', 'viber', 'website'];
const KEYCRM_BASE = 'https://openapi.keycrm.app/v1';

const env = process.env;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function dateRange(days) {
  const out = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    out.push(new Date(today - i * 86400000).toISOString().slice(0, 10));
  }
  return out;
}

function emptyDay(date) {
  return {
    date, channels: null, ai_resolved: null, handoffs: null,
    orders: null, revenue: null, new_clients: null, blocked: null, response_sec: null,
  };
}

const clip = (s, n) => (s == null ? '' : String(s).slice(0, n));

// ---------- KeyCRM ----------

async function keycrmGet(path, params) {
  const url = new URL(KEYCRM_BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${env.KEYCRM_API_KEY}`, accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    if (res.status === 429) { await sleep(5000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`KeyCRM ${path}: HTTP ${res.status}`);
    return res.json();
  }
  throw new Error(`KeyCRM ${path}: перевищено ліміт запитів`);
}

async function collectKeycrm(days) {
  const sourceIds = (env.KEYCRM_BOT_SOURCE_IDS || '').trim();
  if (!sourceIds) {
    return { status: 'error', note: 'Не вказано KEYCRM_BOT_SOURCE_IDS — невідомо, які замовлення створив бот' };
  }
  const from = `${days[0]} 00:00:00`;
  const to = `${days[days.length - 1]} 23:59:59`;
  const byDay = Object.fromEntries(days.map((d) => [d, { orders: 0, revenue: 0, newClients: new Set() }]));

  let page = 1;
  let total = 0;
  for (;;) {
    const res = await keycrmGet('/order', {
      limit: 50,
      page,
      include: 'buyer',
      'filter[source_id]': sourceIds,
      'filter[created_between]': `${from}, ${to}`,
    });
    for (const o of res.data || []) {
      const day = String(o.created_at || '').slice(0, 10);
      if (!byDay[day]) continue;
      byDay[day].orders += 1;
      byDay[day].revenue += Number(o.grand_total) || 0;
      // Картку вважаємо створеною ботом, якщо клієнт зʼявився в CRM того ж дня, що й замовлення
      const buyerCreated = String(o.buyer?.created_at || '').slice(0, 10);
      if (o.buyer?.id && buyerCreated === day) byDay[day].newClients.add(o.buyer.id);
      total += 1;
    }
    if (!res.next_page_url) break;
    page += 1;
    await sleep(1100); // ліміт KeyCRM — 60 запитів на хвилину
  }

  return {
    status: 'connected',
    note: `${total} замовлень від бота за ${days.length} дн.`,
    byDay: Object.fromEntries(Object.entries(byDay).map(([d, v]) => [d, {
      orders: v.orders, revenue: Math.round(v.revenue), new_clients: v.newClients.size,
    }])),
  };
}

// ---------- Платформа бота ----------
// Поки платформу не вибрано, читаємо JSON у нейтральному форматі (див. README).
// Після вибору сюди додається адаптер під API конкретного сервісу.

async function collectBotPlatform() {
  const headers = { accept: 'application/json' };
  if (env.BOT_METRICS_TOKEN) headers.authorization = `Bearer ${env.BOT_METRICS_TOKEN}`;
  const res = await fetch(env.BOT_METRICS_URL, { headers, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`BOT_METRICS_URL: HTTP ${res.status}`);
  const data = await res.json();
  const byDay = {};
  for (const d of data.daily || []) {
    byDay[d.date] = {
      channels: Object.fromEntries(CHANNELS.map((c) => [c, Number(d.channels?.[c]) || 0])),
      ai_resolved: Number(d.ai_resolved) || 0,
      handoffs: Number(d.handoffs) || 0,
      blocked: Number(d.blocked) || 0,
      response_sec: d.response_sec == null ? null : Number(d.response_sec),
    };
  }
  return {
    status: 'connected',
    byDay,
    topics: (data.topics || []).slice(0, 20).map((t) => ({ label: clip(t.label, 80), count: Number(t.count) || 0 })),
    handoffs: (data.handoffs || []).slice(0, 20).map((h) => ({
      time: h.time, channel: CHANNELS.includes(h.channel) ? h.channel : 'other', reason: clip(h.reason, 120),
    })),
  };
}

// ---------- Збирання ----------

async function live() {
  const days = dateRange(DAYS);
  const daily = days.map(emptyDay);
  const index = Object.fromEntries(daily.map((d) => [d.date, d]));
  const metrics = {
    schema: 1,
    generated_at: new Date().toISOString(),
    mode: 'live',
    sources: {
      bot_platform: { status: 'not_connected', name: env.BOT_PLATFORM_NAME || null },
      keycrm: { status: 'not_connected' },
      onec: env.ONEC_LAST_IMPORT
        ? { status: 'connected', note: `Останнє вивантаження: ${env.ONEC_LAST_IMPORT}` }
        : { status: 'not_connected' },
    },
    daily,
    topics: [],
    handoffs: [],
  };

  if (env.KEYCRM_API_KEY) {
    try {
      const kc = await collectKeycrm(days);
      metrics.sources.keycrm = { status: kc.status, note: kc.note };
      for (const [date, v] of Object.entries(kc.byDay || {})) Object.assign(index[date], v);
    } catch (err) {
      metrics.sources.keycrm = { status: 'error', note: err.message };
    }
  }

  if (env.BOT_METRICS_URL) {
    try {
      const bot = await collectBotPlatform();
      metrics.sources.bot_platform.status = bot.status;
      for (const [date, v] of Object.entries(bot.byDay)) if (index[date]) Object.assign(index[date], v);
      metrics.topics = bot.topics;
      metrics.handoffs = bot.handoffs;
    } catch (err) {
      metrics.sources.bot_platform = { ...metrics.sources.bot_platform, status: 'error', note: err.message };
    }
  }

  return metrics;
}

function demo() {
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const days = dateRange(DAYS);
  const daily = days.map((date, i) => {
    const weekday = new Date(date).getUTCDay();
    const weekend = weekday === 0 || weekday === 6 ? 0.7 : 1;
    const growth = 0.75 + (i / DAYS) * 0.5; // бот поступово бере більше діалогів
    const base = 60 * weekend * growth;
    const channels = {
      telegram: Math.round(base * (0.38 + rnd() * 0.1)),
      instagram: Math.round(base * (0.3 + rnd() * 0.1)),
      viber: Math.round(base * (0.18 + rnd() * 0.06)),
      website: Math.round(base * (0.08 + rnd() * 0.05)),
    };
    const dialogs = Object.values(channels).reduce((a, b) => a + b, 0);
    const aiShare = 0.55 + (i / DAYS) * 0.2 + rnd() * 0.06;
    const ai = Math.round(dialogs * aiShare);
    const orders = Math.round(dialogs * (0.07 + rnd() * 0.04));
    return {
      date,
      channels,
      ai_resolved: ai,
      handoffs: dialogs - ai,
      orders,
      revenue: Math.round(orders * (850 + rnd() * 700)),
      new_clients: Math.round(orders * (0.35 + rnd() * 0.2)),
      blocked: rnd() < 0.25 ? Math.ceil(rnd() * 3) : 0,
      response_sec: Math.round(4 + rnd() * 6),
    };
  });
  const now = Date.now();
  const reasons = [
    'Клієнт просить знижку понад дозволену',
    'Скарга на якість товару',
    'Питання про оптову закупівлю',
    'Бот не знайшов товар у базі знань',
    'Клієнт попросив живого менеджера',
    'Повернення товару',
  ];
  return {
    schema: 1,
    generated_at: new Date().toISOString(),
    mode: 'demo',
    sources: {
      bot_platform: { status: 'not_connected', name: null, note: 'Платформу ще вибираємо' },
      keycrm: { status: 'not_connected', note: 'Додайте KEYCRM_API_KEY у секрети репозиторію' },
      onec: { status: 'not_connected', note: 'Дані з 1С ще не вивантажені' },
    },
    daily,
    topics: [
      { label: 'Наявність товару', count: 412 },
      { label: 'Доставка і терміни', count: 356 },
      { label: 'Ціна та знижки', count: 298 },
      { label: 'Статус замовлення', count: 241 },
      { label: 'Підбір розміру', count: 187 },
      { label: 'Оплата', count: 133 },
      { label: 'Повернення та обмін', count: 92 },
      { label: 'Опт', count: 41 },
    ],
    handoffs: Array.from({ length: 10 }, (_, i) => ({
      time: new Date(now - (i * 2.7 + rnd()) * 3600000).toISOString(),
      channel: CHANNELS[Math.floor(rnd() * CHANNELS.length)],
      reason: reasons[Math.floor(rnd() * reasons.length)],
    })),
  };
}

let isDemo = process.argv.includes('--demo');
if (!isDemo && !env.KEYCRM_API_KEY && !env.BOT_METRICS_URL) {
  console.log('Жодне джерело не налаштоване — генерую демо-дані.');
  isDemo = true;
}

const metrics = isDemo ? demo() : await live();
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(metrics, null, 2) + '\n');
console.log(`Записано ${OUT} (${metrics.mode}).`);
for (const [k, v] of Object.entries(metrics.sources)) console.log(`  ${k}: ${v.status}${v.note ? ` — ${v.note}` : ''}`);
