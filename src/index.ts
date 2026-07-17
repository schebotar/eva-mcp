import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { EvaClient } from "./eva-client.js";

// ── Tools modules ──────────────────────────────────────────────
import { taskToolDefs, handleTaskToolCall } from "./tools/task.tools.js";
import { projectToolDefs, handleProjectToolCall } from "./tools/project.tools.js";
import { userToolDefs, handleUserToolCall } from "./tools/user.tools.js";
import { linkedToolDefs, handleLinkedToolCall } from "./tools/linked.tools.js";
import { attachmentToolDefs, handleAttachmentToolCall } from "./tools/attachment.tools.js";
import { worklogToolDefs, handleWorklogToolCall } from "./tools/worklog.tools.js";
import { followerToolDefs, handleFollowerToolCall } from "./tools/follower.tools.js";
import { historyToolDefs, handleHistoryToolCall } from "./tools/history.tools.js";
import { sprintToolDefs, handleSprintToolCall } from "./tools/sprint.tools.js";
import { backlogToolDefs, handleBacklogToolCall } from "./tools/backlog.tools.js";
import { boardToolDefs, handleBoardToolCall } from "./tools/board.tools.js";
import { commentToolDefs, handleCommentToolCall } from "./tools/comment.tools.js";
import { metricsToolDefs, handleMetricsToolCall } from "./tools/metrics.tools.js";

// ── Конфигурация ───────────────────────────────────────────────

const EVA_URL = process.env.EVA_URL;
const EVA_TOKEN = process.env.EVA_TOKEN;

if (!EVA_URL || !EVA_TOKEN) {
  console.error("Ошибка: EVA_URL и EVA_TOKEN должны быть заданы в .env файле или переменных окружения.");
  process.exit(1);
}

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
  ...backlogToolDefs,
  ...boardToolDefs,
  ...commentToolDefs,
  ...metricsToolDefs,
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
  handleBacklogToolCall,
  handleBoardToolCall,
  handleCommentToolCall,
  handleMetricsToolCall,
];

// ── MCP Server ─────────────────────────────────────────────────

const server = new Server(
  {
    name: "eva-mcp",
    version: "0.5.0",
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
  console.error(`eva-mcp запущен. EvaProject URL: ${EVA_URL}`);
}

main().catch((err) => {
  console.error("Критическая ошибка при запуске:", err);
  process.exit(1);
});