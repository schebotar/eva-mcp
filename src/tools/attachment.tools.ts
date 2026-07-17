import { z } from "zod";
import type { EvaClient } from "../eva-client.js";
import type { AttachmentInfo, WorklogEntry, StatusHistoryEntry, PersonInfo } from "../types.js";

// ── Zod-схемы ──────────────────────────────────────────────────

const GetAttachmentsSchema = z.object({
  code: z.string().min(1, "code обязателен"),
});

// ── Форматтер ──────────────────────────────────────────────────

function formatAttachments(attachments: AttachmentInfo[]): string {
  if (attachments.length === 0) {
    return "Вложений нет.";
  }

  const lines: string[] = [
    `# Вложения (${attachments.length})`,
    "",
    "| Имя | Тип | Размер | Дата | Автор |",
    "|-----|-----|--------|------|-------|",
  ];

  for (const a of attachments) {
    const size = a.fileSize !== null ? `${(a.fileSize / 1024).toFixed(1)} KB` : "—";
    lines.push(
      `| ${a.name} | ${a.mimeType ?? "—"} | ${size} | ${a.createdAt ?? "—"} | ${a.authorName ?? a.author ?? "—"} |`
    );
  }

  return lines.join("\n");
}

// ── Определение инструмента ────────────────────────────────────

export const attachmentToolDefs = [
  {
    name: "get_attachments",
    description: "Получить список вложений задачи по её коду.",
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

export async function handleAttachmentToolCall(
  name: string,
  args: unknown,
  evaClient: EvaClient
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean } | null> {
  if (name === "get_attachments") {
    const { code } = GetAttachmentsSchema.parse(args);
    const attachments = await evaClient.getAttachments(code);
    return { content: [{ type: "text", text: formatAttachments(attachments) }] };
  }
  return null;
}
