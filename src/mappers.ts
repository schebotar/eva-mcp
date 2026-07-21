import type {
  TaskInfo, CommentInfo, AttachmentInfo, WorklogEntry, StatusHistoryEntry,
  ProjectInfo, PersonInfo, StatusInfo, SprintInfo,
  EvaTaskRaw, EvaAttachmentRaw, EvaCommentRaw, WorklogEntryRaw, StatusHistoryEntryRaw,
  EvaProjectRaw, EvaPersonRaw, EvaStatusRaw, EvaSprintRaw,
} from "./types.js";
import { htmlToMd } from "./helpers/markdown.js";

/** Маппинг сырых данных вложения → AttachmentInfo */
export function mapAttachment(raw: EvaAttachmentRaw): AttachmentInfo {
  return {
    id: raw.id,
    name: raw.name ?? "",
    fileSize: raw.file_size ?? null,
    mimeType: raw.mime_type ?? null,
    createdAt: raw.cmf_created_at ?? null,
    author: raw.cmf_author?.login ?? null,
    authorName: raw.cmf_author?.name ?? null,
  };
}

/** Маппинг сырых данных задачи → TaskInfo */
export function mapTask(raw: EvaTaskRaw): TaskInfo {
  const statusObj =
    typeof raw.status === "object" && raw.status !== null ? raw.status : null;
  return {
    id: raw.id,
    code: raw.code,
    name: raw.name,
    text: htmlToMd(raw.text ?? ""),
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
    deadline: raw.deadline ?? null,
    resultText: raw.result_text ? htmlToMd(raw.result_text) : null,
    executors: (raw.executors ?? []).map((e: { login?: string; name?: string }) => e.login ?? "").filter(Boolean),
    executorNames: (raw.executors ?? []).map((e: { login?: string; name?: string }) => e.name ?? "").filter(Boolean),
    spectators: (raw.spectators ?? []).map((s: { login?: string; name?: string }) => s.login ?? "").filter(Boolean),
    spectatorNames: (raw.spectators ?? []).map((s: { login?: string; name?: string }) => s.name ?? "").filter(Boolean),
    tags: (raw.tags ?? []).map((t: { name?: string }) => t.name ?? "").filter(Boolean),
    lists: (raw.lists ?? []).map((l: { id?: string; code?: string; name?: string }) => ({ id: l.id ?? "", code: l.code ?? "", name: l.name ?? "" })),
    isMilestone: raw.is_milestone ?? false,
    estimateWork: raw.estimate_work ?? null,
    epicCode: raw.epic?.code ?? null,
    epicName: raw.epic?.name ?? null,
    mark: raw.mark ?? null,
    waitingFor: raw.waiting_for?.login ?? null,
    waitingForName: raw.waiting_for?.name ?? null,
    workflowCode: raw.workflow?.code ?? null,
    workflowName: raw.workflow?.name ?? null,
    components: (raw.components ?? []).map((c: { name?: string }) => c.name ?? "").filter(Boolean),
    subprojectCode: raw.subproject?.code ?? null,
    subprojectName: raw.subproject?.name ?? null,
    attachments: (raw.attachments ?? []).map((a: EvaAttachmentRaw) => mapAttachment(a)),
    statusModifiedAt: raw.status_modified_at ?? null,
    statusClosedAt: raw.status_closed_at ?? null,
  };
}

export function mapWorklog(raw: WorklogEntryRaw): WorklogEntry {
  return {
    id: raw.id,
    timeSpent: raw.time_spent ?? null,
    startDate: raw.start_date ?? null,
    text: htmlToMd(raw.text ?? ""),
    createdAt: raw.cmf_created_at ?? null,
    author: raw.cmf_owner?.login ?? null,
    authorName: raw.cmf_owner?.name ?? null,
  };
}

export function mapHistoryEntry(raw: StatusHistoryEntryRaw): StatusHistoryEntry {
  return {
    id: raw.id,
    createdAt: raw.cmf_created_at ?? null,
    fromStatus: raw.from_status_name ?? null,
    toStatus: raw.to_status_name ?? null,
    toStatusCode: raw.to_status_code ?? null,
    author: raw.cmf_author?.login ?? null,
    authorName: raw.cmf_author?.name ?? null,
  };
}

export function mapComment(raw: EvaCommentRaw): CommentInfo {
  return {
    id: raw.id ?? null,
    author: raw.cmf_author?.login ?? null,
    authorName: raw.cmf_author?.name ?? null,
    text: htmlToMd(raw.text ?? ""),
    createdAt: raw.cmf_created_at ?? null,
    parentCode: raw.tree_parent?.id ?? null,
  };
}

export function mapProject(raw: EvaProjectRaw): ProjectInfo {
  const statusObj =
    typeof raw.status === "object" && raw.status !== null ? raw.status : null;
  return {
    id: raw.id,
    code: raw.code,
    name: raw.name,
    description: htmlToMd(raw.description ?? ""),
    status: statusObj?.id ?? (typeof raw.status === "string" ? raw.status : null),
    statusName: raw.status_name ?? statusObj?.name ?? null,
    createdAt: raw.cmf_created_at ?? null,
    updatedAt: raw.cmf_modified_at ?? null,
  };
}

export function mapPerson(raw: EvaPersonRaw): PersonInfo {
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

export function mapStatus(raw: EvaStatusRaw): StatusInfo {
  return {
    id: raw.id,
    name: raw.name ?? "",
    code: raw.code ?? null,
    type: raw.status_type ?? null,
  };
}

export function mapSprint(raw: EvaSprintRaw): SprintInfo {
  const statusObj =
    typeof raw.status === "object" && raw.status !== null ? raw.status : null;
  return {
    id: raw.id,
    code: raw.code ?? "",
    name: raw.name ?? "",
    projectCode: raw.parent?.code ?? null,
    projectName: raw.parent?.name ?? null,
    status: statusObj?.id ?? (typeof raw.status === "string" ? raw.status : null),
    statusName: raw.status_name ?? statusObj?.name ?? null,
    startDate: raw.plan_start_date ?? null,
    endDate: raw.plan_end_date ?? null,
    isDefault: raw.is_default ?? false,
    createdAt: raw.cmf_created_at ?? null,
    updatedAt: raw.cmf_modified_at ?? null,
    ownerLogin: raw.cmf_owner?.login ?? null,
    ownerName: raw.cmf_owner?.name ?? null,
    sysType: raw.sys_type ?? null,
    logicType: typeof raw.logic_type === "object" && raw.logic_type ? raw.logic_type.code ?? null : (typeof raw.logic_type === "string" ? raw.logic_type : null),
    workflowCode: raw.workflow?.code ?? null,
    workflowName: raw.workflow?.name ?? null,
    schemeWfCode: raw.scheme_wf?.code ?? null,
    schemeWfName: raw.scheme_wf?.name ?? null,
    treeParentCode: raw.tree_parent?.code ?? null,
    treeParentName: raw.tree_parent?.name ?? null,
  };
}
