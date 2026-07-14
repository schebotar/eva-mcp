---
description: "Use when: adding, editing, or debugging MCP tools (get_task, search_tasks, update_task, etc.) in src/index.ts. Covers Zod schema definition, ListToolsRequestSchema registration, CallToolRequestSchema handler, and Markdown formatter patterns."
applyTo: "src/index.ts"
---

# Добавление MCP-инструментов

## Шаблон добавления нового инструмента

### 1. Zod-схема валидации

В верхней части `index.ts`, после импортов и создания `evaClient`:

```typescript
const NewToolSchema = z.object({
  param1: z.string().min(1, "param1 обязателен"),
  param2: z.string().optional(),
  // ...
});
```

Для необязательных полей используй `.optional()`. Для обязательных — `.min(1, "сообщение об ошибке")`.

### 2. Регистрация в ListToolsRequestSchema

Добавь объект в массив `tools` внутри `ListToolsRequestSchema` handler:

```typescript
{
  name: "new_tool",                              // snake_case
  description: "Описание на русском языке.",      // понятное описание для AI-агента
  inputSchema: {
    type: "object",
    properties: {
      param1: { type: "string", description: "Описание параметра" },
      param2: { type: "string", description: "..." },
    },
    required: ["param1"],                        // только обязательные поля
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}
```

**annotations:**
- `readOnlyHint: true` — инструмент только читает данные
- `destructiveHint: true` — инструмент изменяет данные (update_task)
- `idempotentHint: true` — повторный вызов с теми же параметрами даёт тот же результат

### 3. Обработчик в CallToolRequestSchema

Добавь `case` в `switch (name)`:

```typescript
case "new_tool": {
  const params = NewToolSchema.parse(args);
  const result = await evaClient.someMethod(params.param1, params.param2);
  return { content: [{ type: "text", text: formatResult(result) }] };
}
```

### 4. Функция-форматтер

Создай функцию форматирования результата в Markdown:

```typescript
function formatResult(data: SomeType): string {
  const lines: string[] = [
    `# Заголовок`,
    "",
    // ... Markdown-строки
  ];
  if (data.length === 0) {
    return "Данные не найдены.";
  }
  return lines.join("\n");
}
```

## Полный список существующих инструментов

| Инструмент | Схема | Метод EvaClient | Форматтер | readOnly |
|-----------|-------|-----------------|-----------|----------|
| `get_task` | `GetTaskSchema` | `getTaskWithComments` / `getTaskById` | `formatTask` + `formatComments` + `formatMentionedTasks` | ✅ |
| `search_tasks` | `SearchTasksSchema` | `listTasks` + `countTasks` | `formatTaskList` | ✅ |
| `count_tasks` | `CountTasksSchema` | `countTasks` | inline | ✅ |
| `update_task` | `UpdateTaskSchema` | `updateTask` | `formatTask` | ❌ |
| `get_project` | `GetProjectSchema` | `getProject` | `formatProject` | ✅ |
| `search_projects` | `SearchProjectsSchema` | `listProjects` | `formatProject` (повторно) | ✅ |
| `search_users` | `SearchUsersSchema` | `searchUsers` | `formatUsers` | ✅ |
| `get_linked_tasks` | `GetLinkedTasksSchema` | `getLinkedTasks` | `formatLinkedTasks` | ✅ |
| `get_referencing_tasks` | `GetReferencingTasksSchema` | `getReferencingTasks` | `formatReferencingTasks` | ✅ |
| `get_linked_tasks_batch` | `GetLinkedTasksBatchSchema` | `getLinkedTasksBatch` | `formatLinkedTasksBatch` | ✅ |
| `get_statuses` | — (нет полей) | `getStatuses` | `formatStatuses` | ✅ |

## Соглашения

- Имена инструментов: `snake_case`
- Описания: на русском, с примерами значений параметров
- Все ответы — Markdown (таблицы, заголовки, списки)
- При отсутствии данных — понятное сообщение («Задачи не найдены.», «Комментариев нет.»)
- Не меняй `annotations` у существующих инструментов без необходимости
- Новый инструмент должен быть задокументирован в `README.md` (таблица «Возможности»)
