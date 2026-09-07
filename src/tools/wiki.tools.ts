import { z } from "zod";
import type { EvaClient } from "../eva-client.js";
import type { BqlFilter, DocInfo } from "../types.js";
import { mdToHtml } from "../helpers/markdown.js";

// ── Zod-схемы ──────────────────────────────────────────────────

const SearchDocsSchema = z.object({
  query: z.string().optional(),
  project: z.string().optional(),
  parent: z.string().optional(),
  limit: z.number().int().positive().max(200).optional(),
});

const GetDocSchema = z.object({
  code: z.string().min(1, "Код документа обязателен"),
  max_chars: z.number().int().positive().optional(),
});

const CreateDocSchema = z.object({
  project: z.string().min(1, "Код проекта обязателен"),
  name: z.string().min(1, "Название документа обязательно"),
  text: z.string().optional(),
  parent: z.string().optional(),
});

const UpdateDocSchema = z.object({
  code: z.string().min(1, "Код документа обязателен"),
  text: z.string().min(1, "Текст документа обязателен"),
});

// ── Определения инструментов ───────────────────────────────────

export const wikiToolDefs = [
  {
    name: "search_docs",
    description:
      "Поиск страниц wiki (EvaWiki). Фильтры: query — по названию, project — корневые страницы wiki проекта, " +
      "parent — подстраницы документа (код DOC-XXXXXX). Нужен хотя бы один параметр. " +
      "Возвращает код, название, проект и дату изменения (без текста — текст отдаёт get_doc).",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Подстрока в названии страницы, например 'регламент'" },
        project: { type: "string", description: "Код проекта — вернёт корневые страницы его wiki" },
        parent: { type: "string", description: "Код родительской страницы (DOC-XXXXXX) — вернёт её подстраницы" },
        limit: { type: "number", description: "Максимум результатов (по умолчанию 50, максимум 200)" },
      },
      required: [],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "get_doc",
    description:
      "Получить страницу wiki (EvaWiki) по коду DOC-XXXXXX: название, проект, родитель и полный текст " +
      "(конвертируется из HTML в Markdown). Длинный текст обрезается (max_chars, по умолчанию 30000).",
    inputSchema: {
      type: "object" as const,
      properties: {
        code: { type: "string", description: "Код документа, например DOC-000123" },
        max_chars: { type: "number", description: "Обрезать текст до N символов (по умолчанию 30000)" },
      },
      required: ["code"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "create_doc",
    description:
      "Создать страницу wiki (EvaWiki) в проекте. text — содержимое в Markdown (конвертируется в HTML " +
      "и публикуется через черновик). parent — код родительской страницы DOC-XXXXXX; без него страница " +
      "создаётся в корне wiki проекта.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: { type: "string", description: "Код проекта, например my-project" },
        name: { type: "string", description: "Название страницы" },
        text: { type: "string", description: "Содержимое страницы (Markdown, конвертируется в HTML)" },
        parent: { type: "string", description: "Код родительской страницы (DOC-XXXXXX), опционально" },
      },
      required: ["project", "name"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: "update_doc",
    description:
      "Заменить текст страницы wiki (EvaWiki) по коду DOC-XXXXXX. text — новое содержимое в Markdown " +
      "(конвертируется в HTML). Запись идёт через черновик (text_draft) с публикацией — так устроен EvaWiki. " +
      "ВНИМАНИЕ: текст заменяется целиком; для правки фрагмента сначала получите текущий текст через get_doc.",
    inputSchema: {
      type: "object" as const,
      properties: {
        code: { type: "string", description: "Код документа, например DOC-000123" },
        text: { type: "string", description: "Новое содержимое страницы (Markdown, заменяет текст целиком)" },
      },
      required: ["code", "text"],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  },
];

// ── Форматтеры ─────────────────────────────────────────────────

function formatDocList(docs: DocInfo[]): string {
  if (docs.length === 0) return "Страницы wiki не найдены.";
  const rows = docs.map(
    (d) => `| \`${d.code}\` | ${d.name || "—"} | ${d.projectName ?? d.projectCode ?? "—"} | ${d.parentCode ?? "—"} | ${d.updatedAt ?? "—"} |`
  );
  return [
    `Найдено страниц: **${docs.length}**`,
    "",
    "| Код | Название | Проект | Родитель | Изменена |",
    "|-----|----------|--------|----------|----------|",
    ...rows,
  ].join("\n");
}

function formatDoc(doc: DocInfo, maxChars: number): string {
  let text = doc.text || "*Страница пуста (или это контейнер для подстраниц).*";
  let truncNote = "";
  if (text.length > maxChars) {
    truncNote = `\n\n> ⚠️ Текст обрезан: показано ${maxChars} из ${text.length} символов. Увеличьте max_chars, чтобы получить больше.`;
    text = text.slice(0, maxChars);
  }
  return [
    `# ${doc.name} (\`${doc.code}\`)`,
    "",
    `**Проект:** ${doc.projectName ?? doc.projectCode ?? "—"}`,
    `**Родитель:** ${doc.parentName ?? doc.parentCode ?? "—"}`,
    `**Автор:** ${doc.ownerName ?? doc.ownerLogin ?? "—"}`,
    `**Изменена:** ${doc.updatedAt ?? "—"}`,
    "",
    "---",
    "",
    text + truncNote,
  ].join("\n");
}

// ── Обработчик ─────────────────────────────────────────────────

export async function handleWikiToolCall(
  name: string,
  args: unknown,
  evaClient: EvaClient
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean } | null> {
  if (name === "search_docs") {
    const params = SearchDocsSchema.parse(args);
    if (!params.query && !params.project && !params.parent) {
      return {
        content: [{ type: "text", text: "Укажите хотя бы один параметр: query, project или parent." }],
        isError: true,
      };
    }

    const limit = params.limit ?? 50;
    const baseFilters: BqlFilter[] = [];
    if (params.query) baseFilters.push(["name", "ILIKE", `%${params.query}%`]);

    let docs: DocInfo[];
    if (params.parent) {
      // Дети видны то через parent.code, то через tree_parent.code
      // (индекс дерева обновляется с задержкой) — объединяем оба запроса
      const [byParent, byTreeParent] = await Promise.all([
        evaClient.listDocs([...baseFilters, ["parent.code", "==", params.parent]], [0, limit]).catch(() => [] as DocInfo[]),
        evaClient.listDocs([...baseFilters, ["tree_parent.code", "==", params.parent]], [0, limit]).catch(() => [] as DocInfo[]),
      ]);
      const seen = new Set<string>();
      docs = [...byParent, ...byTreeParent].filter((d) => {
        if (seen.has(d.id)) return false;
        seen.add(d.id);
        return true;
      });
    } else {
      const filters = [...baseFilters];
      if (params.project) filters.push(["parent.code", "==", params.project]);
      docs = await evaClient.listDocs(filters, [0, limit]);
    }

    return { content: [{ type: "text", text: formatDocList(docs) }] };
  }

  if (name === "get_doc") {
    const params = GetDocSchema.parse(args);
    const doc = await evaClient.getDoc(params.code);
    return { content: [{ type: "text", text: formatDoc(doc, params.max_chars ?? 30000) }] };
  }

  if (name === "create_doc") {
    const params = CreateDocSchema.parse(args);
    const doc = await evaClient.createDoc(
      params.project,
      params.name,
      params.text ? mdToHtml(params.text) : undefined,
      params.parent
    );
    return {
      content: [{
        type: "text",
        text: `✅ Страница wiki создана: **${doc.name}** (\`${doc.code}\`) в проекте ${doc.projectName ?? params.project}.`,
      }],
    };
  }

  if (name === "update_doc") {
    const params = UpdateDocSchema.parse(args);
    const doc = await evaClient.updateDoc(params.code, mdToHtml(params.text));
    return {
      content: [{
        type: "text",
        text: `✅ Текст страницы **${doc.name}** (\`${doc.code}\`) обновлён и опубликован (${doc.updatedAt ?? "—"}).`,
      }],
    };
  }

  return null;
}
