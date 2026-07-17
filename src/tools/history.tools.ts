import { z } from "zod";
import type { EvaClient } from "../eva-client.js";
import type { StatusHistoryEntry } from "../types.js";

// ── Zod-схема ──────────────────────────────────────────────────

const GetTaskHistorySchema = z.object({
  code: z.string().min(1, "code обязателен"),
});

// ── Форматтер ──────────────────────────────────────────────────

function formatHistory(entries: StatusHistoryEntry[]): string {
  if (entries.length === 0) {
    return "История изменений статуса пуста.";
  }

  const lines: string[] = [
    `# История изменений статуса (${entries.length})`,
    "",
    "| Дата | Автор | Из статуса | В статус |",
    "|------|-------|-----------|----------|",
  ];

  for (const e of entries) {
    const author = e.authorName ?? e.author ?? "—";
    lines.push(
      `| ${e.createdAt ?? "—"} | ${author} | ${e.fromStatus ?? "—"} | ${e.toStatus ?? "—"} |`
    );
  }

  return lines.join("\n");
}

// ── Определение инструмента ────────────────────────────────────

export const historyToolDefs = [
  {
    name: "get_task_history",
    description:
      "Получить историю изменения статусов задачи. Возвращает записи с датой, автором, " +
      "предыдущим и новым статусом.",
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

export async function handleHistoryToolCall(
  name: string,
  args: unknown,
  evaClient: EvaClient
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean } | null> {
  if (name === "get_task_history") {
    const { code } = GetTaskHistorySchema.parse(args);
    const entries = await evaClient.getTaskHistory(code);
    return { content: [{ type: "text", text: formatHistory(entries) }] };
  }
  return null;
}
