---
description: "Use when: adding new API methods to EvaClient class in src/eva-client.ts, working with JSON-RPC 2.2 calls, adding new raw/normalized types in src/types.ts, or extending the BQL filter system."
applyTo: ["src/eva-client.ts", "src/types.ts"]
---

# Расширение EvaClient и типов API

## Добавление нового метода в EvaClient

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
export type BqlFilter = [string, BqlOperator, unknown] | ["OR", ...BqlFilter[]];
export type BqlOperator = "==" | "!=" | "ILIKE" | "NOT ILIKE" | "IN" | "NOT IN" | ">" | "<" | ">=" | "<=";
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

## BQL-фильтры — известные ограничения

### parent (проект) в задачах
- ❌ `["parent", "==", code]` — не работает
- ❌ `["parent.code", "==", code]` — "Недопустимый тип поля для вложенной фильтрации"
- ✅ `["parent_id", "==", projectId]` — работает, но требует UUID проекта

### lists (спринты) в задачах
- ❌ `["lists", "IN", [sprintCode]]` — не работает
- ❌ `["lists.code", "IN", [sprintCode]]` — не работает
- ✅ Клиентская фильтрация: `tasks.filter(t => t.lists.some(l => l.code === sprintCode))`

### Вывод
Для надёжной фильтрации по проекту/спринту используй клиентскую фильтрацию после получения задач.

## Соглашения

- Все поля дат/вложенных объектов могут быть `null`/`undefined` — защищайся через `??`
- Мапперы вынесены в `src/mappers.ts` как чистые функции
- Новые типы добавляются в `types.ts`, импортируются в `eva-client.ts`
- JSDoc-комментарии к публичным методам — на русском
- Методы API, возвращающие списки, типизируются как массив: `call<EvaTaskRaw[]>(...)`
- При добавлении нового метода — добавь соответствующий MCP-инструмент в `src/tools/`
- `{class}.create` всегда возвращает ID (строку). Для получения полного объекта используй `{class}.get({ id })`
- `{class}.get` по ID: `{ id }` в kwargs. По фильтру: `{ filter: [...], fields: [...] }`
