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

/** Данные вложения */
export interface AttachmentInfo {
  id: string;
  name: string;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: string | null;
  author: string | null;
  authorName: string | null;
}

// ── Требования (CmfReq) ───────────────────────────────────────

/** Сырые данные требования из API EvaProject (CmfReq) */
export interface EvaReqRaw {
  id: string;
  code: string;
  name: string;
  text?: string;
  text_draft?: string;
  status?: { id?: string; name?: string; code?: string } | string | null;
  status_name?: string;
  cmf_author?: { login?: string; name?: string } | null;
  responsible?: { login?: string; name?: string } | null;
  parent?: { code?: string; name?: string } | null;
  cmf_created_at?: string;
  cmf_modified_at?: string;
  priority?: string;
  priority_name?: string;
  logic_type?: { name?: string; code?: string } | null;
  deadline?: string;
  result_text?: string;
  executors?: { login?: string; name?: string }[];
  spectators?: { login?: string; name?: string }[];
  tags?: { name?: string }[];
  lists?: { id?: string; code?: string; name?: string }[];
  estimate_work?: number;
  mark?: string;
  waiting_for?: { login?: string; name?: string } | null;
  workflow?: { code?: string; name?: string } | null;
  components?: { name?: string }[];
  attachments?: EvaAttachmentRaw[];
  status_modified_at?: string;
  status_closed_at?: string;
  epic?: { code?: string; name?: string } | null;
  parent_task?: { code?: string; name?: string } | null;
  comments?: EvaCommentRaw[];
  is_milestone?: boolean;
}

/** Нормализованные данные требования */
export interface RequirementInfo {
  id: string;
  code: string;
  name: string;
  text: string;
  textDraft: string | null;
  status: string | null;
  statusName: string | null;
  statusCode: string | null;
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
  deadline: string | null;
  resultText: string | null;
  executors: string[];
  executorNames: string[];
  spectators: string[];
  spectatorNames: string[];
  tags: string[];
  lists: { id: string; code: string; name: string }[];
  isMilestone: boolean;
  estimateWork: number | null;
  mark: string | null;
  waitingFor: string | null;
  waitingForName: string | null;
  workflowCode: string | null;
  workflowName: string | null;
  components: string[];
  attachments: AttachmentInfo[];
  statusModifiedAt: string | null;
  statusClosedAt: string | null;
  epicCode: string | null;
  epicName: string | null;
  parentTaskCode: string | null;
  parentTaskName: string | null;
}

/** Параметры для listRequirements */
export interface RequirementListParams {
  filter?: BqlFilter | BqlFilter[];
  fields?: string[];
  slice?: [number, number];
}

/** Данные задачи из EvaProject */
export interface TaskInfo {
  id: string;
  code: string;
  name: string;
  text: string;
  status: string | null;
  statusName: string | null;
  statusCode: string | null;
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
  // ── Новые поля (фаза 1) ──
  deadline: string | null;
  resultText: string | null;
  executors: string[];
  executorNames: string[];
  spectators: string[];
  spectatorNames: string[];
  tags: string[];
  lists: { id: string; code: string; name: string }[];
  isMilestone: boolean;
  estimateWork: number | null;
  epicCode: string | null;
  epicName: string | null;
  mark: string | null;
  waitingFor: string | null;
  waitingForName: string | null;
  workflowCode: string | null;
  workflowName: string | null;
  components: string[];
  subprojectCode: string | null;
  subprojectName: string | null;
  attachments: AttachmentInfo[];
  statusModifiedAt: string | null;
  statusClosedAt: string | null;
  // ── Связи ──
  parentTaskCode: string | null;
  parentTaskName: string | null;
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

/** Сырые данные вложения из API EvaProject */
export interface EvaAttachmentRaw {
  id: string;
  name?: string;
  file_size?: number;
  mime_type?: string;
  cmf_created_at?: string;
  cmf_author?: { login?: string; name?: string } | null;
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
  // ── Новые поля (фаза 1) ──
  deadline?: string;
  result_text?: string;
  executors?: { login?: string; name?: string }[];
  spectators?: { login?: string; name?: string }[];
  tags?: { name?: string }[];
  lists?: { id?: string; code?: string; name?: string }[];
  is_milestone?: boolean;
  estimate_work?: number;
  epic?: { code?: string; name?: string } | null;
  mark?: string;
  waiting_for?: { login?: string; name?: string } | null;
  workflow?: { code?: string; name?: string } | null;
  components?: { name?: string }[];
  subproject?: { code?: string; name?: string } | null;
  attachments?: EvaAttachmentRaw[];
  status_modified_at?: string;
  status_closed_at?: string;
  followers?: EvaPersonRaw[];
}

/** Сырые данные комментария из API EvaProject */
export interface EvaCommentRaw {
  id?: string;
  cmf_author?: { login?: string; name?: string } | null;
  text?: string;
  cmf_created_at?: string;
  tree_parent?: string | { id?: string } | null;
}

// ── BQL (фильтры) ──────────────────────────────────────────────

/** Операторы сравнения BQL */
export type BqlOperator = "==" | "!=" | "LIKE" | "NOT LIKE" | "ILIKE" | "NOT ILIKE" | "IN" | "NOT IN" | ">" | "<" | ">=" | "<=";

/** BQL-фильтр: кортеж [поле, оператор, значение], OR-группа или AND-группа */
export type BqlFilter = [string, BqlOperator, unknown] | ["OR", ...BqlFilter[]] | ["AND", ...BqlFilter[]];

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
  parent_task?: string | null;  // код родительской задачи; null — очистить
  epic?: string;
  mark?: string;

  depended_tasks?: string[];    // Зависимые задачи (depended)
  affected_tasks?: string[];   // Связанные задачи (affected)
  local_links?: string[];      // Локальные связи

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
  components?: string[];
  subproject?: string;
  tmplt_document?: string;
  waiting_for?: string;
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
  workflowCode: string | null;
  workflowName: string | null;
}

/** Сырые данные проекта из API */
export interface EvaProjectRaw {
  id: string;
  code: string;
  name: string;
  description?: string;
  status?: { id?: string; name?: string; code?: string } | string | null;
  status_name?: string;
  cmf_created_at?: string;
  cmf_modified_at?: string;
  workflow?: { code?: string; name?: string } | null;
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

// ── Журнал работ ────────────────────────────────────────────

/** Сырые данные записи журнала работ */
export interface WorklogEntryRaw {
  id: string;
  time_spent?: number;
  start_date?: string;
  text?: string;
  cmf_created_at?: string;
  cmf_owner?: { login?: string; name?: string } | null;
}

/** Нормализованная запись журнала работ */
export interface WorklogEntry {
  id: string;
  timeSpent: number | null;
  startDate: string | null;
  text: string;
  createdAt: string | null;
  author: string | null;
  authorName: string | null;
}

// ── История изменений ───────────────────────────────────────

/** Сырые данные записи истории статусов */
export interface StatusHistoryEntryRaw {
  id: string;
  cmf_created_at?: string;
  from_status_name?: string;
  to_status_name?: string;
  to_status_code?: string;
  cmf_author?: { login?: string; name?: string } | null;
}

/** Нормализованная запись истории статусов */
export interface StatusHistoryEntry {
  id: string;
  createdAt: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  toStatusCode: string | null;
  author: string | null;
  authorName: string | null;
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
  relationTypeId: string | null;   // ID типа связи (для create/delete)
  relationTypeCode: string | null; // Код типа связи
}

/** Набор связанных задач */
export interface LinkedTasksInfo {
  parentTask: TaskInfo | null;
  childTasks: TaskInfo[];
  dependedTasks: TaskInfo[];
  affectedTasks: TaskInfo[];
  localLinks: TaskInfo[];
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
    id?: string;
    code?: string;
    out_type_name?: string;
    in_type_name?: string;
    choice_type?: string;
  } | null;
}

/** Тип связи (из справочника CmfRelationOptionType) */
export interface RelationTypeInfo {
  id: string;
  code: string | null;
  outTypeName: string | null;
  inTypeName: string | null;
  choiceType: string | null;
}

// ── Спринты/списки ────────────────────────────────────────────

/** Нормализованные данные спринта (CmfList) */
export interface SprintInfo {
  id: string;
  code: string;
  name: string;
  projectCode: string | null;
  projectName: string | null;
  status: string | null;
  statusName: string | null;
  startDate: string | null;
  endDate: string | null;
  isDefault: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  ownerLogin: string | null;
  ownerName: string | null;
  sysType: string | null;
  logicType: string | null;
  workflowCode: string | null;
  workflowName: string | null;
  schemeWfCode: string | null;
  schemeWfName: string | null;
  treeParentCode: string | null;
  treeParentName: string | null;
}

/** Сырые данные спринта из API EvaProject */
export interface EvaSprintRaw {
  id: string;
  code?: string;
  name?: string;
  parent?: { code?: string; name?: string } | null;
  status?: { id?: string; name?: string } | string | null;
  status_name?: string;
  plan_start_date?: string;
  plan_end_date?: string;
  is_default?: boolean;
  cmf_created_at?: string;
  cmf_modified_at?: string;
  cmf_owner?: { login?: string; name?: string } | null;
  sys_type?: string;
  logic_type?: { code?: string; name?: string } | string | null;
  workflow?: { code?: string; name?: string } | null;
  scheme_wf?: { code?: string; name?: string } | null;
  tree_parent?: { code?: string; name?: string } | null;
}

/** Поля для создания/обновления спринта */
export interface SprintUpdateFields {
  name?: string;
  code?: string;
  parent_id?: string;        // проект (ID)
  tree_parent_id?: string;   // папка в дереве проекта
  activity?: string;         // вид деятельности (ID)
  status?: string;
  plan_start_date?: string;
  plan_end_date?: string;
  is_default?: boolean;
  cmf_owner?: string;
  logic_type?: string;
  executors?: string[];
  spectators?: string[];
}

// ── Установка/удаление связей между задачами ──────────────────

/** Параметры для link_tasks — установка связей */
export interface LinkTasksParams {
  depended_tasks?: string[];   // Коды задач для добавления в depended
  affected_tasks?: string[];   // Коды задач для добавления в affected
  local_links?: string[];      // Коды задач для добавления в local_links
  parent_task?: string;        // Код родительской задачи
}

/** Параметры для unlink_tasks — удаление связей */
export interface UnlinkTasksParams {
  depended_tasks?: string[];   // Коды задач для удаления из depended
  affected_tasks?: string[];   // Коды задач для удаления из affected
  local_links?: string[];      // Коды задач для удаления из local_links
  parent_task?: string;        // Код родительской задачи (для удаления)
}
