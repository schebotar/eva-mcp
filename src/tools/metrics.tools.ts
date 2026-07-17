import { z } from "zod";
import type { EvaClient } from "../eva-client.js";
import { computeBurndown } from "../metrics/burndown.js";
import { computeVelocity } from "../metrics/velocity.js";
import { computeCycleTime } from "../metrics/cycle-time.js";
import { computeCFD } from "../metrics/cumulative-flow.js";

// ── Zod-схемы ──────────────────────────────────────────────────

const BurndownSchema = z.object({
  sprint: z.string().min(1, "Код спринта обязателен"),
  project: z.string().min(1, "Код проекта обязателен"),
});

const VelocitySchema = z.object({
  project: z.string().min(1, "Код проекта обязателен"),
  sprint_count: z.number().int().min(1).max(10).optional().default(3),
});

const CycleTimeSchema = z.object({
  project: z.string().min(1, "Код проекта обязателен"),
  sprint: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional().default(50),
});

const CFDSchema = z.object({
  project: z.string().min(1, "Код проекта обязателен"),
  sprint: z.string().optional(),
  days: z.number().int().min(1).max(90).optional().default(14),
});

// ── Форматтеры ─────────────────────────────────────────────────

const TREND_EMOJI: Record<string, string> = {
  on_track: "✅",
  ahead: "🟢",
  behind: "🔴",
};

function formatBurndown(result: Awaited<ReturnType<typeof computeBurndown>>): string {
  if (result.totalTasks === 0) {
    return "Нет данных для построения burndown-диаграммы.";
  }

  const points = result.points.slice(-10); // последние 10 дней
  const lines: string[] = [
    `# Burndown — ${TREND_EMOJI[result.trend]} ${result.trend === "on_track" ? "По плану" : result.trend === "ahead" ? "Опережение" : "Отставание"}`,
    "",
    `| Показатель | Значение |`,
    `|------------|----------|`,
    `| Всего задач | ${result.totalTasks} |`,
    `| Выполнено | ${result.completedTasks} |`,
    `| Осталось | ${result.remainingTasks} |`,
    `| Прогресс | ${Math.round((result.completedTasks / result.totalTasks) * 100)}% |`,
    "",
    "## Динамика (последние дни)",
    "",
    "| Дата | Идеал | Факт |",
    "|------|-------|------|",
  ];

  for (const p of points) {
    const diff = p.ideal - p.actual;
    const marker = diff > 0 ? `+${diff} 🔴` : diff < 0 ? `${diff} 🟢` : "✓";
    lines.push(`| ${p.date} | ${p.ideal} | ${p.actual} (${marker}) |`);
  }

  return lines.join("\n");
}

function formatVelocity(result: Awaited<ReturnType<typeof computeVelocity>>): string {
  if (result.sprints.length === 0) {
    return "Нет данных о спринтах для расчёта velocity.";
  }

  const lines: string[] = [
    `# Velocity команды`,
    "",
    `| Показатель | Значение |`,
    `|------------|----------|`,
    `| Среднее выполненных задач | **${result.averageCompleted}** за спринт |`,
    `| Средний % выполнения | **${result.averageCompletionPct}%** |`,
    "",
    "## Последние спринты",
    "",
    "| Код | Название | Выполнено | Всего | % |",
    "|-----|----------|-----------|-------|---|",
  ];

  for (const s of result.sprints) {
    const bar = "█".repeat(Math.round(s.completionPct / 10)) + "░".repeat(10 - Math.round(s.completionPct / 10));
    lines.push(`| \`${s.code}\` | ${s.name} | ${s.completedTasks} | ${s.totalTasks} | ${bar} ${s.completionPct}% |`);
  }

  return lines.join("\n");
}

function formatCycleTime(result: Awaited<ReturnType<typeof computeCycleTime>>): string {
  if (result.totalAnalyzed === 0) {
    return "Нет закрытых задач для расчёта cycle time.";
  }

  const lines: string[] = [
    `# Cycle Time (часы)`,
    "",
    `| Метрика | Часов | Дней |`,
    `|---------|-------|------|`,
    `| Среднее | ${result.averageHours} | ${Math.round(result.averageHours / 24)} |`,
    `| Медиана | ${result.medianHours} | ${Math.round(result.medianHours / 24)} |`,
    `| Min | ${result.minHours} | ${Math.round(result.minHours / 24)} |`,
    `| Max | ${result.maxHours} | ${Math.round(result.maxHours / 24)} |`,
    `| P50 | ${result.p50} | ${Math.round(result.p50 / 24)} |`,
    `| P85 | ${result.p85} | ${Math.round(result.p85 / 24)} |`,
    `| P95 | ${result.p95} | ${Math.round(result.p95 / 24)} |`,
    "",
    `Проанализировано задач: **${result.totalAnalyzed}**`,
    "",
    "## Быстрейшие задачи",
    "",
    "| Код | Название | Часов |",
    "|-----|----------|-------|",
  ];

  for (const t of result.tasks.slice(0, 5)) {
    const name = t.name.length > 40 ? t.name.slice(0, 37) + "..." : t.name;
    lines.push(`| \`${t.code}\` | ${name} | ${t.hours} |`);
  }

  if (result.tasks.length > 5) {
    lines.push("", "## Медленнейшие задачи", "", "| Код | Название | Часов |", "|-----|----------|-------|");
    for (const t of result.tasks.slice(-5)) {
      const name = t.name.length > 40 ? t.name.slice(0, 37) + "..." : t.name;
      lines.push(`| \`${t.code}\` | ${name} | ${t.hours} |`);
    }
  }

  return lines.join("\n");
}

function formatCFD(result: Awaited<ReturnType<typeof computeCFD>>): string {
  if (result.totalTasks === 0) {
    return "Нет данных для CFD.";
  }

  const lines: string[] = [
    `# Cumulative Flow Diagram`,
    "",
    `Всего задач: **${result.totalTasks}** | Дней: **${result.dates.length}**`,
    "",
    "## Распределение по статусам (последний день)",
    "",
    "| Статус | Количество |",
    "|--------|------------|",
  ];

  for (const s of result.statuses) {
    const last = s.counts[s.counts.length - 1];
    lines.push(`| ${s.name} | ${last} |`);
  }

  lines.push("", "## Детально по дням", "");
  lines.push("| Дата |" + result.statuses.map((s) => ` ${s.name} |`).join(""));
  lines.push("|------|" + result.statuses.map(() => "-------|").join(""));

  // Последние 7 дней
  const recentDates = result.dates.slice(-7);
  for (let i = 0; i < recentDates.length; i++) {
    const idx = result.dates.indexOf(recentDates[i]);
    const cells = result.statuses.map((s) => ` ${s.counts[idx]} |`).join("");
    lines.push(`| ${recentDates[i]} |${cells}`);
  }

  return lines.join("\n");
}

// ── Определения инструментов ───────────────────────────────────

export const metricsToolDefs = [
  {
    name: "get_burndown_data",
    description:
      "Получить данные для burndown-диаграммы спринта. Возвращает идеальную и фактическую линии, " +
      "тренд (опережение/отставание/по плану).",
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
    name: "get_velocity",
    description:
      "Получить velocity команды — среднее количество выполненных задач за спринт " +
      "по последним N спринтам.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: { type: "string", description: "Код проекта" },
        sprint_count: { type: "number", description: "Количество спринтов для анализа (по умолчанию 3)" },
      },
      required: ["project"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "get_cycle_time",
    description:
      "Получить cycle time — время от создания до закрытия задачи. Среднее, медиана, " +
      "процентили (P50, P85, P95), самые быстрые и медленные задачи.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: { type: "string", description: "Код проекта" },
        sprint: { type: "string", description: "Фильтр по спринту (опционально)" },
        limit: { type: "number", description: "Максимум задач для анализа (по умолчанию 50)" },
      },
      required: ["project"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "get_cumulative_flow",
    description:
      "Получить данные Cumulative Flow Diagram — распределение задач по статусам за период.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: { type: "string", description: "Код проекта" },
        sprint: { type: "string", description: "Фильтр по спринту (опционально)" },
        days: { type: "number", description: "Количество дней (по умолчанию 14)" },
      },
      required: ["project"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
];

// ── Обработчик вызовов ─────────────────────────────────────────

export async function handleMetricsToolCall(
  name: string,
  args: unknown,
  evaClient: EvaClient
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean } | null> {
  switch (name) {
    case "get_burndown_data": {
      const { sprint, project } = BurndownSchema.parse(args);
      const result = await computeBurndown(evaClient, sprint, project);
      return { content: [{ type: "text", text: formatBurndown(result) }] };
    }

    case "get_velocity": {
      const { project, sprint_count } = VelocitySchema.parse(args);
      const result = await computeVelocity(evaClient, project, sprint_count);
      return { content: [{ type: "text", text: formatVelocity(result) }] };
    }

    case "get_cycle_time": {
      const { project, sprint, limit } = CycleTimeSchema.parse(args);
      const result = await computeCycleTime(evaClient, project, sprint, limit);
      return { content: [{ type: "text", text: formatCycleTime(result) }] };
    }

    case "get_cumulative_flow": {
      const { project, sprint, days } = CFDSchema.parse(args);
      const result = await computeCFD(evaClient, project, sprint, days);
      return { content: [{ type: "text", text: formatCFD(result) }] };
    }

    default:
      return null;
  }
}
