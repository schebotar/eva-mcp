# Правила слоя API (`src/`) — AGENTS.md

Правила для работы с **API-слоем** сервера: класс `EvaClient` (`src/eva-client.ts`),
типы (`src/types.ts`), мапперы (`src/mappers.ts`), JSON-RPC 2.2 вызовы и BQL-фильтры.
Используй при добавлении новых API-методов, raw/normalized-типов или расширении BQL.

Для MCP-инструментов (обвязка над API-слоем) — см. `src/tools/AGENTS.md`.

## Источники

- Официальная документация (сайт — SPA: WebFetch и curl видят пустую оболочку, читать
  только браузером): [начало работы](https://docs.evateam.ru/docs/DOC-000200),
  [правила работы с API](https://docs.evateam.ru/docs/DOC-000201),
  [доп. опции запросов](https://docs.evateam.ru/docs/DOC-000695),
  [справочник методов](https://docs.evateam.ru/docs/DOC-000202),
  [примеры запросов](https://docs.evateam.ru/docs/DOC-000244).
- OpenAPI-спецификация v1.9.22, 69 эндпоинтов:
  [`docs/oas_evateam_v1_9_22.json`](../docs/oas_evateam_v1_9_22.json). Две оговорки:
  в `servers` захардкожен тестовый стенд — это пример, реальный адрес берётся из
  `EVA_URL`; пути вида `/api/?m=CmfTask.create` — способ адресовать описание метода,
  а не требование к вызову: клиент всегда шлёт `POST /api/` с `method` в теле.
- Ловушки ниже собраны на живом инстансе; там, где они расходятся с документацией,
  верны они.

Эндпоинт один: `POST {EVA_URL}/api/`, заголовки `Content-Type: application/json`
и `Authorization: Bearer <EVA_TOKEN>`. HTTP-коды: 200 — успех, 401 — не авторизован,
500 — внутренняя ошибка.

## Расширение EvaClient и типов API

### 1. Добавить типы в `src/types.ts`

Если API возвращает новый тип данных:

```typescript
// Сырые данные из API
export interface EvaNewEntityRaw {
  id: string;
  name: string;
  // ...
}

// Нормализованные данные
export interface NewEntityInfo {
  id: string;
  name: string;
  // ...
}
```

### 2. Добавить метод в `EvaClient` (`src/eva-client.ts`)

Шаблон публичного метода:

```typescript
/** Описание метода на русском */
async getNewEntity(code: string): Promise<NewEntityInfo> {
  const raw = await this.call<EvaNewEntityRaw>("CmfNewEntity.get", {
    filter: ["code", "==", code],
    fields: ["**"],
  });
  return this.mapNewEntity(raw);
}
```

### 3. Добавить приватный маппер

```typescript
private mapNewEntity(raw: EvaNewEntityRaw): NewEntityInfo {
  return {
    id: raw.id,
    name: raw.name,
    // ...
  };
}
```

## Паттерн JSON-RPC вызовов

Все вызовы к EvaProject API идут через приватный метод `call<T>()`:

```typescript
private async call<T>(
  method: string,                              // e.g. "CmfTask.get"
  kwargs: Record<string, unknown>,             // параметры метода
  topLevel?: { filter?: BqlFilter | BqlFilter[]; args?: unknown[] }
): Promise<T>
```

- `kwargs` — параметры JSON-RPC метода (filter, fields, slice, ...)
- `topLevel.args` — позиционные аргументы (используется в `updateTask` для передачи ID)
- `topLevel.filter` — альтернативный способ передать filter на верхнем уровне

### Формат ответа

Успешный ответ: `{ jsonrpc, result, meta, callid, profiler_data, alert, abort, ... }`.
Транспортная ошибка: `{ error: { code, message } }` — `-32601` метод не найден,
`-32001` ошибка выполнения, в `message` приходит traceback сервера.

Два поля в ответе легко принять за шум, но они значимы:

- **`abort`** — отказ бизнес-валидации. Приходит с HTTP 200 и `result: null`,
  в `error` такие отказы не попадают. Разбор — в «Важные нюансы API» ниже.
- **`alert`** — служебные предупреждения. Если в запросе нет `callid`, там всегда
  лежит `["API: No callid specified"]`; на результат это не влияет.

Полезные kwargs: `no_meta: true` (убрать из ответа большой блок `meta`), `limit`,
`slice`, `include_archived: "true"`.

### Шаблоны вызовов

**Получение одной сущности по фильтру:**
```typescript
const raw = await this.call<EvaTaskRaw>("CmfTask.get", {
  filter: ["code", "==", code],
  fields: ["**"],
});
```

**Получение списка:**
```typescript
const result = await this.call<EvaTaskRaw[]>("CmfTask.list", {
  fields: ["**"],
  filter: myFilter,    // опционально
  slice: [0, 50],      // опционально
});
```

**Вызов с позиционными аргументами:**
```typescript
const raw = await this.call<EvaTaskRaw>(
  "CmfTask.update",
  { name: "Новое название", status: "3" },
  { args: [taskId] }
);
```

## BQL-фильтры

Тип в `types.ts`:
```typescript
export type BqlFilter = [string, BqlOperator, unknown] | ["OR", ...BqlFilter[]] | ["AND", ...BqlFilter[]];
export type BqlOperator = "==" | "!=" | "LIKE" | "NOT LIKE" | "ILIKE" | "NOT ILIKE" | "IN" | "NOT IN" | ">" | "<" | ">=" | "<=";
```

Примеры:
```typescript
// Простой фильтр
["status", "==", "3"]

// Поиск подстроки
["name", "ILIKE", "%поиск%"]

// IN с массивом
["code", "IN", ["DEV-001", "DEV-002"]]

// OR-группа
["OR",
  ["status", "==", "1"],
  ["status", "==", "2"],
]
```

## Существующие JSON-RPC методы EvaProject

| Метод | Назначение | Метод EvaClient |
|-------|-----------|-----------------|
| `CmfTask.get` | Получить задачу | `getTask`, `getTaskWithComments`, `getTaskById` |
| `CmfTask.list` | Список задач | `listTasks` |
| `CmfTask.count` | Количество задач | `countTasks` |
| `CmfTask.create` | Создать задачу | `createTask` |
| `CmfTask.update` | Обновить задачу | `updateTask` |
| `CmfComment.create` | Добавить комментарий | `addComment` |
| `CmfTask.timetracker_change_time` | Списать время | `logWork` |
| `CmfProject.get` | Получить проект | `getProject` |
| `CmfProject.list` | Список проектов | `listProjects` |
| `CmfPerson.list` | Список пользователей | `searchUsers` |
| `CmfStatus.list` | Список статусов | `getStatuses` |
| `CmfList.get` | Получить спринт/список | `getSprint` |
| `CmfList.list` | Список спринтов | `listSprints` |
| `CmfList.create` | Создать спринт | `createSprint` |
| `CmfList.update` | Обновить спринт | `updateSprint` |
| `CmfList.delete` | Удалить спринт | `deleteSprint` |
| `CmfList.count` | Количество спринтов | `countSprints` |
| `CmfFolder.list` | Список папок | `findSprintsFolderId` |
| `CmfTimeTrackerHistory.list` | Журнал работ | `getWorklog` |
| `CmfStatusHistory.list` | История статусов | `getTaskHistory` |
| `CmfWorkflow.get` | Получить бизнес-процесс | Используется в `getStatuses(projectCode)` |

## Важные нюансы API

### Отказ валидации приходит в `abort`, а не в `error`

Ошибку бизнес-валидации EvaProject отдаёт как **HTTP 200 с `result: null`**, а причину
кладёт в поле `abort` ответа: при успехе там `null`, при отказе — строка с текстом.
В `error` такие отказы не попадают, у ответов с отказом есть ещё ключ `exception_types`.

`call<T>()` считает непустой `abort` ошибкой и бросает исключение вида
`EvaProject API: <метод> отклонён — <текст abort>`. Без этой проверки неудачная запись
выглядела бы как успешный пустой ответ: например, `CmfTask.create` с `project_id`
вместо `project` возвращает `abort: "Это служебное поле, для присвоения ид используйте
project"` и не создаёт задачу.

Порог именно «непустая строка», а не «пустой `result`»: пустая выборка — обычный
результат, ошибкой её считать нельзя.

### Приоритет (ChoiceInt)

Поле `priority` в задачах — целочисленное (`ChoiceInt`). API ожидает **число** (0-4), не строку.
Передача `"high"` вместо `3` вызывает `pg: invalid input syntax for type integer`.

Конвертация строк → чисел: `mapPriority()` в `task.tools.ts` (экспортируется через `PRIORITY_MAP`).
Обратный маппинг (число → название): `PRIORITY_NUM_TO_NAME` в `mappers.ts`.

### Статусы (CmfStatus)

`CmfStatus` — **глобальный справочник**, не привязан к проекту/workflow.
- Нет полей `parent`, `parent_id`, `project`
- `CmfStatus.list` не поддерживает фильтрацию по проекту
- Для получения статусов проекта используется трёхуровневый подход: workflow → задачи → глобально

### Workflow проекта

Проект имеет поле `workflow: { code, name }` — бизнес-процесс.
Доступен через `CmfProject.get` с `fields: ["**"]` (входит в `**`).
Добавлен в `EvaProjectRaw` и `ProjectInfo` как `workflowCode`/`workflowName`.

### Журнал работ (CmfTimeTrackerHistory)

Фильтр: `["parent", "==", taskId]` где `taskId` — полный ID задачи (`CmfTask:uuid`).
Рекомендуется `no_meta: true` для консистентности с другими list-вызовами.
Поле `parent` подтверждено документацией API (KB-000187).

### Спринты в BQL

`["lists.code", "IN", [sprintCode]]` — **работает** в `CmfTask.list`.
Фильтр собирается в `buildTaskFilter()` (`src/helpers/build-task-filter.ts`) и приходит
из `search_tasks`/`count_tasks` с параметром `sprint`.

### Неизвестные kwargs игнорируются молча

Опечатка в имени kwarg не вызывает ошибки — параметр просто отбрасывается. Хуже, что
вместе с ним может слететь `limit`: один такой запрос вернул все ~13 700 задач инстанса.
Новый kwarg проверяй на заведомо маленькой выборке (`slice: [0, 3]`).

### Конвенции args/kwargs разнятся по методам

| Метод | Где передавать объект |
|-------|----------------------|
| `get` | только kwargs: `{ id }`, `{ code }` или `{ filter }`. Позиционные `args` **игнорируются** — вернётся первый попавшийся объект |
| `list` / `count` | kwargs: `filter`, `fields`, `limit`, `slice` |
| `create` | kwargs со значениями; возвращает **строку-ID**, а не объект |
| `update` | id в `args[0]`, значения — в kwargs (документация допускает и `filter` на верхнем уровне) |
| `delete`, `do_publish` | id (не код!) в `args[0]` |

### Тяжёлый `list` без фильтра → 502

Подтверждено на `CmfComment` (глобальный список не отвечает) и `CmfDocument` (4301
документ на инстансе). Любой `list` — только с фильтром и/или срезом. Комментарии задачи
дешевле брать через `CmfTask.get` с `fields: ["comments.*"]`.

### `CmfTask.create`: проект — в kwarg `project`

`project_id` — служебное поле, с ним объект молча не создастся (сервер отвечает отказом
в `abort`). Описание задачи — в `text` (HTML). Коды списков в `create` работают:
`lists: ["SPR-000006"]` создаст задачу сразу в спринте. `CmfComment.create` при этом
принимает обычный `parent_id`.

### EvaWiki: текст только через `text_draft` + `do_publish`

Прямая запись в `text` отклоняется отказом в `abort`. Создание страницы: `create`
с kwargs `{ project, parent, name, text_draft }`, затем `CmfDocument.do_publish` с id
в `args[0]`. **Без `parent` документ уходит в личное пространство пользователя**, а не
в wiki проекта. `text` бывает в сотни КБ — не тяни его в списочных запросах.

### `_acl_fields` / `_acl_obj` — права токена

`deny` означает «поле или действие недоступно этому токену» — это норма, а не сбой API.
Скрытые поля приходят пустыми: например, у спринта из чужого проекта не читаются `code`
и `name`, поэтому списочные методы отбрасывают записи без `code`.

### Мелочи, на которых легко ошибиться

- Тексты (`text`, `description`) везде HTML: на запись `mdToHtml()`, на чтение
  `htmlToMd()` из `src/helpers/markdown.ts`.
- Даты: в ответах ISO 8601 с таймзоной, в фильтрах — `Y-m-d`.
- Строковые BQL-выражения (`"a=='b'"`) не поддерживаются — только массивы.

## CmfList — Спринты/списки

### Модель CmfList

Наследование: `CmfModel → CmfEntity → CmfActiveEntity → CmfList`

Ключевые поля:
- `sys_type` — "release", "sprint", "список" (не влияет на префикс кода)
- `logic_type` — определяет префикс кода: `list.agile_sprint:default` → SPR-префикс
- `workflow` — бизнес-процесс (обычно `default.system:default`)
- `scheme_wf` — схема БП (обычно `softdev:default`)
- `list_type` — вид по умолчанию
- `is_default_list` — список по умолчанию для новых задач
- `plan_start_date` / `plan_end_date` — даты начала/окончания (НЕ `start_date`/`end_date`!)

### Создание спринта через API

**Обязательные поля** (для корректного отображения в UI):
```typescript
{
  name: "Название спринта",
  parent_id: "CmfProject:uuid",           // ID проекта (не код!)
  tree_parent_id: "CmfFolder:uuid",       // ID папки Sprints в дереве проекта
  logic_type: "list.agile_sprint:default",
  executors: [],
  spectators: [],
}
```

**Опционально:**
- `code` — код спринта (автогенерация если не указан)
- `plan_start_date` / `plan_end_date` — даты (ISO)
- `activity` — вид деятельности (ID)

**Поиск папки Sprints:**
```typescript
const folders = await this.call<Array<{ id: string }>>(
  "CmfFolder.list",
  {
    filter: [["parent_id", "==", projectId], ["code", "ILIKE", "%SPRINT%"]],
    fields: ["id"],
  }
);
```

### Получение спринта

- `CmfList.get` по коду: `{ filter: ["code", "==", code], fields: ["**"] }`
- `CmfList.get` по ID: `{ id }` (ID в kwargs, не в filter!)
- `CmfList.create` возвращает **ID (строка)**, не объект
- `CmfList.delete` требует ID в `args`

### Даты в спринтах

⚠️ Поля называются `plan_start_date` / `plan_end_date`, а не `start_date` / `end_date`.

### Архив и счётчики задач (проверено на живом инстансе)

Закрытый спринт архивируется (`cmf_archived: true`) и пропадает из `CmfList.list`
и `CmfList.count`; вернуть его в выдачу можно kwarg `include_archived: "true"`
(строка!). На инстансе разница ощутимая: 217 спринтов против 1114.
`CmfList.get` по коду отдаёт архивные спринты и без этого флага.

Вместе со спринтом архивируются и его задачи, поэтому состав закрытого спринта
через `CmfTask.list` / `CmfTask.count` тоже нужно запрашивать с `include_archived`.

`fields: ["**"]` возвращает счётчики `count_tasks_open`, `count_tasks_in_progress`,
`count_tasks_in_review`, `count_tasks_closed` — отдельно их перечислять не нужно.
Насколько им можно верить:

- **живой спринт** — счётчики совпадают с фактическим составом (проверено на выборке);
- **архивный спринт** — обновляться перестают: сумма обычно верна, а разбивка по
  статусам остаётся снимком на момент архивации и с текущими статусами задач
  расходится.

Права: если у токена нет доступа к проекту спринта, ACL прячет даже `code` и `name` —
в объекте остаются только `id`, `class_name`, `cache_status_type` и `_acl_*`.
Поэтому `listSprints` отбрасывает записи без `code`.

## BQL-фильтры — известные ограничения

### parent (проект) в задачах
- ❌ `["parent", "==", code]` — не работает
- ⚠️ `["parent.code", "==", code]` — может работать на новых версиях API (требуется тестирование)
- ✅ `["parent_id", "==", projectId]` — работает, но требует UUID проекта

### lists (спринты) в задачах
- ❌ `["lists", "IN", [sprintCode]]` — не работает: m2m по коду не разрешается
- ✅ `["lists", "IN", ["CmfList:<uuid>"]]` — работает по полному ID
- ✅ `["lists.code", "IN", [sprintCode]]` — **работает**, см. «Спринты в BQL» выше

### Вывод
Фильтруй через путь с `.code` или по полному ID (`Класс:uuid`). Клиентская фильтрация —
запасной вариант для полей, где серверный фильтр не разрешён.

## Соглашения

- Все поля дат/вложенных объектов могут быть `null`/`undefined` — защищайся через `??`
- Мапперы вынесены в `src/mappers.ts` как чистые функции
- Новые типы добавляются в `types.ts`, импортируются в `eva-client.ts`
- JSDoc-комментарии к публичным методам — на русском
- Методы API, возвращающие списки, типизируются как массив: `call<EvaTaskRaw[]>(...)`
- При добавлении нового метода — добавь соответствующий MCP-инструмент в `src/tools/`

## Правила для параметров-идентификаторов

При добавлении нового параметра в Zod-схему и inputSchema, который принимает идентификатор сущности:

1. **Всегда указывай тип идентификатора жирным** в description: `**Код задачи**`, `**Код проекта**`, `**Логин**`, `**UUID**`
2. **Всегда указывай пример** в том же формате: `(например DEV-000003)`
3. **Всегда указывай где взять**: `— возьми из search_users`, `— возьми из get_statuses`
4. **Используй канонический идентификатор** из таблицы в корневом `AGENTS.md`

### Шаблон description

```
"Что делает параметр. **Тип** — возьми из `инструмент` (например `пример`)"
```

### Примеры

| Параметр | Правильное описание |
|----------|-------------------|
| Код задачи | `"**Код задачи** (например `DEV-000003`)"` |
| Код проекта | `"**Код проекта** — возьми из `search_projects`"` |
| Логин пользователя | `"**Логин** пользователя (email) — возьми из `search_users`"` |
| Код статуса | `"**Код** статуса — возьми из `get_statuses` (например `open`)"` |
| Код спринта | `"**Код спринта** (например `SPR-000001`)"` |
- `{class}.create` всегда возвращает ID (строку). Для получения полного объекта используй `{class}.get({ id })`
- `{class}.get` по ID: `{ id }` в kwargs. По фильтру: `{ filter: [...], fields: [...] }`
