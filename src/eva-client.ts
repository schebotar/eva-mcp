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
      fields: ["***", "priority_name"],
    });

    return mapTask(raw);
  }

  /** Получить комментарии задачи по коду */
  async getTaskComments(code: string): Promise<CommentInfo[]> {
    const raw = await this.call<EvaTaskRaw>("CmfTask.get", {
      filter: ["code", "==", code],
      fields: [
        "comments.id",
        "comments.text",
        "comments.cmf_created_at",
        "comments.cmf_author.login",
        "comments.cmf_author.name",
        "comments.tree_parent.id",
      ],
    });

    const comments = raw.comments ?? [];
    return comments.map((c) => mapComment(c));
  }

  /** Получить задачу вместе с комментариями */
  async getTaskWithComments(code: string): Promise<{ task: TaskInfo; comments: CommentInfo[]; mentionedTasks: string[] }> {
    const raw = await this.call<EvaTaskRaw>("CmfTask.get", {
      filter: ["code", "==", code],
      fields: [
        "***",
        "priority_name",
        "comments.id",
        "comments.text",
        "comments.cmf_created_at",
        "comments.cmf_author.login",
        "comments.cmf_author.name",
        "comments.tree_parent.id",
        "attachments.**",
      ],
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
      fields: params.fields ?? ["**", "priority_name"],
      no_meta: true,
    };

    if (params.filter) {
      kwargs.filter = params.filter;
    }

    if (params.slice) {
      kwargs.slice = params.slice;
    }

    const result = await this.call<EvaTaskRaw[]>("CmfTask.list", kwargs);
    return result.map((raw) => mapTask(raw)).filter((t) => t.code);
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
    const raw = await this.call<EvaProjectRaw | null>("CmfProject.get", {
      filter: ["code", "==", code],
      fields: ["**"],
    });
    if (!raw) {
      throw new Error(`Проект с кодом "${code}" не найден. Проверьте код через search_projects.`);
    }
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

  /** Найти ID папки Sprints в проекте */
  async findSprintsFolderId(projectId: string): Promise<string | null> {
    try {
      const folders = await this.call<Array<{ id: string }>>(
        "CmfFolder.list",
        {
          filter: [["parent_id", "==", projectId], ["code", "ILIKE", "%SPRINT%"]],
          fields: ["id"],
        }
      );
      return folders.length > 0 ? folders[0].id : null;
    } catch {
      return null;
    }
  }

  // ── Спринты (CmfList) ────────────────────────────────────

  /** Получить спринт по коду */
  async getSprint(code: string): Promise<SprintInfo> {
    const raw = await this.call<EvaSprintRaw>("CmfList.get", {
      filter: ["code", "==", code],
      fields: ["**"],
    });
    return mapSprint(raw);
  }

  /** Получить список спринтов с фильтрацией */
  async listSprints(filter?: BqlFilter | BqlFilter[], slice?: [number, number]): Promise<SprintInfo[]> {
    const kwargs: Record<string, unknown> = {
      fields: ["**"],
      no_meta: true,
    };
    if (filter) {
      kwargs.filter = filter;
    }
    if (slice) {
      kwargs.slice = slice;
    }
    const result = await this.call<EvaSprintRaw[]>("CmfList.list", kwargs);
    return result.map((raw) => mapSprint(raw)).filter((s) => s.code);
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
    // Если передан код проекта — получаем ID
    const kwargs: Record<string, unknown> = {
      ...fields,
      logic_type: fields.logic_type ?? "list.agile_sprint:default",
      executors: fields.executors ?? [],
      spectators: fields.spectators ?? [],
    };

    const id = await this.call<string>("CmfList.create", kwargs);
    const raw = await this.call<EvaSprintRaw>("CmfList.get", { id });
    return mapSprint(raw);
  }

  /** Получить спринт по ID */
  private async getSprintById(id: string): Promise<SprintInfo> {
    const raw = await this.call<EvaSprintRaw>("CmfList.get", { id });
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
      { filter: [["id", "==", resolved.id]] }
    );

    return this.getSprint(code);
  }

  /** Удалить спринт */
  async deleteSprint(code: string): Promise<void> {
    const resolved = await this.call<EvaSprintRaw>("CmfList.get", {
      filter: ["code", "==", code],
      fields: ["id"],
    });
    await this.call<void>("CmfList.delete", {}, { filter: [["id", "==", resolved.id]] });
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

  /** Получить список статусов. Если передан projectCode — пытается получить статусы проекта через workflow или задачи. */
  async getStatuses(projectCode?: string): Promise<StatusInfo[]> {
    if (projectCode) {
      // 1. Получаем проект, чтобы узнать workflow
      const project = await this.getProject(projectCode);

      // 2. Пробуем получить статусы через workflow проекта
      if (project.workflowCode) {
        try {
          const wfRaw = await this.call<Record<string, unknown>>("CmfWorkflow.get", {
            filter: ["code", "==", project.workflowCode],
            fields: ["**", "statuses.id", "statuses.code", "statuses.name", "statuses.status_type"],
          });
          const statuses = (wfRaw as Record<string, unknown>).statuses;
          if (Array.isArray(statuses) && statuses.length > 0) {
            return statuses.map((s: Record<string, unknown>) => mapStatus({
              id: s.id as string,
              name: s.name as string | undefined,
              code: s.code as string | undefined,
              status_type: s.status_type as string | undefined,
            }));
          }
        } catch {
          // workflow не поддерживается — пробуем другой способ
        }
      }

      // 3. Фолбэк: собираем уникальные статусы из задач проекта
      try {
        const tasks = await this.call<EvaTaskRaw[]>("CmfTask.list", {
          fields: ["status.id", "status.code", "status.name", "status.status_type"],
          filter: ["parent_id", "==", project.id],
          no_meta: true,
          slice: [0, 200],
        });
        if (tasks.length > 0) {
          const seen = new Map<string, StatusInfo>();
          for (const t of tasks) {
            const s = typeof t.status === "object" && t.status ? t.status : null;
            if (s && s.id && !seen.has(s.id)) {
              seen.set(s.id, {
                id: s.id,
                name: s.name ?? "",
                code: s.code ?? null,
                type: (s as Record<string, unknown>).status_type as string ?? null,
              });
            }
          }
          if (seen.size > 0) return [...seen.values()];
        }
      } catch {
        // fallback к полному списку
      }
    }

    // Без project_code или если все попытки не удались — возвращаем все статусы
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
        "lists.id",
        "lists.code",
        "lists.name",
        "parent_task.**",
        "parent_task.lists.id",
        "parent_task.lists.code",
        "parent_task.lists.name",
        "child_tasks.**",
        "child_tasks.lists.id",
        "child_tasks.lists.code",
        "child_tasks.lists.name",
        "depended_tasks.**",
        "depended_tasks.lists.id",
        "depended_tasks.lists.code",
        "depended_tasks.lists.name",
        "affected_tasks.**",
        "affected_tasks.lists.id",
        "affected_tasks.lists.code",
        "affected_tasks.lists.name",
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
        "lists.id",
        "lists.code",
        "lists.name",
        "parent_task.**",
        "parent_task.lists.id",
        "parent_task.lists.code",
        "parent_task.lists.name",
        "child_tasks.**",
        "child_tasks.lists.id",
        "child_tasks.lists.code",
        "child_tasks.lists.name",
        "depended_tasks.**",
        "depended_tasks.lists.id",
        "depended_tasks.lists.code",
        "depended_tasks.lists.name",
        "affected_tasks.**",
        "affected_tasks.lists.id",
        "affected_tasks.lists.code",
        "affected_tasks.lists.name",
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
      no_meta: true,
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
    const taskId = await this.call<string>("CmfTask.create", { ...fields });
    return this.getTaskById(taskId);
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
        remaining_estimate: 0,
        text: text ?? "",
        date: date ?? new Date().toISOString(),
      },
      { args: [resolved.id] }
    );
  }
}
