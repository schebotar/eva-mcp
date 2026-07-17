import { z } from "zod";
import type { EvaClient } from "../eva-client.js";
import type { TaskInfo } from "../types.js";

// ── Zod-схемы ──────────────────────────────────────────────────

const GetBacklogSchema = z.object({
  project: z.string().min(1, "Код проекта обязателен"),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().min(0).optional(),
});

const ManageSprintTasksSchema = z.object({
  sprint: z.string().min(1, "Код спринта обязателен"),
  task_codes: z.array(z.string().min(1)).min(1, "Укажите хотя бы один код задачи"),
});

const MoveTasksSchema = z.object({
  from_sprint: z.string().min(1, "Код исходного спринта обязателен"),
  to_sprint: z.string().min(1, "Код целевого спринта обязателен"),
  task_codes: z.array(z.string().min(1)).min(1, "Укажите хотя бы один код задачи"),
});

const GetSprintSummarySchema = z.object({
  sprint: z.string().min(1, "Код спринта обязателен"),
  project: z.string().min(1, "Код проекта обязателен"),
});

// ── Хелперы ────────────────────────────────────────────────────

async function getTasksForSprint(
  evaClient: EvaClient,
  sprintCode: string,
  projectCode: string
): Promise<TaskInfo[]> {
  // Получаем все задачи проекта и фильтруем по спринту на клиенте
  const allTasks = await evaClient.listTasks({
    filter: [["parent", "==", projectCode]],
  });
  return allTasks.filter((t) =>
    t.lists.some((l) => l.code === sprintCode || l.id === sprintCode)
  );
}

/**
 * Обновляет поле lists у задачи: добавляет или убирает спринт.
 */
async function updateTaskLists(
  evaClient: EvaClient,
  taskCode: string,
  addSprints: string[],
  removeSprints: string[]
): Promise<TaskInfo> {
  // Получаем текущую задачу (только поле lists)
  const task = await evaClient.getTask(taskCode);
  const currentLists = task.lists.map((l) => l.code || l.id);

  // Убираем спринты, добавляем новые, убираем дубликаты
  const updated = [...new Set([
    ...currentLists.filter((c) => !removeSprints.includes(c)),
    ...addSprints,
  ])];

  return evaClient.updateTask(taskCode, { lists: updated });
}

// ── Форматтеры ─────────────────────────────────────────────────

function formatBacklog(tasks: TaskInfo[], projectCode: string): string {
  if (tasks.length === 0) {
    return `Бэклог проекта \`${projectCode}\` пуст — все задачи распределены по спринтам.`;
  }

  // Группируем по приоритету
  const byPriority = new Map<string, TaskInfo[]>();
  for (const t of tasks) {
    const prio = t.priorityName ?? "Без приоритета";
    if (!byPriority.has(prio)) byPriority.set(prio, []);
    byPriority.get(prio)!.push(t);
  }

  const lines: string[] = [
    `# Бэклог проекта \`${projectCode}\` (${tasks.length} задач)`,
    "",
    `| Код | Название | Приоритет | Тип |`,
    `|-----|----------|-----------|-----|`,
  ];

  // Приоритеты: Critical > High > Normal > Low > Без приоритета
  const order = ["Critical", "High", "Normal", "Low"];
  for (const prio of order) {
    const group = byPriority.get(prio);
    if (group) {
      for (const t of group) {
        const name = (t.name ?? "").length > 50 ? t.name.slice(0, 47) + "..." : t.name;
        lines.push(`| \`${t.code}\` | ${name} | ${prio} | ${t.typeName ?? "—"} |`);
      }
    }
  }
  // Остальные приоритеты
  for (const [prio, group] of byPriority) {
    if (!order.includes(prio)) {
      for (const t of group) {
        const name = (t.name ?? "").length > 50 ? t.name.slice(0, 47) + "..." : t.name;
        lines.push(`| \`${t.code}\` | ${name} | ${prio} | ${t.typeName ?? "—"} |`);
      }
    }
  }

  return lines.join("\n");
}

function formatSprintSummary(
  tasks: TaskInfo[],
  sprintCode: string
): string {
  if (tasks.length === 0) {
    return `Спринт \`${sprintCode}\` не содержит задач.`;
  }

  // Группируем по статусу
  const byStatus = new Map<string, TaskInfo[]>();
  for (const t of tasks) {
    const st = t.statusName ?? "Без статуса";
    if (!byStatus.has(st)) byStatus.set(st, []);
    byStatus.get(st)!.push(t);
  }

  // Считаем закрытые (обычно статусы с типом CLOSED или по названию)
  const closedStatuses = new Set(["Done", "Closed", "Выполнено", "Закрыто", "Готово", "Завершено"]);
  let closedCount = 0;
  let totalEstimate = 0;
  let closedEstimate = 0;

  for (const t of tasks) {
    const stName = (t.statusName ?? "").toLowerCase();
    const isClosed = [...closedStatuses].some((cs) => stName.includes(cs.toLowerCase()));
    if (isClosed) {
      closedCount++;
      if (t.estimateWork !== null) closedEstimate += t.estimateWork;
    }
    if (t.estimateWork !== null) totalEstimate += t.estimateWork;
  }

  const pct = tasks.length > 0 ? Math.round((closedCount / tasks.length) * 100) : 0;
  const bar = buildProgressBar(pct);

  const lines: string[] = [
    `# Сводка спринта \`${sprintCode}\``,
    "",
    `| Показатель | Значение |`,
    `|------------|----------|`,
    `| **Всего задач** | ${tasks.length} |`,
    `| **Выполнено** | ${closedCount} (${pct}%) |`,
    `| **Прогресс** | ${bar} |`,
  ];

  if (totalEstimate > 0) {
    const estPct = Math.round((closedEstimate / totalEstimate) * 100);
    lines.push(`| **Оценка (ч)** | ${closedEstimate} / ${totalEstimate} (${estPct}%) |`);
  }

  lines.push("", "## По статусам", "");
  lines.push("| Статус | Количество | % |");
  lines.push("|--------|------------|---|");

  for (const [status, group] of byStatus) {
    const count = group.length;
    const pctStatus = Math.round((count / tasks.length) * 100);
    lines.push(`| ${status} | ${count} | ${pctStatus}% |`);
  }

  return lines.join("\n");
}

function buildProgressBar(pct: number): string {
  const filled = Math.round(pct / 10);
  const empty = 10 - filled;
  return "█".repeat(filled) + "░".repeat(empty) + ` ${pct}%`;
}

// ── Определения инструментов ───────────────────────────────────

export const backlogToolDefs = [
  {
    name: "get_backlog",
    description:
      "Получить бэклог проекта — задачи, не входящие ни в один спринт. " +
      "Задачи сгруппированы по приоритету.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: { type: "string", description: "Код проекта (обязательно)" },
        limit: { type: "number", description: "Максимальное количество результатов" },
        offset: { type: "number", description: "Смещение для пагинации" },
      },
      required: ["project"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "add_tasks_to_sprint",
    description:
      "Добавить задачи в спринт. Принимает код спринта и массив кодов задач.",
    inputSchema: {
      type: "object" as const,
      properties: {
        sprint: { type: "string", description: "Код спринта, например SPR-000001" },
        task_codes: {
          type: "array",
          items: { type: "string" },
          description: "Коды задач для добавления, например [\"MCP-1\", \"MCP-2\"]",
        },
      },
      required: ["sprint", "task_codes"],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  },
  {
    name: "remove_tasks_from_sprint",
    description:
      "Убрать задачи из спринта (вернуть в бэклог). Принимает код спринта и массив кодов задач.",
    inputSchema: {
      type: "object" as const,
      properties: {
        sprint: { type: "string", description: "Код спринта" },
        task_codes: {
          type: "array",
          items: { type: "string" },
          description: "Коды задач для удаления из спринта",
        },
      },
      required: ["sprint", "task_codes"],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  },
  {
    name: "move_tasks_to_sprint",
    description:
      "Перенести задачи из одного спринта в другой. Принимает исходный спринт, целевой спринт и коды задач.",
    inputSchema: {
      type: "object" as const,
      properties: {
        from_sprint: { type: "string", description: "Код исходного спринта" },
        to_sprint: { type: "string", description: "Код целевого спринта" },
        task_codes: {
          type: "array",
          items: { type: "string" },
          description: "Коды задач для переноса",
        },
      },
      required: ["from_sprint", "to_sprint", "task_codes"],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  },
  {
    name: "get_sprint_summary",
    description:
      "Получить сводку по спринту: количество задач, процент выполнения, " +
      "прогресс-бар, распределение по статусам.",
    inputSchema: {
      type: "object" as const,
      properties: {
        sprint: { type: "string", description: "Код спринта" },
        project: { type: "string", description: "Код проекта" },
      },
      required: ["sprint", "project"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
];

// ── Обработчик вызовов ─────────────────────────────────────────

export async function handleBacklogToolCall(
  name: string,
  args: unknown,
  evaClient: EvaClient
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean } | null> {
  switch (name) {
    case "get_backlog": {
      const { project, limit, offset } = GetBacklogSchema.parse(args);

      // Получаем все задачи проекта
      const slice: [number, number] | undefined =
        limit !== undefined ? [offset ?? 0, limit] : undefined;

      const allTasks = await evaClient.listTasks({
        filter: [["parent", "==", project]],
        slice,
      });

      // Фильтруем: только задачи без спринта
      const backlog = allTasks.filter((t) => t.lists.length === 0);

      return { content: [{ type: "text", text: formatBacklog(backlog, project) }] };
    }

    case "add_tasks_to_sprint": {
      const { sprint, task_codes } = ManageSprintTasksSchema.parse(args);
      const results: string[] = [];

      for (const code of task_codes) {
        try {
          const task = await updateTaskLists(evaClient, code, [sprint], []);
          results.push(`✅ \`${code}\` — добавлена в \`${sprint}\``);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          results.push(`❌ \`${code}\` — ${msg}`);
        }
      }

      return {
        content: [{
          type: "text",
          text: `# Добавление задач в спринт \`${sprint}\`\n\n${results.join("\n")}`,
        }],
      };
    }

    case "remove_tasks_from_sprint": {
      const { sprint, task_codes } = ManageSprintTasksSchema.parse(args);
      const results: string[] = [];

      for (const code of task_codes) {
        try {
          const task = await updateTaskLists(evaClient, code, [], [sprint]);
          results.push(`✅ \`${code}\` — убрана из \`${sprint}\``);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          results.push(`❌ \`${code}\` — ${msg}`);
        }
      }

      return {
        content: [{
          type: "text",
          text: `# Удаление задач из спринта \`${sprint}\`\n\n${results.join("\n")}`,
        }],
      };
    }

    case "move_tasks_to_sprint": {
      const { from_sprint, to_sprint, task_codes } = MoveTasksSchema.parse(args);
      const results: string[] = [];

      for (const code of task_codes) {
        try {
          const task = await updateTaskLists(evaClient, code, [to_sprint], [from_sprint]);
          results.push(`✅ \`${code}\` — \`${from_sprint}\` → \`${to_sprint}\``);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          results.push(`❌ \`${code}\` — ${msg}`);
        }
      }

      return {
        content: [{
          type: "text",
          text: `# Перенос задач: \`${from_sprint}\` → \`${to_sprint}\`\n\n${results.join("\n")}`,
        }],
      };
    }

    case "get_sprint_summary": {
      const { sprint, project } = GetSprintSummarySchema.parse(args);
      const tasks = await getTasksForSprint(evaClient, sprint, project);
      return { content: [{ type: "text", text: formatSprintSummary(tasks, sprint) }] };
    }

    default:
      return null;
  }
}
