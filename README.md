# AI-Mola-manager

AI-менеджери для Telegram, Instagram, Viber і сайту плюс дашборд для контролю процесу.

Дашборд: https://fixerhack.github.io/mola-ai-2/

- [docs/01-services-research.md](docs/01-services-research.md) — порівняння сервісів для бота.
- `site/` — дашборд з етапами проєкту та задачами (статичний сайт для GitHub Pages).
- `.github/workflows/pages.yml` — деплоїть `site/` при кожному пуші в `main`.

## Як оновити етапи й задачі

Усе зберігається в [site/data/roadmap.json](site/data/roadmap.json):

```json
{
  "updated": "2026-10-28",
  "stages": [
    {
      "title": "1. Відповіді на прості питання",
      "note": "Перша задача",
      "tasks": [
        { "title": "Підключити Telegram", "status": "in_progress", "note": "необовʼязково" }
      ]
    }
  ]
}
```

- `status`: `todo` (заплановано), `in_progress` (в роботі) або `done` (готово).
- Статус етапу і прогрес рахуються автоматично із задач.
- Після правки оновіть `updated` і запуште. Сайт оновиться приблизно за хвилину.

Файл можна правити прямо на GitHub через кнопку редагування.

## Локально

```bash
python3 -m http.server 8765 --directory site
```

Потім відкрийте http://localhost:8765.
