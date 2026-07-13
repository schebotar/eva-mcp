import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { EvaClient } from "./eva-client.js";
import type { TaskInfo, CommentInfo, ProjectInfo, PersonInfo, StatusInfo, LinkedTasksInfo, ReferencingTasksInfo, RelationInfo, BqlFilter } from "./types.js";
import { z } from "zod";

// --- Конфигурация из переменных окружения ---
const EVA_URL = process.env.EVA_URL;
const EVA_TOKEN = process.env.EVA_TOKEN;

if (!EVA_URL || !EVA_TOKEN) {
  console.error("Ошибка: EVA_URL и EVA_TOKEN должны быть заданы в .env файле или переменных окружения.");
  process.exit(1);
}

const evaClient = new EvaClient(EVA_URL, EVA_TOKEN);

// ── Zod-схемы валидации ────────────────────────────────────────

const GetTaskSchema = z.object({
  code: z.string().optional(),
  id: z.string().optional(),
}).refine((v) => v.code || v.id, "Укажите code или id");

const SearchTasksSchema = z.object({
  status: z.string().optional(),
  responsible: z.string().optional(),
  project: z.string().optional(),
  priority: z.string().optional(),
  type: z.string().optional(),
  query: z.string().optional(),
  linked_to: z.string().optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().min(0).optional(),
});

const CountTasksSchema = z.object({
  status: z.string().optional(),
  responsible: z.string().optional(),
  project: z.string().optional(),
  priority: z.string().optional(),
  type: z.string().optional(),
  query: z.string().optional(),
  linked_to: z.string().optional(),
});

const UpdateTaskSchema = z.object({
  code: z.string().min(1, "code обязателен"),
  status: z.string().optional(),
  responsible: z.string().optional(),
  priority: z.string().optional(),
  deadline: z.string().optional(),
  name: z.string().optional(),
  text: z.string().optional(),
  result_text: z.string().optional(),
  project: z.string().optional(),
  waiting_for: z.string().optional(),
  executors: z.array(z.string()).optional(),
  spectators: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  lists: z.array(z.string()).optional(),
  is_milestone: z.boolean().optional(),
  estimate_work: z.number().optional(),
  parent_task: z.string().optional(),
  epic: z.string().optional(),
  mark: z.string().optional(),
});

const GetProjectSchema = z.object({
  code: z.string().min(1, "code обязателен"),
});

const SearchProjectsSchema = z.object({
  query: z.string().optional(),
});

const SearchUsersSchema = z.object({
  query: z.string().min(1, "Укажите имя или логин для поиска"),
});

const GetLinkedTasksSchema = z.object({
  code: z.string().min(1, "code обязателен"),
});

const GetReferencingTasksSchema = z.object({
  code: z.string().min(1, "code обязателен"),
});

const GetLinkedTasksBatchSchema = z.object({
  codes: z.array(z.string().min(1)).min(1, "Укажите хотя бы один код").max(50, "Не более 50 кодов за раз"),
});

// --- Форматирование ---

function formatTask(task: TaskInfo): string {
  const lines: string[] = [
    `# ${task.code}: ${task.name}`,
    "",
    `| Поле | Значение |`,
    `|------|----------|`,
    `| **Код** | ${task.code} |`,
    `| **Название** | ${task.name} |`,
    `| **Статус** | ${task.statusName ?? "—"} (\`${task.status ?? "—"}\`) |`,
    `| **Приоритет** | ${task.priorityName ?? "—"} |`,
    `| **Тип** | ${task.typeName ?? "—"} |`,
    `| **Проект** | ${task.projectName ?? "—"} (\`${task.projectCode ?? "—"}\`) |`,
    `| **Автор** | ${task.authorName ?? task.author ?? "—"} |`,
    `| **Исполнитель** | ${task.responsibleName ?? task.responsible ?? "—"} |`,
    `| **Создана** | ${task.createdAt ?? "—"} |`,
    `| **Обновлена** | ${task.updatedAt ?? "—"} |`,
    "",
  ];

  if (task.text) {
    lines.push("## Описание", "", task.text, "");
  }

  return lines.join("\n");
}

function formatComments(comments: CommentInfo[]): string {
  if (comments.length === 0) {
    return "Комментариев нет.";
  }

  const lines: string[] = ["# Комментарии", ""];

  for (let i = 0; i < comments.length; i++) {
    const c = comments[i];
    const author = c.authorName ?? c.author ?? "Неизвестный";
    const date = c.createdAt ?? "—";
    lines.push(`### ${i + 1}. ${author} — ${date}`, "", c.text, "");
  }

  return lines.join("\n");
}

function formatTaskList(tasks: TaskInfo[], total?: number): string {
  if (tasks.length === 0) {
    return "Задачи не найдены.";
  }

  const header =
    total !== undefined
      ? `# Задачи (найдено: ${total}, показано: ${tasks.length})`
      : `# Задачи (${tasks.length})`;

  const lines: string[] = [
    header,
    "",
    "| Код | Название | Статус | Приоритет | Исполнитель |",
    "|-----|----------|--------|-----------|-------------|",
  ];

  for (const t of tasks) {
    const name = t.name.length > 60 ? t.name.slice(0, 57) + "..." : t.name;
    const prio = t.priorityName ?? "—";
    const resp = t.responsibleName ?? t.responsible ?? "—";
    lines.push(
      `| \`${t.code}\` | ${name} | ${t.statusName ?? "—"} | ${prio} | ${resp} |`
    );
  }

  return lines.join("\n");
}

function formatProject(project: ProjectInfo): string {
  const lines: string[] = [
    `# ${project.code}: ${project.name}`,
    "",
    `| Поле | Значение |`,
    `|------|----------|`,
    `| **Код** | ${project.code} |`,
    `| **Название** | ${project.name} |`,
    `| **Статус** | ${project.statusName ?? "—"} |`,
    `| **Создан** | ${project.createdAt ?? "—"} |`,
    `| **Обновлён** | ${project.updatedAt ?? "—"} |`,
    "",
  ];

  if (project.description) {
    lines.push("## Описание", "", project.description, "");
  }

  return lines.join("\n");
}

function formatUsers(users: PersonInfo[]): string {
  if (users.length === 0) {
    return "Пользователи не найдены.";
  }

  const lines: string[] = [
    `# Пользователи (${users.length})`,
    "",
    "| Логин | Имя | Фамилия | Email |",
    "|-------|-----|---------|-------|",
  ];

  for (const u of users) {
    const login = u.login || "—";
    const firstName = u.firstName ?? "—";
    const lastName = u.lastName ?? "—";
    const email = u.email ?? "—";
    lines.push(`| \`${login}\` | ${firstName} | ${lastName} | ${email} |`);
  }

  return lines.join("\n");
}

function formatStatuses(statuses: StatusInfo[]): string {
  if (statuses.length === 0) {
    return "Статусы не найдены.";
  }

  const lines: string[] = [
    `# Статусы (${statuses.length})`,
    "",
    "| ID | Название | Код | Тип |",
    "|----|----------|-----|-----|",
  ];

  for (const s of statuses) {
    lines.push(
      `| \`${s.id}\` | ${s.name} | \`${s.code ?? "—"}\` | ${s.type ?? "—"} |`
    );
  }

  return lines.join("\n");
}

function formatLinkedTasks(linked: LinkedTasksInfo): string {
  const parts: string[] = [];

  if (linked.parentTask) {
    parts.push(
      "## Родительская задача",
      "",
      `- \`${linked.parentTask.code}\` — ${linked.parentTask.name} (${linked.parentTask.statusName ?? "—"})`,
      ""
    );
  }

  if (linked.childTasks.length > 0) {
    parts.push("## Дочерние задачи", "");
    for (const t of linked.childTasks) {
      parts.push(
        `- \`${t.code}\` — ${t.name} (${t.statusName ?? "—"}) | ${t.responsibleName ?? "—"}`
      );
    }
    parts.push("");
  }

  if (linked.dependedTasks.length > 0) {
    parts.push("## Зависимые задачи (depended)", "");
    for (const t of linked.dependedTasks) {
      parts.push(
        `- \`${t.code}\` — ${t.name} (${t.statusName ?? "—"}) | ${t.responsibleName ?? "—"}`
      );
    }
    parts.push("");
  }

  if (linked.affectedTasks.length > 0) {
    parts.push("## Связанные задачи (affected)", "");
    for (const t of linked.affectedTasks) {
      parts.push(
        `- \`${t.code}\` — ${t.name} (${t.statusName ?? "—"}) | ${t.responsibleName ?? "—"}`
      );
    }
    parts.push("");
  }

  // Группируем precedesTasks по типу связи
  if (linked.precedesTasks.length > 0) {
    const grouped = new Map<string, RelationInfo[]>();
    for (const r of linked.precedesTasks) {
      const key = r.outTypeName ?? "Связь";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(r);
    }
    for (const [label, rels] of grouped) {
      parts.push(`## ${label}`, "");
      for (const r of rels) {
        parts.push(
          `- \`${r.inTask.code}\` — ${r.inTask.name}`
        );
      }
      parts.push("");
    }
  }

  if (linked.followsTasks.length > 0) {
    const grouped = new Map<string, RelationInfo[]>();
    for (const r of linked.followsTasks) {
      const key = r.inTypeName ?? "Связь";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(r);
    }
    for (const [label, rels] of grouped) {
      parts.push(`## ${label}`, "");
      for (const r of rels) {
        parts.push(
          `- \`${r.outTask.code}\` — ${r.outTask.name}`
        );
      }
      parts.push("");
    }
  }

  if (parts.length === 0) {
    return "Связанных задач нет.";
  }

  return parts.join("\n");
}

function formatReferencingTasks(refs: ReferencingTasksInfo): string {
  const parts: string[] = [];

  if (refs.tasksWithThisAsParent.length > 0) {
    parts.push("## Задачи, в которых эта задача — родительская", "");
    for (const t of refs.tasksWithThisAsParent) {
      parts.push(
        `- \`${t.code}\` — ${t.name} (${t.statusName ?? "—"}) | ${t.responsibleName ?? "—"}`
      );
    }
    parts.push("");
  }

  if (refs.tasksWithThisAsDepended.length > 0) {
    parts.push("## Задачи, которые зависят от этой (depended)", "");
    for (const t of refs.tasksWithThisAsDepended) {
      parts.push(
        `- \`${t.code}\` — ${t.name} (${t.statusName ?? "—"}) | ${t.responsibleName ?? "—"}`
      );
    }
    parts.push("");
  }

  if (refs.tasksWithThisAsAffected.length > 0) {
    parts.push("## Задачи, связанные с этой (affected)", "");
    for (const t of refs.tasksWithThisAsAffected) {
      parts.push(
        `- \`${t.code}\` — ${t.name} (${t.statusName ?? "—"}) | ${t.responsibleName ?? "—"}`
      );
    }
    parts.push("");
  }

  if (parts.length === 0) {
    return "Ни одна задача не ссылается на эту.";
  }

  return parts.join("\n");
}

function formatLinkedTasksBatch(
  batch: Record<string, LinkedTasksInfo>,
  codes: string[]
): string {
  const lines: string[] = [`# Связанные задачи (${codes.length} шт.)`, ""];

  for (const code of codes) {
    const linked = batch[code];
    lines.push(`## ${code}`, "");
    if (linked) {
      if (linked.parentTask) {
        lines.push(`- **Родительская**: \`${linked.parentTask.code}\` — ${linked.parentTask.name} (${linked.parentTask.statusName ?? "—"})`);
      }
      if (linked.childTasks.length > 0) {
        lines.push(`- **Дочерние**: ${linked.childTasks.map((t) => `\`${t.code}\``).join(", ")}`);
      }
      if (linked.dependedTasks.length > 0) {
        lines.push(`- **Зависимые**: ${linked.dependedTasks.map((t) => `\`${t.code}\``).join(", ")}`);
      }
      if (linked.affectedTasks.length > 0) {
        lines.push(`- **Связанные**: ${linked.affectedTasks.map((t) => `\`${t.code}\``).join(", ")}`);
      }
      if (linked.precedesTasks.length > 0) {
        const label = linked.precedesTasks[0].outTypeName ?? "Предшествует";
        lines.push(`- **${label}**: ${linked.precedesTasks.map((r) => `\`${r.inTask.code}\``).join(", ")}`);
      }
      if (linked.followsTasks.length > 0) {
        const label = linked.followsTasks[0].inTypeName ?? "Следует за";
        lines.push(`- **${label}**: ${linked.followsTasks.map((r) => `\`${r.outTask.code}\``).join(", ")}`);
      }
      const hasAny = linked.parentTask || linked.childTasks.length > 0 || linked.dependedTasks.length > 0 || linked.affectedTasks.length > 0 || linked.precedesTasks.length > 0 || linked.followsTasks.length > 0;
      if (!hasAny) {
        lines.push("- Связанных задач нет");
      }
    } else {
      lines.push("- ⚠️ Задача не найдена");
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatMentionedTasks(mentionedTasks: string[]): string {
  if (mentionedTasks.length === 0) return "";
  return [
    "",
    "## Упомянутые задачи",
    "",
    ...mentionedTasks.map((c) => `- \`${c}\``),
    "",
  ].join("\n");
}

// ── Хелперы для построения BQL-фильтров ─────────────────────────

function buildTaskFilter(args: Record<string, unknown> | undefined): BqlFilter[] {
  const filters: BqlFilter[] = [];
  if (!args) return filters;

  if (args.status) filters.push(["status", "==", args.status]);
  if (args.responsible) filters.push(["responsible", "==", args.responsible]);
  if (args.project) filters.push(["parent", "==", args.project]);
  if (args.priority) filters.push(["priority", "==", args.priority]);
  if (args.type) filters.push(["logic_type", "==", args.type]);
  if (args.query) filters.push(["name", "ILIKE", `%${args.query}%`]);
  if (args.linked_to) {
    // OR-фильтр: задача ссылается на linked_to как parent, depended или affected
    const code = args.linked_to as string;
    filters.push([
      "OR",
      ["parent_task", "==", code],
      ["depended_tasks", "IN", [code]],
      ["affected_tasks", "IN", [code]],
    ]);
  }

  return filters;
}

// --- MCP Server ---

const server = new Server(
  {
    name: "eva-mcp",
    version: "0.4.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ── Регистрируем список инструментов ────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_task",
      description:
        "Получить задачу из EvaProject по коду (например, DEV-000003) или ID. " +
        "Возвращает название, описание, статус, автора, исполнителя, проект, комментарии и коды упомянутых задач.",
      inputSchema: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "Код задачи в EvaProject, например DEV-000003",
          },
          id: {
            type: "string",
            description: "ID задачи (UUID). Используется если code не указан",
          },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    {
      name: "search_tasks",
      description:
        "Поиск задач по фильтрам. Можно фильтровать по статусу, исполнителю, проекту, " +
        "приоритету, типу и текстовому запросу. Возвращает список задач в виде таблицы.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", description: "Фильтр по статусу (ID статуса)" },
          responsible: { type: "string", description: "Фильтр по исполнителю (логин)" },
          project: { type: "string", description: "Фильтр по проекту (код проекта)" },
          priority: { type: "string", description: "Фильтр по приоритету (ID приоритета)" },
          type: { type: "string", description: "Фильтр по типу задачи (ID типа)" },
          query: { type: "string", description: "Текстовый поиск по названию задачи" },
          linked_to: { type: "string", description: "Найти задачи, которые ссылаются на указанную (код задачи)" },
          limit: { type: "number", description: "Максимальное количество результатов" },
          offset: { type: "number", description: "Смещение для пагинации" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    {
      name: "count_tasks",
      description:
        "Подсчитать количество задач по фильтрам (те же фильтры, что у search_tasks).",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", description: "Фильтр по статусу (ID статуса)" },
          responsible: { type: "string", description: "Фильтр по исполнителю (логин)" },
          project: { type: "string", description: "Фильтр по проекту (код проекта)" },
          priority: { type: "string", description: "Фильтр по приоритету (ID приоритета)" },
          type: { type: "string", description: "Фильтр по типу задачи (ID типа)" },
          query: { type: "string", description: "Текстовый поиск по названию задачи" },
          linked_to: { type: "string", description: "Найти задачи, которые ссылаются на указанную (код задачи)" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    {
      name: "update_task",
      description:
        "Обновить поля задачи по её коду. Можно менять статус, исполнителя, приоритет, " +
        "дедлайн, название, описание, проект, результат, ожидание ответа (waiting_for), " +
        "соисполнителей, наблюдателей, теги, списки (спринты), веху, родительскую задачу, эпик и оценку.",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string", description: "Код задачи (обязательный)" },
          status: { type: "string", description: "Новый статус (ID статуса)" },
          responsible: { type: "string", description: "Новый исполнитель (логин)" },
          priority: { type: "string", description: "Новый приоритет (ID приоритета)" },
          deadline: { type: "string", description: "Крайний срок (ISO-дата, например 2026-07-15)" },
          name: { type: "string", description: "Новое название задачи" },
          text: { type: "string", description: "Новое описание (Markdown)" },
          result_text: { type: "string", description: "Текст результата" },
          project: { type: "string", description: "Перенести в проект (код проекта)" },
          waiting_for: { type: "string", description: "Ожидает ответа от (логин пользователя)" },
          executors: {
            type: "array", items: { type: "string" },
            description: "Соисполнители (логины пользователей)",
          },
          spectators: {
            type: "array", items: { type: "string" },
            description: "Наблюдатели (логины пользователей)",
          },
          tags: {
            type: "array", items: { type: "string" },
            description: "Теги (названия или ID тегов)",
          },
          lists: {
            type: "array", items: { type: "string" },
            description: "Списки/спринты (ID списков)",
          },
          is_milestone: { type: "boolean", description: "Отметить как веху (Milestone)" },
          estimate_work: { type: "number", description: "Исходная оценка в часах" },
          parent_task: { type: "string", description: "Родительская задача (код)" },
          epic: { type: "string", description: "Epic (код задачи-эпика)" },
          mark: { type: "string", description: "Оценка" },
        },
        required: ["code"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    {
      name: "get_project",
      description:
        "Получить информацию о проекте по его коду.",
      inputSchema: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "Код проекта в EvaProject",
          },
        },
        required: ["code"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    {
      name: "search_projects",
      description:
        "Поиск проектов по названию.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Текстовый поиск по названию проекта" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    {
      name: "search_users",
      description:
        "Поиск пользователей по имени или логину.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Текстовый поиск по имени или логину" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    {
      name: "get_linked_tasks",
      description:
        "Получить все задачи, связанные с указанной задачей: родительскую, дочерние, " +
        "зависимые (depended) и связанные (affected). Для нескольких задач эффективнее использовать get_linked_tasks_batch.",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string", description: "Код задачи, например DEV-000003" },
        },
        required: ["code"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    {
      name: "get_referencing_tasks",
      description:
        "Обратный поиск связей: найти задачи, которые ссылаются на указанную (в полях " +
        "родительская, depended, affected). Результат сгруппирован по типу связи. " +
        "Для комбинирования с другими фильтрами используйте search_tasks с параметром linked_to.",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string", description: "Код задачи, например MSR-903" },
        },
        required: ["code"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    {
      name: "get_linked_tasks_batch",
      description:
        "Батчевый вариант get_linked_tasks: получить связи для нескольких задач за один вызов. " +
        "Принимает до 50 кодов задач.",
      inputSchema: {
        type: "object",
        properties: {
          codes: {
            type: "array",
            items: { type: "string" },
            description: "Коды задач, например [\"DEV-001\", \"DEV-002\"]",
          },
        },
        required: ["codes"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    {
      name: "get_statuses",
      description:
        "Получить справочник всех статусов задач с их ID и названиями. " +
        "Полезно перед вызовом update_task, чтобы узнать ID нужного статуса.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
  ],
}));

// Обработчик вызовов инструментов
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "get_task": {
        const { code, id } = GetTaskSchema.parse(args);
        if (code) {
          const { task, comments, mentionedTasks } = await evaClient.getTaskWithComments(code);
          const text = formatTask(task) + "\n---\n\n" + formatComments(comments) + formatMentionedTasks(mentionedTasks);
          return { content: [{ type: "text", text }] };
        }
        // Поиск по ID — без комментариев
        const task = await evaClient.getTaskById(id!);
        return { content: [{ type: "text", text: formatTask(task) }] };
      }

      case "search_tasks": {
        const params = SearchTasksSchema.parse(args);
        const filters = buildTaskFilter(params as Record<string, unknown>);
        const slice: [number, number] | undefined =
          params.limit !== undefined ? [params.offset ?? 0, params.limit] : undefined;

        const tasks = await evaClient.listTasks({
          filter: filters.length > 0 ? filters : undefined,
          slice,
        });

        const total = filters.length > 0
          ? await evaClient.countTasks(filters)
          : undefined;

        return { content: [{ type: "text", text: formatTaskList(tasks, total) }] };
      }

      case "count_tasks": {
        const params = CountTasksSchema.parse(args);
        const filters = buildTaskFilter(params as Record<string, unknown>);
        const count = await evaClient.countTasks(
          filters.length > 0 ? filters : undefined
        );
        return { content: [{ type: "text", text: `Найдено задач: **${count}**` }] };
      }

      case "update_task": {
        const { code, ...rest } = UpdateTaskSchema.parse(args);

        const fields: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(rest)) {
          if (value !== undefined && value !== null) {
            fields[key] = value;
          }
        }

        if (Object.keys(fields).length === 0) {
          throw new Error("Не указаны поля для обновления");
        }

        const task = await evaClient.updateTask(code, fields);
        return { content: [{ type: "text", text: "✅ Задача обновлена.\n\n" + formatTask(task) }] };
      }

      case "get_project": {
        const { code } = GetProjectSchema.parse(args);
        const project = await evaClient.getProject(code);
        return { content: [{ type: "text", text: formatProject(project) }] };
      }

      case "search_projects": {
        const { query } = SearchProjectsSchema.parse(args);
        const filters: BqlFilter[] = query ? [["name", "ILIKE", `%${query}%`]] : [];
        const projects = await evaClient.listProjects(
          filters.length > 0 ? filters : undefined
        );
        if (projects.length === 0) {
          return { content: [{ type: "text", text: "Проекты не найдены." }] };
        }
        const lines: string[] = [
          `# Проекты (${projects.length})`,
          "",
          "| Код | Название | Статус |",
          "|-----|----------|--------|",
        ];
        for (const p of projects) {
          lines.push(`| \`${p.code}\` | ${p.name} | ${p.statusName ?? "—"} |`);
        }
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      case "search_users": {
        const { query } = SearchUsersSchema.parse(args);
        const users = await evaClient.searchUsers(query);
        return { content: [{ type: "text", text: formatUsers(users) }] };
      }

      case "get_linked_tasks": {
        const { code } = GetLinkedTasksSchema.parse(args);
        const linked = await evaClient.getLinkedTasks(code);
        return { content: [{ type: "text", text: formatLinkedTasks(linked) }] };
      }

      case "get_referencing_tasks": {
        const { code } = GetReferencingTasksSchema.parse(args);
        const refs = await evaClient.getReferencingTasks(code);
        return { content: [{ type: "text", text: formatReferencingTasks(refs) }] };
      }

      case "get_linked_tasks_batch": {
        const { codes } = GetLinkedTasksBatchSchema.parse(args);
        const batch = await evaClient.getLinkedTasksBatch(codes);
        return { content: [{ type: "text", text: formatLinkedTasksBatch(batch, codes) }] };
      }

      case "get_statuses": {
        const statuses = await evaClient.getStatuses();
        return { content: [{ type: "text", text: formatStatuses(statuses) }] };
      }

      default:
        throw new Error(`Неизвестный инструмент: ${name}`);
    }
  } catch (error) {
    // Zod-ошибки валидации
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((i) => `• ${i.path.join(".")}: ${i.message}`);
      return {
        content: [{ type: "text", text: `❌ Ошибка валидации:\n${issues.join("\n")}` }],
        isError: true,
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `❌ Ошибка: ${message}` }],
      isError: true,
    };
  }
});

// Запуск
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Логгируем в stderr, чтобы не мешать stdio-протоколу
  console.error(`eva-mcp запущен. EvaProject URL: ${EVA_URL}`);
}

main().catch((err) => {
  console.error("Критическая ошибка при запуске:", err);
  process.exit(1);
});
