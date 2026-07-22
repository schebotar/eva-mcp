import { z } from "zod";
import type { EvaClient } from "../eva-client.js";
import { mdToHtml } from "../helpers/markdown.js";

// ── Zod-схема ──────────────────────────────────────────────────

const AddCommentSchema = z.object({
  code: z.string().min(1, "Код задачи обязателен"),
  text: z.string().min(1, "Текст комментария обязателен"),
});

// ── Определение инструмента ────────────────────────────────────

export const commentToolDefs = [
  {
    name: "add_comment",
    description:
      "Добавить комментарий к задаче. Принимает код задачи и текст комментария (Markdown, конвертируется в HTML).",
    inputSchema: {
      type: "object" as const,
      properties: {
        code: { type: "string", description: "Код задачи, например DEV-000003" },
        text: { type: "string", description: "Текст комментария (Markdown, конвертируется в HTML)" },
      },
      required: ["code", "text"],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  },
];

// ── Обработчик ─────────────────────────────────────────────────

export async function handleCommentToolCall(
  name: string,
  args: unknown,
  evaClient: EvaClient
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean } | null> {
  if (name === "add_comment") {
    const { code, text } = AddCommentSchema.parse(args);
    const comment = await evaClient.addComment(code, mdToHtml(text));
    return {
      content: [{
        type: "text",
        text: `✅ Комментарий добавлен к задаче \`${code}\`.\n\n**Автор:** ${comment.authorName ?? comment.author ?? "—"}\n**Дата:** ${comment.createdAt ?? "—"}\n\n${comment.text}`,
      }],
    };
  }
  return null;
}
