import type {
  TaskInfo, CommentInfo, AttachmentInfo, WorklogEntry, WorklogEntryRaw, StatusHistoryEntry, StatusHistoryEntryRaw, JsonRpcRequest, JsonRpcResponse, JsonRpcError,
  EvaTaskRaw, EvaAttachmentRaw, EvaCommentRaw, BqlFilter, TaskListParams, TaskUpdateFields,
  ProjectInfo, EvaProjectRaw,
  PersonInfo, EvaPersonRaw,
  StatusInfo, EvaStatusRaw,
  LinkedTasksInfo, ReferencingTasksInfo,
  EvaRelationOptionRaw, RelationInfo,
  SprintInfo, EvaSprintRaw, SprintUpdateFields,
} from "./types.js";
import {
  mapTask, mapComment, mapAttachment, mapWorklog, mapHistoryEntry,
  mapProject, mapPerson, mapStatus, mapSprint,
} from "./mappers.js";
/** HTTP-клиент для EvaProject JSON-RPC API */
export class EvaClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    // Убираем trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
  }

  /** Извлечь коды задач из произвольного текста (например, из комментариев) */
  extractTaskCodes(text: string): string[] {
    if (!text) return [];
    const matches = text.match(/\b[A-Z]+-\d+\b/g);
    if (!matches) return [];
    // Уникальные значения без учёта регистра кода
    const seen = new Set<string>();
    return matches.filter((m) => {
      const upper = m.toUpperCase();
      if (seen.has(upper)) return false;
      seen.add(upper);
      return true;
    });
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
      fields: ["***"],
    });

    return mapTask(raw);
  }

  /** Получить комментарии задачи по коду */
  async getTaskComments(code: string): Promise<CommentInfo[]> {
    const raw = await this.call<EvaTaskRaw>("CmfTask.get", {
      filter: ["code", "==", code],
      fields: ["comments.*"],
    });

    const comments = raw.comments ?? [];
    return comments.map((c) => mapComment(c));
  }

  /** Получить задачу вместе с комментариями */
  async getTaskWithComments(code: string): Promise<{ task: TaskInfo; comments: CommentInfo[]; mentionedTasks: string[] }> {
    const raw = await this.call<EvaTaskRaw>("CmfTask.get", {
      filter: ["code", "==", code],
      fields: ["***", "comments.**", "attachments.**"],
    });

    const task = mapTask(raw);
    const allComments = (raw.comments ?? []).map((c) => mapComment(c));

    // Собираем упоминания из описания задачи и всех комментариев
    const allText = [
      task.text,
      ...allComments.map((c) => c.text),
    ].join(" ");
    const mentionedTasks = this.extractTaskCodes(allText)
      .filter((c) => c.toUpperCase() !== code.toUpperCase());

    return { task, comments: allComments, mentionedTasks };
  }

  /** Получить задачу по ID */
  async getTaskById(id: string): Promise<TaskInfo> {
    const raw = await this.call<EvaTaskRaw>("CmfTask.get", {
      id,
      fields: ["***"],
    });
    return mapTask(raw);
  }

  /** Получить список задач с фильтрацией */
  async listTasks(params: TaskListParams = {}): Promise<TaskInfo[]> {
    const kwargs: Record<string, unknown> = {
      fields: params.fields ?? ["**"],
      no_meta: true,
    };

    if (params.filter) {
      kwargs.filter = params.filter;
    }

    if (params.slice) {
      kwargs.slice = params.slice;
    }

    const result = await this.call<EvaTaskRaw[]>("CmfTask.list", kwargs);
    return result.map((raw) => mapTask(raw));
  }

  /** Получить количество задач по фильтру */
  async countTasks(filter?: BqlFilter | BqlFilter[]): Promise<number> {
    const kwargs: Record<string, unknown> = { no_meta: true };
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
    return mapProject(raw);
  }

  /** Получить список проектов */
  async listProjects(filter?: BqlFilter | BqlFilter[]): Promise<ProjectInfo[]> {
    const kwargs: Record<string, unknown> = { fields: ["**"] };
    if (filter) {
      kwargs.filter = filter;
    }
    const result = await this.call<EvaProjectRaw[]>("CmfProject.list", kwargs);
    return result.map((raw) => mapProject(raw));
  }

  // ── Спринты/списки (CmfList) ──────────────────────────────────

  /** Получить спринт по коду */
  async getSprint(code: string): Promise<SprintInfo> {
    const raw = await this.call<EvaSprintRaw>("CmfList.get", {
      filter: ["code", "==", code],
      fields: ["***"],
    });
    return mapSprint(raw);
  }

  /** Получить список спринтов с фильтрацией */
  async listSprints(filter?: BqlFilter | BqlFilter[]): Promise<SprintInfo[]> {
    const kwargs: Record<string, unknown> = {
      fields: ["**"],
      no_meta: true,
    };
    if (filter) {
      kwargs.filter = filter;
    }
    const result = await this.call<EvaSprintRaw[]>("CmfList.list", kwargs);
    return result.map((raw) => mapSprint(raw));
  }

  /** Получить количество спринтов по фильтру */
  async countSprints(filter?: BqlFilter | BqlFilter[]): Promise<number> {
    const kwargs: Record<string, unknown> = { no_meta: true };
    if (filter) {
      kwargs.filter = filter;
    }
    return this.call<number>("CmfList.count", kwargs);
  }

  /** Создать новый спринт */
  async createSprint(fields: SprintUpdateFields): Promise<SprintInfo> {
    const raw = await this.call<EvaSprintRaw>("CmfList.create", { ...fields });
    return mapSprint(raw);
  }

  /** Обновить поля спринта */
  async updateSprint(code: string, fields: SprintUpdateFields): Promise<SprintInfo> {
    // Получаем ID спринта по коду
    const resolved = await this.call<EvaSprintRaw>("CmfList.get", {
      filter: ["code", "==", code],
      fields: ["id"],
    });

    await this.call<EvaSprintRaw>(
      "CmfList.update",
      { ...fields },
      { args: [resolved.id] }
    );

    return this.getSprint(code);
  }

  // ── Пользователи ──────────────────────────────────────────────

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
    return result.map((raw) => mapPerson(raw));
  }

  /** Получить список всех статусов */
  async getStatuses(): Promise<StatusInfo[]> {
    const result = await this.call<EvaStatusRaw[]>("CmfStatus.list", {
      fields: ["**"],
    });
    return result.map((raw) => mapStatus(raw));
  }

  /** Получить связанные задачи (родительскую, дочерние, зависимые, affected, а также связи через CmfRelationOption) */
  async getLinkedTasks(code: string): Promise<LinkedTasksInfo> {
    const raw = await this.call<Record<string, unknown>>("CmfTask.get", {
      filter: ["code", "==", code],
      fields: [
        "**",
        "parent_task.**",
        "child_tasks.**",
        "depended_tasks.**",
        "affected_tasks.**",
        "in_tasks.**",
        "in_tasks.out_link.code",
        "in_tasks.out_link.name",
        "in_tasks.in_link.code",
        "in_tasks.in_link.name",
        "in_tasks.relation_type.out_type_name",
        "in_tasks.relation_type.in_type_name",
        "in_tasks.relation_type.choice_type",
        "out_tasks.**",
        "out_tasks.out_link.code",
        "out_tasks.out_link.name",
        "out_tasks.in_link.code",
        "out_tasks.in_link.name",
        "out_tasks.relation_type.out_type_name",
        "out_tasks.relation_type.in_type_name",
        "out_tasks.relation_type.choice_type",
      ],
    });

    const mapOrNull = (r: unknown): TaskInfo | null =>
      r ? mapTask(r as EvaTaskRaw) : null;

    const mapArr = (arr: unknown): TaskInfo[] =>
      Array.isArray(arr) ? arr.map((r) => mapTask(r as EvaTaskRaw)) : [];

    const mapRelations = (arr: unknown): RelationInfo[] => {
      if (!Array.isArray(arr)) return [];
      return arr.map((rel: EvaRelationOptionRaw) => ({
        relationId: rel.id,
        outTask: mapTask({ id: rel.out_link?.id ?? "", code: rel.out_link?.code ?? "", name: rel.out_link?.name ?? "" } as EvaTaskRaw),
        inTask: mapTask({ id: rel.in_link?.id ?? "", code: rel.in_link?.code ?? "", name: rel.in_link?.name ?? "" } as EvaTaskRaw),
        outTypeName: rel.relation_type?.out_type_name ?? null,
        inTypeName: rel.relation_type?.in_type_name ?? null,
        choiceType: rel.relation_type?.choice_type ?? null,
      }));
    };

    return {
      parentTask: mapOrNull((raw as Record<string, unknown>).parent_task),
      childTasks: mapArr((raw as Record<string, unknown>).child_tasks),
      dependedTasks: mapArr((raw as Record<string, unknown>).depended_tasks),
      affectedTasks: mapArr((raw as Record<string, unknown>).affected_tasks),
      precedesTasks: mapRelations((raw as Record<string, unknown>).in_tasks),
      followsTasks: mapRelations((raw as Record<string, unknown>).out_tasks),
    };
  }

  /** Обратный поиск: найти задачи, которые ссылаются на указанную */
  async getReferencingTasks(code: string): Promise<ReferencingTasksInfo> {
    const fields = ["**"];

    // Параллельно ищем задачи по трём типам обратных связей
    const [asParent, asDepended, asAffected] = await Promise.all([
      this.call<EvaTaskRaw[]>("CmfTask.list", {
        fields,
        filter: ["parent_task", "==", code],
      }).catch(() => [] as EvaTaskRaw[]),
      this.call<EvaTaskRaw[]>("CmfTask.list", {
        fields,
        filter: ["depended_tasks", "IN", [code]],
      }).catch(() => [] as EvaTaskRaw[]),
      this.call<EvaTaskRaw[]>("CmfTask.list", {
        fields,
        filter: ["affected_tasks", "IN", [code]],
      }).catch(() => [] as EvaTaskRaw[]),
    ]);

    const mapArr = (arr: EvaTaskRaw[]): TaskInfo[] =>
      arr.map((r) => mapTask(r));

    return {
      tasksWithThisAsParent: mapArr(asParent),
      tasksWithThisAsDepended: mapArr(asDepended),
      tasksWithThisAsAffected: mapArr(asAffected),
    };
  }

  /** Батчевый вариант getLinkedTasks — сразу для нескольких кодов */
  async getLinkedTasksBatch(codes: string[]): Promise<Record<string, LinkedTasksInfo>> {
    if (codes.length === 0) return {};

    const rawList = await this.call<Record<string, unknown>[]>("CmfTask.list", {
      fields: [
        "**",
        "parent_task.**",
        "child_tasks.**",
        "depended_tasks.**",
        "affected_tasks.**",
        "in_tasks.**",
        "in_tasks.out_link.code",
        "in_tasks.out_link.name",
        "in_tasks.in_link.code",
        "in_tasks.in_link.name",
        "in_tasks.relation_type.out_type_name",
        "in_tasks.relation_type.in_type_name",
        "in_tasks.relation_type.choice_type",
        "out_tasks.**",
        "out_tasks.out_link.code",
        "out_tasks.out_link.name",
        "out_tasks.in_link.code",
        "out_tasks.in_link.name",
        "out_tasks.relation_type.out_type_name",
        "out_tasks.relation_type.in_type_name",
        "out_tasks.relation_type.choice_type",
      ],
      filter: ["code", "IN", codes],
    });

    const mapOrNull = (r: unknown): TaskInfo | null =>
      r ? mapTask(r as EvaTaskRaw) : null;

    const mapArr = (arr: unknown): TaskInfo[] =>
      Array.isArray(arr) ? arr.map((r) => mapTask(r as EvaTaskRaw)) : [];

    const mapRelations = (arr: unknown): RelationInfo[] => {
      if (!Array.isArray(arr)) return [];
      return arr.map((rel: EvaRelationOptionRaw) => ({
        relationId: rel.id,
        outTask: mapTask({ id: rel.out_link?.id ?? "", code: rel.out_link?.code ?? "", name: rel.out_link?.name ?? "" } as EvaTaskRaw),
        inTask: mapTask({ id: rel.in_link?.id ?? "", code: rel.in_link?.code ?? "", name: rel.in_link?.name ?? "" } as EvaTaskRaw),
        outTypeName: rel.relation_type?.out_type_name ?? null,
        inTypeName: rel.relation_type?.in_type_name ?? null,
        choiceType: rel.relation_type?.choice_type ?? null,
      }));
    };

    const result: Record<string, LinkedTasksInfo> = {};
    for (const raw of rawList) {
      const code = (raw as Record<string, unknown>).code as string;
      if (code) {
        result[code] = {
          parentTask: mapOrNull((raw as Record<string, unknown>).parent_task),
          childTasks: mapArr((raw as Record<string, unknown>).child_tasks),
          dependedTasks: mapArr((raw as Record<string, unknown>).depended_tasks),
          affectedTasks: mapArr((raw as Record<string, unknown>).affected_tasks),
          precedesTasks: mapRelations((raw as Record<string, unknown>).in_tasks),
          followsTasks: mapRelations((raw as Record<string, unknown>).out_tasks),
        };
      }
    }
    return result;
  }

  /** Получить список вложений задачи */
  async getAttachments(code: string): Promise<AttachmentInfo[]> {
    const raw = await this.call<EvaTaskRaw>("CmfTask.get", {
      filter: ["code", "==", code],
      fields: ["attachments.**"],
    });
    return (raw.attachments ?? []).map((a) => mapAttachment(a));
  }

  /** Получить журнал работ (timetracker) по задаче */
  async getWorklog(code: string): Promise<WorklogEntry[]> {
    // Сначала получаем ID задачи
    const resolved = await this.call<EvaTaskRaw>("CmfTask.get", {
      filter: ["code", "==", code],
      fields: ["id"],
    });

    const result = await this.call<WorklogEntryRaw[]>("CmfTimeTrackerHistory.list", {
      fields: ["**"],
      filter: ["parent", "==", resolved.id],
    });

    return result.map((raw) => mapWorklog(raw));
  }

  /** Получить подписчиков задачи */
  async getFollowers(code: string): Promise<PersonInfo[]> {
    const raw = await this.call<EvaTaskRaw>("CmfTask.get", {
      filter: ["code", "==", code],
      fields: ["followers.**"],
    });
    return (raw.followers ?? []).map((f) => mapPerson(f));
  }

  /** Получить историю изменения статусов задачи */
  async getTaskHistory(code: string): Promise<StatusHistoryEntry[]> {
    const result = await this.call<StatusHistoryEntryRaw[]>("CmfStatusHistory.list", {
      fields: ["**"],
      filter: ["obj_code", "==", code],
      order_by: ["-cmf_created_at"],
    });
    return result.map((raw) => mapHistoryEntry(raw));
  }

  /** Создать новую задачу */
  async createTask(fields: Record<string, unknown>): Promise<TaskInfo> {
    const raw = await this.call<EvaTaskRaw>("CmfTask.create", { ...fields });
    return this.getTask(raw.code);
  }

  /** Добавить комментарий к задаче */
  async addComment(taskCode: string, text: string): Promise<CommentInfo> {
    const raw = await this.call<EvaCommentRaw>("CmfComment.create", {
      parent: taskCode,
      text: text,
    });
    return mapComment(raw);
  }

  /** Списать время по задаче (timetracker) */
  async logWork(
    taskCode: string,
    timeSpent: number,
    text?: string,
    date?: string
  ): Promise<void> {
    const resolved = await this.call<EvaTaskRaw>("CmfTask.get", {
      filter: ["code", "==", taskCode],
      fields: ["id"],
    });

    await this.call<unknown>(
      "CmfTask.timetracker_change_time",
      {
        time_spent: timeSpent,
        text: text ?? "",
        date: date ?? new Date().toISOString(),
      },
      { args: [resolved.id] }
    );
  }
}
