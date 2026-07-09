import type { TaskInfo, CommentInfo, JsonRpcRequest, JsonRpcResponse, JsonRpcError, EvaTaskRaw, EvaCommentRaw } from "./types.js";

/** HTTP-клиент для EvaProject JSON-RPC API */
export class EvaClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    // Убираем trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
  }

  /** Универсальный вызов JSON-RPC метода */
  private async call<T>(method: string, kwargs: Record<string, unknown>): Promise<T> {
    const body: JsonRpcRequest = {
      jsonrpc: "2.2",
      method,
      kwargs,
    };

    const apiUrl = `${this.baseUrl}/api/`;
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("EvaProject API: неавторизованный запрос (401). Проверьте EVA_TOKEN.");
      }
      throw new Error(`EvaProject API: HTTP ${response.status} — ${response.statusText}`);
    }

    const data = (await response.json()) as JsonRpcResponse<T> | JsonRpcError;

    if ("error" in data) {
      throw new Error(
        `EvaProject API: ошибка ${data.error.code} — ${data.error.message}`
      );
    }

    return (data as JsonRpcResponse<T>).result;
  }

  /** Получить задачу по коду (например, DEV-000003) */
  async getTask(code: string): Promise<TaskInfo> {
    const raw = await this.call<EvaTaskRaw>("CmfTask.get", {
      filter: ["code", "==", code],
      fields: ["**"],
    });

    return this.mapTask(raw);
  }

  /** Получить комментарии задачи по коду */
  async getTaskComments(code: string): Promise<CommentInfo[]> {
    const raw = await this.call<EvaTaskRaw>("CmfTask.get", {
      filter: ["code", "==", code],
      fields: ["comments.*"],
    });

    const comments = raw.comments ?? [];
    return comments.map((c) => this.mapComment(c));
  }

  /** Получить задачу вместе с комментариями */
  async getTaskWithComments(code: string): Promise<{ task: TaskInfo; comments: CommentInfo[] }> {
    const raw = await this.call<EvaTaskRaw>("CmfTask.get", {
      filter: ["code", "==", code],
      fields: ["**", "comments.*"],
    });

    const task = this.mapTask(raw);
    const comments = (raw.comments ?? []).map((c) => this.mapComment(c));
    return { task, comments };
  }

  private mapTask(raw: EvaTaskRaw): TaskInfo {
    return {
      id: raw.id,
      code: raw.code,
      name: raw.name,
      text: raw.text ?? "",
      status: raw.status ?? null,
      statusName: raw.status_name ?? null,
      author: raw.cmf_author?.login ?? null,
      authorName: raw.cmf_author?.name ?? null,
      responsible: raw.responsible?.login ?? null,
      responsibleName: raw.responsible?.name ?? null,
      projectCode: raw.parent?.code ?? null,
      projectName: raw.parent?.name ?? null,
      createdAt: raw.cmf_created_at ?? null,
      updatedAt: raw.cmf_modified_at ?? null,
      priority: raw.priority ?? null,
      priorityName: raw.priority_name ?? null,
      typeName: raw.logic_type?.name ?? null,
    };
  }

  private mapComment(raw: EvaCommentRaw): CommentInfo {
    return {
      author: raw.cmf_author?.login ?? null,
      authorName: raw.cmf_author?.name ?? null,
      text: raw.text ?? "",
      createdAt: raw.cmf_created_at ?? null,
    };
  }
}
