import { z } from "zod";
import type { EvaClient } from "../eva-client.js";
import type { PersonInfo } from "../types.js";

// ── Zod-схема ──────────────────────────────────────────────────

const GetFollowersSchema = z.object({
  code: z.string().min(1, "code обязателен"),
});

// ── Форматтер ──────────────────────────────────────────────────

function formatFollowers(followers: PersonInfo[]): string {
  if (followers.length === 0) {
    return "Подписчиков нет.";
  }

  const lines: string[] = [
    `# Подписчики (${followers.length})`,
    "",
    "| Логин | Имя | Email |",
    "|-------|-----|-------|",
  ];

  for (const f of followers) {
    const name = [f.firstName, f.lastName].filter(Boolean).join(" ") || f.name;
    lines.push(`| \`${f.login}\` | ${name} | ${f.email ?? "—"} |`);
  }

  return lines.join("\n");
}

// ── Определение инструмента ────────────────────────────────────

export const followerToolDefs = [
  {
    name: "get_task_followers",
    description: "Получить список подписчиков задачи.",
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

export async function handleFollowerToolCall(
  name: string,
  args: unknown,
  evaClient: EvaClient
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean } | null> {
  if (name === "get_task_followers") {
    const { code } = GetFollowersSchema.parse(args);
    const followers = await evaClient.getFollowers(code);
    return { content: [{ type: "text", text: formatFollowers(followers) }] };
  }
  return null;
}
