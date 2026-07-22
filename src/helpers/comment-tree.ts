import type { CommentInfo, CommentNode } from "../types.js";

/**
 * Строит дерево комментариев из плоского списка.
 */
export function buildCommentTree(comments: CommentInfo[], maxDepth = 10): CommentNode[] {
  const byId = new Map<string, CommentNode>();
  const roots: CommentNode[] = [];

  for (const c of comments) {
    byId.set(c.id ?? "", { comment: c, replies: [] });
  }

  for (const c of comments) {
    const node = byId.get(c.id ?? "")!;
    if (c.parentCode && byId.has(c.parentCode)) {
      byId.get(c.parentCode)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Форматирует дерево комментариев в Markdown с отступами.
 */
export function formatCommentTree(
  nodes: CommentNode[],
  depth = 0,
  counter: { value: number } = { value: 0 },
  maxDepth = 10
): string {
  if (nodes.length === 0) return "";

  const lines: string[] = [];
  const indent = "  ".repeat(depth);
  const prefix = depth > 0 ? "↳ " : "";

  for (const node of nodes) {
    if (depth > maxDepth) break;
    counter.value++;
    const c = node.comment;
    const author = c.authorName ?? c.author ?? "Неизвестный";
    const date = c.createdAt ?? "—";

    if (depth === 0) {
      lines.push(`### ${counter.value}. ${author} — ${date}`, "", `\`${c.id ?? "—"}\``, "", c.text, "");
    } else {
      lines.push(`${indent}${prefix}**${counter.value}. ${author} — ${date}**`, "");
      lines.push(`${indent}   \`${c.id ?? "—"}\``, "");
      lines.push(`${indent}   ${c.text}`, "");
    }

    if (node.replies.length > 0) {
      lines.push(formatCommentTree(node.replies, depth + 1, counter, maxDepth));
    }
  }

  return lines.join("\n");
}

/**
 * Форматирует плоский список комментариев в Markdown-дерево.
 */
export function formatComments(comments: CommentInfo[]): string {
  if (comments.length === 0) {
    return "Комментариев нет.";
  }

  const tree = buildCommentTree(comments);
  const body = formatCommentTree(tree);
  return "# Комментарии\n\n" + body;
}
