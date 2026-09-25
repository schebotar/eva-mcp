#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { EvaClient } from "./eva-client.js";
import {
  resolveCredentials,
  ensureUserConfigTemplate,
  describeMissing,
  userConfigPath,
  describeLoosePermissions,
} from "./helpers/credentials.js";

// ── Tools modules ──────────────────────────────────────────────
import { taskToolDefs, handleTaskToolCall } from "./tools/task.tools.js";
import { sprintToolDefs, handleSprintToolCall } from "./tools/sprint.tools.js";
import { userToolDefs, handleUserToolCall } from "./tools/user.tools.js";
import { projectToolDefs, handleProjectToolCall } from "./tools/project.tools.js";
import { linkedToolDefs, handleLinkedToolCall } from "./tools/linked.tools.js";
import { attachmentToolDefs, handleAttachmentToolCall } from "./tools/attachment.tools.js";
import { worklogToolDefs, handleWorklogToolCall } from "./tools/worklog.tools.js";
import { followerToolDefs, handleFollowerToolCall } from "./tools/follower.tools.js";
import { historyToolDefs, handleHistoryToolCall } from "./tools/history.tools.js";
import { commentToolDefs, handleCommentToolCall } from "./tools/comment.tools.js";
import { requirementToolDefs, handleRequirementToolCall } from "./tools/requirement.tools.js";
import { metricsToolDefs, handleMetricsToolCall } from "./tools/metrics.tools.js";
import { wikiToolDefs, handleWikiToolCall } from "./tools/wiki.tools.js";
// import { epicToolDefs, handleEpicToolCall } from "./tools/epic.tools.js";
import { reportsToolDefs, handleReportsToolCall } from "./tools/reports.tools.js";

// ── Пакет и переменные окружения ───────────────────────────────

/** Корень пакета: на уровень выше собранного dist/ (или src/ при запуске через tsx) */
const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Версия — из package.json, чтобы не разъезжаться с ним */
const { version: VERSION } = JSON.parse(
  readFileSync(join(PKG_ROOT, "package.json"), "utf8")
) as { version: string };

// ── Учётные данные ─────────────────────────────────────────────

// Цепочка источников — в src/helpers/credentials.ts: переменные окружения →
// ./.env → конфиг пользователя → .env пакета. Всё в stderr: stdout занят протоколом MCP.
const USER_CONFIG_PATH = userConfigPath();
const resolved = resolveCredentials({ cwd: process.cwd(), pkgRoot: PKG_ROOT, userConfigPath: USER_CONFIG_PATH });

// Файл с токеном, открытый шире 0600, — только предупреждение: права не меняем
const looseWarning = describeLoosePermissions(USER_CONFIG_PATH);
if (looseWarning) console.error(looseWarning);

if (!resolved.ok) {
  // Первый запуск без учётных данных: создаём шаблон, чтобы пользователю было
  // что заполнить, и выходим — второй запуск с заполненным файлом уже сработает
  const created = ensureUserConfigTemplate(USER_CONFIG_PATH);
  console.error(describeMissing(resolved, created, USER_CONFIG_PATH));
  process.exit(1);
}

const { url: EVA_URL, token: EVA_TOKEN, sources } = resolved.credentials;
const evaClient = new EvaClient(EVA_URL, EVA_TOKEN);

// ── Агрегируем все определения инструментов ────────────────────

const ALL_TOOL_DEFS = [
  ...taskToolDefs,
  ...projectToolDefs,
  ...userToolDefs,
  ...linkedToolDefs,
  ...attachmentToolDefs,
  ...worklogToolDefs,
  ...followerToolDefs,
  ...historyToolDefs,
  ...sprintToolDefs,
  ...commentToolDefs,
  ...requirementToolDefs,
  ...metricsToolDefs,
  ...wikiToolDefs,
  // ...epicToolDefs,
  ...reportsToolDefs,
];

// Все обработчики в порядке приоритета
type ToolHandler = (
  name: string,
  args: unknown,
  client: EvaClient
) => Promise<{ content: { type: "text"; text: string }[]; isError?: boolean } | null>;

const ALL_HANDLERS: ToolHandler[] = [
  handleTaskToolCall,
  handleProjectToolCall,
  handleUserToolCall,
  handleLinkedToolCall,
  handleAttachmentToolCall,
  handleWorklogToolCall,
  handleFollowerToolCall,
  handleHistoryToolCall,
  handleSprintToolCall,
  handleCommentToolCall,
  handleRequirementToolCall,
  handleMetricsToolCall,
  handleWikiToolCall,
  // handleEpicToolCall,
  handleReportsToolCall,
];

// ── MCP Server ─────────────────────────────────────────────────

const server = new Server(
  {
    name: "eva-mcp",
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Регистрируем список инструментов
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: ALL_TOOL_DEFS,
}));

// Обработчик вызовов: делегирует каждому модулю по очереди
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    for (const handler of ALL_HANDLERS) {
      const result = await handler(name, args, evaClient);
      if (result !== null) return result;
    }

    throw new Error(`Неизвестный инструмент: ${name}`);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((i) => `• ${i.path.join(".")}: ${i.message}`);
      return {
        content: [{ type: "text", text: `❌ Ошибка валидации:\n${issues.join("\n")}` }],
        isError: true,
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `❌ Ошибка: ${message}` }],
      isError: true,
    };
  }
});

// ── Запуск ─────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `eva-mcp запущен. EvaProject URL: ${EVA_URL} ` +
      `(EVA_URL: ${sources.EVA_URL}, EVA_TOKEN: ${sources.EVA_TOKEN})`
  );
}

main().catch((err) => {
  console.error("Критическая ошибка при запуске:", err);
  process.exit(1);
});
