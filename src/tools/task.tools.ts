import { z } from "zod";
import type { EvaClient } from "../eva-client.js";
import type { TaskInfo } from "../types.js";
import { buildTaskFilter } from "../helpers/build-task-filter.js";
import { formatComments } from "../helpers/comment-tree.js";

// ── Zod-схемы ──────────────────────────────────────────────────

export const GetTaskSchema = z.object({
  code: z.string().optional(),
  id: z.string().optional(),
}).refine((v) => v.code || v.id, "Укажите code или id");

export const SearchTasksSchema = z.object({
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

export const CountTasksSchema = z.object({
  status: z.string().optional(),
  responsible: z.string().optional(),
  project: z.string().optional(),
  priority: z.string().optional(),
  type: z.string().optional(),
  query: z.string().optional(),
  linked_to: z.string().optional(),
});

export const UpdateTaskSchema = z.object({
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

// ── Форматтеры ─────────────────────────────────────────────────

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
  ];

  if (task.deadline) {
    lines.push(`| **Дедлайн** | ${task.deadline} |`);
  }
  if (task.estimateWork !== null) {
    lines.push(`| **Оценка (ч)** | ${task.estimateWork} |`);
  }
  if (task.mark) {
    lines.push(`| **Оценка** | ${task.mark} |`);
  }
  if (task.isMilestone) {
    lines.push(`| **Веха** | ✅ Да |`);
  }
  if (task.epicCode) {
    lines.push(`| **Epic** | \`${task.epicCode}\` — ${task.epicName ?? "—"} |`);
  }
  if (task.workflowCode) {
    lines.push(`| **Бизнес-процесс** | \`${task.workflowCode}\` — ${task.workflowName ?? "—"} |`);
  }
  if (task.subprojectCode) {
    lines.push(`| **Подпроект** | \`${task.subprojectCode}\` — ${task.subprojectName ?? "—"} |`);
  }
  if (task.statusModifiedAt) {
    lines.push(`| **Статус изменён** | ${task.statusModifiedAt} |`);
  }
  if (task.statusClosedAt) {
    lines.push(`| **Закрыта** | ${task.statusClosedAt} |`);
  }
  lines.push("");

  if (task.executors.length > 0) {
    lines.push("## Соисполнители", "");
    for (let i = 0; i < task.executors.length; i++) {
      const name = task.executorNames[i];
      lines.push(`- \`${task.executors[i]}\`${name ? ` — ${name}` : ""}`);
    }
    lines.push("");
  }

  if (task.spectators.length > 0) {
    lines.push("## Наблюдатели", "");
    for (let i = 0; i < task.spectators.length; i++) {
      const name = task.spectatorNames[i];
      lines.push(`- \`${task.spectators[i]}\`${name ? ` — ${name}` : ""}`);
    }
    lines.push("");
  }

  if (task.tags.length > 0) {
    lines.push(`**Теги:** ${task.tags.map((t) => `\`${t}\``).join(", ")}`, "");
  }

  if (task.lists.length > 0) {
    lines.push("## Списки/спринты", "");
    for (const l of task.lists) {
      lines.push(`- \`${l.code || l.id}\` — ${l.name}`);
    }
    lines.push("");
  }

  if (task.components.length > 0) {
    lines.push(`**Компоненты:** ${task.components.map((c) => `\`${c}\``).join(", ")}`, "");
  }

  if (task.waitingFor) {
    lines.push(`**Ожидает ответа от:** \`${task.waitingFor}\`${task.waitingForName ? ` — ${task.waitingForName}` : ""}`, "");
  }

  if (task.text) {
    lines.push("## Описание", "", task.text, "");
  }

  if (task.resultText) {
    lines.push("## Результат", "", task.resultText, "");
  }

  if (task.attachments.length > 0) {
    lines.push(
      "## Вложения",
      "",
      "| Имя | Тип | Размер | Дата | Автор |",
      "|-----|-----|--------|------|-------|"
    );
    for (const a of task.attachments) {
      const size = a.fileSize !== null ? `${(a.fileSize / 1024).toFixed(1)} KB` : "—";
      lines.push(
        `| ${a.name} | ${a.mimeType ?? "—"} | ${size} | ${a.createdAt ?? "—"} | ${a.authorName ?? a.author ?? "—"} |`
      );
    }
    lines.push("");
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

  const hasDeadline = tasks.some((t) => t.deadline !== null);

  const lines: string[] = [
    header,
    "",
  ];

  if (hasDeadline) {
    lines.push("| Код | Название | Статус | Приоритет | Исполнитель | Дедлайн |");
    lines.push("|-----|----------|--------|-----------|-------------|----------|");
  } else {
    lines.push("| Код | Название | Статус | Приоритет | Исполнитель |");
    lines.push("|-----|----------|--------|-----------|-------------|");
  }

  for (const t of tasks) {
    const taskName = t.name ?? "";
    const name = taskName.length > 60 ? taskName.slice(0, 57) + "..." : taskName;
    const prio = t.priorityName ?? "—";
    const resp = t.responsibleName ?? t.responsible ?? "—";
    if (hasDeadline) {
      const dl = t.deadline ?? "—";
      lines.push(
        `| \`${t.code}\` | ${name} | ${t.statusName ?? "—"} | ${prio} | ${resp} | ${dl} |`
      );
    } else {
      lines.push(
        `| \`${t.code}\` | ${name} | ${t.statusName ?? "—"} | ${prio} | ${resp} |`
      );
    }
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

// ── Определения инструментов (для ListToolsRequestSchema) ──────

export const taskToolDefs = [
  {
    name: "get_task",
    description:
      "Получить задачу из EvaProject по коду (например, DEV-000003) или ID. " +
      "Возвращает название, описание, статус, автора, исполнителя, проект, комментарии и коды упомянутых задач.",
    inputSchema: {
      type: "object" as const,
      properties: {
        code: { type: "string", description: "Код задачи в EvaProject, например DEV-000003" },
        id: { type: "string", description: "ID задачи (UUID). Используется если code не указан" },
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
      type: "object" as const,
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
      type: "object" as const,
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
      type: "object" as const,
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
        executors: { type: "array", items: { type: "string" }, description: "Соисполнители (логины пользователей)" },
        spectators: { type: "array", items: { type: "string" }, description: "Наблюдатели (логины пользователей)" },
        tags: { type: "array", items: { type: "string" }, description: "Теги (названия или ID тегов)" },
        lists: { type: "array", items: { type: "string" }, description: "Списки/спринты (ID списков)" },
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
];

// ── Обработчик вызовов ─────────────────────────────────────────

export async function handleTaskToolCall(
  name: string,
  args: unknown,
  evaClient: EvaClient
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean } | null> {
  switch (name) {
    case "get_task": {
      const { code, id } = GetTaskSchema.parse(args);
      if (code) {
        const { task, comments, mentionedTasks } = await evaClient.getTaskWithComments(code);
        const text = formatTask(task) + "\n---\n\n" + formatComments(comments) + formatMentionedTasks(mentionedTasks);
        return { content: [{ type: "text", text }] };
      }
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

    default:
      return null;
  }
}
