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
| `CmfTask.update` | Обновить задачу | `updateTask` |
| `CmfProject.get` | Получить проект | `getProject` |
| `CmfProject.list` | Список проектов | `listProjects` |
| `CmfPerson.list` | Список пользователей | `searchUsers` |
| `CmfStatus.list` | Список статусов | `getStatuses` |

## Соглашения

- Все поля дат/вложенных объектов могут быть `null`/`undefined` — защищайся через `??`
- Мапперы — приватные методы класса `EvaClient`
- Новые типы добавляются в `types.ts`, импортируются в `eva-client.ts`
- JSDoc-комментарии к публичным методам — на русском
- Методы API, возвращающие списки, типизируются как массив: `call<EvaTaskRaw[]>(...)`
- При добавлении нового метода — добавь соответствующий MCP-инструмент в `index.ts`
