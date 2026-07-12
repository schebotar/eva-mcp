import type {
  TaskInfo, CommentInfo, JsonRpcRequest, JsonRpcResponse, JsonRpcError,
  EvaTaskRaw, EvaCommentRaw, BqlFilter, TaskListParams, TaskUpdateFields,
  ProjectInfo, EvaProjectRaw,
  PersonInfo, EvaPersonRaw,
  StatusInfo, EvaStatusRaw,
  LinkedTasksInfo,
} from "./types.js";

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
  private async call<T>(
    method: string,
    kwargs: Record<string, unknown>,
    topLevel?: { filter?: BqlFilter | BqlFilter[]; args?: unknown[] }
  ): Promise<T> {
    const body: JsonRpcRequest = {
      jsonrpc: "2.2",
      method,
      kwargs,
      ...(topLevel?.filter && { filter: topLevel.filter }),
      ...(topLevel?.args && { args: topLevel.args }),
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

  /** Получить задачу по ID */
  async getTaskById(id: string): Promise<TaskInfo> {
    const raw = await this.call<EvaTaskRaw>("CmfTask.get", {
      id,
      fields: ["**"],
    });
    return this.mapTask(raw);
  }

  /** Получить список задач с фильтрацией */
  async listTasks(params: TaskListParams = {}): Promise<TaskInfo[]> {
    const kwargs: Record<string, unknown> = {
      fields: params.fields ?? ["**"],
    };

    if (params.filter) {
      kwargs.filter = params.filter;
    }

    if (params.slice) {
      kwargs.slice = params.slice;
    }

    const result = await this.call<EvaTaskRaw[]>("CmfTask.list", kwargs);
    return result.map((raw) => this.mapTask(raw));
  }

  /** Получить количество задач по фильтру */
  async countTasks(filter?: BqlFilter | BqlFilter[]): Promise<number> {
    const kwargs: Record<string, unknown> = {};
    if (filter) {
      kwargs.filter = filter;
    }
    return this.call<number>("CmfTask.count", kwargs);
  }

  /** Обновить поля задачи */
  async updateTask(code: string, fields: TaskUpdateFields): Promise<TaskInfo> {
    // Сначала получаем ID задачи по коду
    const resolved = await this.call<EvaTaskRaw>("CmfTask.get", {
      filter: ["code", "==", code],
      fields: ["id"],
    });

    // ID — как args[0], поля обновления — в kwargs
    const raw = await this.call<EvaTaskRaw>(
      "CmfTask.update",
      { ...fields },
      { args: [resolved.id] }
    );

    // После обновления получаем свежую версию задачи
    return this.getTask(code);
  }

  /** Получить проект по коду */
  async getProject(code: string): Promise<ProjectInfo> {
    const raw = await this.call<EvaProjectRaw>("CmfProject.get", {
      filter: ["code", "==", code],
      fields: ["**"],
    });
    return this.mapProject(raw);
  }

  /** Получить список проектов */
  async listProjects(filter?: BqlFilter | BqlFilter[]): Promise<ProjectInfo[]> {
    const kwargs: Record<string, unknown> = { fields: ["**"] };
    if (filter) {
      kwargs.filter = filter;
    }
    const result = await this.call<EvaProjectRaw[]>("CmfProject.list", kwargs);
    return result.map((raw) => this.mapProject(raw));
  }

  /** Поиск пользователей по имени или логину */
  async searchUsers(query: string): Promise<PersonInfo[]> {
    const kwargs: Record<string, unknown> = {
      fields: ["**"],
      filter: [
        "OR",
        ["name", "ILIKE", `%${query}%`],
        ["login", "ILIKE", `%${query}%`],
        ["last_name", "ILIKE", `%${query}%`],
      ],
    };
    let result: EvaPersonRaw[];
    try {
      result = await this.call<EvaPersonRaw[]>("CmfPerson.list", kwargs);
    } catch {
      // Fallback: без OR (старые версии API)
      const kwargs2: Record<string, unknown> = {
        fields: ["**"],
        filter: ["name", "ILIKE", `%${query}%`],
      };
      result = await this.call<EvaPersonRaw[]>("CmfPerson.list", kwargs2);
    }
    return result.map((raw) => this.mapPerson(raw));
  }

  /** Получить список всех статусов */
  async getStatuses(): Promise<StatusInfo[]> {
    const result = await this.call<EvaStatusRaw[]>("CmfStatus.list", {
      fields: ["**"],
    });
    return result.map((raw) => this.mapStatus(raw));
  }

  /** Получить связанные задачи (родительскую, дочерние, зависимые, affected) */
  async getLinkedTasks(code: string): Promise<LinkedTasksInfo> {
    const raw = await this.call<Record<string, unknown>>("CmfTask.get", {
      filter: ["code", "==", code],
      fields: [
        "**",
        "parent_task.**",
        "child_tasks.**",
        "depended_tasks.**",
        "affected_tasks.**",
      ],
    });

    const mapOrNull = (r: unknown): TaskInfo | null =>
      r ? this.mapTask(r as EvaTaskRaw) : null;

    const mapArr = (arr: unknown): TaskInfo[] =>
      Array.isArray(arr) ? arr.map((r) => this.mapTask(r as EvaTaskRaw)) : [];

    return {
      parentTask: mapOrNull((raw as Record<string, unknown>).parent_task),
      childTasks: mapArr((raw as Record<string, unknown>).child_tasks),
      dependedTasks: mapArr((raw as Record<string, unknown>).depended_tasks),
      affectedTasks: mapArr((raw as Record<string, unknown>).affected_tasks),
    };
  }

  private mapTask(raw: EvaTaskRaw): TaskInfo {
    // status может быть объектом {id, name} или строкой
    const statusObj =
      typeof raw.status === "object" && raw.status !== null ? raw.status : null;
    return {
      id: raw.id,
      code: raw.code,
      name: raw.name,
      text: raw.text ?? "",
      status: statusObj?.id ?? (typeof raw.status === "string" ? raw.status : null),
      statusName: raw.status_name ?? statusObj?.name ?? null,
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

  private mapProject(raw: EvaProjectRaw): ProjectInfo {
    return {
      id: raw.id,
      code: raw.code,
      name: raw.name,
      description: raw.description ?? "",
      status: raw.status ?? null,
      statusName: raw.status_name ?? null,
      createdAt: raw.cmf_created_at ?? null,
      updatedAt: raw.cmf_modified_at ?? null,
    };
  }

  private mapPerson(raw: EvaPersonRaw): PersonInfo {
    return {
      id: raw.id,
      login: raw.login ?? "",
      name: raw.name ?? "",
      firstName: raw.first_name ?? null,
      lastName: raw.last_name ?? null,
      secondName: raw.second_name ?? null,
      email: raw.email ?? null,
    };
  }

  private mapStatus(raw: EvaStatusRaw): StatusInfo {
    return {
      id: raw.id,
      name: raw.name ?? "",
      code: raw.code ?? null,
      type: raw.status_type ?? null,
    };
  }
}
