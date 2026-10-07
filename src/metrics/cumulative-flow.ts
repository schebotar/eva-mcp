import type { EvaClient } from "../eva-client.js";
import type { StatusHistoryEntry, TaskInfo } from "../types.js";
import { fetchScopedTasks } from "../helpers/scoped-tasks.js";

export interface CFDResult {
  dates: string[];
  statuses: { name: string; counts: number[] }[];
  totalTasks: number;
  /** Задачи без записей в истории: статус не менялся с создания, он и текущий */
  withoutHistory: number;
  /** В разрезе проекта задачи, закрытые до начала периода, не учитываются */
  closedBeforeExcluded: boolean;
}

/** Порядок колонок — по ходу потока: тип статуса, затем имя */
const TYPE_ORDER: Record<string, number> = { OPEN: 0, IN_PROGRESS: 1, IN_REVIEW: 2, CLOSED: 3 };

interface DayState {
  name: string;
  type: string | null;
}

/** Дата `Y-m-d` по локальному времени процесса — так же, как день видит пользователь */
function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Статус задачи на конец дня по истории переходов.
 * null — задачи к этому моменту ещё не было.
 */
function statusAt(task: TaskInfo, history: StatusHistoryEntry[], dayEnd: number): DayState | null {
  const created = task.createdAt ? new Date(task.createdAt).getTime() : null;
  if (created !== null && created > dayEnd) return null;

  let last: StatusHistoryEntry | null = null;
  for (const h of history) {
    if (h.createdAt && new Date(h.createdAt).getTime() <= dayEnd) last = h;
    else break;
  }
  if (last?.toStatus) return { name: last.toStatus.trim(), type: last.toStatusType };

  // Переходов до этого дня не было: статус — исходный первого перехода.
  // Нет записей вовсе — статус не менялся с создания, это текущий. Запись о самом
  // создании (from = null) есть не у всех задач: на рабочих проектах её нет
  const first = history[0];
  if (first?.fromStatus) return { name: first.fromStatus.trim(), type: null };
  if (history.length > 0) return null;
  return { name: (task.statusName ?? "Без статуса").trim(), type: null };
}

/**
 * Cumulative Flow Diagram: сколько задач было в каждом статусе на конец каждого дня.
 * Считается по истории статусов (`CmfStatusHistory`), а не по текущему срезу.
 */
export async function computeCFD(
  evaClient: EvaClient,
  projectCode: string,
  sprintCode?: string,
  daysBack: number = 14
): Promise<CFDResult> {
  const now = new Date();
  const days: Date[] = [];
  for (let i = daysBack; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(23, 59, 59, 999);
    days.push(d);
  }
  const dates = days.map(localDate);

  // Спринт небольшой и смотрится целиком. Проект — с архивом (задачи закрытых
  // спринтов архивируются), но без закрытых до начала периода: они бы только
  // приподняли полосу закрытых, а стоили бы тысяч лишних записей истории
  const closedBeforeExcluded = !sprintCode;
  const tasks = await fetchScopedTasks(evaClient, {
    projectCode,
    sprintCode,
    includeArchived: true,
    openSince: closedBeforeExcluded ? dates[0] : undefined,
  });

  if (tasks.length === 0) {
    return { dates: [], statuses: [], totalTasks: 0, withoutHistory: 0, closedBeforeExcluded };
  }

  const history = new Map<string, StatusHistoryEntry[]>();
  for (const h of await evaClient.listStatusHistory(tasks.map((t) => t.code))) {
    if (!h.taskCode) continue;
    if (!history.has(h.taskCode)) history.set(h.taskCode, []);
    history.get(h.taskCode)!.push(h);
  }

  const counts = new Map<string, number[]>();
  const types = new Map<string, string | null>();
  for (const t of tasks) {
    const own = history.get(t.code) ?? [];
    days.forEach((day, i) => {
      const state = statusAt(t, own, day.getTime());
      if (!state) return;
      if (!counts.has(state.name)) counts.set(state.name, dates.map(() => 0));
      counts.get(state.name)![i]++;
      if (state.type || !types.has(state.name)) types.set(state.name, state.type ?? types.get(state.name) ?? null);
    });
  }

  const rank = (name: string) => TYPE_ORDER[types.get(name) ?? ""] ?? Object.keys(TYPE_ORDER).length;
  const statuses = [...counts.entries()]
    .map(([name, c]) => ({ name, counts: c }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, "ru"));

  return {
    dates,
    statuses,
    totalTasks: tasks.length,
    withoutHistory: tasks.filter((t) => !history.has(t.code)).length,
    closedBeforeExcluded,
  };
}
