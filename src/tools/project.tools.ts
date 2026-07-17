import { z } from "zod";
import type { EvaClient } from "../eva-client.js";
import type { BqlFilter, ProjectInfo } from "../types.js";

// ── Zod-схемы ──────────────────────────────────────────────────

const GetProjectSchema = z.object({
  code: z.string().min(1, "code обязателен"),
});

const SearchProjectsSchema = z.object({
  query: z.string().optional(),
});

// ── Форматтеры ─────────────────────────────────────────────────

function formatProject(project: ProjectInfo): string {
  const lines: string[] = [
    `# ${project.code}: ${project.name}`,
    "",
    `| Поле | Значение |`,
    `|------|----------|`,
    `| **Код** | ${project.code} |`,
    `| **Название** | ${project.name} |`,
    `| **Статус** | ${project.statusName ?? "—"} |`,
    `| **Создан** | ${project.createdAt ?? "—"} |`,
    `| **Обновлён** | ${project.updatedAt ?? "—"} |`,
    "",
  ];

  if (project.description) {
    lines.push("## Описание", "", project.description, "");
  }

  return lines.join("\n");
}

// ── Определения инструментов ───────────────────────────────────

export const projectToolDefs = [
  {
    name: "get_project",
    description: "Получить информацию о проекте по его коду.",
    inputSchema: {
      type: "object" as const,
      properties: {
        code: { type: "string", description: "Код проекта в EvaProject" },
      },
      required: ["code"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "search_projects",
    description: "Поиск проектов по названию.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Текстовый поиск по названию проекта" },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
];

// ── Обработчик вызовов ─────────────────────────────────────────

export async function handleProjectToolCall(
  name: string,
  args: unknown,
  evaClient: EvaClient
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean } | null> {
  switch (name) {
    case "get_project": {
      const { code } = GetProjectSchema.parse(args);
      const project = await evaClient.getProject(code);
      return { content: [{ type: "text", text: formatProject(project) }] };
    }

    case "search_projects": {
      const { query } = SearchProjectsSchema.parse(args);
      const filters: BqlFilter[] = query ? [["name", "ILIKE", `%${query}%`]] : [];
      const projects = await evaClient.listProjects(
        filters.length > 0 ? filters : undefined
      );
      if (projects.length === 0) {
        return { content: [{ type: "text", text: "Проекты не найдены." }] };
      }
      const lines: string[] = [
        `# Проекты (${projects.length})`,
        "",
        "| Код | Название | Статус |",
        "|-----|----------|--------|",
      ];
      for (const p of projects) {
        lines.push(`| \`${p.code}\` | ${p.name} | ${p.statusName ?? "—"} |`);
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }

    default:
      return null;
  }
}
