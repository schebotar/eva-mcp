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

const LinkTasksSchema = z.object({
  code: z.string().min(1, "code обязателен"),
  depended_tasks: z.array(z.string()).optional(),
  affected_tasks: z.array(z.string()).optional(),
  local_links: z.array(z.string()).optional(),
  parent_task: z.string().optional(),
}).refine(
  (data) => data.depended_tasks || data.affected_tasks || data.local_links || data.parent_task,
  { message: "Укажите хотя бы один тип связи: depended_tasks, affected_tasks, local_links или parent_task" }
);

const UnlinkTasksSchema = z.object({
  code: z.string().min(1, "code обязателен"),
  depended_tasks: z.array(z.string()).optional(),
  affected_tasks: z.array(z.string()).optional(),
  local_links: z.array(z.string()).optional(),
  parent_task: z.string().optional(),
}).refine(
  (data) => data.depended_tasks || data.affected_tasks || data.local_links || data.parent_task,
  { message: "Укажите хотя бы один тип связи для удаления: depended_tasks, affected_tasks, local_links или parent_task" }
);

// ── Произвольные связи (CmfRelationOption) ────────────────────

const ListRelationTypesSchema = z.object({});

const LinkRelationSchema = z.object({
  code: z.string().min(1, "code обязателен"),
  target: z.string().min(1, "target обязателен"),
  relation_type: z.string().min(1, "relation_type обязателен"),
});

const UnlinkRelationSchema = z.object({
  code: z.string().min(1, "code обязателен"),
  target: z.string().optional(),
  relation_type: z.string().optional(),
  relation_id: z.string().optional(),
}).refine(
  (data) => data.target || data.relation_id,
  { message: "Укажите target (пару задач) или relation_id для удаления" }
);

// ── Форматтеры ─────────────────────────────────────────────────

function formatLinkedTasks(linked: LinkedTasksInfo): string {
  const parts: string[] = [];

  if (linked.parentTask) {
    parts.push(
      "## Родительская задача",
      "",
      `- \`${linked.parentTask.code}\` — ${linked.parentTask.name} (${linked.parentTask.statusCode ?? linked.parentTask.statusName ?? "—"})`,
      ""
    );
  }

  if (linked.childTasks.length > 0) {
    parts.push("## Дочерние задачи", "");
    for (const t of linked.childTasks) {
      const sprints = t.lists.length > 0 ? ` [${t.lists.map(l => l.code || l.name).join(", ")}]` : "";
      parts.push(
        `- \`${t.code}\` — ${t.name} (${t.statusCode ?? t.statusName ?? "—"})${sprints} | ${t.responsibleName ?? "—"}`
      );
    }
    parts.push("");
  }

  if (linked.dependedTasks.length > 0) {
    parts.push("## Зависимые задачи (depended)", "");
    for (const t of linked.dependedTasks) {
      const sprints = t.lists.length > 0 ? ` [${t.lists.map(l => l.code || l.name).join(", ")}]` : "";
      parts.push(
        `- \`${t.code}\` — ${t.name} (${t.statusCode ?? t.statusName ?? "—"})${sprints} | ${t.responsibleName ?? "—"}`
      );
    }
    parts.push("");
  }

  if (linked.affectedTasks.length > 0) {
    parts.push("## Связанные задачи (affected)", "");
    for (const t of linked.affectedTasks) {
      const sprints = t.lists.length > 0 ? ` [${t.lists.map(l => l.code || l.name).join(", ")}]` : "";
      parts.push(
        `- \`${t.code}\` — ${t.name} (${t.statusCode ?? t.statusName ?? "—"})${sprints} | ${t.responsibleName ?? "—"}`
      );
    }
    parts.push("");
  }

  if (linked.localLinks.length > 0) {
    parts.push("## Локальные связи (local_links)", "");
    for (const t of linked.localLinks) {
      const sprints = t.lists.length > 0 ? ` [${t.lists.map(l => l.code || l.name).join(", ")}]` : "";
      parts.push(
        `- \`${t.code}\` — ${t.name} (${t.statusCode ?? t.statusName ?? "—"})${sprints} | ${t.responsibleName ?? "—"}`
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
        `- \`${t.code}\` — ${t.name} (${t.statusCode ?? t.statusName ?? "—"}) | ${t.responsibleName ?? "—"}`
      );
    }
    parts.push("");
  }

  if (refs.tasksWithThisAsDepended.length > 0) {
    parts.push("## Задачи, которые зависят от этой (depended)", "");
    for (const t of refs.tasksWithThisAsDepended) {
      parts.push(
        `- \`${t.code}\` — ${t.name} (${t.statusCode ?? t.statusName ?? "—"}) | ${t.responsibleName ?? "—"}`
      );
    }
    parts.push("");
  }

  if (refs.tasksWithThisAsAffected.length > 0) {
    parts.push("## Задачи, связанные с этой (affected)", "");
    for (const t of refs.tasksWithThisAsAffected) {
      parts.push(
        `- \`${t.code}\` — ${t.name} (${t.statusCode ?? t.statusName ?? "—"}) | ${t.responsibleName ?? "—"}`
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
      if (linked.localLinks.length > 0) {
        lines.push(`- **Локальные**: ${linked.localLinks.map((t) => `\`${t.code}\``).join(", ")}`);
      }
      if (linked.precedesTasks.length > 0) {
        const label = linked.precedesTasks[0].outTypeName ?? "Предшествует";
        lines.push(`- **${label}**: ${linked.precedesTasks.map((r) => `\`${r.inTask.code}\``).join(", ")}`);
      }
      if (linked.followsTasks.length > 0) {
        const label = linked.followsTasks[0].inTypeName ?? "Следует за";
        lines.push(`- **${label}**: ${linked.followsTasks.map((r) => `\`${r.outTask.code}\``).join(", ")}`);
      }
      const hasAny = linked.parentTask || linked.childTasks.length > 0 || linked.dependedTasks.length > 0 || linked.affectedTasks.length > 0 || linked.localLinks.length > 0 || linked.precedesTasks.length > 0 || linked.followsTasks.length > 0;
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
          description: "**Коды задач** (массив строк, например `[\"DEV-001\", \"DEV-002\"]`)",
        },
      },
      required: ["codes"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "link_tasks",
    description:
      "Установить связи между задачами. Добавляет (merge) указанные коды к существующим связям, " +
      "не затирая неупомянутые. Поддерживает depended_tasks, affected_tasks, local_links и parent_task. " +
      "Идемпотентен: повторный вызов с теми же кодами не создаёт дубликатов.",
    inputSchema: {
      type: "object" as const,
      properties: {
        code: { type: "string", description: "Код задачи, у которой устанавливаются связи" },
        depended_tasks: { type: "array", items: { type: "string" }, description: "Коды задач для добавления в depended (зависимые). **Коды задач**." },
        affected_tasks: { type: "array", items: { type: "string" }, description: "Коды задач для добавления в affected (связанные). **Коды задач**." },
        local_links: { type: "array", items: { type: "string" }, description: "Коды задач для добавления в локальные связи. **Коды задач**." },
        parent_task: { type: "string", description: "Код родительской задачи." },
      },
      required: ["code"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "unlink_tasks",
    description:
      "Удалить связи между задачами. Удаляет только указанные коды из соответствующих списков связей. " +
      "Идемпотентен: если связь уже отсутствует, ошибки не будет.",
    inputSchema: {
      type: "object" as const,
      properties: {
        code: { type: "string", description: "Код задачи, у которой удаляются связи" },
        depended_tasks: { type: "array", items: { type: "string" }, description: "Коды задач для удаления из depended. **Коды задач**." },
        affected_tasks: { type: "array", items: { type: "string" }, description: "Коды задач для удаления из affected. **Коды задач**." },
        local_links: { type: "array", items: { type: "string" }, description: "Коды задач для удаления из локальных связей. **Коды задач**." },
        parent_task: { type: "string", description: "Код родительской задачи для удаления (если совпадает с текущей)." },
      },
      required: ["code"],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  },
  {
    name: "list_relation_types",
    description:
      "Получить список доступных типов связей (CmfRelationOption) — тех, что отображаются " +
      "в интерфейсе EvaProject в разделе «Связи» (например, «Относится к», «Дополнительная дочерняя задача»). " +
      "Возвращает ID, код и названия типов.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "link_relation",
    description:
      "Создать произвольную связь между задачами (CmfRelationOption) — ту, что отображается " +
      "в интерфейсе EvaProject в разделе «Связи». В отличие от link_tasks (поля depended/affected), " +
      "этот инструмент создаёт связь с типом (например, «Относится к»). " +
      "Идемпотентен: повторный вызов не создаёт дубликатов.",
    inputSchema: {
      type: "object" as const,
      properties: {
        code: { type: "string", description: "Код исходной задачи (у которой появится связь в out_tasks)" },
        target: { type: "string", description: "Код целевой задачи (in_link)" },
        relation_type: { type: "string", description: "Название или ID типа связи, напр. «Относится к». Список доступных: list_relation_types" },
      },
      required: ["code", "target", "relation_type"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "unlink_relation",
    description:
      "Удалить произвольную связь между задачами (CmfRelationOption). Можно удалить по ID связи " +
      "(из get_linked_tasks) или по паре задач + типу связи. Идемпотентен.",
    inputSchema: {
      type: "object" as const,
      properties: {
        code: { type: "string", description: "Код задачи, у которой удаляется связь" },
        target: { type: "string", description: "Код задачи, с которой разрывается связь (опционально, если указан relation_id)" },
        relation_type: { type: "string", description: "Тип связи для точного удаления (опционально)" },
        relation_id: { type: "string", description: "ID связи для удаления напрямую (из get_linked_tasks, поле relationTypeId)" },
      },
      required: ["code"],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  },
];

// ── Обработчик вызовов ─────────────────────────────────────────

function formatRelationTypes(types: import("../types.js").RelationTypeInfo[]): string {
  if (types.length === 0) {
    return "Типы связей не найдены.";
  }

  const lines: string[] = [
    "# Типы связей (CmfRelationOption)",
    "",
    "| ID | Код | Название (out) | Название (in) | choice_type |",
    "|----|-----|----------------|---------------|-------------|",
  ];

  for (const t of types) {
    lines.push(
      `| \`${t.id}\` | \`${t.code ?? "—"}\` | ${t.outTypeName ?? "—"} | ${t.inTypeName ?? "—"} | \`${t.choiceType ?? "—"}\` |`
    );
  }

  return lines.join("\n");
}

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

    case "link_tasks": {
      const { code, ...params } = LinkTasksSchema.parse(args);
      const linked = await evaClient.linkTasks(code, params);
      return { content: [{ type: "text", text: "✅ Связи установлены.\n\n" + formatLinkedTasks(linked) }] };
    }

    case "unlink_tasks": {
      const { code, ...params } = UnlinkTasksSchema.parse(args);
      const linked = await evaClient.unlinkTasks(code, params);
      return { content: [{ type: "text", text: "✅ Связи удалены.\n\n" + formatLinkedTasks(linked) }] };
    }

    case "list_relation_types": {
      ListRelationTypesSchema.parse(args);
      const types = await evaClient.listRelationTypes();
      return { content: [{ type: "text", text: formatRelationTypes(types) }] };
    }

    case "link_relation": {
      const { code, target, relation_type } = LinkRelationSchema.parse(args);
      const linked = await evaClient.createRelation(code, target, relation_type);
      return { content: [{ type: "text", text: `✅ Связь «${relation_type}» установлена: \`${code}\` → \`${target}\`.\n\n` + formatLinkedTasks(linked) }] };
    }

    case "unlink_relation": {
      const { code, target, relation_type, relation_id } = UnlinkRelationSchema.parse(args);

      if (relation_id) {
        await evaClient.deleteRelation(relation_id);
        const linked = await evaClient.getLinkedTasks(code);
        return { content: [{ type: "text", text: `✅ Связь \`${relation_id}\` удалена.\n\n` + formatLinkedTasks(linked) }] };
      }

      // Удаление по паре + опционально типу
      const linked = await evaClient.deleteRelationByPair(code, target!, relation_type);
      const typeInfo = relation_type ? ` типа «${relation_type}»` : "";
      return { content: [{ type: "text", text: `✅ Связь${typeInfo} между \`${code}\` и \`${target}\` удалена.\n\n` + formatLinkedTasks(linked) }] };
    }

    default:
      return null;
  }
}
