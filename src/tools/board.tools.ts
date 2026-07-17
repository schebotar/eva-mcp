import { z } from "zod";
import type { EvaClient } from "../eva-client.js";
import type { TaskInfo } from "../types.js";

// ── Zod-схемы ──────────────────────────────────────────────────

const GetSprintBoardSchema = z.object({
  sprint: z.string().min(1, "Код спринта обязателен"),
  project: z.string().min(1, "Код проекта обязателен"),
  group_by: z.enum(["status", "responsible"]).optional().default("status"),
});

const GetMyTasksSchema = z.object({
  user: z.string().min(1, "Логин пользователя обязателен"),
  project: z.string().optional(),
  sprint: z.string().optional(),
});

const GetDailyStandupSchema = z.object({
  sprint: z.string().min(1, "Код спринта обязателен"),
  project: z.string().min(1, "Код проекта обязателен"),
});

const IdentifyBlockersSchema = z.object({
  project: z.string().min(1, "Код проекта обязателен"),
  sprint: z.string().optional(),
  days_without_movement: z.number().int().min(1).optional().default(3),
});

// ── Хелперы ────────────────────────────────────────────────────

const CLOSED_STATUSES = new Set([
  "done", "closed", "выполнено", "закрыто", "готово", "завершено",
  "resolved", "completed", "finished",
]);

function isClosed(statusName: string | null): boolean {
  if (!statusName) return false;
  const lower = statusName.toLowerCase();
  return [...CLOSED_STATUSES].some((cs) => lower.includes(cs));
}

async function getSprintTasks(
  evaClient: EvaClient,
  sprintCode: string,
  _projectCode: string
): Promise<TaskInfo[]> {
  const allTasks = await evaClient.listTasks();
  return allTasks.filter((t) =>
    t.lists.some((l) => l.code === sprintCode || l.id === sprintCode)
  );
}

/**
 * Определяет, когда задача последний раз меняла статус.
 * Возвращает дату последнего изменения или null.
 */
async function getLastMovementDate(
  evaClient: EvaClient,
  taskCode: string
): Promise<string | null> {
  try {
    const history = await evaClient.getTaskHistory(taskCode);
    if (history.length === 0) return null;
    return history[0].createdAt; // отсортированы по убыванию
  } catch {
    return null;
  }
}

// ── Форматтеры ─────────────────────────────────────────────────

function formatBoardByStatus(tasks: TaskInfo[], sprintCode: string): string {
  const byStatus = new Map<string, TaskInfo[]>();
  for (const t of tasks) {
    const st = t.statusName ?? "Без статуса";
    if (!byStatus.has(st)) byStatus.set(st, []);
    byStatus.get(st)!.push(t);
  }

  const lines: string[] = [
    `# Доска спринта \`${sprintCode}\` (по статусам)`,
    "",
  ];

  for (const [status, group] of byStatus) {
    const closed = isClosed(status) ? " ✅" : "";
    lines.push(
      `## ${status}${closed} (${group.length})`,
      "",
      "| Код | Название | Исполнитель | Приоритет |",
      "|-----|----------|-------------|-----------|"
    );

    for (const t of group) {
      const name = (t.name ?? "").length > 40 ? t.name.slice(0, 37) + "..." : t.name;
      const resp = t.responsibleName ?? t.responsible ?? "—";
      lines.push(
        `| \`${t.code}\` | ${name} | ${resp} | ${t.priorityName ?? "—"} |`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatBoardByResponsible(tasks: TaskInfo[], sprintCode: string): string {
  const byResp = new Map<string, TaskInfo[]>();
  for (const t of tasks) {
    const resp = t.responsibleName ?? t.responsible ?? "Без исполнителя";
    if (!byResp.has(resp)) byResp.set(resp, []);
    byResp.get(resp)!.push(t);
  }

  const lines: string[] = [
    `# Доска спринта \`${sprintCode}\` (по исполнителям)`,
    "",
  ];

  for (const [resp, group] of byResp) {
    const closed = group.filter((t) => isClosed(t.statusName)).length;
    const total = group.length;
    const pct = Math.round((closed / total) * 100);
    const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));

    lines.push(
      `## ${resp} — ${closed}/${total} ${bar}`,
      "",
      "| Код | Название | Статус | Приоритет |",
      "|-----|----------|--------|-----------|"
    );

    for (const t of group) {
      const name = (t.name ?? "").length > 40 ? t.name.slice(0, 37) + "..." : t.name;
      lines.push(
        `| \`${t.code}\` | ${name} | ${t.statusName ?? "—"} | ${t.priorityName ?? "—"} |`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatMyTasks(tasks: TaskInfo[], user: string): string {
  if (tasks.length === 0) {
    return `У пользователя \`${user}\` нет активных задач.`;
  }

  const inProgress: TaskInfo[] = [];
  const open: TaskInfo[] = [];
  const closed: TaskInfo[] = [];

  for (const t of tasks) {
    if (isClosed(t.statusName)) {
      closed.push(t);
    } else if (t.statusName && t.statusName.toLowerCase().includes("progress")) {
      inProgress.push(t);
    } else {
      open.push(t);
    }
  }

  const lines: string[] = [
    `# Задачи пользователя \`${user}\``,
    "",
    `| Категория | Количество |`,
    `|-----------|------------|`,
    `| 🔄 В работе | ${inProgress.length} |`,
    `| 📋 Открыто | ${open.length} |`,
    `| ✅ Закрыто | ${closed.length} |`,
    "",
  ];

  function addSection(title: string, group: TaskInfo[]) {
    if (group.length === 0) return;
    lines.push(`## ${title}`, "");
    lines.push("| Код | Название | Статус | Проект |");
    lines.push("|-----|----------|--------|--------|");
    for (const t of group) {
      const name = (t.name ?? "").length > 45 ? t.name.slice(0, 42) + "..." : t.name;
      lines.push(
        `| \`${t.code}\` | ${name} | ${t.statusName ?? "—"} | ${t.projectName ?? "—"} |`
      );
    }
    lines.push("");
  }

  addSection("🔄 В работе", inProgress);
  addSection("📋 Открыто", open);
  addSection("✅ Закрыто", closed);

  return lines.join("\n");
}

function formatDailyStandup(
  tasks: TaskInfo[],
  sprintCode: string
): string {
  // Группируем по исполнителю
  const byPerson = new Map<string, { done: TaskInfo[]; planned: TaskInfo[]; login: string }>();

  for (const t of tasks) {
    const login = t.responsible ?? "unassigned";
    const name = t.responsibleName ?? t.responsible ?? "Без исполнителя";

    if (!byPerson.has(name)) {
      byPerson.set(name, { done: [], planned: [], login });
    }

    const entry = byPerson.get(name)!;
    if (isClosed(t.statusName)) {
      entry.done.push(t);
    } else {
      entry.planned.push(t);
    }
  }

  const lines: string[] = [
    `# Daily Standup — спринт \`${sprintCode}\``,
    "",
    `Всего участников: **${byPerson.size}** | Задач в спринте: **${tasks.length}**`,
    "",
  ];

  for (const [name, { done, planned }] of byPerson) {
    lines.push(`## ${name}`, "");

    if (done.length > 0) {
      lines.push("**Что сделано:**");
      for (const t of done) {
        lines.push(`- ✅ \`${t.code}\` — ${t.name}`);
      }
      lines.push("");
    } else {
      lines.push("**Что сделано:** —", "");
    }

    if (planned.length > 0) {
      lines.push("**Что планирует:**");
      for (const t of planned) {
        const age = t.createdAt
          ? ` (создана ${t.createdAt.slice(0, 10)})`
          : "";
        lines.push(`- 📋 \`${t.code}\` — ${t.name}${age}`);
      }
      lines.push("");
    } else {
      lines.push("**Что планирует:** —", "");
    }

    lines.push("**Блокеры:** " + (planned.length > 5 ? "⚠️ Высокая загрузка" : "Нет"), "");
  }

  return lines.join("\n");
}

function formatBlockers(
  blockers: { task: TaskInfo; lastMovement: string | null }[],
  daysThreshold: number
): string {
  if (blockers.length === 0) {
    return `Задач без движения > ${daysThreshold} дн. не найдено.`;
  }

  const lines: string[] = [
    `# Блокеры — без движения > ${daysThreshold} дн. (${blockers.length})`,
    "",
    "| Код | Название | Статус | Исполнитель | Последнее движение | Дней |",
    "|-----|----------|--------|-------------|-------------------|------|",
  ];

  const now = new Date();
  for (const { task, lastMovement } of blockers) {
    const name = (task.name ?? "").length > 35 ? task.name.slice(0, 32) + "..." : task.name;
    const resp = task.responsibleName ?? task.responsible ?? "—";

    let daysStale = "?";
    if (lastMovement) {
      const diff = now.getTime() - new Date(lastMovement).getTime();
      daysStale = String(Math.floor(diff / (1000 * 60 * 60 * 24)));
    }

    lines.push(
      `| \`${task.code}\` | ${name} | ${task.statusName ?? "—"} | ${resp} | ${lastMovement?.slice(0, 10) ?? "—"} | ${daysStale} |`
    );
  }

  return lines.join("\n");
}

// ── Определения инструментов ───────────────────────────────────

export const boardToolDefs = [
  {
    name: "get_sprint_board",
    description:
      "Получить Kanban-доску спринта. Задачи группируются по статусам (по умолчанию) " +
      "или по исполнителям. Для каждого статуса показывается таблица задач.",
    inputSchema: {
      type: "object" as const,
      properties: {
        sprint: { type: "string", description: "Код спринта" },
        project: { type: "string", description: "Код проекта" },
        group_by: {
          type: "string",
          enum: ["status", "responsible"],
          description: "Группировка: по статусам (status) или исполнителям (responsible)",
        },
      },
      required: ["sprint", "project"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "get_my_tasks",
    description:
      "Получить задачи конкретного пользователя (где он исполнитель или соисполнитель). " +
      "Группирует по категориям: «В работе», «Открыто», «Закрыто».",
    inputSchema: {
      type: "object" as const,
      properties: {
        user: { type: "string", description: "Логин пользователя (обязательно)" },
        project: { type: "string", description: "Фильтр по проекту (код)" },
        sprint: { type: "string", description: "Фильтр по спринту (код)" },
      },
      required: ["user"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "get_daily_standup",
    description:
      "Получить данные для Daily Scrum по спринту. Для каждого участника показывает: " +
      "что сделано, что планирует, возможные блокеры.",
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
  {
    name: "identify_blockers",
    description:
      "Найти задачи, которые не меняли статус дольше указанного количества дней. " +
      "Помогает выявить заблокированные или забытые задачи.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: { type: "string", description: "Код проекта (обязательно)" },
        sprint: { type: "string", description: "Фильтр по спринту (код)" },
        days_without_movement: {
          type: "number",
          description: "Дней без движения (по умолчанию 3)",
        },
      },
      required: ["project"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
];

// ── Обработчик вызовов ─────────────────────────────────────────

export async function handleBoardToolCall(
  name: string,
  args: unknown,
  evaClient: EvaClient
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean } | null> {
  switch (name) {
    case "get_sprint_board": {
      const { sprint, project, group_by } = GetSprintBoardSchema.parse(args);
      const tasks = await getSprintTasks(evaClient, sprint, project);

      const text =
        group_by === "responsible"
          ? formatBoardByResponsible(tasks, sprint)
          : formatBoardByStatus(tasks, sprint);

      return { content: [{ type: "text", text }] };
    }

    case "get_my_tasks": {
      const { user, project, sprint } = GetMyTasksSchema.parse(args);

      const filters: import("../types.js").BqlFilter[] = [];
      filters.push(["responsible", "==", user]);
      if (project) filters.push(["parent", "==", project]);
      if (sprint) filters.push(["lists.code", "IN", [sprint]]);

      const tasks = await evaClient.listTasks({
        filter: filters.length > 0 ? filters : undefined,
      });

      return { content: [{ type: "text", text: formatMyTasks(tasks, user) }] };
    }

    case "get_daily_standup": {
      const { sprint, project } = GetDailyStandupSchema.parse(args);
      const tasks = await getSprintTasks(evaClient, sprint, project);

      return { content: [{ type: "text", text: formatDailyStandup(tasks, sprint) }] };
    }

    case "identify_blockers": {
      const { project, sprint, days_without_movement } = IdentifyBlockersSchema.parse(args);

      const filters: import("../types.js").BqlFilter[] = [["parent", "==", project]];
      if (sprint) filters.push(["lists.code", "IN", [sprint]]);

      const tasks = await evaClient.listTasks({
        filter: filters.length > 0 ? filters : undefined,
      });

      // Проверяем историю для каждой задачи
      const blockers: { task: TaskInfo; lastMovement: string | null }[] = [];
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days_without_movement);

      for (const task of tasks) {
        // Пропускаем уже закрытые
        if (isClosed(task.statusName)) continue;

        const lastMovement = await getLastMovementDate(evaClient, task.code);
        if (!lastMovement) {
          // Нет истории — считаем блокером
          blockers.push({ task, lastMovement: null });
        } else if (new Date(lastMovement) < cutoff) {
          blockers.push({ task, lastMovement });
        }
      }

      return {
        content: [{
          type: "text",
          text: formatBlockers(blockers, days_without_movement),
        }],
      };
    }

    default:
      return null;
  }
}
