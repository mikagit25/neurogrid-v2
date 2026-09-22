# NeuroGrid v2

AI-платформа для продавцов маркетплейсов WildBerries, Ozon, Яндекс Маркет и Мегамаркет.

## Стек

| Слой | Технология |
|------|------------|
| Backend | Node.js 20 + Express + TypeScript |
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| БД | PostgreSQL 16 |
| Очереди | Redis 7 + BullMQ |
| AI/LLM | OpenAI-compatible API (Gemini / OpenRouter / Groq / Ollama) |
| Изображения | Pollinations FLUX / Together AI |
| Процесс-менеджер | PM2 |

## Быстрый старт (dev)

```bash
# 1. Инфраструктура
cp .env.example .env          # заполнить переменные (минимум: JWT_SECRET, ENCRYPTION_KEY, LLM_API_KEY)
docker compose up -d          # запускает postgres + redis

# 2. Backend
cd backend
npm install
npm run build
npm run dev                   # порт 4001

# 3. Frontend
cd ../frontend
npm install
npm run dev                   # порт 3000 (или 4000 в prod)
```

## Запуск в prod (PM2)

```bash
# Backend
cd backend && npm run build
pm2 start dist/app.js --name ng-backend

# Frontend
cd frontend && npm run build
pm2 start npm --name ng-frontend -- start
pm2 save
```

## Переменные окружения

Все переменные описаны в `.env.example`. Обязательные:

| Переменная | Описание | Минимум |
|------------|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@localhost:5432/db` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | Подпись JWT токенов | 32+ символа |
| `ENCRYPTION_KEY` | AES-256 шифрование API-ключей | **ровно 32+ байта** |
| `LLM_API_KEY` | Ключ языковой модели | Gemini/OpenRouter/Groq |
| `NEXT_PUBLIC_API_URL` | URL бэкенда для браузера | `http://localhost:4001` |

Сгенерировать безопасные ключи:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Применение миграций

Миграции применяются вручную при первом деплое и при обновлениях:

```bash
docker exec neurogrid-postgres-1 psql -U neurogrid -d neurogrid -f /path/to/migration.sql
```

Файлы миграций: `backend/src/db/migrations/` (нумерованные, применять по порядку).

## Структура проекта

```
neurogrid/
├── backend/
│   ├── src/
│   │   ├── app.ts                    # Express app, воркеры, глобальный error handler
│   │   ├── config/index.ts           # Конфиг из env (с валидацией при старте)
│   │   ├── db/
│   │   │   ├── index.ts              # pg Pool
│   │   │   └── migrations/           # SQL миграции 001–029
│   │   ├── integrations/
│   │   │   ├── marketplace/          # Адаптеры WB, Ozon, YM, MM (retry/backoff)
│   │   │   ├── llm/llm.client.ts     # OpenAI-compatible LLM клиент
│   │   │   └── image/                # FLUX / Together AI
│   │   ├── modules/                  # ~40 модулей (auth, billing, warehouse, ...)
│   │   ├── queue/
│   │   │   ├── queue.ts              # BullMQ setup
│   │   │   └── workers/              # scenario, automation, sync, alert, pricing
│   │   ├── scenarios/                # 9 AI-сценариев (registry + executors)
│   │   └── utils/
│   │       ├── encryption.ts         # AES-256-GCM (хранение API-ключей)
│   │       ├── retry.ts              # withRetry(fn, attempts, baseDelay)
│   │       └── mailer.ts             # SMTP
└── frontend/
    └── src/
        ├── app/
        │   ├── (app)/                # Авторизованная зона (layout + все страницы ЛК)
        │   └── page.tsx              # Лендинг с демо-аккаунтом
        ├── components/               # Sidebar, MobileNav, CommandPalette, ...
        └── lib/
            ├── api.ts                # Все API-функции фронтенда
            └── auth.ts               # JWT в localStorage
```

## Ключевые архитектурные решения

- **Транзакции**: все денежные операции (списание/пополнение баланса) используют `client = await db.connect()` с `BEGIN/COMMIT/ROLLBACK` + `finally client.release()`. Никаких `db.query('BEGIN')` через пул — каждый вызов может уйти на разное соединение.
- **FOR UPDATE**: блокировка баланса (`SELECT ... FOR UPDATE`) выполняется внутри той же транзакции, что и списание.
- **Retry**: HTTP-запросы к API маркетплейсов обёрнуты в `withRetry(fn, 3, 1000ms)` с экспоненциальным backoff. 4xx (кроме 429) не ретраятся.
- **Демо-аккаунты**: `POST /api/auth/demo` создаёт изолированный аккаунт с `is_demo=true`, TTL 2 часа, seeded данными. Воркеры синхронизации фильтруют демо-коннекции по `credentials_enc != 'demo_placeholder'`.
- **ENCRYPTION_KEY**: при старте проверяется длина (≥32 байта), иначе сервер не запускается.

## Поддерживаемые маркетплейсы

| МП | Статус |
|----|--------|
| WildBerries | ✅ полная поддержка (склад, финансы, реклама, заказы) |
| Ozon | ✅ полная поддержка |
| Яндекс Маркет | ⚠️ базовая (товары, заказы) |
| Мегамаркет | ⚠️ базовая (товары, заказы) |

## PM2 — управление процессами

```bash
pm2 status                    # статус всех процессов
pm2 logs ng-backend --lines 50 # логи бэкенда
pm2 restart ng-backend ng-frontend  # перезапуск после деплоя
pm2 save                      # сохранить конфиг для автозапуска
```
