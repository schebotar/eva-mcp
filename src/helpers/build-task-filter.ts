import type { BqlFilter } from "../types.js";

/**
 * Строит массив BQL-фильтров из аргументов поиска задач.
 * Используется в search_tasks, count_tasks и других инструментах.
 */
export function buildTaskFilter(args: Record<string, unknown> | undefined): BqlFilter[] {
  const filters: BqlFilter[] = [];
  if (!args) return filters;

  if (args.status) filters.push(["status", "==", args.status]);
  if (args.responsible) filters.push(["responsible", "==", args.responsible]);
  if (args.project) filters.push(["parent", "==", args.project]);
  if (args.priority) filters.push(["priority", "==", args.priority]);
  if (args.type) filters.push(["logic_type", "==", args.type]);
  if (args.query) filters.push(["name", "ILIKE", `%${args.query}%`]);
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
