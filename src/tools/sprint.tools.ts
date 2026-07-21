import { z } from "zod";
import type { EvaClient } from "../eva-client.js";
import type { SprintInfo } from "../types.js";

// ── Zod-схемы ──────────────────────────────────────────────────

export const GetSprintSchema = z.object({
  code: z.string().min(1, "code обязателен"),
});

export const SearchSprintsSchema = z.object({
  project: z.string().optional(),
  status: z.string().optional(),
  query: z.string().optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().min(0).optional(),
});

export const CreateSprintSchema = z.object({
  name: z.string().min(1, "Название спринта обязательно"),
  project: z.string().min(1, "Код проекта обязателен"),
  code: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  owner: z.string().optional(),
});

export const UpdateSprintSchema = z.object({
  code: z.string().min(1, "code обязателен"),
  name: z.string().optional(),
  status: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  is_default: z.boolean().optional(),
  owner: z.string().optional(),
});

const DeleteSprintSchema = z.object({
  code: z.string().min(1, "code обязателен"),
});

// ── Форматтеры ─────────────────────────────────────────────────

function formatSprint(sprint: SprintInfo): string {
  const lines: string[] = [
    `# ${sprint.code}: ${sprint.name}`,
    "",
    `| Поле | Значение |`,
    `|------|----------|`,
    `| **Код** | \`${sprint.code}\` |`,
    `| **Название** | ${sprint.name} |`,
    `| **Статус** | ${sprint.statusName ?? "—"} |`,
    `| **Проект** | ${sprint.projectName ?? "—"} (\`${sprint.projectCode ?? "—"}\`) |`,
    `| **Владелец** | ${sprint.ownerName ?? sprint.ownerLogin ?? "—"} |`,
    `| **Дата начала** | ${sprint.startDate ?? "—"} |`,
    `| **Дата окончания** | ${sprint.endDate ?? "—"} |`,
    `| **По умолчанию** | ${sprint.isDefault ? "✅ Да" : "Нет"} |`,
    `| **Создан** | ${sprint.createdAt ?? "—"} |`,
    `| **Обновлён** | ${sprint.updatedAt ?? "—"} |`,
    `| **Тип** | \`${sprint.sysType ?? "—"}\` |`,
    `| **LogicType** | \`${sprint.logicType ?? "—"}\` |`,
    `| **Workflow** | \`${sprint.workflowCode ?? "—"}\` — ${sprint.workflowName ?? "—"} |`,
    `| **SchemeWF** | \`${sprint.schemeWfCode ?? "—"}\` — ${sprint.schemeWfName ?? "—"} |`,
    `| **Родитель** | ${sprint.treeParentName ?? "—"} (\`${sprint.treeParentCode ?? "—"}\`) |`,
    "",
  ];

  return lines.join("\n");
}

function formatSprintList(sprints: SprintInfo[], total?: number): string {
  if (sprints.length === 0) {
    return "Спринты не найдены.";
  }

  const header =
    total !== undefined
      ? `# Спринты (найдено: ${total}, показано: ${sprints.length})`
      : `# Спринты (${sprints.length})`;

  const lines: string[] = [
    header,
    "",
    "| Код | Название | Статус | Проект | Даты |",
    "|-----|----------|--------|--------|------|",
  ];

  for (const s of sprints) {
    const dates = [s.startDate, s.endDate]
      .filter(Boolean)
      .map((d) => d?.slice(0, 10))
      .join(" → ") || "—";
    lines.push(
      `| \`${s.code}\` | ${s.name} | ${s.statusName ?? "—"} | ${s.projectName ?? "—"} | ${dates} |`
    );
  }

  return lines.join("\n");
}

// ── Определения инструментов ───────────────────────────────────

export const sprintToolDefs = [
  {
    name: "get_sprint",
    description:
      "Получить информацию о спринте (списке) по его коду. Возвращает название, статус, " +
      "проект, даты начала/окончания, владельца и признак «по умолчанию».",
    inputSchema: {
      type: "object" as const,
      properties: {
        code: { type: "string", description: "Код спринта, например SPR-000001" },
      },
      required: ["code"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "search_sprints",
    description:
      "Поиск спринтов по фильтрам: проекту, статусу, текстовому запросу. " +
      "Возвращает список спринтов в виде таблицы.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: { type: "string", description: "Фильтр по проекту. **Код проекта** — возьми из `search_projects`" },
        status: { type: "string", description: "Фильтр по статусу. **Код** статуса — возьми из `get_statuses`" },
        query: { type: "string", description: "Текстовый поиск по **названию** спринта" },
        limit: { type: "number", description: "Максимальное количество результатов" },
        offset: { type: "number", description: "Смещение для пагинации" },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "create_sprint",
    description:
      "Создать новый спринт (список) в проекте. Требуется название и код проекта.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Название спринта (обязательно)" },
        project: { type: "string", description: "Код проекта, в котором создаётся спринт (обязательно)" },
        code: { type: "string", description: "Код спринта (если не указан — сгенерируется автоматически)" },
        start_date: { type: "string", description: "Дата начала (ISO, например 2026-07-20)" },
        end_date: { type: "string", description: "Дата окончания (ISO, например 2026-08-03)" },
        owner: { type: "string", description: "Владелец спринта. **Логин** пользователя (email) — возьми из `search_users`" },
      },
      required: ["name", "project"],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  },
  {
    name: "update_sprint",
    description:
      "Обновить поля спринта: название, статус, даты начала/окончания, признак " +
      "«по умолчанию», владелец.",
    inputSchema: {
      type: "object" as const,
      properties: {
        code: { type: "string", description: "Код спринта (обязательно)" },
        name: { type: "string", description: "Новое название спринта" },
        status: { type: "string", description: "Новый статус. **Код** статуса — возьми из `get_statuses`" },
        start_date: { type: "string", description: "Новая дата начала (ISO)" },
        end_date: { type: "string", description: "Новая дата окончания (ISO)" },
        is_default: { type: "boolean", description: "Сделать спринтом по умолчанию" },
        owner: { type: "string", description: "Новый владелец. **Логин** пользователя (email) — возьми из `search_users`" },
      },
      required: ["code"],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  },
  {
    name: "delete_sprint",
    description: "Удалить спринт по коду.",
    inputSchema: {
      type: "object" as const,
      properties: {
        code: { type: "string", description: "Код спринта для удаления" },
      },
      required: ["code"],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  },
];

// ── Обработчик вызовов ─────────────────────────────────────────

export async function handleSprintToolCall(
  name: string,
  args: unknown,
  evaClient: EvaClient
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean } | null> {
  switch (name) {
    case "get_sprint": {
      const { code } = GetSprintSchema.parse(args);
      const sprint = await evaClient.getSprint(code);
      return { content: [{ type: "text", text: formatSprint(sprint) }] };
    }

    case "search_sprints": {
      const params = SearchSprintsSchema.parse(args);
      const filters: Record<string, unknown> = {};
      if (params.project) filters.project = params.project;
      if (params.status) filters.status = params.status;
      if (params.query) filters.query = params.query;

      const bqlFilters = buildSprintFilter(filters);

      const tasks = await evaClient.listSprints(
        bqlFilters.length > 0 ? bqlFilters : undefined
      );

      const total = bqlFilters.length > 0
        ? await evaClient.countSprints(bqlFilters)
        : undefined;

      return { content: [{ type: "text", text: formatSprintList(tasks, total) }] };
    }

    case "create_sprint": {
      const { name, project, code, start_date, end_date, owner } = CreateSprintSchema.parse(args);

      // Получаем ID проекта по коду
      const projectInfo = await evaClient.getProject(project);

      // Пытаемся найти папку Sprints в проекте для tree_parent_id
      const treeParentId = await evaClient.findSprintsFolderId(projectInfo.id);

      const fields: Record<string, unknown> = {
        name,
        parent_id: projectInfo.id,
        executors: [],
        spectators: [],
      };
      if (code) fields.code = code;
      if (start_date) fields.plan_start_date = start_date;
      if (end_date) fields.plan_end_date = end_date;
      if (owner) fields.cmf_owner = owner;
      if (treeParentId) fields.tree_parent_id = treeParentId;

      const sprint = await evaClient.createSprint(fields);
      return { content: [{ type: "text", text: "✅ Спринт создан.\n\n" + formatSprint(sprint) }] };
    }

    case "update_sprint": {
      const { code, ...rest } = UpdateSprintSchema.parse(args);

      const fields: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(rest)) {
        if (value !== undefined && value !== null) {
          // Маппинг: owner → cmf_owner, start_date → plan_start_date, end_date → plan_end_date, status → status_id
          const mappedKey = key === "owner" ? "cmf_owner"
            : key === "start_date" ? "plan_start_date"
            : key === "end_date" ? "plan_end_date"
            : key === "status" ? "status_id"
            : key;
          fields[mappedKey] = value;
        }
      }

      if (Object.keys(fields).length === 0) {
        throw new Error("Не указаны поля для обновления");
      }

      const sprint = await evaClient.updateSprint(code, fields);
      return { content: [{ type: "text", text: "✅ Спринт обновлён.\n\n" + formatSprint(sprint) }] };
    }

    case "delete_sprint": {
      const { code } = DeleteSprintSchema.parse(args);
      await evaClient.deleteSprint(code);
      return { content: [{ type: "text", text: `✅ Спринт \`${code}\` удалён.` }] };
    }

    default:
      return null;
  }
}

/** Строит BQL-фильтры для поиска спринтов */
function buildSprintFilter(args: Record<string, unknown>): import("../types.js").BqlFilter[] {
  const filters: import("../types.js").BqlFilter[] = [];
  if (!args) return filters;

  // TODO: parent фильтр требует UUID
  // if (args.project) filters.push(["parent_id", "==", args.project]);
  if (args.status) filters.push(["status", "==", args.status]);
  if (args.query) filters.push(["name", "ILIKE", `%${args.query}%`]);

  return filters;
}
