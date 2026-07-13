/** Универсальный JSON-RPC 2.2 запрос */
export interface JsonRpcRequest {
  jsonrpc: "2.2";
  method: string;
  kwargs: Record<string, unknown>;
  filter?: BqlFilter | BqlFilter[];
  args?: unknown[];
  callid?: string;
}

/** Успешный JSON-RPC ответ */
export interface JsonRpcResponse<T = unknown> {
  result: T;
  id?: string;
}

/** JSON-RPC ошибка */
export interface JsonRpcError {
  error: {
    code: number;
    message: string;
  };
}

/** Данные задачи из EvaProject */
export interface TaskInfo {
  id: string;
  code: string;
  name: string;
  text: string;
  status: string | null;
  statusName: string | null;
  author: string | null;
  authorName: string | null;
  responsible: string | null;
  responsibleName: string | null;
  projectCode: string | null;
  projectName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  priority: string | null;
  priorityName: string | null;
  typeName: string | null;
}

/** Данные комментария */
export interface CommentInfo {
  id: string | null;
  author: string | null;
  authorName: string | null;
  text: string;
  createdAt: string | null;
  parentCode: string | null;
}

/** Узел дерева комментариев */
export interface CommentNode {
  comment: CommentInfo;
  replies: CommentNode[];
}

/** Сырые данные задачи из API EvaProject */
export interface EvaTaskRaw {
  id: string;
  code: string;
  name: string;
  text?: string;
  status?: { id?: string; name?: string; code?: string } | string | null;
  status_name?: string;
  cmf_author?: { login?: string; name?: string } | null;
  responsible?: { login?: string; name?: string } | null;
  parent?: { code?: string; name?: string } | null;
  cmf_created_at?: string;
  cmf_modified_at?: string;
  priority?: string;
  priority_name?: string;
  logic_type?: { name?: string } | null;
  comments?: EvaCommentRaw[];
  parent_task?: EvaTaskRaw | null;
  child_tasks?: EvaTaskRaw[];
  depended_tasks?: EvaTaskRaw[];
  affected_tasks?: EvaTaskRaw[];
  in_tasks?: EvaRelationOptionRaw[];
  out_tasks?: EvaRelationOptionRaw[];
}

/** Сырые данные комментария из API EvaProject */
export interface EvaCommentRaw {
  id?: string;
  cmf_author?: { login?: string; name?: string } | null;
  text?: string;
  cmf_created_at?: string;
  tree_parent?: { id?: string } | null;
}

// ── BQL (фильтры) ──────────────────────────────────────────────

/** Операторы сравнения BQL */
export type BqlOperator = "==" | "!=" | "ILIKE" | "NOT ILIKE" | "IN" | "NOT IN" | ">" | "<" | ">=" | "<=";

/** BQL-фильтр: кортеж [поле, оператор, значение] или OR-группа */
export type BqlFilter = [string, BqlOperator, unknown] | ["OR", ...BqlFilter[]];

// ── Параметры запросов ────────────────────────────────────────

/** Параметры для listTasks */
export interface TaskListParams {
  filter?: BqlFilter | BqlFilter[];
  fields?: string[];
  slice?: [number, number]; // [offset, limit]
}

// ── Обновление задачи ─────────────────────────────────────────

/** Поля, доступные для редактирования через CmfTask.update */
export interface TaskUpdateFields {
  name?: string;
  text?: string;
  status?: string;
  responsible?: string;
  priority?: string;
  deadline?: string;
  result_text?: string;
  parent?: string;        // проект
  executors?: string[];
  spectators?: string[];
  tags?: string[];
  lists?: string[];       // списки/спринты
  is_milestone?: boolean;
  estimate_work?: number;
  parent_task?: string;
  epic?: string;
  mark?: string;

  // Низкий приоритет — доступны в клиенте, но не в MCP-инструменте
  alarm_date?: string;
  period_interval?: string;
  period_next_date?: string;
  period_clear_checkbox?: boolean;
  period_create_new?: boolean;
  workflow?: string;
  logic_type?: string;
  activity?: string;
  no_control?: boolean;
  depended_tasks?: string[];
  affected_tasks?: string[];
  components?: string[];
  subproject?: string;
  tmplt_document?: string;
  waiting_for?: string;
  local_links?: string[];
  is_favorite?: boolean;
  cmf_owner_assistants?: string[];
  ui_view_form?: string;
}

// ── Проекты ───────────────────────────────────────────────────

/** Нормализованные данные проекта */
export interface ProjectInfo {
  id: string;
  code: string;
  name: string;
  description: string;
  status: string | null;
  statusName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** Сырые данные проекта из API */
export interface EvaProjectRaw {
  id: string;
  code: string;
  name: string;
  description?: string;
  status?: string;
  status_name?: string;
  cmf_created_at?: string;
  cmf_modified_at?: string;
}

// ── Пользователи ──────────────────────────────────────────────

/** Нормализованные данные пользователя */
export interface PersonInfo {
  id: string;
  login: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  secondName: string | null;
  email: string | null;
}

/** Сырые данные пользователя из API */
export interface EvaPersonRaw {
  id: string;
  login?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  second_name?: string;
  email?: string;
}

// ── Статусы ───────────────────────────────────────────────────

/** Нормализованные данные статуса */
export interface StatusInfo {
  id: string;
  name: string;
  code: string | null;
  type: string | null;
}

/** Сырые данные статуса из API */
export interface EvaStatusRaw {
  id: string;
  name?: string;
  code?: string;
  status_type?: string;
}

// ── Связанные задачи ──────────────────────────────────────────

/** Информация о связи через CmfRelationOption */
export interface RelationInfo {
  relationId: string;
  outTask: TaskInfo;
  inTask: TaskInfo;
  outTypeName: string | null;
  inTypeName: string | null;
  choiceType: string | null;
}

/** Набор связанных задач */
export interface LinkedTasksInfo {
  parentTask: TaskInfo | null;
  childTasks: TaskInfo[];
  dependedTasks: TaskInfo[];
  affectedTasks: TaskInfo[];
  /** Задачи, следующие за этой (эта задача предшествует им) — in_tasks */
  precedesTasks: RelationInfo[];
  /** Задачи, предшествующие этой (эта задача следует за ними) — out_tasks */
  followsTasks: RelationInfo[];
}

/** Обратные связи: кто ссылается на эту задачу */
export interface ReferencingTasksInfo {
  tasksWithThisAsParent: TaskInfo[];
  tasksWithThisAsDepended: TaskInfo[];
  tasksWithThisAsAffected: TaskInfo[];
}

/** Сырые данные CmfRelationOption */
export interface EvaRelationOptionRaw {
  id: string;
  out_link?: { code?: string; name?: string; id?: string } | null;
  in_link?: { code?: string; name?: string; id?: string } | null;
  relation_type?: {
    out_type_name?: string;
    in_type_name?: string;
    choice_type?: string;
  } | null;
}
