import type {
  TaskInfo, CommentInfo, AttachmentInfo, WorklogEntry, WorklogEntryRaw, StatusHistoryEntry, StatusHistoryEntryRaw, JsonRpcRequest, JsonRpcResponse, JsonRpcError,
  EvaTaskRaw, EvaAttachmentRaw, EvaCommentRaw, BqlFilter, TaskListParams, TaskUpdateFields,
  ProjectInfo, EvaProjectRaw,
  PersonInfo, EvaPersonRaw,
  StatusInfo, EvaStatusRaw,
  LinkedTasksInfo, ReferencingTasksInfo,
  EvaRelationOptionRaw, RelationInfo,
  SprintInfo, EvaSprintRaw, SprintUpdateFields,
  RequirementInfo, EvaReqRaw, RequirementListParams, RequirementUpdateFields,
  LinkTasksParams, UnlinkTasksParams,
  RelationTypeInfo,
} from "./types.js";
import {
  mapTask, mapComment, mapAttachment, mapWorklog, mapHistoryEntry,
  mapProject, mapPerson, mapStatus, mapSprint, mapRequirement,
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
        "comments.tree_parent",
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
        "comments.tree_parent",
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

  /** Резолвить коды задач в ID (параллельно, для валидации) */
  async resolveTaskIds(codes: string[]): Promise<Record<string, string>> {
    if (codes.length === 0) return {};

    const results = await Promise.all(
      codes.map(async (code) => {
        try {
          const raw = await this.call<EvaTaskRaw>("CmfTask.get", {
            filter: ["code", "==", code],
            fields: ["id", "code"],
          });
          return { code, id: raw.id };
        } catch {
          throw new Error(`Задача с кодом "${code}" не найдена. Проверьте код через search_tasks.`);
        }
      })
    );

    const map: Record<string, string> = {};
    for (const { code, id } of results) {
      map[code] = id;
    }
    return map;
  }

  /** Получить текущие коды связей задачи (depended/affected/local_links/parent_task) */
  private async getCurrentLinkCodes(code: string): Promise<{
    depended: string[];
    affected: string[];
    localLinks: string[];
    parentTask: string | null;
  }> {
    const raw = await this.call<EvaTaskRaw>("CmfTask.get", {
      filter: ["code", "==", code],
      fields: [
        "depended_tasks.code",
        "affected_tasks.code",
        "local_links.code",
        "parent_task.code",
      ],
    });

    return {
      depended: (raw.depended_tasks ?? []).map((t) => t.code).filter(Boolean),
      affected: (raw.affected_tasks ?? []).map((t) => t.code).filter(Boolean),
      localLinks: ((raw as unknown as Record<string, unknown>).local_links as Array<{ code?: string }> ?? [])
        .map((t) => t.code).filter((c): c is string => !!c),
      parentTask: raw.parent_task?.code ?? null,
    };
  }

  /** Установить связи между задачами (merge — дополняет существующие) */
  async linkTasks(code: string, params: LinkTasksParams): Promise<LinkedTasksInfo> {
    // Валидация: запрет самосвязи
    const allTargetCodes = [
      ...(params.depended_tasks ?? []),
      ...(params.affected_tasks ?? []),
      ...(params.local_links ?? []),
    ];
    if (params.parent_task) allTargetCodes.push(params.parent_task);

    for (const target of allTargetCodes) {
      if (target.toUpperCase() === code.toUpperCase()) {
        throw new Error(`Нельзя связать задачу с самой собой (\`${code}\`).`);
      }
    }

    // Валидация: существование целевых задач
    if (allTargetCodes.length > 0) {
      await this.resolveTaskIds(allTargetCodes);
    }

    // Получаем текущие связи
    const current = await this.getCurrentLinkCodes(code);

    // Собираем поля для обновления (merge)
    const fields: TaskUpdateFields = {};

    if (params.depended_tasks !== undefined) {
      const merged = [...new Set([...current.depended, ...params.depended_tasks])];
      fields.depended_tasks = merged;
    }
    if (params.affected_tasks !== undefined) {
      const merged = [...new Set([...current.affected, ...params.affected_tasks])];
      fields.affected_tasks = merged;
    }
    if (params.local_links !== undefined) {
      const merged = [...new Set([...current.localLinks, ...params.local_links])];
      fields.local_links = merged;
    }
    if (params.parent_task !== undefined) {
      fields.parent_task = params.parent_task;
    }

    if (Object.keys(fields).length === 0) {
      throw new Error("Не указаны связи для установки. Укажите хотя бы один параметр: depended_tasks, affected_tasks, local_links или parent_task.");
    }

    // Обновляем задачу
    await this.updateTask(code, fields);

    // Возвращаем актуальные связи
    return this.getLinkedTasks(code);
  }

  /** Удалить связи между задачами (удаляет только указанные коды) */
  async unlinkTasks(code: string, params: UnlinkTasksParams): Promise<LinkedTasksInfo> {
    // Получаем текущие связи
    const current = await this.getCurrentLinkCodes(code);

    const fields: TaskUpdateFields = {};
    let hasAny = false;

    if (params.depended_tasks !== undefined) {
      hasAny = true;
      const removeSet = new Set(params.depended_tasks.map((c) => c.toUpperCase()));
      fields.depended_tasks = current.depended.filter(
        (c) => !removeSet.has(c.toUpperCase())
      );
    }
    if (params.affected_tasks !== undefined) {
      hasAny = true;
      const removeSet = new Set(params.affected_tasks.map((c) => c.toUpperCase()));
      fields.affected_tasks = current.affected.filter(
        (c) => !removeSet.has(c.toUpperCase())
      );
    }
    if (params.local_links !== undefined) {
      hasAny = true;
      const removeSet = new Set(params.local_links.map((c) => c.toUpperCase()));
      fields.local_links = current.localLinks.filter(
        (c) => !removeSet.has(c.toUpperCase())
      );
    }
    if (params.parent_task !== undefined) {
      hasAny = true;
      // Если передан parent_task, и он совпадает с текущим — удаляем (null очищает связь)
      if (current.parentTask && params.parent_task.toUpperCase() === current.parentTask.toUpperCase()) {
        fields.parent_task = null;
      }
    }

    if (!hasAny) {
      throw new Error("Не указаны связи для удаления. Укажите хотя бы один параметр: depended_tasks, affected_tasks, local_links или parent_task.");
    }

    // Обновляем задачу
    await this.updateTask(code, fields);

    // Возвращаем актуальные связи
    return this.getLinkedTasks(code);
  }

  // ── Произвольные связи (CmfRelationOption) ──────────────────

  /** Получить список доступных типов связей */
  async listRelationTypes(): Promise<RelationTypeInfo[]> {
    try {
      // Пробуем CmfRelationOptionType.list
      const raw = await this.call<Array<Record<string, unknown>>>("CmfRelationOptionType.list", {
        fields: ["**"],
        no_meta: true,
      });
      return raw.map((r) => ({
        id: r.id as string,
        code: (r.code as string) ?? null,
        outTypeName: (r.out_type_name as string) ?? null,
        inTypeName: (r.in_type_name as string) ?? null,
        choiceType: (r.choice_type as string) ?? null,
      }));
    } catch {
      // Фолбэк: пробуем собрать типы из существующих связей (CmfRelationOption.list)
      try {
        const raw = await this.call<Array<Record<string, unknown>>>("CmfRelationOption.list", {
          fields: ["relation_type.id", "relation_type.code", "relation_type.out_type_name", "relation_type.in_type_name", "relation_type.choice_type"],
          no_meta: true,
        });
        const seen = new Map<string, RelationTypeInfo>();
        for (const r of raw) {
          const rt = r.relation_type as Record<string, unknown> | undefined;
          if (rt?.id && !seen.has(rt.id as string)) {
            seen.set(rt.id as string, {
              id: rt.id as string,
              code: (rt.code as string) ?? null,
              outTypeName: (rt.out_type_name as string) ?? null,
              inTypeName: (rt.in_type_name as string) ?? null,
              choiceType: (rt.choice_type as string) ?? null,
            });
          }
        }
        return [...seen.values()];
      } catch {
        throw new Error("Не удалось получить список типов связей. Проверьте API EvaProject.");
      }
    }
  }

  /** Найти ID типа связи по названию или ID */
  async resolveRelationType(nameOrId: string): Promise<{ id: string; name: string }> {
    const types = await this.listRelationTypes();
    // Сначала точное совпадение по ID
    const byId = types.find((t) => t.id === nameOrId);
    if (byId) return { id: byId.id, name: byId.outTypeName ?? byId.id };

    // По коду
    const byCode = types.find((t) => t.code?.toUpperCase() === nameOrId.toUpperCase());
    if (byCode) return { id: byCode.id, name: byCode.outTypeName ?? byCode.code ?? byCode.id };

    // По названию (out_type_name — то, что видно в UI как «Относится к»)
    const byName = types.find(
      (t) =>
        t.outTypeName?.toLowerCase() === nameOrId.toLowerCase() ||
        t.inTypeName?.toLowerCase() === nameOrId.toLowerCase()
    );
    if (byName) return { id: byName.id, name: byName.outTypeName ?? nameOrId };

    // Частичное совпадение
    const partial = types.find(
      (t) =>
        t.outTypeName?.toLowerCase().includes(nameOrId.toLowerCase()) ||
        t.inTypeName?.toLowerCase().includes(nameOrId.toLowerCase())
    );
    if (partial) return { id: partial.id, name: partial.outTypeName ?? nameOrId };

    const available = types.map((t) => `\`${t.outTypeName ?? t.code ?? t.id}\``).join(", ");
    throw new Error(
      `Тип связи "${nameOrId}" не найден. Доступные типы: ${available}. ` +
      `Используйте list_relation_types для получения списка.`
    );
  }

  /** Создать произвольную связь между задачами */
  async createRelation(code: string, target: string, relationType: string): Promise<LinkedTasksInfo> {
    // Валидация самосвязи
    if (code.toUpperCase() === target.toUpperCase()) {
      throw new Error(`Нельзя связать задачу с самой собой (\`${code}\`).`);
    }

    // Резолвим тип связи
    const rt = await this.resolveRelationType(relationType);

    // Создаём связь: out_link = code (исходная), in_link = target (целевая)
    // EvaProject API принимает коды задач
    try {
      await this.call<string>("CmfRelationOption.create", {
        out_link: code,
        in_link: target,
        relation_type: rt.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Если связь уже существует — не ошибка
      if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("exist") || msg.includes("уже")) {
        // no-op, продолжаем
      } else {
        throw err;
      }
    }

    return this.getLinkedTasks(code);
  }

  /** Удалить произвольную связь */
  async deleteRelation(relationId: string): Promise<void> {
    await this.call<void>("CmfRelationOption.delete", {}, {
      args: [relationId],
    });
  }

  /** Удалить связь по паре задач и типу */
  async deleteRelationByPair(code: string, target: string, relationType?: string): Promise<LinkedTasksInfo> {
    const linked = await this.getLinkedTasks(code);

    // Ищем связь в precedesTasks (out_tasks: code → target) и followsTasks (in_tasks: target → code)
    const allRelations = [
      ...linked.precedesTasks.filter((r) => r.inTask.code.toUpperCase() === target.toUpperCase()),
      ...linked.followsTasks.filter((r) => r.outTask.code.toUpperCase() === target.toUpperCase()),
    ];

    let toDelete: RelationInfo[];
    if (relationType) {
      const rt = await this.resolveRelationType(relationType);
      toDelete = allRelations.filter((r) => r.relationTypeId === rt.id);
    } else {
      toDelete = allRelations;
    }

    if (toDelete.length === 0) {
      // Связь не найдена — идемпотентно, не ошибка
      return linked;
    }

    // Удаляем все найденные связи
    for (const rel of toDelete) {
      try {
        await this.deleteRelation(rel.relationId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[deleteRelationByPair] Ошибка удаления ${rel.relationId}: ${msg}`);
      }
    }

    return this.getLinkedTasks(code);
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

  /** Найти ID папки Epics в проекте */
  async findEpicsFolderId(projectId: string): Promise<string | null> {
    try {
      const folders = await this.call<Array<{ id: string }>>(
        "CmfFolder.list",
        {
          filter: [["parent_id", "==", projectId], ["code", "ILIKE", "%EPIC%"]],
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

  /** Получить связанные задачи (родительскую, дочерние, зависимые, affected, local_links, а также связи через CmfRelationOption) */
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
        "local_links.**",
        "local_links.lists.id",
        "local_links.lists.code",
        "local_links.lists.name",
        "in_tasks.**",
        "in_tasks.out_link.code",
        "in_tasks.out_link.name",
        "in_tasks.in_link.code",
        "in_tasks.in_link.name",
        "in_tasks.relation_type.out_type_name",
        "in_tasks.relation_type.in_type_name",
        "in_tasks.relation_type.choice_type",
        "in_tasks.relation_type.id",
        "in_tasks.relation_type.code",
        "out_tasks.**",
        "out_tasks.out_link.code",
        "out_tasks.out_link.name",
        "out_tasks.in_link.code",
        "out_tasks.in_link.name",
        "out_tasks.relation_type.out_type_name",
        "out_tasks.relation_type.in_type_name",
        "out_tasks.relation_type.choice_type",
        "out_tasks.relation_type.id",
        "out_tasks.relation_type.code",
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
        relationTypeId: rel.relation_type?.id ?? null,
        relationTypeCode: rel.relation_type?.code ?? null,
      }));
    };

    return {
      parentTask: mapOrNull((raw as Record<string, unknown>).parent_task),
      childTasks: mapArr((raw as Record<string, unknown>).child_tasks),
      dependedTasks: mapArr((raw as Record<string, unknown>).depended_tasks),
      affectedTasks: mapArr((raw as Record<string, unknown>).affected_tasks),
      localLinks: mapArr((raw as Record<string, unknown>).local_links),
      precedesTasks: mapRelations((raw as Record<string, unknown>).in_tasks),
      followsTasks: mapRelations((raw as Record<string, unknown>).out_tasks),
    };
  }

  /** Обратный поиск: найти задачи, которые ссылаются на указанную */
  async getReferencingTasks(code: string): Promise<ReferencingTasksInfo> {
    const fields = ["**"];

    // Параллельно ищем задачи по трём типам обратных связей
    // ВАЖНО: parent_task / depended_tasks / affected_tasks — ссылочные поля,
    // фильтровать нужно по вложенному .code, а не по самому объекту.
    const [asParent, asDepended, asAffected] = await Promise.all([
      this.call<EvaTaskRaw[]>("CmfTask.list", {
        fields,
        no_meta: true,
        filter: ["parent_task.code", "==", code],
      }).catch((err) => {
        console.error(`[getReferencingTasks] parent_task.code: ${err instanceof Error ? err.message : String(err)}`);
        return [] as EvaTaskRaw[];
      }),
      this.call<EvaTaskRaw[]>("CmfTask.list", {
        fields,
        no_meta: true,
        filter: ["depended_tasks.code", "IN", [code]],
      }).catch((err) => {
        console.error(`[getReferencingTasks] depended_tasks.code: ${err instanceof Error ? err.message : String(err)}`);
        return [] as EvaTaskRaw[];
      }),
      this.call<EvaTaskRaw[]>("CmfTask.list", {
        fields,
        no_meta: true,
        filter: ["affected_tasks.code", "IN", [code]],
      }).catch((err) => {
        console.error(`[getReferencingTasks] affected_tasks.code: ${err instanceof Error ? err.message : String(err)}`);
        return [] as EvaTaskRaw[];
      }),
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
        "local_links.**",
        "local_links.lists.id",
        "local_links.lists.code",
        "local_links.lists.name",
        "in_tasks.**",
        "in_tasks.out_link.code",
        "in_tasks.out_link.name",
        "in_tasks.in_link.code",
        "in_tasks.in_link.name",
        "in_tasks.relation_type.out_type_name",
        "in_tasks.relation_type.in_type_name",
        "in_tasks.relation_type.choice_type",
        "in_tasks.relation_type.id",
        "in_tasks.relation_type.code",
        "out_tasks.**",
        "out_tasks.out_link.code",
        "out_tasks.out_link.name",
        "out_tasks.in_link.code",
        "out_tasks.in_link.name",
        "out_tasks.relation_type.out_type_name",
        "out_tasks.relation_type.in_type_name",
        "out_tasks.relation_type.choice_type",
        "out_tasks.relation_type.id",
        "out_tasks.relation_type.code",
        "out_tasks.relation_type.id",
        "out_tasks.relation_type.code",
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
        relationTypeId: rel.relation_type?.id ?? null,
        relationTypeCode: rel.relation_type?.code ?? null,
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
          localLinks: mapArr((raw as Record<string, unknown>).local_links),
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
  async addComment(taskCode: string, text: string, parentCommentId?: string): Promise<CommentInfo> {
    const kwargs: Record<string, unknown> = {
      parent: taskCode,
      text: text,
    };
    if (parentCommentId) kwargs.tree_parent = parentCommentId;
    const id = await this.call<string>("CmfComment.create", kwargs);
    // CmfComment.create возвращает ID — полные данные будут при get_task
    return {
      id,
      author: null,
      authorName: null,
      text,
      createdAt: null,
      parentCode: parentCommentId ?? null,
    };
  }

  // ── Требования (CmfReq) ──────────────────────────────────

  /** Получить требование по коду (например, MSR-BR-0085) */
  async getRequirement(code: string): Promise<RequirementInfo> {
    const raw = await this.call<EvaReqRaw>("CmfReq.get", {
      filter: ["code", "==", code],
      fields: ["***", "priority_name"],
    });
    return mapRequirement(raw);
  }

  /** Получить список требований с фильтрацией */
  async listRequirements(params: RequirementListParams = {}): Promise<RequirementInfo[]> {
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
    const result = await this.call<EvaReqRaw[]>("CmfReq.list", kwargs);
    return result.map((raw) => mapRequirement(raw)).filter((r) => r.code);
  }

  /** Обновить поля требования (например, черновик text_draft) по коду */
  async updateRequirement(code: string, fields: RequirementUpdateFields): Promise<RequirementInfo> {
    // Сначала получаем ID требования по коду
    const resolved = await this.call<EvaReqRaw>("CmfReq.get", {
      filter: ["code", "==", code],
      fields: ["id"],
    });

    // ID — как args[0], поля обновления — в kwargs
    await this.call<unknown>("CmfReq.update", { ...fields }, { args: [resolved.id] });

    // После обновления получаем свежую версию требования
    return this.getRequirement(code);
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
