import { z } from "zod";
import type { EvaClient } from "../eva-client.js";
import type { TaskInfo, SprintInfo } from "../types.js";

// ── Zod-схемы ──────────────────────────────────────────────────

const EpicSummarySchema = z.object({
  epic: z.string().min(1, "Код задачи-эпика обязателен"),
  project: z.string().min(1, "Код проекта обязателен"),
});

const RoadmapSchema = z.object({
  project: z.string().min(1, "Код проекта обязателен"),
});

// ── Форматтеры ─────────────────────────────────────────────────

function isClosed(statusName: string | null): boolean {
  if (!statusName) return false;
  const lower = statusName.toLowerCase();
  return ["done", "closed", "выполнено", "закрыто", "готово", "завершено", "resolved", "completed", "finished"]
    .some((s) => lower.includes(s));
}

function formatEpicSummary(tasks: TaskInfo[], epicCode: string): string {
  if (tasks.length === 0) {
    return `Эпик \`${epicCode}\` не содержит задач.`;
  }

  const byStatus = new Map<string, TaskInfo[]>();
  let completedCount = 0;
  let totalEstimate = 0;
  let completedEstimate = 0;

  for (const t of tasks) {
    const st = t.statusName ?? "Без статуса";
    if (!byStatus.has(st)) byStatus.set(st, []);
    byStatus.get(st)!.push(t);

    if (isClosed(t.statusName)) {
      completedCount++;
      if (t.estimateWork !== null) completedEstimate += t.estimateWork;
    }
    if (t.estimateWork !== null) totalEstimate += t.estimateWork;
  }

  const pct = Math.round((completedCount / tasks.length) * 100);
  const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));

  const lines: string[] = [
    `# Эпик \`${epicCode}\``,
    "",
    `| Показатель | Значение |`,
    `|------------|----------|`,
    `| Всего задач | ${tasks.length} |`,
    `| Выполнено | ${completedCount} (${pct}%) |`,
    `| Прогресс | ${bar} |`,
  ];

  if (totalEstimate > 0) {
    const estPct = Math.round((completedEstimate / totalEstimate) * 100);
    lines.push(`| Оценка (ч) | ${completedEstimate} / ${totalEstimate} (${estPct}%) |`);
  }

  lines.push("", "## По статусам", "");
  lines.push("| Статус | Количество |");
  lines.push("|--------|------------|");
  for (const [status, group] of byStatus) {
    lines.push(`| ${status} | ${group.length} |`);
  }

  lines.push("", "## Задачи", "");
  lines.push("| Код | Название | Статус | Исполнитель |");
  lines.push("|-----|----------|--------|-------------|");
  for (const t of tasks) {
    const name = (t.name ?? "").length > 50 ? t.name.slice(0, 47) + "..." : t.name;
    lines.push(`| \`${t.code}\` | ${name} | ${t.statusName ?? "—"} | ${t.responsibleName ?? "—"} |`);
  }

  return lines.join("\n");
}

function formatRoadmap(
  epics: TaskInfo[],
  sprints: SprintInfo[],
  milestones: TaskInfo[],
  projectCode: string
): string {
  const lines: string[] = [
    `# Дорожная карта \`${projectCode}\``,
    "",
    "## Активные спринты",
    "",
  ];

  if (sprints.length > 0) {
    lines.push("| Код | Название | Статус | Даты |");
    lines.push("|-----|----------|--------|------|");
    for (const s of sprints) {
      const dates = [s.startDate, s.endDate].filter(Boolean).map((d) => d?.slice(0, 10)).join(" → ") || "—";
      lines.push(`| \`${s.code}\` | ${s.name} | ${s.statusName ?? "—"} | ${dates} |`);
    }
  } else {
    lines.push("Нет активных спринтов.");
  }

  lines.push("", "## Эпики", "");

  if (epics.length > 0) {
    lines.push("| Код | Название | Статус | Задач |");
    lines.push("|-----|----------|--------|-------|");
    for (const e of epics) {
      lines.push(`| \`${e.code}\` | ${e.name} | ${e.statusName ?? "—"} | — |`);
    }
  } else {
    lines.push("Нет эпиков в проекте.");
  }

  lines.push("", "## Вехи (Milestones)", "");

  if (milestones.length > 0) {
    lines.push("| Код | Название | Дедлайн | Статус |");
    lines.push("|-----|----------|---------|--------|");
    for (const m of milestones) {
      lines.push(`| \`${m.code}\` | ${m.name} | ${m.deadline ?? "—"} | ${m.statusName ?? "—"} |`);
    }
  } else {
    lines.push("Нет вех в проекте.");
  }

  return lines.join("\n");
}

// ── Определения инструментов ───────────────────────────────────

export const epicToolDefs = [
  {
    name: "get_epic_summary",
    description:
      "Получить сводку по эпику: количество задач, прогресс, распределение по статусам, список задач.",
    inputSchema: {
      type: "object" as const,
      properties: {
        epic: { type: "string", description: "Код задачи-эпика, например MCP-10" },
        project: { type: "string", description: "Код проекта" },
      },
      required: ["epic", "project"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "get_roadmap",
    description:
      "Получить дорожную карту проекта: активные спринты, эпики, вехи (milestones).",
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

export async function handleEpicToolCall(
  name: string,
  args: unknown,
  evaClient: EvaClient
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean } | null> {
  switch (name) {
    case "get_epic_summary": {
      const { epic, project } = EpicSummarySchema.parse(args);
      // Фильтруем на стороне API: проект + эпик
      const tasks = await evaClient.listTasks({
        filter: [
          "AND",
          ["parent.code", "==", project],
          ["epic", "IN", [epic]],
        ],
      });
      return { content: [{ type: "text", text: formatEpicSummary(tasks, epic) }] };
    }

    case "get_roadmap": {
      const { project } = RoadmapSchema.parse(args);
      // Фильтруем задачи по проекту на стороне API
      const projectTasks = await evaClient.listTasks({
        filter: ["parent.code", "==", project],
      });

      // Эпики — задачи без своего эпика, не закрытые, не вехи (клиентская фильтрация, т.к. API может не поддерживать фильтр «epic is null»)
      const epics = projectTasks.filter((t) =>
        t.epicCode === null && !isClosed(t.statusName) && t.isMilestone === false
      ).slice(0, 20);

      // Вехи — фильтруем клиентски по isMilestone (API может не поддерживать этот фильтр)
      const milestones = projectTasks.filter((t) => t.isMilestone);

      // Спринты — фильтруем по проекту на стороне API
      const allSprints = await evaClient.listSprints(["parent.code", "==", project]);
      const sprints = allSprints.filter((s) => s.statusName !== "Закрыто");

      return { content: [{ type: "text", text: formatRoadmap(epics, sprints, milestones, project) }] };
    }

    default:
      return null;
  }
}
