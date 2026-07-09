import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { EvaClient } from "./eva-client.js";
import type { TaskInfo, CommentInfo } from "./types.js";

// --- Конфигурация из переменных окружения ---
const EVA_URL = process.env.EVA_URL;
const EVA_TOKEN = process.env.EVA_TOKEN;

if (!EVA_URL || !EVA_TOKEN) {
  console.error("Ошибка: EVA_URL и EVA_TOKEN должны быть заданы в .env файле или переменных окружения.");
  process.exit(1);
}

const evaClient = new EvaClient(EVA_URL, EVA_TOKEN);

// --- Форматирование ---

function formatTask(task: TaskInfo): string {
  const lines: string[] = [
    `# ${task.code}: ${task.name}`,
    "",
    `| Поле | Значение |`,
    `|------|----------|`,
    `| **Код** | ${task.code} |`,
    `| **Название** | ${task.name} |`,
    `| **Статус** | ${task.statusName ?? "—"} (\`${task.status ?? "—"}\`) |`,
    `| **Приоритет** | ${task.priorityName ?? "—"} |`,
    `| **Тип** | ${task.typeName ?? "—"} |`,
    `| **Проект** | ${task.projectName ?? "—"} (\`${task.projectCode ?? "—"}\`) |`,
    `| **Автор** | ${task.authorName ?? task.author ?? "—"} |`,
    `| **Исполнитель** | ${task.responsibleName ?? task.responsible ?? "—"} |`,
    `| **Создана** | ${task.createdAt ?? "—"} |`,
    `| **Обновлена** | ${task.updatedAt ?? "—"} |`,
    "",
  ];

  if (task.text) {
    lines.push("## Описание", "", task.text, "");
  }

  return lines.join("\n");
}

function formatComments(comments: CommentInfo[]): string {
  if (comments.length === 0) {
    return "Комментариев нет.";
  }

  const lines: string[] = ["# Комментарии", ""];

  for (let i = 0; i < comments.length; i++) {
    const c = comments[i];
    const author = c.authorName ?? c.author ?? "Неизвестный";
    const date = c.createdAt ?? "—";
    lines.push(`### ${i + 1}. ${author} — ${date}`, "", c.text, "");
  }

  return lines.join("\n");
}

// --- MCP Server ---

const server = new Server(
  {
    name: "eva-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Регистрируем список инструментов
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_task",
      description:
        "Получить описание задачи из EvaProject по её коду (например, DEV-000003). " +
        "Возвращает название, описание, статус, автора, исполнителя, проект и другие поля.",
      inputSchema: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "Код задачи в EvaProject, например DEV-000003",
          },
        },
        required: ["code"],
      },
    },
    {
      name: "get_task_comments",
      description:
        "Получить комментарии к задаче из EvaProject по её коду.",
      inputSchema: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "Код задачи в EvaProject, например DEV-000003",
          },
        },
        required: ["code"],
      },
    },
    {
      name: "get_task_full",
      description:
        "Получить полную информацию о задаче: описание + комментарии одним запросом.",
      inputSchema: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "Код задачи в EvaProject, например DEV-000003",
          },
        },
        required: ["code"],
      },
    },
  ],
}));

// Обработчик вызовов инструментов
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "get_task": {
        const code = String(args?.code ?? "");
        if (!code) {
          throw new Error("Не указан код задачи (параметр 'code')");
        }
        const task = await evaClient.getTask(code);
        return {
          content: [{ type: "text", text: formatTask(task) }],
        };
      }

      case "get_task_comments": {
        const code = String(args?.code ?? "");
        if (!code) {
          throw new Error("Не указан код задачи (параметр 'code')");
        }
        const comments = await evaClient.getTaskComments(code);
        return {
          content: [{ type: "text", text: formatComments(comments) }],
        };
      }

      case "get_task_full": {
        const code = String(args?.code ?? "");
        if (!code) {
          throw new Error("Не указан код задачи (параметр 'code')");
        }
        const { task, comments } = await evaClient.getTaskWithComments(code);
        const text = formatTask(task) + "\n---\n\n" + formatComments(comments);
        return {
          content: [{ type: "text", text }],
        };
      }

      default:
        throw new Error(`Неизвестный инструмент: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `❌ Ошибка: ${message}` }],
      isError: true,
    };
  }
});

// Запуск
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Логгируем в stderr, чтобы не мешать stdio-протоколу
  console.error(`eva-mcp запущен. EvaProject URL: ${EVA_URL}`);
}

main().catch((err) => {
  console.error("Критическая ошибка при запуске:", err);
  process.exit(1);
});
