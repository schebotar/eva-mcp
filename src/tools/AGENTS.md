# Правила MCP-инструментов (`src/tools/`) — AGENTS.md

Правила для добавления, правки и отладки MCP-инструментов (get_task, search_tasks,
update_task и др.). Распространяются на каталог `src/tools/`. Охватывают определение
Zod-схем, экспорт `toolDefs`, паттерн `handleToolCall` и Markdown-форматтеры.

Для API-слоя (EvaClient/типы/JSON-RPC/BQL) — см. `src/AGENTS.md`.

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

## Полный список инструментов (35)

В сборке 35 инструментов из 11 активных модулей (см. `ALL_TOOL_DEFS` в `src/index.ts`):

| Группа | Инструменты | Файл |
|--------|------------|------|
| Задачи | `get_task`, `search_tasks`, `count_tasks`, `update_task`, `create_task` | `task.tools.ts` |
| Спринты | `get_sprint`, `search_sprints`, `create_sprint` | `sprint.tools.ts` |
| Связи | `get_linked_tasks`, `get_referencing_tasks`, `get_linked_tasks_batch`, `link_tasks`, `unlink_tasks`, `list_relation_types`, `link_relation`, `unlink_relation` | `linked.tools.ts` |
| Журнал работ | `get_task_worklog`, `log_work` | `worklog.tools.ts` |
| История | `get_task_history` | `history.tools.ts` |
| Комментарии | `add_comment` | `comment.tools.ts` |
| Требования | `get_requirement`, `search_requirements`, `update_requirement` | `requirement.tools.ts` |
| Пользователи | `search_users`, `get_statuses` | `user.tools.ts` |
| Проекты | `get_project`, `search_projects` | `project.tools.ts` |
| Метрики | `get_burndown_data`, `get_velocity`, `get_cycle_time`, `get_cumulative_flow` | `metrics.tools.ts` |
| Отчёты | `get_sprint_review`, `get_sprint_retrospective`, `get_team_workload`, `get_project_health` | `reports.tools.ts` |

Не подключены в `src/index.ts` (код есть, сервер инструменты не отдаёт): `attachment.tools.ts`,
`follower.tools.ts`, `epic.tools.ts`; в `sprint.tools.ts`
закомментированы `update_sprint` и `delete_sprint`. Числа и причины — в корневом `AGENTS.md`,
раздел «Состояние сборки».

Модулей `board.tools.ts` и `backlog.tools.ts` в репозитории больше нет.

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
