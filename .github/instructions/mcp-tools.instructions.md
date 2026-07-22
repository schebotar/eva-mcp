---
description: "Use when: adding, editing, or debugging MCP tools (get_task, search_tasks, update_task, etc.). Covers Zod schema definition, toolDefs export, handleToolCall pattern, and Markdown formatter patterns."
applyTo: "src/tools/"
---

# Добавление MCP-инструментов

## Архитектура

Инструменты разнесены по доменам в `src/tools/`. Каждый файл:
- Экспортирует `xxxToolDefs` — массив определений для `ListToolsRequestSchema`
- Экспортирует `handleXxxToolCall(name, args, evaClient)` — обработчик для `CallToolRequestSchema`
- Содержит Zod-схемы и Markdown-форматтеры внутри файла

`src/index.ts` агрегирует все `toolDefs` и `handle*` вызовы в один массив.

## Шаблон нового инструмента

### 1. Zod-схема

```typescript
const NewToolSchema = z.object({
  param1: z.string().min(1, "param1 обязателен"),
  param2: z.string().optional(),
});
```

### 2. Определение в toolDefs

```typescript
export const newToolDefs = [
  {
    name: "new_tool",                              // snake_case
    description: "Описание на русском.",
    inputSchema: {
      type: "object" as const,
      properties: {
        param1: { type: "string", description: "Описание параметра" },
      },
      required: ["param1"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
];
```

### 3. Обработчик в handleToolCall

```typescript
export async function handleNewToolCall(
  name: string,
  args: unknown,
  evaClient: EvaClient
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean } | null> {
  if (name === "new_tool") {
    const params = NewToolSchema.parse(args);
    const result = await evaClient.someMethod(params.param1);
    return { content: [{ type: "text", text: formatResult(result) }] };
  }
  return null;  // не наш инструмент
}
```

### 4. Регистрация в index.ts

```typescript
import { newToolDefs, handleNewToolCall } from "./tools/new.tools.js";

// В ALL_TOOL_DEFS добавить: ...newToolDefs,
// В ALL_HANDLERS добавить: handleNewToolCall,
```

### 5. Форматтер

```typescript
function formatResult(data: SomeType): string {
  if (!data) return "Данные не найдены.";
  return `# Заголовок\n\n...`;
}
```

## Полный список инструментов (32)

| Группа | Инструменты | Файл |
|--------|------------|------|
| Задачи | `get_task`, `search_tasks`, `count_tasks`, `update_task`, `create_task` | `task.tools.ts` |
| Проекты | `get_project`, `search_projects` | `project.tools.ts` |
| Пользователи | `search_users`, `get_statuses` | `user.tools.ts` |
| Связи | `get_linked_tasks`, `get_referencing_tasks`, `get_linked_tasks_batch` | `linked.tools.ts` |
| Вложения | `get_attachments` | `attachment.tools.ts` |
| Журнал работ | `get_task_worklog`, `log_work` | `worklog.tools.ts` |
| Подписчики | `get_task_followers` | `follower.tools.ts` |
| История | `get_task_history` | `history.tools.ts` |
| Комментарии | `add_comment` | `comment.tools.ts` |
| Спринты | `get_sprint`, `search_sprints`, `create_sprint`, `update_sprint`, `delete_sprint` | `sprint.tools.ts` |
| Бэклог | `get_backlog`, `add_tasks_to_sprint`, `remove_tasks_from_sprint`, `move_tasks_to_sprint`, `get_sprint_summary` | `backlog.tools.ts` |
| Доски | `get_sprint_board`, `get_my_tasks`, `get_daily_standup`, `identify_blockers` | `board.tools.ts` |

## Соглашения

- Имена инструментов: `snake_case`
- Описания: на русском, с примерами значений параметров
- Все ответы — Markdown (таблицы, заголовки, списки)
- При отсутствии данных — понятное сообщение
- `handle*` возвращает `null` если инструмент не из этой группы
- Zod-схемы и форматтеры — приватные внутри файла (не экспортируются)
- Не меняй `annotations` у существующих инструментов без необходимости
- Новый инструмент должен быть задокументирован в `README.md` (таблица «Возможности»)

## Проверка inputSchema

При **любом** изменении параметров инструмента (добавление, удаление, переименование) — **обязательно** сверяй три места:

| # | Что | Где | Пример |
|---|-----|-----|--------|
| 1 | **Zod-схема** | `const XxxSchema = z.object({...})` | `linked_to: z.string().optional()` |
| 2 | **`inputSchema.properties`** | В `toolDefs`, объект `properties` | `linked_to: { type: "string", description: "..." }` |
| 3 | **`inputSchema.required`** | В `toolDefs`, массив `required` | `required: ["code"]` |

**Правило:** `properties` должен содержать **ровно те же ключи**, что и Zod-схема. `required` должен содержать **ровно те ключи**, у которых в Zod-схеме **нет** `.optional()`.

**Пример ошибки:** Добавили параметр в Zod-схему, но забыли добавить в `inputSchema.properties` → MCP-клиент не будет передавать этот параметр, хотя сервер его ожидает.

**Пример ошибки:** Убрали параметр из Zod-схемы, но оставили в `inputSchema.properties` → MCP-клиент будет передавать параметр, который сервер игнорирует.

При переносе логики параметра из одного места в другое (например, из `buildTaskFilter` в handler) — `inputSchema` и Zod-схема **не меняются**, если параметр по-прежнему принимается tool'ом.
