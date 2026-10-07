import type { EvaClient } from "../eva-client.js";
import type { SprintInfo } from "../types.js";
import { fetchScopedTasks } from "../helpers/scoped-tasks.js";

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

/** Момент спринта для сортировки: плановое окончание, начало, без дат — создание */
function sprintMoment(sprint: SprintInfo): number | null {
  const date = sprint.endDate ?? sprint.startDate ?? sprint.createdAt;
  return date ? new Date(date).getTime() : null;
}

/**
 * Вычисляет velocity команды по последним N спринтам проекта.
 */
export async function computeVelocity(
  evaClient: EvaClient,
  projectCode: string,
  sprintCount: number = 3
): Promise<VelocityResult> {
  // Спринты проекта, включая архивные: velocity считается как раз по закрытым
  // спринтам, а они уходят в архив и без include_archived в выдачу не попадают
  const project = await evaClient.getProject(projectCode);
  const projectSprints = await evaClient.listSprints(
    [
      ["parent_id", "==", project.id],
      ["code", "LIKE", "SPR-%"],
    ],
    undefined,
    true
  );

  // Velocity — по завершённым спринтам: текущий с недоделанными задачами занизил бы
  // среднее. Завершён — закрыт (архив) или прошла плановая дата окончания.
  // Порядок — по датам спринта (новые первые), а не по созданию: спринты заводят
  // и задним числом, и заранее
  const now = Date.now();
  const sorted = projectSprints
    .map((s) => ({ sprint: s, at: sprintMoment(s) }))
    .filter((s): s is { sprint: SprintInfo; at: number } =>
      s.at !== null && (s.sprint.archived || (s.sprint.endDate !== null && s.at <= now)))
    .sort((a, b) => b.at - a.at)
    .map((s) => s.sprint);

  const recent = sorted.slice(0, sprintCount);

  const result: VelocitySprint[] = [];

  for (const sprint of recent) {
    const sprintTasks = await fetchScopedTasks(evaClient, { sprintCode: sprint.code });
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
