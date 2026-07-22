import { z } from "zod";
import type { EvaClient } from "../eva-client.js";
import type { TaskInfo } from "../types.js";
import { buildTaskFilter } from "../helpers/build-task-filter.js";
import { formatComments } from "../helpers/comment-tree.js";
import { mdToHtml } from "../helpers/markdown.js";// ── Приоритеты: маппинг имён в числа (ChoiceInt) ──────────────

const PRIORITY_MAP: Record<string, number> = {
  "none": 0, "нет": 0, "0": 0,
  "low": 1, "низкий": 1, "1": 1,
  "normal": 2, "средний": 2, "обычный": 2, "medium": 2, "2": 2,
  "high": 3, "высокий": 3, "3": 3,
  "critical": 4, "критичный": 4, "критический": 4, "4": 4,
};

function mapPriority(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") return value;
  const key = value.toLowerCase().trim();
  return PRIORITY_MAP[key] ?? (parseInt(value, 10) || undefined);
}

// ── Zod-схемы ──────────────────────────────────────────────────

export const GetTaskSchema = z.object({
  code: z.string().min(1, "code обязателен"),
});

export const SearchTasksSchema = z.object({
  status: z.string().optional(),
  responsible: z.string().optional(),
  project: z.string().optional(),
  priority: z.string().optional(),
  type: z.string().optional(),
  query: z.string().optional(),
  linked_to: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  created_from: z.string().optional(),
  created_to: z.string().optional(),
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
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  created_from: z.string().optional(),
  created_to: z.string().optional(),
  // sprint не поддерживается — клиентская фильтрация невозможна для count
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

export const CreateTaskSchema = z.object({
  name: z.string().min(1, "Название задачи обязательно"),
  project: z.string().min(1, "Код проекта обязателен"),
  text: z.string().optional(),
  responsible: z.string().optional(),
  priority: z.string().optional(),
  type: z.string().optional(),
  deadline: z.string().optional(),
  lists: z.array(z.string()).optional(),
  epic: z.string().optional(),
  estimate_work: z.number().optional(),
  tags: z.array(z.string()).optional(),
  executors: z.array(z.string()).optional(),
  parent_task: z.string().optional(),
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
      },
      required: ["code"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "search_tasks",
    description:
      "Поиск задач по фильтрам. Можно фильтровать по статусу, исполнителю, проекту, " +
      "приоритету, типу, текстовому запросу и датам изменения/создания. Возвращает список задач в виде таблицы.",
    inputSchema: {
      type: "object" as const,
      properties: {
        status: { type: "string", description: "Фильтр по статусу. **Код** статуса — возьми из `get_statuses`" },
        responsible: { type: "string", description: "Фильтр по исполнителю. **Логин** пользователя (email) — возьми из `search_users`" },
        project: { type: "string", description: "Фильтр по проекту. **Код проекта** (например `mcp-test`) — возьми из `search_projects`" },
        priority: { type: "string", description: "Фильтр по приоритету: `low`, `normal`, `high`, `critical` или 1-4" },
        type: { type: "string", description: "Фильтр по типу задачи (ID логического типа)" },
        query: { type: "string", description: "Текстовый поиск по **названию** задачи (ищет подстроку в name)" },
        linked_to: { type: "string", description: "Найти задачи, связанные с указанной. **Код задачи** (например `DEV-000003`)" },
        date_from: { type: "string", description: "Дата изменения ОТ (ISO, например 2026-07-20). Фильтр по полю `cmf_modified_at`" },
        date_to: { type: "string", description: "Дата изменения ДО (ISO). Фильтр по полю `cmf_modified_at`" },
        created_from: { type: "string", description: "Дата создания ОТ (ISO). Фильтр по полю `cmf_created_at`" },
        created_to: { type: "string", description: "Дата создания ДО (ISO). Фильтр по полю `cmf_created_at`" },
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
        status: { type: "string", description: "Фильтр по статусу. **Код** статуса — возьми из `get_statuses`" },
        responsible: { type: "string", description: "Фильтр по исполнителю. **Логин** (email) — возьми из `search_users`" },
        project: { type: "string", description: "Фильтр по проекту. **Код проекта** — возьми из `search_projects`" },
        priority: { type: "string", description: "Фильтр по приоритету: `low`, `normal`, `high`, `critical` или 1-4" },
        type: { type: "string", description: "Фильтр по типу задачи (ID логического типа)" },
        query: { type: "string", description: "Текстовый поиск по **названию** задачи" },
        linked_to: { type: "string", description: "Найти задачи, связанные с указанной. **Код задачи**" },
        date_from: { type: "string", description: "Дата изменения ОТ (ISO). Фильтр по `cmf_modified_at`" },
        date_to: { type: "string", description: "Дата изменения ДО (ISO). Фильтр по `cmf_modified_at`" },
        created_from: { type: "string", description: "Дата создания ОТ (ISO). Фильтр по `cmf_created_at`" },
        created_to: { type: "string", description: "Дата создания ДО (ISO). Фильтр по `cmf_created_at`" },
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
        status: { type: "string", description: "Новый статус. **Код** статуса — возьми из `get_statuses`" },
        responsible: { type: "string", description: "Новый исполнитель. **Логин** пользователя (email) — возьми из `search_users`" },
        priority: { type: "string", description: "Новый приоритет: `low`, `normal`, `high`, `critical` или 1-4" },
        deadline: { type: "string", description: "Крайний срок (ISO-дата, например 2026-07-15)" },
        name: { type: "string", description: "Новое название задачи" },
        text: { type: "string", description: "Новое описание (Markdown, конвертируется в HTML)" },
        result_text: { type: "string", description: "Текст результата (Markdown, конвертируется в HTML)" },
        project: { type: "string", description: "Перенести в другой проект. **Код проекта** — возьми из `search_projects`" },
        waiting_for: { type: "string", description: "Ожидает ответа от. **Логин** пользователя (email) — возьми из `search_users`" },
        executors: { type: "array", items: { type: "string" }, description: "Соисполнители. **Логины** пользователей (email) — возьми из `search_users`" },
        spectators: { type: "array", items: { type: "string" }, description: "Наблюдатели. **Логины** пользователей (email) — возьми из `search_users`" },
        tags: { type: "array", items: { type: "string" }, description: "Теги (названия или ID тегов)" },
        lists: { type: "array", items: { type: "string" }, description: "Спринты. **Коды спринтов** (например `SPR-000001`) — возьми из `search_sprints`" },
        is_milestone: { type: "boolean", description: "Отметить как веху (Milestone)" },
        estimate_work: { type: "number", description: "Исходная оценка в часах" },
        parent_task: { type: "string", description: "Родительская задача. **Код задачи**" },
        epic: { type: "string", description: "Эпик. **Код задачи-эпика**" },
        mark: { type: "string", description: "Оценка (строка, например `5`)" },
      },
      required: ["code"],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  },
  // {
  //   name: "create_task",
  //   description:
  //     "Создать новую задачу в проекте. Обязательные поля: название и код проекта. " +
  //     "Опционально: описание, исполнитель, приоритет, тип, дедлайн, спринты, эпик, оценка, теги.",
  //   inputSchema: {
  //     type: "object" as const,
  //     properties: {
  //       name: { type: "string", description: "Название задачи (обязательно)" },
  //       project: { type: "string", description: "**Код проекта**, в котором создать задачу — возьми из `search_projects`" },
  //       text: { type: "string", description: "Описание задачи (Markdown, будет сконвертировано в HTML)" },
  //       responsible: { type: "string", description: "Исполнитель. **Логин** пользователя (email) — возьми из `search_users`" },
  //       priority: { type: "string", description: "Приоритет: `low`, `normal`, `high`, `critical` или 1-4" },
  //       type: { type: "string", description: "Тип задачи (ID логического типа)" },
  //       deadline: { type: "string", description: "Дедлайн (ISO-дата)" },
  //       lists: { type: "array", items: { type: "string" }, description: "Спринты. **Коды спринтов** — возьми из `search_sprints`" },
  //       epic: { type: "string", description: "Эпик. **Код задачи-эпика**" },
  //       estimate_work: { type: "number", description: "Оценка в часах" },
  //       tags: { type: "array", items: { type: "string" }, description: "Теги (названия или ID тегов)" },
  //       executors: { type: "array", items: { type: "string" }, description: "Соисполнители. **Логины** пользователей (email)" },
  //       parent_task: { type: "string", description: "Родительская задача. **Код задачи**" },
  //     },
  //     required: ["name", "project"],
  //   },
  //   annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  // },
];

// ── Обработчик вызовов ─────────────────────────────────────────

export async function handleTaskToolCall(
  name: string,
  args: unknown,
  evaClient: EvaClient
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean } | null> {
  switch (name) {
    case "get_task": {
      const { code } = GetTaskSchema.parse(args);
      const { task, comments, mentionedTasks } = await evaClient.getTaskWithComments(code);
      const text = formatTask(task) + "\n---\n\n" + formatComments(comments) + formatMentionedTasks(mentionedTasks);
      return { content: [{ type: "text", text }] };
    }

    case "search_tasks": {
      const params = SearchTasksSchema.parse(args);

      // Резолвим код проекта → UUID (parent_id требует UUID)
      let projectId: string | undefined;
      if (params.project) {
        const project = await evaClient.getProject(params.project);
        projectId = project.id;
      }

      // Извлекаем linked_to — обрабатывается отдельно, не через BQL
      const { linked_to, ...restParams } = params as Record<string, unknown>;
      const filterArgs: Record<string, unknown> = { ...restParams };
      if (projectId) filterArgs.project = projectId;

      const filters = buildTaskFilter(filterArgs);

      // Если указан linked_to — получаем все связанные коды через getLinkedTasks
      if (linked_to && typeof linked_to === "string") {
        const linked = await evaClient.getLinkedTasks(linked_to);
        const linkedCodes = new Set<string>();
        if (linked.parentTask) linkedCodes.add(linked.parentTask.code);
        for (const t of linked.childTasks) linkedCodes.add(t.code);
        for (const t of linked.dependedTasks) linkedCodes.add(t.code);
        for (const t of linked.affectedTasks) linkedCodes.add(t.code);
        for (const r of linked.precedesTasks) linkedCodes.add(r.inTask.code);
        for (const r of linked.followsTasks) linkedCodes.add(r.outTask.code);

        if (linkedCodes.size > 0) {
          filters.push(["code", "IN", [...linkedCodes]]);
        } else {
          // Нет связанных задач — возвращаем пустой результат
          return { content: [{ type: "text", text: formatTaskList([], 0) }] };
        }
      }

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

      // Резолвим код проекта → UUID
      let projectId: string | undefined;
      if (params.project) {
        const project = await evaClient.getProject(params.project);
        projectId = project.id;
      }

      // Извлекаем linked_to — обрабатывается отдельно, не через BQL
      const { linked_to, ...restParams } = params as Record<string, unknown>;
      const filterArgs: Record<string, unknown> = { ...restParams };
      if (projectId) filterArgs.project = projectId;

      const filters = buildTaskFilter(filterArgs);

      // Если указан linked_to — получаем все связанные коды через getLinkedTasks
      if (linked_to && typeof linked_to === "string") {
        const linked = await evaClient.getLinkedTasks(linked_to);
        const linkedCodes = new Set<string>();
        if (linked.parentTask) linkedCodes.add(linked.parentTask.code);
        for (const t of linked.childTasks) linkedCodes.add(t.code);
        for (const t of linked.dependedTasks) linkedCodes.add(t.code);
        for (const t of linked.affectedTasks) linkedCodes.add(t.code);
        for (const r of linked.precedesTasks) linkedCodes.add(r.inTask.code);
        for (const r of linked.followsTasks) linkedCodes.add(r.outTask.code);

        if (linkedCodes.size > 0) {
          filters.push(["code", "IN", [...linkedCodes]]);
        } else {
          return { content: [{ type: "text", text: "Найдено задач: **0**" }] };
        }
      }

      const count = await evaClient.countTasks(
        filters.length > 0 ? filters : undefined
      );
      return { content: [{ type: "text", text: `Найдено задач: **${count}**` }] };
    }

    case "update_task": {
      const { code, text, result_text, ...rest } = UpdateTaskSchema.parse(args);

      const fields: Record<string, unknown> = {};
      // Текстовые поля конвертируем Markdown → HTML (пропускаем пустые строки)
      if (text) fields.text = mdToHtml(text);
      if (result_text) fields.result_text = mdToHtml(result_text);

      for (const [key, value] of Object.entries(rest)) {
        // Пропускаем undefined, null и пустые строки (API некорректно обрабатывает "")
        if (value === undefined || value === null || value === "") continue;
        // Пропускаем пустые массивы
        if (Array.isArray(value) && value.length === 0) continue;

        if (key === "project") {
          // API ожидает поле parent для перемещения задачи в проект
          fields["parent"] = value;
        } else {
          // Маппим приоритет из строки в число
          fields[key] = key === "priority" ? mapPriority(value as string | number) : value;
        }
      }

      if (Object.keys(fields).length === 0) {
        throw new Error("Не указаны поля для обновления");
      }

      const task = await evaClient.updateTask(code, fields);
      return { content: [{ type: "text", text: "✅ Задача обновлена.\n\n" + formatTask(task) }] };
    }

    // case "create_task": {
    //   const { name, project, text, ...rest } = CreateTaskSchema.parse(args);

    //   const fields: Record<string, unknown> = { name, parent: project };
    //   // Конвертируем Markdown → HTML для описания
    //   if (text !== undefined && text !== null) fields.text = mdToHtml(text);

    //   for (const [key, value] of Object.entries(rest)) {
    //     if (value !== undefined && value !== null) {
    //       fields[key] = key === "priority" ? mapPriority(value as string | number) : value;
    //     }
    //   }

    //   const task = await evaClient.createTask(fields);
    //   return { content: [{ type: "text", text: "✅ Задача создана.\n\n" + formatTask(task) }] };
    // }

    default:
      return null;
  }
}
