import type { EvaClient } from "../eva-client.js";
import type { BqlFilter, TaskInfo } from "../types.js";

/**
 * Выборка задач в разрезе проекта и/или спринта — серверной фильтрацией.
 *
 * Метрики и отчёты раньше звали listTasks() без фильтра и отбирали нужное в
 * памяти: на инстансе с ~13 700 задачами такой запрос упирается в 502.
 *
 * Про архив. Задачи закрытого спринта архивируются вместе с ним, поэтому
 * в разрезе спринта архив включается всегда — иначе состав будет неполным
 * и молча. В разрезе проекта архив по умолчанию выключен (текущее состояние
 * проекта), включать его нужно там, где смотрят на историю.
 */
export async function fetchScopedTasks(
  evaClient: EvaClient,
  scope: { projectCode?: string; sprintCode?: string; includeArchived?: boolean }
): Promise<TaskInfo[]> {
  const filters: BqlFilter[] = [];
  let includeArchived: boolean;

  if (scope.sprintCode) {
    // Код спринта задаёт выборку однозначно — фильтр по проекту не нужен
    filters.push(["lists.code", "IN", [scope.sprintCode]]);
    includeArchived = true;
  } else if (scope.projectCode) {
    // ["parent", "==", code] молча возвращает 0 задач; работает только parent_id с UUID
    const project = await evaClient.getProject(scope.projectCode);
    filters.push(["parent_id", "==", project.id]);
    includeArchived = scope.includeArchived ?? false;
  } else {
    throw new Error(
      "fetchScopedTasks: нужен projectCode или sprintCode — выборка по всему инстансу возвращает 502"
    );
  }

  return evaClient.listTasks({ filter: filters, includeArchived });
}
