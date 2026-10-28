// Звідки дашборд бере дані. За замовчуванням це JSON, який GitHub Action
// генерує при кожному деплої. Якщо дані треба закрити від сторонніх,
// вкажіть тут URL проксі (наприклад, Cloudflare Worker за Cloudflare Access).
window.MOLA_CONFIG = {
  metricsUrl: 'data/metrics.json',
  roadmapUrl: 'data/roadmap.json',
  currency: 'UAH',
};
