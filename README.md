# AI-Mola-manager

AI-менеджери для Telegram, Instagram, Viber і сайту плюс дашборд для контролю процесу.

- [docs/01-services-research.md](docs/01-services-research.md) — порівняння сервісів для бота.
- `site/` — дашборд (статичний сайт для GitHub Pages).
- `scripts/collect-metrics.mjs` — збирає метрики в `site/data/metrics.json`.
- `.github/workflows/pages.yml` — щогодини збирає метрики й деплоїть сайт.

## Дашборд локально

```bash
node scripts/collect-metrics.mjs --demo
```

```bash
python3 -m http.server 8765 --directory site
```

Потім відкрийте http://localhost:8765.

## Деплой на GitHub Pages

1. Створіть репозиторій і запуште код у гілку `main`.
2. **Settings → Pages → Source:** GitHub Actions.
3. **Settings → Secrets and variables → Actions:**
   - Secrets: `KEYCRM_API_KEY`, `BOT_METRICS_URL`, `BOT_METRICS_TOKEN` (за потреби).
   - Variables: `KEYCRM_BOT_SOURCE_IDS` (id джерел замовлень бота в KeyCRM, через кому), `BOT_PLATFORM_NAME`, `ONEC_LAST_IMPORT`.
4. Без жодного секрету сайт показує демо-дані з позначкою «Демо-дані».

Ключі живуть тільки в секретах GitHub Actions і ніколи не потрапляють у браузер. У `metrics.json` пишуться лише агрегати, без імен, телефонів і текстів переписок.

### Хто бачить дашборд

GitHub Pages на безкоштовному тарифі публічний: будь-хто з посиланням бачить агреговані цифри. Сторінка закрита від індексації (`noindex`), але це не захист. Щоб закрити повністю:

- поставити домен сайту за **Cloudflare Access** (безкоштовно до 50 користувачів, вхід за поштою компанії), або
- віддавати `metrics.json` з Cloudflare Worker за Access і вказати його URL у `site/assets/config.js`.

## Звідки беруться дані

| Показник | Джерело |
|---|---|
| Замовлення й виручка від бота | KeyCRM: замовлення з джерел `KEYCRM_BOT_SOURCE_IDS` |
| Нові картки клієнтів | KeyCRM: клієнт створений того ж дня, що й замовлення бота |
| Діалоги, канали, закрито AI / передано, час відповіді, атаки, теми | Платформа бота (`BOT_METRICS_URL`) |
| Етапи проєкту | `site/data/roadmap.json`, редагується вручну |

### Формат `BOT_METRICS_URL`

Поки платформу не вибрано, збирач читає JSON у нейтральному форматі. Після вибору сервісу додамо адаптер під його API.

```json
{
  "daily": [
    {
      "date": "2026-10-28",
      "channels": { "telegram": 30, "instagram": 22, "viber": 12, "website": 5 },
      "ai_resolved": 52,
      "handoffs": 17,
      "blocked": 1,
      "response_sec": 6
    }
  ],
  "topics": [{ "label": "Наявність товару", "count": 41 }],
  "handoffs": [{ "time": "2026-10-28T09:40:00Z", "channel": "viber", "reason": "Скарга на якість" }]
}
```
