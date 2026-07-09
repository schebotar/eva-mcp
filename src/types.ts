/** Универсальный JSON-RPC 2.2 запрос */
export interface JsonRpcRequest {
  jsonrpc: "2.2";
  method: string;
  kwargs: Record<string, unknown>;
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
  author: string | null;
  authorName: string | null;
  text: string;
  createdAt: string | null;
}

/** Сырые данные задачи из API EvaProject */
export interface EvaTaskRaw {
  id: string;
  code: string;
  name: string;
  text?: string;
  status?: string;
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
}

/** Сырые данные комментария из API EvaProject */
export interface EvaCommentRaw {
  cmf_author?: { login?: string; name?: string } | null;
  text?: string;
  cmf_created_at?: string;
}
