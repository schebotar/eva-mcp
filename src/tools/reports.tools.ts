import { z } from "zod";
import type { EvaClient } from "../eva-client.js";
import type { TaskInfo, SprintInfo } from "../types.js";

// ── Zod-схемы ──────────────────────────────────────────────────

const SprintReviewSchema = z.object({
  sprint: z.string().min(1, "Код спринта обязателен"),
  project: z.string().min(1, "Код проекта обязателен"),
});

const TeamWorkloadSchema = z.object({
  project: z.string().min(1, "Код проекта обязателен"),
  sprint: z.string().optional(),
});

const ProjectHealthSchema = z.object({
  project: z.string().min(1, "Код проекта обязателен"),
});

// ── Хелперы ────────────────────────────────────────────────────

function isClosed(statusName: string | null): boolean {
  if (!statusName) return false;
  const lower = statusName.toLowerCase();
  return ["done", "closed", "выполнено", "закрыто", "готово", "завершено", "resolved", "completed", "finished"]
    .some((s) => lower.includes(s));
}

// ── Форматтеры ─────────────────────────────────────────────────

function formatSprintReview(
  tasks: TaskInfo[],
  sprintCode: string
): string {
  const done: TaskInfo[] = [];
  const notDone: TaskInfo[] = [];

  for (const t of tasks) {
    if (isClosed(t.statusName)) {
      done.push(t);
    } else {
      notDone.push(t);
    }
  }

  const pct = tasks.length > 0 ? Math.round((done.length / tasks.length) * 100) : 0;
  const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));

  let totalEstimate = 0;
  let doneEstimate = 0;
  for (const t of tasks) {
    if (t.estimateWork !== null) {
      totalEstimate += t.estimateWork;
      if (isClosed(t.statusName)) doneEstimate += t.estimateWork;
    }
  }

  const lines: string[] = [
    `# Sprint Review — \`${sprintCode}\``,
    "",
    `| Показатель | Значение |`,
    `|------------|----------|`,
    `| Всего задач | ${tasks.length} |`,
    `| Выполнено | ${done.length} |`,
    `| Не выполнено | ${notDone.length} |`,
    `| Прогресс | ${bar} ${pct}% |`,
  ];

  if (totalEstimate > 0) {
    lines.push(`| Оценка (ч) | ${doneEstimate} / ${totalEstimate} |`);
  }

  if (done.length > 0) {
    lines.push("", "## ✅ Что сделано", "");
    lines.push("| Код | Название | Статус |");
    lines.push("|-----|----------|--------|");
    for (const t of done) {
      const name = (t.name ?? "").length > 50 ? t.name.slice(0, 47) + "..." : t.name;
      lines.push(`| \`${t.code}\` | ${name} | ${t.statusName ?? "—"} |`);
    }
  }

  if (notDone.length > 0) {
    lines.push("", "## ❌ Что не сделано", "");
    lines.push("| Код | Название | Статус | Причина |");
    lines.push("|-----|----------|--------|---------|");
    for (const t of notDone) {
      const name = (t.name ?? "").length > 50 ? t.name.slice(0, 47) + "..." : t.name;
      const reason = t.statusName?.toLowerCase().includes("progress") ? "В процессе" : "Не начато";
      lines.push(`| \`${t.code}\` | ${name} | ${t.statusName ?? "—"} | ${reason} |`);
    }
  }

  return lines.join("\n");
}

function formatSprintRetrospective(
  tasks: TaskInfo[],
  sprintCode: string,
  cycleTimeHours: number | null
): string {
  const done = tasks.filter((t) => isClosed(t.statusName));
  const notDone = tasks.filter((t) => !isClosed(t.statusName));

  const lines: string[] = [
    `# Sprint Retrospective — \`${sprintCode}\``,
    "",
    "## 📊 Метрики спринта",
    "",
    `| Метрика | Значение |`,
    `|---------|----------|`,
    `| Задач выполнено | ${done.length} / ${tasks.length} |`,
    `| % выполнения | ${tasks.length > 0 ? Math.round((done.length / tasks.length) * 100) : 0}% |`,
    `| Средний cycle time | ${cycleTimeHours !== null ? `${cycleTimeHours} ч` : "Н/Д"} |`,
    `| Блокеров | ${notDone.length} задач не завершено |`,
    "",
    "## 👍 Что прошло хорошо",
    "",
  ];

  if (done.length > 0) {
    lines.push(`- ${done.length} задач успешно завершены`);
    const withResults = done.filter((t) => t.resultText).length;
    if (withResults > 0) lines.push(`- ${withResults} задач с заполненными результатами`);
  } else {
    lines.push("- Нет завершённых задач для анализа");
  }

  lines.push("", "## 🔧 Что можно улучшить", "");

  if (notDone.length > 0) {
    lines.push(`- ${notDone.length} задач остались незавершёнными`);
    const noExecutor = notDone.filter((t) => !t.responsible).length;
    if (noExecutor > 0) lines.push(`- ${noExecutor} задач без исполнителя`);
  }

  if (tasks.length > 10) {
    lines.push("- Высокая загрузка спринта — рассмотреть уменьшение scope");
  }

  lines.push("", "## 🎯 Рекомендации", "");

  if (notDone.length > 0) {
    lines.push("- Перенести незавершённые задачи в следующий спринт");
  }
  lines.push("- Провести grooming бэклога перед планированием следующего спринта");

  return lines.join("\n");
}

function formatTeamWorkload(
  tasks: TaskInfo[],
  projectCode: string
): string {
  // Группируем по исполнителю
  const byPerson = new Map<string, TaskInfo[]>();

  for (const t of tasks) {
    const resp = t.responsibleName ?? t.responsible ?? "Без исполнителя";
    if (!byPerson.has(resp)) byPerson.set(resp, []);
    byPerson.get(resp)!.push(t);
  }

  const lines: string[] = [
    `# Загруженность команды — \`${projectCode}\``,
    "",
    "| Исполнитель | Задач | Открыто | В работе | Закрыто | Оценка (ч) |",
    "|------------|-------|---------|----------|---------|------------|",
  ];

  for (const [name, personTasks] of byPerson) {
    const total = personTasks.length;
    const open = personTasks.filter((t) =>
      !isClosed(t.statusName) && !(t.statusName?.toLowerCase().includes("progress"))
    ).length;
    const inProgress = personTasks.filter((t) =>
      t.statusName?.toLowerCase().includes("progress") === true
    ).length;
    const closed = personTasks.filter((t) => isClosed(t.statusName)).length;
    const estimate = personTasks.reduce((sum, t) => sum + (t.estimateWork ?? 0), 0);

    const load = total > 5 ? "🔴" : total > 3 ? "🟡" : "🟢";
    lines.push(
      `| ${load} ${name} | ${total} | ${open} | ${inProgress} | ${closed} | ${estimate || "—"} |`
    );
  }

  return lines.join("\n");
}

function formatProjectHealth(
  tasks: TaskInfo[],
  sprints: SprintInfo[],
  projectCode: string
): string {
  const totalTasks = tasks.length;
  const closedTasks = tasks.filter((t) => isClosed(t.statusName)).length;
  const overdue = tasks.filter((t) =>
    !isClosed(t.statusName) && t.deadline && new Date(t.deadline) < new Date()
  ).length;
  const activeSprints = sprints.filter((s) => s.statusName !== "Закрыто").length;

  const healthClosed = totalTasks > 0 && closedTasks / totalTasks >= 0.7 ? "🟢" : totalTasks > 0 ? "🟡" : "⚪";
  const healthOverdue = overdue === 0 ? "🟢" : overdue <= 3 ? "🟡" : "🔴";
  const healthSprints = activeSprints > 0 ? "🟢" : "⚪";

  const lines: string[] = [
    `# Health Check — \`${projectCode}\``,
    "",
    "| Показатель | Значение | Статус |",
    "|------------|----------|--------|",
    `| Активные спринты | ${activeSprints} | ${healthSprints} |`,
    `| Всего задач | ${totalTasks} | — |`,
    `| Закрыто задач | ${closedTasks} (${totalTasks > 0 ? Math.round((closedTasks / totalTasks) * 100) : 0}%) | ${healthClosed} |`,
    `| Просроченных задач | ${overdue} | ${healthOverdue} |`,
    `| Исполнителей | ${new Set(tasks.map((t) => t.responsible).filter(Boolean)).size} | — |`,
    "",
    "### Легенда",
    "🟢 Хорошо | 🟡 Внимание | 🔴 Проблема | ⚪ Нет данных",
  ];

  return lines.join("\n");
}

// ── Определения инструментов ───────────────────────────────────

export const reportsToolDefs = [
  {
    name: "get_sprint_review",
    description:
      "Получить отчёт Sprint Review: что сделано, что не сделано, метрики спринта.",
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
    name: "get_sprint_retrospective",
    description:
      "Получить данные для Sprint Retrospective: метрики спринта, что прошло хорошо, " +
      "что улучшить, рекомендации.",
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
    name: "get_team_workload",
    description:
      "Получить загруженность команды: количество задач по исполнителям, статусы, оценка.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: { type: "string", description: "Код проекта" },
        sprint: { type: "string", description: "Фильтр по спринту (опционально)" },
      },
      required: ["project"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "get_project_health",
    description:
      "Получить health check проекта: активные спринты, % закрытых задач, просрочка, " +
      "количество исполнителей. С цветовой индикацией 🟢🟡🔴.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: { type: "string", description: "Код проекта" },
      },
      required: ["project"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
];

// ── Обработчик вызовов ─────────────────────────────────────────

export async function handleReportsToolCall(
  name: string,
  args: unknown,
  evaClient: EvaClient
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean } | null> {
  switch (name) {
    case "get_sprint_review": {
      const { sprint, project } = SprintReviewSchema.parse(args);
      const allTasks = await evaClient.listTasks();
      const tasks = allTasks.filter((t) =>
        t.lists.some((l) => l.code === sprint || l.id === sprint)
      );
      return { content: [{ type: "text", text: formatSprintReview(tasks, sprint) }] };
    }

    case "get_sprint_retrospective": {
      const { sprint, project } = SprintReviewSchema.parse(args);
      const allTasks = await evaClient.listTasks();
      const tasks = allTasks.filter((t) =>
        t.lists.some((l) => l.code === sprint || l.id === sprint)
      );

      // Примерный cycle time (упрощённо)
      const closedTasks = tasks.filter((t) => isClosed(t.statusName) && t.createdAt && t.statusClosedAt);
      let avgHours: number | null = null;
      if (closedTasks.length > 0) {
        const totalHours = closedTasks.reduce((sum, t) => {
          const created = new Date(t.createdAt!).getTime();
          const closed = new Date(t.statusClosedAt!).getTime();
          return sum + (closed - created) / (1000 * 60 * 60);
        }, 0);
        avgHours = Math.round(totalHours / closedTasks.length);
      }

      return { content: [{ type: "text", text: formatSprintRetrospective(tasks, sprint, avgHours) }] };
    }

    case "get_team_workload": {
      const { project, sprint } = TeamWorkloadSchema.parse(args);
      const allTasks = await evaClient.listTasks();
      let tasks = allTasks.filter((t) => t.projectCode === project);
      if (sprint) {
        tasks = tasks.filter((t) =>
          t.lists.some((l) => l.code === sprint || l.id === sprint)
        );
      }
      return { content: [{ type: "text", text: formatTeamWorkload(tasks, project) }] };
    }

    case "get_project_health": {
      const { project } = ProjectHealthSchema.parse(args);
      const allTasks = await evaClient.listTasks();
      const tasks = allTasks.filter((t) => t.projectCode === project);
      const allSprints = await evaClient.listSprints();
      const sprints = allSprints.filter((s) => s.projectCode === project);
      return { content: [{ type: "text", text: formatProjectHealth(tasks, sprints, project) }] };
    }

    default:
      return null;
  }
}
