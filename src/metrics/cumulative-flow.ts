import type { EvaClient } from "../eva-client.js";
import type { TaskInfo } from "../types.js";

export interface CFDDatePoint {
  date: string;
  [statusName: string]: number | string;
}

export interface CFDResult {
  dates: string[];
  statuses: { name: string; counts: number[] }[];
  totalTasks: number;
}

/**
 * Вычисляет Cumulative Flow Diagram данные для спринта.
 */
export async function computeCFD(
  evaClient: EvaClient,
  projectCode: string,
  sprintCode?: string,
  daysBack: number = 14
): Promise<CFDResult> {
  const allTasks = await evaClient.listTasks();
  let tasks = allTasks;

  if (projectCode) {
    tasks = tasks.filter((t) => t.projectCode === projectCode);
  }
  if (sprintCode) {
    tasks = tasks.filter((t) =>
      t.lists.some((l) => l.code === sprintCode || l.id === sprintCode)
    );
  }

  if (tasks.length === 0) {
    return { dates: [], statuses: [], totalTasks: 0 };
  }

  // Строим диапазон дат
  const now = new Date();
  const dates: string[] = [];
  for (let i = daysBack; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  // Упрощённый CFD: для каждого дня считаем задачи по статусам
  // Без полной истории статусов — используем текущий статус как «срез»
  const allStatuses = new Set<string>();
  for (const t of tasks) {
    allStatuses.add(t.statusName ?? "Без статуса");
  }

  const statuses = [...allStatuses].map((name) => {
    const counts = dates.map(() =>
      tasks.filter((t) => (t.statusName ?? "Без статуса") === name).length
    );
    return { name, counts };
  });

  return { dates, statuses, totalTasks: tasks.length };
}
