import { z } from "zod";
import type { EvaClient } from "../eva-client.js";
import type { LinkedTasksInfo, ReferencingTasksInfo, RelationInfo } from "../types.js";

// ── Zod-схемы ──────────────────────────────────────────────────

const GetLinkedTasksSchema = z.object({
  code: z.string().min(1, "code обязателен"),
});

const GetReferencingTasksSchema = z.object({
  code: z.string().min(1, "code обязателен"),
});

const GetLinkedTasksBatchSchema = z.object({
  codes: z.array(z.string().min(1)).min(1, "Укажите хотя бы один код").max(50, "Не более 50 кодов за раз"),
});

// ── Форматтеры ─────────────────────────────────────────────────

function formatLinkedTasks(linked: LinkedTasksInfo): string {
  const parts: string[] = [];

  if (linked.parentTask) {
    parts.push(
      "## Родительская задача",
      "",
      `- \`${linked.parentTask.code}\` — ${linked.parentTask.name} (${linked.parentTask.statusName ?? "—"})`,
      ""
    );
  }

  if (linked.childTasks.length > 0) {
    parts.push("## Дочерние задачи", "");
    for (const t of linked.childTasks) {
      parts.push(
        `- \`${t.code}\` — ${t.name} (${t.statusName ?? "—"}) | ${t.responsibleName ?? "—"}`
      );
    }
    parts.push("");
  }

  if (linked.dependedTasks.length > 0) {
    parts.push("## Зависимые задачи (depended)", "");
    for (const t of linked.dependedTasks) {
      parts.push(
        `- \`${t.code}\` — ${t.name} (${t.statusName ?? "—"}) | ${t.responsibleName ?? "—"}`
      );
    }
    parts.push("");
  }

  if (linked.affectedTasks.length > 0) {
    parts.push("## Связанные задачи (affected)", "");
    for (const t of linked.affectedTasks) {
      parts.push(
        `- \`${t.code}\` — ${t.name} (${t.statusName ?? "—"}) | ${t.responsibleName ?? "—"}`
      );
    }
    parts.push("");
  }

  if (linked.precedesTasks.length > 0) {
    const grouped = new Map<string, RelationInfo[]>();
    for (const r of linked.precedesTasks) {
      const key = r.outTypeName ?? "Связь";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(r);
    }
    for (const [label, rels] of grouped) {
      parts.push(`## ${label}`, "");
      for (const r of rels) {
        parts.push(`- \`${r.inTask.code}\` — ${r.inTask.name}`);
      }
      parts.push("");
    }
  }

  if (linked.followsTasks.length > 0) {
    const grouped = new Map<string, RelationInfo[]>();
    for (const r of linked.followsTasks) {
      const key = r.inTypeName ?? "Связь";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(r);
    }
    for (const [label, rels] of grouped) {
      parts.push(`## ${label}`, "");
      for (const r of rels) {
        parts.push(`- \`${r.outTask.code}\` — ${r.outTask.name}`);
      }
      parts.push("");
    }
  }

  if (parts.length === 0) {
    return "Связанных задач нет.";
  }

  return parts.join("\n");
}

function formatReferencingTasks(refs: ReferencingTasksInfo): string {
  const parts: string[] = [];

  if (refs.tasksWithThisAsParent.length > 0) {
    parts.push("## Задачи, в которых эта задача — родительская", "");
    for (const t of refs.tasksWithThisAsParent) {
      parts.push(
        `- \`${t.code}\` — ${t.name} (${t.statusName ?? "—"}) | ${t.responsibleName ?? "—"}`
      );
    }
    parts.push("");
  }

  if (refs.tasksWithThisAsDepended.length > 0) {
    parts.push("## Задачи, которые зависят от этой (depended)", "");
    for (const t of refs.tasksWithThisAsDepended) {
      parts.push(
        `- \`${t.code}\` — ${t.name} (${t.statusName ?? "—"}) | ${t.responsibleName ?? "—"}`
      );
    }
    parts.push("");
  }

  if (refs.tasksWithThisAsAffected.length > 0) {
    parts.push("## Задачи, связанные с этой (affected)", "");
    for (const t of refs.tasksWithThisAsAffected) {
      parts.push(
        `- \`${t.code}\` — ${t.name} (${t.statusName ?? "—"}) | ${t.responsibleName ?? "—"}`
      );
    }
    parts.push("");
  }

  if (parts.length === 0) {
    return "Ни одна задача не ссылается на эту.";
  }

  return parts.join("\n");
}

function formatLinkedTasksBatch(
  batch: Record<string, LinkedTasksInfo>,
  codes: string[]
): string {
  const lines: string[] = [`# Связанные задачи (${codes.length} шт.)`, ""];

  for (const code of codes) {
    const linked = batch[code];
    lines.push(`## ${code}`, "");
    if (linked) {
      if (linked.parentTask) {
        lines.push(`- **Родительская**: \`${linked.parentTask.code}\` — ${linked.parentTask.name} (${linked.parentTask.statusName ?? "—"})`);
      }
      if (linked.childTasks.length > 0) {
        lines.push(`- **Дочерние**: ${linked.childTasks.map((t) => `\`${t.code}\``).join(", ")}`);
      }
      if (linked.dependedTasks.length > 0) {
        lines.push(`- **Зависимые**: ${linked.dependedTasks.map((t) => `\`${t.code}\``).join(", ")}`);
      }
      if (linked.affectedTasks.length > 0) {
        lines.push(`- **Связанные**: ${linked.affectedTasks.map((t) => `\`${t.code}\``).join(", ")}`);
      }
      if (linked.precedesTasks.length > 0) {
        const label = linked.precedesTasks[0].outTypeName ?? "Предшествует";
        lines.push(`- **${label}**: ${linked.precedesTasks.map((r) => `\`${r.inTask.code}\``).join(", ")}`);
      }
      if (linked.followsTasks.length > 0) {
        const label = linked.followsTasks[0].inTypeName ?? "Следует за";
        lines.push(`- **${label}**: ${linked.followsTasks.map((r) => `\`${r.outTask.code}\``).join(", ")}`);
      }
      const hasAny = linked.parentTask || linked.childTasks.length > 0 || linked.dependedTasks.length > 0 || linked.affectedTasks.length > 0 || linked.precedesTasks.length > 0 || linked.followsTasks.length > 0;
      if (!hasAny) {
        lines.push("- Связанных задач нет");
      }
    } else {
      lines.push("- ⚠️ Задача не найдена");
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ── Определения инструментов ───────────────────────────────────

export const linkedToolDefs = [
  {
    name: "get_linked_tasks",
    description:
      "Получить все задачи, связанные с указанной задачей: родительскую, дочерние, " +
      "зависимые (depended) и связанные (affected). Для нескольких задач эффективнее использовать get_linked_tasks_batch.",
    inputSchema: {
      type: "object" as const,
      properties: {
        code: { type: "string", description: "Код задачи, например DEV-000003" },
      },
      required: ["code"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "get_referencing_tasks",
    description:
      "Обратный поиск связей: найти задачи, которые ссылаются на указанную (в полях " +
      "родительская, depended, affected). Результат сгруппирован по типу связи. " +
      "Для комбинирования с другими фильтрами используйте search_tasks с параметром linked_to.",
    inputSchema: {
      type: "object" as const,
      properties: {
        code: { type: "string", description: "Код задачи, например MSR-903" },
      },
      required: ["code"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "get_linked_tasks_batch",
    description:
      "Батчевый вариант get_linked_tasks: получить связи для нескольких задач за один вызов. " +
      "Принимает до 50 кодов задач.",
    inputSchema: {
      type: "object" as const,
      properties: {
        codes: {
          type: "array",
          items: { type: "string" },
          description: "Коды задач, например [\"DEV-001\", \"DEV-002\"]",
        },
      },
      required: ["codes"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
];

// ── Обработчик вызовов ─────────────────────────────────────────

export async function handleLinkedToolCall(
  name: string,
  args: unknown,
  evaClient: EvaClient
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean } | null> {
  switch (name) {
    case "get_linked_tasks": {
      const { code } = GetLinkedTasksSchema.parse(args);
      const linked = await evaClient.getLinkedTasks(code);
      return { content: [{ type: "text", text: formatLinkedTasks(linked) }] };
    }

    case "get_referencing_tasks": {
      const { code } = GetReferencingTasksSchema.parse(args);
      const refs = await evaClient.getReferencingTasks(code);
      return { content: [{ type: "text", text: formatReferencingTasks(refs) }] };
    }

    case "get_linked_tasks_batch": {
      const { codes } = GetLinkedTasksBatchSchema.parse(args);
      const batch = await evaClient.getLinkedTasksBatch(codes);
      return { content: [{ type: "text", text: formatLinkedTasksBatch(batch, codes) }] };
    }

    default:
      return null;
  }
}
