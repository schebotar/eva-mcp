import type { BqlFilter } from "../types.js";

/**
 * Строит массив BQL-фильтров из аргументов поиска задач.
 * Используется в search_tasks, count_tasks и других инструментах.
 */
export function buildTaskFilter(args: Record<string, unknown> | undefined): BqlFilter[] {
  const filters: BqlFilter[] = [];
  if (!args) return filters;

  if (args.status) filters.push(["status", "==", args.status]);
  if (args.responsible) filters.push(["responsible.login", "==", args.responsible]);
  if (args.project) filters.push(["parent.code", "==", args.project]);
  if (args.priority) filters.push(["priority", "==", args.priority]);
  if (args.type) filters.push(["logic_type", "==", args.type]);
  if (args.query) filters.push(["name", "ILIKE", `%${args.query}%`]);
  if (args.date_from) filters.push(["cmf_modified_at", ">=", args.date_from]);
  if (args.date_to) filters.push(["cmf_modified_at", "<=", args.date_to]);
  if (args.created_from) filters.push(["cmf_created_at", ">=", args.created_from]);
  if (args.created_to) filters.push(["cmf_created_at", "<=", args.created_to]);
  if (args.linked_to) {
    const code = args.linked_to as string;
    filters.push([
      "OR",
      ["parent_task", "==", code],
      ["depended_tasks", "IN", [code]],
      ["affected_tasks", "IN", [code]],
    ]);
  }
  if (args.sprint) {
    filters.push(["lists.code", "IN", [args.sprint]]);
  }

  return filters;
}
