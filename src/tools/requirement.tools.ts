import { z } from "zod";
import type { EvaClient } from "../eva-client.js";
import type { RequirementInfo } from "../types.js";
import type { BqlFilter } from "../types.js";

// ── Приоритеты: маппинг имён в числа (ChoiceInt) ──────────────

const PRIORITY_MAP: Record<string, number> = {
  "none": 0, "нет": 0, "0": 0,
  "low": 1, "низкий": 1, "1": 1,
  "normal": 2, "средний": 2, "обычный": 2, "medium": 2, "2": 2,
  "high": 3, "высокий": 3, "3": 3,
  "critical": 4, "критичный": 4, "критический": 4, "4": 4,
};

function mapPriority(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") return value;
  const key = value.toLowerCase().trim();
  return PRIORITY_MAP[key] ?? (parseInt(value, 10) || undefined);
}

// ── Zod-схемы ──────────────────────────────────────────────────

export const GetRequirementSchema = z.object({
  code: z.string().min(1, "code обязателен"),
});

export const SearchRequirementsSchema = z.object({
  status: z.string().optional(),
  responsible: z.string().optional(),
  project: z.string().optional(),
  priority: z.string().optional(),
  query: z.string().optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().min(0).optional(),
});

// ── Форматтеры ─────────────────────────────────────────────────

function formatRequirement(req: RequirementInfo): string {
  const lines: string[] = [
    `# ${req.code}: ${req.name}`,
    "",
    `| Поле | Значение |`,
    `|------|----------|`,
    `| **Код** | ${req.code} |`,
    `| **Название** | ${req.name} |`,
    `| **Статус** | ${req.statusName ?? "—"} (\`${req.statusCode ?? req.status ?? "—"}\`) |`,
    `| **Приоритет** | ${req.priorityName ?? "—"} |`,
    `| **Тип** | ${req.typeName ?? "—"} |`,
    `| **Проект** | ${req.projectName ?? "—"} (\`${req.projectCode ?? "—"}\`) |`,
    `| **Автор** | ${req.authorName ?? req.author ?? "—"} |`,
    `| **Исполнитель** | ${req.responsibleName ?? req.responsible ?? "—"} |`,
    `| **Создано** | ${req.createdAt ?? "—"} |`,
    `| **Обновлено** | ${req.updatedAt ?? "—"} |`,
  ];

  if (req.deadline) {
    lines.push(`| **Дедлайн** | ${req.deadline} |`);
  }
  if (req.estimateWork !== null) {
    lines.push(`| **Оценка (ч)** | ${req.estimateWork} |`);
  }
  if (req.mark) {
    lines.push(`| **Оценка** | ${req.mark} |`);
  }
  if (req.epicCode) {
    lines.push(`| **Epic** | \`${req.epicCode}\` — ${req.epicName ?? "—"} |`);
  }
  if (req.parentTaskCode) {
    lines.push(`| **Родительская задача** | \`${req.parentTaskCode}\` — ${req.parentTaskName ?? "—"} |`);
  }
  if (req.workflowCode) {
    lines.push(`| **Бизнес-процесс** | \`${req.workflowCode}\` — ${req.workflowName ?? "—"} |`);
  }
  if (req.statusModifiedAt) {
    lines.push(`| **Статус изменён** | ${req.statusModifiedAt} |`);
  }
  if (req.statusClosedAt) {
    lines.push(`| **Закрыто** | ${req.statusClosedAt} |`);
  }
  lines.push("");

  if (req.executors.length > 0) {
    lines.push("## Соисполнители", "");
    for (let i = 0; i < req.executors.length; i++) {
      const name = req.executorNames[i];
      lines.push(`- \`${req.executors[i]}\`${name ? ` — ${name}` : ""}`);
    }
    lines.push("");
  }

  if (req.spectators.length > 0) {
    lines.push("## Наблюдатели", "");
    for (let i = 0; i < req.spectators.length; i++) {
      const name = req.spectatorNames[i];
      lines.push(`- \`${req.spectators[i]}\`${name ? ` — ${name}` : ""}`);
    }
    lines.push("");
  }

  if (req.tags.length > 0) {
    lines.push(`**Теги:** ${req.tags.map((t) => `\`${t}\``).join(", ")}`, "");
  }

  if (req.lists.length > 0) {
    lines.push("## Списки/спринты", "");
    for (const l of req.lists) {
      lines.push(`- \`${l.code || l.id}\` — ${l.name}`);
    }
    lines.push("");
  }

  if (req.components.length > 0) {
    lines.push(`**Компоненты:** ${req.components.map((c) => `\`${c}\``).join(", ")}`, "");
  }

  if (req.waitingFor) {
    lines.push(`**Ожидает ответа от:** \`${req.waitingFor}\`${req.waitingForName ? ` — ${req.waitingForName}` : ""}`, "");
  }

  if (req.text) {
    lines.push("## Описание", "", req.text, "");
  }

  if (req.textDraft) {
    lines.push("## Черновик", "", req.textDraft, "");
  }

  if (req.resultText) {
    lines.push("## Результат", "", req.resultText, "");
  }

  if (req.attachments.length > 0) {
    lines.push(
      "## Вложения",
      "",
      "| Имя | Тип | Размер | Дата | Автор |",
      "|-----|-----|--------|------|-------|"
    );
    for (const a of req.attachments) {
      const size = a.fileSize !== null ? `${(a.fileSize / 1024).toFixed(1)} KB` : "—";
      lines.push(
        `| ${a.name} | ${a.mimeType ?? "—"} | ${size} | ${a.createdAt ?? "—"} | ${a.authorName ?? a.author ?? "—"} |`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatRequirementList(reqs: RequirementInfo[], total?: number): string {
  if (reqs.length === 0) {
    return "Требования не найдены.";
  }

  const header =
    total !== undefined
      ? `# Требования (найдено: ${total}, показано: ${reqs.length})`
      : `# Требования (${reqs.length})`;

  const hasDeadline = reqs.some((r) => r.deadline !== null);

  const lines: string[] = [
    header,
    "",
  ];

  if (hasDeadline) {
    lines.push("| Код | Название | Статус | Приоритет | Исполнитель | Дедлайн |");
    lines.push("|-----|----------|--------|-----------|-------------|----------|");
  } else {
    lines.push("| Код | Название | Статус | Приоритет | Исполнитель |");
    lines.push("|-----|----------|--------|-----------|-------------|");
  }

  for (const r of reqs) {
    const name = r.name.length > 60 ? r.name.slice(0, 57) + "..." : r.name;
    const prio = r.priorityName ?? "—";
    const resp = r.responsibleName ?? r.responsible ?? "—";
    if (hasDeadline) {
      const dl = r.deadline ?? "—";
      lines.push(
        `| \`${r.code}\` | ${name} | ${r.statusCode ?? r.statusName ?? "—"} | ${prio} | ${resp} | ${dl} |`
      );
    } else {
      lines.push(
        `| \`${r.code}\` | ${name} | ${r.statusCode ?? r.statusName ?? "—"} | ${prio} | ${resp} |`
      );
    }
  }

  return lines.join("\n");
}

// ── Определения инструментов (для ListToolsRequestSchema) ──────

export const requirementToolDefs = [
  {
    name: "get_requirement",
    description:
      "Получить требование из EvaProject/EvaReq по коду (например, MSR-BR-0085). " +
      "Возвращает название, описание, статус, автора, исполнителя, проект.",
    inputSchema: {
      type: "object" as const,
      properties: {
        code: { type: "string", description: "Код требования, например MSR-BR-0085" },
      },
      required: ["code"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "search_requirements",
    description:
      "Поиск требований по фильтрам. Можно фильтровать по статусу, исполнителю, проекту, " +
      "приоритету и текстовому запросу. Возвращает список требований в виде таблицы.",
    inputSchema: {
      type: "object" as const,
      properties: {
        status: { type: "string", description: "Фильтр по статусу. **Код** статуса — возьми из `get_statuses`" },
        responsible: { type: "string", description: "Фильтр по исполнителю. **Логин** пользователя (email) — возьми из `search_users`" },
        project: { type: "string", description: "Фильтр по проекту. **Код проекта** (например `EvaReq`) — возьми из `search_projects`" },
        priority: { type: "string", description: "Фильтр по приоритету: `low`, `normal`, `high`, `critical` или 1-4" },
        query: { type: "string", description: "Текстовый поиск по **названию** требования" },
        limit: { type: "number", description: "Максимальное количество результатов" },
        offset: { type: "number", description: "Смещение для пагинации" },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
];

// ── Хелпер: построение BQL-фильтра для требований ─────────────

function buildRequirementFilter(args: Record<string, unknown>): BqlFilter[] {
  const filters: BqlFilter[] = [];

  if (args.status) {
    filters.push(["status.code", "==", String(args.status)]);
  }
  if (args.responsible) {
    filters.push(["responsible.login", "==", String(args.responsible)]);
  }
  if (args.projectId) {
    // parent не поддерживает nested filtering на CmfReq — используем parent_id с UUID
    filters.push(["parent_id", "==", String(args.projectId)]);
  }
  if (args.priority !== undefined) {
    const p = mapPriority(args.priority as string | number);
    if (p !== undefined) {
      filters.push(["priority", "==", p]);
    }
  }
  if (args.query) {
    filters.push(["name", "ILIKE", `%${String(args.query)}%`]);
  }

  return filters;
}

// ── Обработчик вызовов ─────────────────────────────────────────

export async function handleRequirementToolCall(
  name: string,
  args: unknown,
  evaClient: EvaClient
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean } | null> {
  switch (name) {
    case "get_requirement": {
      const { code } = GetRequirementSchema.parse(args);
      const req = await evaClient.getRequirement(code);
      return { content: [{ type: "text", text: formatRequirement(req) }] };
    }

    case "search_requirements": {
      const params = SearchRequirementsSchema.parse(args);

      // Резолвим код проекта → UUID (parent_id требует UUID)
      let projectId: string | undefined;
      if (params.project) {
        try {
          const project = await evaClient.getProject(params.project);
          projectId = project.id;
        } catch {
          // Проект не найден — возвращаем пустой результат вместо ошибки
          return { content: [{ type: "text", text: formatRequirementList([]) }] };
        }
      }

      const filterArgs: Record<string, unknown> = {};
      if (params.status) filterArgs.status = params.status;
      if (params.responsible) filterArgs.responsible = params.responsible;
      if (projectId) filterArgs.projectId = projectId;
      if (params.priority) filterArgs.priority = params.priority;
      if (params.query) filterArgs.query = params.query;

      const filters = buildRequirementFilter(filterArgs);
      const slice: [number, number] | undefined =
        params.limit !== undefined ? [params.offset ?? 0, params.limit] : undefined;

      const reqs = await evaClient.listRequirements({
        filter: filters.length > 0 ? filters : undefined,
        slice,
      });

      return { content: [{ type: "text", text: formatRequirementList(reqs) }] };
    }

    default:
      return null;
  }
}
