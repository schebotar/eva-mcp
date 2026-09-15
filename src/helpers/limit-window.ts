/**
 * Окно запроса для list-методов EvaProject.
 *
 * ⚠️ API ждёт `slice` как диапазон `[от, до]`, а не пару `[offset, limit]`.
 * Пока окно собиралось как `[offset, limit]`, всё работало только при
 * `offset = 0`, а при `offset > limit` получалось отрицательным — сервер
 * отвечал ошибкой SQL, и наружу уезжал трейсбек вместо понятного сообщения.
 *
 * Поэтому: `limit` — размер окна (сколько записей запросить), `offset` — сдвиг
 * от начала. Важно, что это окно запроса, а не число результатов: фильтр
 * применяется к уже выбранному окну, поэтому часть совпадений в него может не
 * попасть. Истинное число совпадений дают `count_tasks` / `count_sprints`.
 */
export function buildSlice(params: {
  limit?: number;
  offset?: number;
}): [number, number] | undefined {
  if (params.limit === undefined) {
    return undefined;
  }
  const from = params.offset ?? 0;
  return [from, from + params.limit];
}
