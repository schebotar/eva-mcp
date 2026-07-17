import { z } from "zod";
import type { EvaClient } from "../eva-client.js";
import type { WorklogEntry } from "../types.js";

// ── Zod-схема ──────────────────────────────────────────────────

const GetWorklogSchema = z.object({
  code: z.string().min(1, "code обязателен"),
});

// ── Форматтер ──────────────────────────────────────────────────

function formatWorklog(entries: WorklogEntry[]): string {
  if (entries.length === 0) {
    return "Записей в журнале работ нет.";
  }

  const lines: string[] = [
    `# Журнал работ (${entries.length})`,
    "",
    "| Дата | Пользователь | Время (мин) | Описание |",
    "|------|-------------|-------------|----------|",
  ];

  for (const e of entries) {
    const author = e.authorName ?? e.author ?? "—";
    const time = e.timeSpent !== null ? `${e.timeSpent}` : "—";
    const text = e.text.length > 80 ? e.text.slice(0, 77) + "..." : e.text;
    lines.push(
      `| ${e.startDate ?? e.createdAt ?? "—"} | ${author} | ${time} | ${text} |`
    );
  }

  return lines.join("\n");
}

// ── Определение инструмента ────────────────────────────────────

export const worklogToolDefs = [
  {
    name: "get_task_worklog",
    description:
      "Получить журнал работ (timetracker) по задаче. Возвращает записи с датой, пользователем, " +
      "затраченным временем и описанием.",
    inputSchema: {
      type: "object" as const,
      properties: {
        code: { type: "string", description: "Код задачи, например DEV-000003" },
      },
      required: ["code"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
];

// ── Обработчик ─────────────────────────────────────────────────

export async function handleWorklogToolCall(
  name: string,
  args: unknown,
  evaClient: EvaClient
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean } | null> {
  if (name === "get_task_worklog") {
    const { code } = GetWorklogSchema.parse(args);
    const entries = await evaClient.getWorklog(code);
    return { content: [{ type: "text", text: formatWorklog(entries) }] };
  }
  return null;
}
