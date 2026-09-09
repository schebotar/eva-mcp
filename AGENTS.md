# eva-mcp — AGENTS.md

MCP-сервер для работы с системой управления проектами **EvaProject** (EvaTeam).
Позволяет AI-агенту получать описание задач, комментарии, обновлять поля,
работать со спринтами, требованиями, журналом работ и искать
проекты/пользователей.

Этот файл — инструкции для ИИ-агентов в открытом формате [AGENTS.md](https://agents.md/):
он читается из корня репозитория любым поддерживающим агентом (VS Code Copilot,
Claude Code, Codex, Cursor и др.). Детальные правила по слоям кода лежат во
вложенных файлах и применяются при правке соответствующих поддеревьев (ближайший
`AGENTS.md` к редактируемому файлу имеет приоритет):

- `src/AGENTS.md` — добавление API-методов в `EvaClient`, типов, JSON-RPC 2.2, BQL.
- `src/tools/AGENTS.md` — добавление и правка MCP-инструментов.

## Работа с EvaTeam через инструменты

Инструменты сервера (`get_task`, `search_tasks`, `update_task`, `search_sprints`,
`link_tasks`, `get_requirement`, `log_work` и другие) принимают и возвращают
**Markdown** — конвертация в HTML происходит внутри сервера. Если инструментов
eva-mcp в сессии нет — предложи подключить сервер (README репозитория), но не
ходи в JSON-RPC API напрямую.

Инстанс и токен сервер берёт из `EVA_URL` и `EVA_TOKEN`. Токен не выводи
ни в чат, ни в логи; при отладке проверяй только «задан / не задан».

### Типовые сценарии

- **«Что в спринте / как дела по проекту»** → `search_sprints` по проекту →
  взять открытый → `search_tasks` с фильтром `sprint` → сгруппировать по статусам.
- **«Сделай по задаче X»** → `get_task`: там сразу описание, треды комментариев
  и упомянутые задачи — это готовое ТЗ. При необходимости `get_linked_tasks`.
- **Перед `update_task`** со сменой исполнителя или статуса → `search_users`
  и `get_statuses(project)`: нужны логин и код, а не имя на глаз.
- **Списание времени** → `log_work`; история статусов → `get_task_history`.
- **Требования** → `get_requirement`, `search_requirements`; правка текста —
  `update_requirement` (уходит в черновик и публикуется).
- **Итоги в wiki** → `search_docs`, `get_doc`, `create_doc`, `update_doc`,
  если модуль wiki подключён в этой сборке сервера.

### Правила работы

- **Идентификаторы — коды, а не имена**: задачи `ABC-123`, спринты `SPR-XXXXXX`,
  документы `DOC-XXXXXX`, проекты — slug, пользователи — логин (email).
  `name` не уникален и идентификатором не является.
- **Закрытые спринты архивируются** вместе со своими задачами. Если у
  `search_sprints` и `search_tasks` есть параметр `include_archived`, без него
  закрытый спринт не найдётся, а состав его вернётся неполным — молча.
- **Перед записью уточняй у пользователя**, если задача или проект выбраны
  по догадке: `create_task`, `update_task`, `log_work` меняют живую систему.
- **Тестовые объекты** создавай только в тестовом проекте, помечай «можно
  удалить» и убирай за собой.
- **Не обходи сервер прямыми вызовами JSON-RPC API** — у EvaTeam хватает
  неочевидных ловушек (отказ приходит с HTTP 200 в поле `abort`, неизвестные
  kwargs игнорируются молча и сбрасывают `limit`, у `get` и `update` разные
  конвенции args/kwargs). Вместо этого добавь инструмент в eva-mcp — правила:
  `src/AGENTS.md` и `src/tools/AGENTS.md`.

## Разработка сервера

### Документация

При внесении любых изменений, добавлении новых инструментов или API-методов
**всегда сверяйся** с актуальной документацией EvaTeam:

- **Основная документация EvaTeam**: <https://docs.evateam.ru/docs/docs#eva-team/>
- **Документация API (интеграция и автоматизация)**: <https://docs.evateam.ru/docs/docs/DOC-000198#dokumentacziya-po-integraczii-i-avtomatizaczii>

Перед добавлением нового JSON-RPC метода или поля в `TaskUpdateFields` — проверь
документацию API на наличие этого метода/поля и его актуальную сигнатуру.

### Стек

- **Runtime**: Node.js (ESM, `"type": "module"`)
- **Язык**: TypeScript (strict mode, target ES2022, module NodeNext)
- **MCP SDK**: `@modelcontextprotocol/sdk` v1.x (stdio transport)
- **Валидация**: Zod v4
- **Конфигурация**: `dotenv` (.env файл)
- **Dev-запуск**: `tsx` (on-the-fly TypeScript execution)

### Команды

```bash
npm run dev      # Запуск через tsx (разработка)
npm run build    # Компиляция tsc → dist/
npm start        # Запуск скомпилированной версии
```

### Архитектура

```
src/
├── index.ts              # Точка входа: MCP-сервер, регистрация инструментов
├── eva-client.ts         # HTTP-клиент для JSON-RPC API EvaProject (класс EvaClient)
├── types.ts              # Все TypeScript-интерфейсы (TaskInfo, CommentInfo, BqlFilter, ...)
├── mappers.ts            # Мапперы сырых данных API → нормализованные (mapTask, mapProject, ...)
├── helpers/
│   ├── build-task-filter.ts  # Построение BQL-фильтров из аргументов инструментов
│   ├── comment-tree.ts       # Форматирование дерева комментариев
│   └── markdown.ts          # Конвертация HTML ↔ Markdown
├── tools/
│   ├── task.tools.ts     # get_task, search_tasks, count_tasks, update_task, create_task
│   ├── board.tools.ts    # get_sprint_board, get_my_tasks, identify_blockers
│   ├── sprint.tools.ts   # search_sprints, get_sprint, create_sprint, update_sprint
│   ├── linked.tools.ts   # get_linked_tasks, get_referencing_tasks, get_linked_tasks_batch
│   ├── worklog.tools.ts  # get_task_worklog, log_work
│   ├── user.tools.ts     # search_users, get_statuses
│   ├── project.tools.ts  # search_projects, get_project
│   └── ...
└── metrics/              # Scrum-метрики (burndown, velocity, cycle-time, cumulative-flow)
```

- **`index.ts`**: Инициализирует `Server` из MCP SDK, регистрирует инструменты.
- **`eva-client.ts`**: Класс `EvaClient` с приватным методом `call<T>()` для JSON-RPC 2.2 вызовов.
- **`mappers.ts`**: `mapTask`, `mapComment`, `mapProject`, `mapPerson`, `mapStatus`, `mapSprint`, `mapWorklog`, `mapHistoryEntry`.
- **`types.ts`**: Интерфейсы для сырых данных API (`EvaTaskRaw`, ...) и нормализованных (`TaskInfo`, ...), BQL-фильтры.

### Соглашения

#### Именование
- **Методы EvaClient**: `camelCase`, соответствуют названиям JSON-RPC методов (getTask, listTasks, ...)
- **MCP-инструменты**: `snake_case` (get_task, search_tasks, update_task, ...)
- **Zod-схемы**: `PascalCase` + `Schema` (GetTaskSchema, SearchTasksSchema, ...)
- **Форматтеры**: `formatTask`, `formatComments`, `formatTaskList`, ...
- **Мапперы**: `mapTask`, `mapComment`, `mapProject`, ... (приватные, внутри EvaClient)

#### Обработка ошибок
- При возникновении любых трудностей и ошибок **всегда сначала сверяйся** с документацией API EvaTeam, чтобы убедиться, что используемый метод/параметр актуален и корректен.
- HTTP 401 → понятное сообщение: «Проверьте EVA_TOKEN»
- JSON-RPC error → `EvaProject API: ошибка {code} — {message}`
- Zod validation error → автоматически возвращается как `invalid arguments`
- Все ошибки в `CallToolRequestSchema` handler оборачиваются: `{ isError: true, content: [{ type: "text", text: "Ошибка: ..." }] }`

#### Ответы инструментов
- Все ответы — Markdown (таблицы, заголовки, списки)
- Задачи форматируются таблицей: Код, Название, Статус, Приоритет, Исполнитель
- Комментарии — иерархическое дерево с отступами и префиксом `↳`
- Связанные задачи группируются по типу связи

#### BQL-фильтры
- Тип `BqlFilter = [string, BqlOperator, unknown] | ["OR", ...BqlFilter[]]`
- Хелпер `buildTaskFilter()` в `index.ts` строит фильтры из аргументов инструмента
- Для `linked_to` используется OR-фильтр: parent_task, depended_tasks, affected_tasks

#### Конфигурация
- `EVA_URL` и `EVA_TOKEN` — обязательные переменные окружения (.env или env vars)
- Сервер читает `.env` из рабочей папки **и** из корня пакета (см. `src/index.ts`) — запуск из любого места
- При отсутствии → `process.exit(1)` с сообщением об ошибке

### Идентификаторы сущностей

**Золотое правило**: `code` — основной human-friendly идентификатор для всех сущностей (уникален, readonly). `id` — всегда UUID (неудобен для humans). `name` — НЕ уникален, не используй как идентификатор.

#### Таблица идентификаторов

| Сущность | Канонический идентификатор | Формат | Пример | Где взять |
|----------|---------------------------|--------|--------|-----------|
| **Задача** | `code` | `ПРЕФИКС-НОМЕР` | `DEV-000003` | `search_tasks`, URL задачи |
| **Задача** | `id` (UUID) | `CmfTask:uuid` | — | API (избегай) |
| **Проект** | `code` | строчные буквы/дефисы | `mcp-test` | `search_projects`, URL `/project/Project/{code}` |
| **Спринт** | `code` | `SPR-НОМЕР` | `SPR-000001` | `search_sprints` |
| **Пользователь** | `login` | email | `user@domain.ru` | `search_users` (колонка **Логин**) |
| **Статус** | `code` | код статуса | взять из колонки **Код** в `get_statuses` | `get_statuses` |
| **Статус** | `id` (UUID) | `CmfStatus:uuid` | — | `get_statuses` (колонка **ID**) |
| **Комментарий** | `id` (UUID) | — | — | Только через `get_task` |
| **Вложение** | `id` (UUID) | — | — | Только через `get_task` / `get_attachments` |

#### Правила

- **Всегда предпочитай `code`** параметру `id` — `code` человекочитаем и уникален
- **Никогда не используй `name` как идентификатор** — `name` не уникален ни для одной сущности
- **Для фильтрации задач по исполнителю** используй `responsible` с **логином** (email из `search_users`)
- **Для фильтрации задач по проекту** используй `project` с **кодом проекта** (из `search_projects`)
- **Для указания спринта** используй `sprint` с **кодом спринта** (`SPR-...`)
- **Для статусов** передавай **код** статуса (из колонки Код в `get_statuses`), не ID
- **Для пользователей** передавай **логин** (email из колонки Логин в `search_users`)
- **При добавлении нового параметра-идентификатора** всегда указывай в description: тип (`Код задачи` / `Код проекта` / `Логин` / `UUID`), пример значения и где его взять

#### Поля-идентификаторы в BQL-фильтрах

При построении BQL-фильтров учитывай, что не все поля поддерживают вложенную фильтрацию:

| Поле API | Тип | Как фильтровать |
|----------|-----|-----------------|
| `parent_id` (проект) | UUID | `["parent_id", "==", "CmfProject:uuid"]` — ⚠️ требует UUID, резолвить через `getProject(code)` |
| `responsible` (исполнитель) | Relation | `["responsible.login", "==", "user@domain.ru"]` |
| `status` | Relation | `["status.code", "==", "open"]` (код статуса) |
| `epic` | Relation | `["epic", "IN", ["EPC-001"]]` |
| `lists` (спринты) | M2M | ✅ `["lists.code", "IN", [sprintCode]]` — работает. Используется в `search_tasks(sprint=...)` и board tools |
| `parent_task` | Relation | `["parent_task", "==", "DEV-000001"]` |
| `spectators` | GenericM2M | `["spectators", "IN", ["user@test.ru"]]` |
| `executors` | GenericM2M | `["executors", "IN", ["user@test.ru"]]` |
| `priority` | ChoiceInt | `["priority", "==", 4]` — ⚠️ API ожидает **число** (0-4), строки конвертируются через `mapPriority()` |

#### Приоритеты (ChoiceInt)

Приоритет в EvaProject — целочисленное поле. API ожидает числа, не строки.

| Число | Название | Строковый алиас |
|-------|----------|-----------------|
| 0 | Нет | `none`, `нет` |
| 1 | Низкий | `low`, `низкий` |
| 2 | Средний | `normal`, `средний`, `обычный`, `medium` |
| 3 | Высокий | `high`, `высокий` |
| 4 | Критичный | `critical`, `критичный`, `критический` |

**Конвертация** происходит в трёх местах:
1. `create_task` / `update_task` — в handler'ах через `mapPriority()`
2. `search_tasks` / `count_tasks` — в handler'ах перед `buildTaskFilter()`
3. **Отображение**: `priorityName` из `raw.priority_name`, при отсутствии — вычисляется из числа через `PRIORITY_NUM_TO_NAME` в `mappers.ts`

#### Статусы и проекты

`CmfStatus` — **глобальный справочник** без привязки к проекту. Поля `parent`/`parent_id` отсутствуют.

`getStatuses(projectCode)` пытается получить статусы проекта в три шага:
1. **Workflow**: проект → `workflow.code` → `CmfWorkflow.get` → извлечь `statuses`
2. **Задачи**: `CmfTask.list` по проекту → собрать уникальные статусы из `status`
3. **Глобально**: вернуть все статусы (фолбэк)

Проект имеет поле `workflow` (бизнес-процесс). Добавлены `workflowCode`/`workflowName` в `ProjectInfo`.

#### Поля TaskInfo

Актуальные поля нормализованной задачи:
- `statusCode` — код статуса (из `status.code`), приоритетнее `status` (UUID) для отображения
- `parentTaskCode` / `parentTaskName` — родительская задача (из `parent_task`)
- `priority` / `priorityName` — приоритет (число строкой / название)
- `lists` — спринты `[{ id, code, name }]`

## Важно
- Не меняй сигнатуры публичных методов `EvaClient` без обновления соответствующих MCP-инструментов
- При добавлении нового инструмента: Zod-схема → регистрация в `ListToolsRequestSchema` → case в `CallToolRequestSchema` (детали — в `src/tools/AGENTS.md`)
- Не дублируй код форматирования — выноси в отдельную функцию-форматтер
- Комментарии в коде — на русском языке
- Все поля с датами могут быть null — всегда используй `?? "—"` для отображения
- **После `npm run build` напоминай пользователю перезапустить MCP-сервер** (в VS Code: `MCP: Restart Server` или через `mcp.json`). Без перезапуска сервер работает со старой скомпилированной версией — изменения не применятся и тесты будут неактуальны.
- Для тестирования используй только проект mcp-test https://rhsolutions.evateam.ru/project/Project/mcp-test#mcp-test
