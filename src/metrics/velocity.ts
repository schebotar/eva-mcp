import type { EvaClient } from "../eva-client.js";
import type { SprintInfo } from "../types.js";

export interface VelocitySprint {
  code: string;
  name: string;
  completedTasks: number;
  totalTasks: number;
  completionPct: number;
}

export interface VelocityResult {
  sprints: VelocitySprint[];
  averageCompleted: number;
  averageCompletionPct: number;
}

function isClosed(statusName: string | null): boolean {
  if (!statusName) return false;
  const lower = statusName.toLowerCase();
  return ["done", "closed", "выполнено", "закрыто", "готово", "завершено", "resolved", "completed", "finished"]
    .some((s) => lower.includes(s));
}

/**
 * Вычисляет velocity команды по последним N спринтам проекта.
 */
export async function computeVelocity(
  evaClient: EvaClient,
  projectCode: string,
  sprintCount: number = 3
): Promise<VelocityResult> {
  // Получаем все спринты
  const allSprints = await evaClient.listSprints();
  const projectSprints = allSprints.filter(
    (s) => s.projectCode === projectCode
  );

  // Сортируем по дате создания (новые первые)
  const sorted = projectSprints
    .filter((s) => s.createdAt)
    .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

  const recent = sorted.slice(0, sprintCount);

  // Получаем все задачи
  const allTasks = await evaClient.listTasks();
  const result: VelocitySprint[] = [];

  for (const sprint of recent) {
    const sprintTasks = allTasks.filter((t) =>
      t.lists.some((l) => l.code === sprint.code || l.id === sprint.code)
    );
    const completed = sprintTasks.filter((t) => isClosed(t.statusName)).length;
    result.push({
      code: sprint.code,
      name: sprint.name,
      completedTasks: completed,
      totalTasks: sprintTasks.length,
      completionPct: sprintTasks.length > 0 ? Math.round((completed / sprintTasks.length) * 100) : 0,
    });
  }

  const avgCompleted = result.length > 0
    ? Math.round(result.reduce((sum, s) => sum + s.completedTasks, 0) / result.length)
    : 0;
  const avgPct = result.length > 0
    ? Math.round(result.reduce((sum, s) => sum + s.completionPct, 0) / result.length)
    : 0;

  return { sprints: result, averageCompleted: avgCompleted, averageCompletionPct: avgPct };
}
