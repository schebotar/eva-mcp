import { z } from "zod";
import type { EvaClient } from "../eva-client.js";
import type { PersonInfo, StatusInfo } from "../types.js";

// ── Zod-схемы ──────────────────────────────────────────────────

const SearchUsersSchema = z.object({
  query: z.string().min(1, "Укажите имя или логин для поиска"),
});

// ── Форматтеры ─────────────────────────────────────────────────

function formatUsers(users: PersonInfo[]): string {
  if (users.length === 0) {
    return "Пользователи не найдены.";
  }

  const lines: string[] = [
    `# Пользователи (${users.length})`,
    "",
    "| Логин | Имя | Фамилия | Email |",
    "|-------|-----|---------|-------|",
  ];

  for (const u of users) {
    const login = u.login || "—";
    const firstName = u.firstName ?? "—";
    const lastName = u.lastName ?? "—";
    const email = u.email ?? "—";
    lines.push(`| \`${login}\` | ${firstName} | ${lastName} | ${email} |`);
  }

  return lines.join("\n");
}

function formatStatuses(statuses: StatusInfo[]): string {
  if (statuses.length === 0) {
    return "Статусы не найдены.";
  }

  const lines: string[] = [
    `# Статусы (${statuses.length})`,
    "",
    "| ID | Название | Код | Тип |",
    "|----|----------|-----|-----|",
  ];

  for (const s of statuses) {
    lines.push(
      `| \`${s.id}\` | ${s.name} | \`${s.code ?? "—"}\` | ${s.type ?? "—"} |`
    );
  }

  return lines.join("\n");
}

// ── Определения инструментов ───────────────────────────────────

export const userToolDefs = [
  {
    name: "search_users",
    description: "Поиск пользователей по имени, фамилии или логину.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Текстовый поиск по **имени**, **фамилии** или **логину** (email) пользователя" },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "get_statuses",
    description:
      "Получить справочник всех статусов задач с их ID, названиями и кодами. " +
      "Полезно перед вызовом update_task, search_tasks и count_tasks — фильтрация по статусу требует **код** статуса (колонка Код).",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
];

// ── Обработчик вызовов ─────────────────────────────────────────

export async function handleUserToolCall(
  name: string,
  args: unknown,
  evaClient: EvaClient
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean } | null> {
  switch (name) {
    case "search_users": {
      const { query } = SearchUsersSchema.parse(args);
      const users = await evaClient.searchUsers(query);
      return { content: [{ type: "text", text: formatUsers(users) }] };
    }

    case "get_statuses": {
      const statuses = await evaClient.getStatuses();
      return { content: [{ type: "text", text: formatStatuses(statuses) }] };
    }

    default:
      return null;
  }
}
