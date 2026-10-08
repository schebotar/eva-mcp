import type { EvaClient } from "../eva-client.js";
import type { StatusHistoryEntry, TaskInfo } from "../types.js";
import { fetchScopedTasks } from "../helpers/scoped-tasks.js";

export interface CFDResult {
  dates: string[];
  statuses: { code: string; name: string; counts: number[] }[];
  totalTasks: number;
  /** Задачи без записей в истории: статус не менялся с создания, он и текущий */
  withoutHistory: number;
  /** В разрезе проекта задачи, закрытые до начала периода, не учитываются */
  closedBeforeExcluded: boolean;
}

/** Порядок колонок — по ходу потока: тип статуса, затем подпись */
const TYPE_ORDER: Record<string, number> = { OPEN: 0, IN_PROGRESS: 1, IN_REVIEW: 2, CLOSED: 3 };

/**
 * Статус задачи на день. Ключ — код статуса: это шаг процесса, а имя — ярлык записи.
 * Имена одного кода расходятся между workflow, а переименованная запись оставляет
 * в истории старое имя — группировка по имени развела бы один статус на две колонки
 */
interface DayState {
  code: string;
  /** Имя из истории — подпись на случай, если кода нет среди текущих статусов */
  name: string | null;
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
  if (last) {
    const code = last.toStatusCode ?? last.toStatus?.trim();
    return code ? { code, name: last.toStatus?.trim() ?? null, type: last.toStatusType } : null;
  }

  // Переходов до этого дня не было: статус — исходный первого перехода.
  // Нет записей вовсе — статус не менялся с создания, это текущий. Запись о самом
  // создании (from = null) есть у новых задач; у задач старше начала истории её нет
  const first = history[0];
  if (first) {
    const code = first.fromStatusCode ?? first.fromStatus?.trim();
    return code ? { code, name: first.fromStatus?.trim() ?? null, type: null } : null;
  }
  const code = task.statusCode ?? task.statusName?.trim() ?? "—";
  return { code, name: task.statusName?.trim() ?? null, type: null };
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

  // Подписи колонок — по текущим статусам задач среза; для кода, которого среди них
  // уже нет, — последнее имя из истории
  const labels = new Map<string, string>();
  for (const t of tasks) {
    if (t.statusCode && t.statusName && !labels.has(t.statusCode)) labels.set(t.statusCode, t.statusName.trim());
  }

  const counts = new Map<string, number[]>();
  const types = new Map<string, string>();
  const historyNames = new Map<string, string>();
  for (const t of tasks) {
    const own = history.get(t.code) ?? [];
    days.forEach((day, i) => {
      const state = statusAt(t, own, day.getTime());
      if (!state) return;
      if (!counts.has(state.code)) counts.set(state.code, dates.map(() => 0));
      counts.get(state.code)![i]++;
      if (state.type) types.set(state.code, state.type);
      if (state.name) historyNames.set(state.code, state.name);
    });
  }

  const label = (code: string) => labels.get(code) ?? historyNames.get(code) ?? code;
  const rank = (code: string) => TYPE_ORDER[types.get(code) ?? ""] ?? Object.keys(TYPE_ORDER).length;
  const statuses = [...counts.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || label(a).localeCompare(label(b), "ru"))
    .map(([code, c]) => ({ code, name: label(code), counts: c }));
  // Разные коды с одной подписью различаем кодом, иначе колонки не отличить
  const seen = new Map<string, number>();
  for (const st of statuses) seen.set(st.name, (seen.get(st.name) ?? 0) + 1);
  for (const st of statuses) if (seen.get(st.name)! > 1) st.name = `${st.name} (${st.code})`;

  return {
    dates,
    statuses,
    totalTasks: tasks.length,
    withoutHistory: tasks.filter((t) => !history.has(t.code)).length,
    closedBeforeExcluded,
  };
}
