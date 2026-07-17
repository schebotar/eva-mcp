import type { EvaClient } from "../eva-client.js";
import type { TaskInfo } from "../types.js";

export interface BurndownPoint {
  date: string;
  ideal: number;
  actual: number;
}

export interface BurndownResult {
  points: BurndownPoint[];
  totalTasks: number;
  completedTasks: number;
  remainingTasks: number;
  trend: "on_track" | "behind" | "ahead";
}

function isClosed(statusName: string | null): boolean {
  if (!statusName) return false;
  const lower = statusName.toLowerCase();
  return ["done", "closed", "выполнено", "закрыто", "готово", "завершено", "resolved", "completed", "finished"]
    .some((s) => lower.includes(s));
}

/**
 * Вычисляет данные burndown-диаграммы для спринта.
 * Идеальная линия — равномерное сгорание от старта к финишу.
 * Фактическая — количество незакрытых задач на каждый день.
 */
export async function computeBurndown(
  evaClient: EvaClient,
  sprintCode: string,
  projectCode: string
): Promise<BurndownResult> {
  // Получаем все задачи спринта (клиентская фильтрация)
  const allTasks = await evaClient.listTasks();
  const tasks = allTasks.filter((t) =>
    t.lists.some((l) => l.code === sprintCode || l.id === sprintCode)
  );

  if (tasks.length === 0) {
    return { points: [], totalTasks: 0, completedTasks: 0, remainingTasks: 0, trend: "on_track" };
  }

  // Определяем диапазон дат: от самой ранней created до сегодня
  const now = new Date();
  const dates = tasks
    .map((t) => t.createdAt)
    .filter(Boolean)
    .map((d) => new Date(d!));

  if (dates.length === 0) {
    return { points: [], totalTasks: tasks.length, completedTasks: 0, remainingTasks: tasks.length, trend: "on_track" };
  }

  const startDate = new Date(Math.min(...dates.map((d) => d.getTime())));
  const endDate = now;
  const totalDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

  // Группируем закрытые задачи по дате закрытия
  const closedByDate = new Map<string, number>();
  let completedCount = 0;

  for (const t of tasks) {
    if (isClosed(t.statusName) && t.statusClosedAt) {
      const day = t.statusClosedAt.slice(0, 10);
      closedByDate.set(day, (closedByDate.get(day) ?? 0) + 1);
      completedCount++;
    }
  }

  const totalTasks = tasks.length;
  const remainingTasks = totalTasks - completedCount;

  // Строим точки по дням
  const points: BurndownPoint[] = [];
  let cumulativeClosed = 0;

  for (let d = 0; d <= totalDays; d++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().slice(0, 10);

    cumulativeClosed += closedByDate.get(dateStr) ?? 0;

    const ideal = Math.round(totalTasks * (1 - d / totalDays));
    const actual = totalTasks - cumulativeClosed;

    points.push({ date: dateStr, ideal, actual });
  }

  // Тренд
  const lastActual = points[points.length - 1]?.actual ?? totalTasks;
  const lastIdeal = points[points.length - 1]?.ideal ?? 0;
  const trend = lastActual < lastIdeal ? "ahead" : lastActual > lastIdeal ? "behind" : "on_track";

  return { points, totalTasks, completedTasks: completedCount, remainingTasks, trend };
}
