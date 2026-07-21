# eva-mcp — Инструкции для Copilot

MCP-сервер для работы с **EvaProject** (EvaTeam) — системой управления проектами.
Позволяет AI-агенту получать описание задач, комментарии, обновлять поля и искать проекты/пользователей.

## Документация

При внесении любых изменений, добавлении новых инструментов или API-методов **всегда сверяйся** с актуальной документацией EvaTeam:

- **Основная документация EvaTeam**: <https://docs.evateam.ru/docs/docs#eva-team/>
- **Документация API (интеграция и автоматизация)**: <https://docs.evateam.ru/docs/docs/DOC-000198#dokumentacziya-po-integraczii-i-avtomatizaczii>

Перед добавлением нового JSON-RPC метода или поля в `TaskUpdateFields` — проверь документацию API на наличие этого метода/поля и его актуальную сигнатуру.

## Стек

- **Runtime**: Node.js (ESM, `"type": "module"`)
- **Язык**: TypeScript (strict mode, target ES2022, module NodeNext)
- **MCP SDK**: `@modelcontextprotocol/sdk` v1.x (stdio transport)
- **Валидация**: Zod v4
- **Конфигурация**: `dotenv` (.env файл)
- **Dev-запуск**: `tsx` (on-the-fly TypeScript execution)

## Команды

```bash
npm run dev      # Запуск через tsx (разработка)
npm run build    # Компиляция tsc → dist/
npm start        # Запуск скомпилированной версии
```

## Архитектура

```
src/
├── index.ts        # Точка входа: MCP-сервер, Zod-схемы, форматтеры, обработчики инструментов
├── eva-client.ts   # HTTP-клиент для JSON-RPC API EvaProject (класс EvaClient)
└── types.ts        # Все TypeScript-интерфейсы (TaskInfo, CommentInfo, BqlFilter, ...)
```

- **`index.ts`**: Инициализирует `Server` из MCP SDK, регистрирует инструменты через `ListToolsRequestSchema` и обрабатывает вызовы через `CallToolRequestSchema`. Каждый инструмент: Zod-схема → handler → форматтер → Markdown-ответ.
- **`eva-client.ts`**: Класс `EvaClient` с приватным методом `call<T>()` для JSON-RPC 2.2 вызовов. Публичные методы: `getTask`, `getTaskWithComments`, `listTasks`, `countTasks`, `updateTask`, `getProject`, `listProjects`, `searchUsers`, `getStatuses`, `getLinkedTasks`, `getReferencingTasks`, `getLinkedTasksBatch`. Приватные мапперы: `mapTask`, `mapComment`, `mapProject`, `mapPerson`, `mapStatus`.
- **`types.ts`**: Интерфейсы для «сырых» данных API (`EvaTaskRaw`, `EvaCommentRaw`, …), нормализованных данных (`TaskInfo`, `CommentInfo`, …), BQL-фильтров (`BqlFilter`, `BqlOperator`) и параметров запросов.

## Соглашения

### Именование
- **Методы EvaClient**: `camelCase`, соответствуют названиям JSON-RPC методов (getTask, listTasks, ...)
- **MCP-инструменты**: `snake_case` (get_task, search_tasks, update_task, ...)
- **Zod-схемы**: `PascalCase` + `Schema` (GetTaskSchema, SearchTasksSchema, ...)
- **Форматтеры**: `formatTask`, `formatComments`, `formatTaskList`, ...
- **Мапперы**: `mapTask`, `mapComment`, `mapProject`, ... (приватные, внутри EvaClient)

### Обработка ошибок
- При возникновении любых трудностей и ошибок **всегда сначала сверяйся** с документацией API EvaTeam, чтобы убедиться, что используемый метод/параметр актуален и корректен.
- HTTP 401 → понятное сообщение: «Проверьте EVA_TOKEN»
- JSON-RPC error → `EvaProject API: ошибка {code} — {message}`
- Zod validation error → автоматически возвращается как `invalid arguments`
- Все ошибки в `CallToolRequestSchema` handler оборачиваются: `{ isError: true, content: [{ type: "text", text: "Ошибка: ..." }] }`

### Ответы инструментов
- Все ответы — Markdown (таблицы, заголовки, списки)
- Задачи форматируются таблицей: Код, Название, Статус, Приоритет, Исполнитель
- Комментарии — иерархическое дерево с отступами и префиксом `↳`
- Связанные задачи группируются по типу связи

### BQL-фильтры
- Тип `BqlFilter = [string, BqlOperator, unknown] | ["OR", ...BqlFilter[]]`
- Хелпер `buildTaskFilter()` в `index.ts` строит фильтры из аргументов инструмента
- Для `linked_to` используется OR-фильтр: parent_task, depended_tasks, affected_tasks

### Конфигурация
- `EVA_URL` и `EVA_TOKEN` — обязательные переменные окружения (.env или env vars)
- При отсутствии → `process.exit(1)` с сообщением об ошибке

## Идентификаторы сущностей

**Золотое правило**: `code` — основной human-friendly идентификатор для всех сущностей (уникален, readonly). `id` — всегда UUID (неудобен для humans). `name` — НЕ уникален, не используй как идентификатор.

### Таблица идентификаторов

| Сущность | Канонический идентификатор | Формат | Пример | Где взять |
|----------|---------------------------|--------|--------|-----------|
| **Задача** | `code` | `ПРЕФИКС-НОМЕР` | `DEV-000003` | `search_tasks`, URL задачи |
| **Задача** | `id` (UUID) | `CmfTask:uuid` | — | API (избегай) |
| **Проект** | `code` | строчные буквы/дефисы | `mcp-test` | `search_projects`, URL `/project/Project/{code}` |
| **Спринт** | `code` | `SPR-НОМЕР` | `SPR-000001` | `search_sprints` |
| **Пользователь** | `login` | email | `user@domain.ru` | `search_users` (колонка **Логин**) |
| **Статус** | `code` | строчные буквы | `open`, `in_progress` | `get_statuses` (колонка **Код**) |
| **Статус** | `id` (UUID) | `CmfStatus:uuid` | — | `get_statuses` (колонка **ID**) |
| **Комментарий** | `id` (UUID) | — | — | Только через `get_task` |
| **Вложение** | `id` (UUID) | — | — | Только через `get_task` / `get_attachments` |

### Правила

- **Всегда предпочитай `code`** параметру `id` — `code` человекочитаем и уникален
- **Никогда не используй `name` как идентификатор** — `name` не уникален ни для одной сущности
- **Для фильтрации задач по исполнителю** используй `responsible` с **логином** (email из `search_users`)
- **Для фильтрации задач по проекту** используй `project` с **кодом проекта** (из `search_projects`)
- **Для указания спринта** используй `sprint` с **кодом спринта** (`SPR-...`)
- **Для статусов** передавай **код** статуса (из колонки Код в `get_statuses`), не ID
- **Для пользователей** передавай **логин** (email из колонки Логин в `search_users`)
- **При добавлении нового параметра-идентификатора** всегда указывай в description: тип (`Код задачи` / `Код проекта` / `Логин` / `UUID`), пример значения и где его взять

### Поля-идентификаторы в BQL-фильтрах

При построении BQL-фильтров учитывай, что Relation-поля — это объекты, не строки:

| Поле API | Тип | Как фильтровать |
|----------|-----|-----------------|
| `parent` (проект) | Relation | `["parent.code", "==", "mcp-test"]` |
| `responsible` (исполнитель) | Relation | `["responsible.login", "==", "user@domain.ru"]` |
| `status` | Relation | `["status", "==", "open"]` (код статуса) |
| `epic` | Relation | `["epic", "IN", ["EPC-001"]]` |
| `lists` (спринты) | M2M | `["lists.code", "IN", ["SPR-001"]]` |
| `parent_task` | Relation | `["parent_task", "==", "DEV-000001"]` |
| `spectators` | GenericM2M | `["spectators", "IN", ["user@test.ru"]]` |
| `executors` | GenericM2M | `["executors", "IN", ["user@test.ru"]]` |

## Важно
- Не меняй сигнатуры публичных методов `EvaClient` без обновления соответствующих MCP-инструментов
- При добавлении нового инструмента: Zod-схема → регистрация в `ListToolsRequestSchema` → case в `CallToolRequestSchema`
- Не дублируй код форматирования — выноси в отдельную функцию-форматтер
- Комментарии в коде — на русском языке
- Все поля с датами могут быть null — всегда используй `?? "—"` для отображения
- **После `npm run build` напоминай пользователю перезапустить MCP-сервер** (в VS Code: `MCP: Restart Server` или через `mcp.json`). Без перезапуска сервер работает со старой скомпилированной версией — изменения не применятся и тесты будут неактуальны.
- Для тестирования используй только проект mcp-test https://rhsolutions.evateam.ru/project/Project/mcp-test#mcp-test