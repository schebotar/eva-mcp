import type { EvaClient } from "../eva-client.js";
import type { TaskInfo } from "../types.js";

export interface CycleTimeResult {
  averageHours: number;
  medianHours: number;
  minHours: number;
  maxHours: number;
  p50: number;
  p85: number;
  p95: number;
  tasks: { code: string; name: string; hours: number }[];
  totalAnalyzed: number;
}

function isClosed(statusName: string | null): boolean {
  if (!statusName) return false;
  const lower = statusName.toLowerCase();
  return ["done", "closed", "выполнено", "закрыто", "готово", "завершено", "resolved", "completed", "finished"]
    .some((s) => lower.includes(s));
}

/**
 * Вычисляет cycle time (время от создания до закрытия) для задач.
 */
export async function computeCycleTime(
  evaClient: EvaClient,
  projectCode: string,
  sprintCode?: string,
  limit: number = 50
): Promise<CycleTimeResult> {
  const allTasks = await evaClient.listTasks();
  let tasks = allTasks.filter((t) =>
    isClosed(t.statusName) && t.createdAt && t.statusClosedAt
  );

  if (projectCode) {
    // Клиентская фильтрация по проекту
    tasks = tasks.filter((t) => t.projectCode === projectCode);
  }

  if (sprintCode) {
    tasks = tasks.filter((t) =>
      t.lists.some((l) => l.code === sprintCode || l.id === sprintCode)
    );
  }

  // Вычисляем cycle time в часах
  const withHours = tasks
    .map((t) => {
      const created = new Date(t.createdAt!).getTime();
      const closed = new Date(t.statusClosedAt!).getTime();
      const hours = Math.round((closed - created) / (1000 * 60 * 60));
      return { code: t.code, name: t.name, hours };
    })
    .sort((a, b) => a.hours - b.hours)
    .slice(0, limit);

  if (withHours.length === 0) {
    return {
      averageHours: 0, medianHours: 0, minHours: 0, maxHours: 0,
      p50: 0, p85: 0, p95: 0, tasks: [], totalAnalyzed: 0,
    };
  }

  const hours = withHours.map((t) => t.hours);
  const sum = hours.reduce((a, b) => a + b, 0);

  const percentile = (arr: number[], p: number) => {
    const idx = Math.ceil((p / 100) * arr.length) - 1;
    return arr[Math.max(0, idx)];
  };

  return {
    averageHours: Math.round(sum / hours.length),
    medianHours: percentile(hours, 50),
    minHours: hours[0],
    maxHours: hours[hours.length - 1],
    p50: percentile(hours, 50),
    p85: percentile(hours, 85),
    p95: percentile(hours, 95),
    tasks: withHours,
    totalAnalyzed: withHours.length,
  };
}
