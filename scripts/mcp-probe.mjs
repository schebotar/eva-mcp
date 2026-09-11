#!/usr/bin/env node
// npm run probe -- --list
// npm run probe -- --tool get_task --args '{"code":"DEV-000003"}'
// Живая проба: свежий спавн собранного сервера с реальным .env из корня пакета.
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ROOT } from "./lib/tool-inventory.mjs";

function parseArgs(argv) {
  const result = { list: false, tool: null, args: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--list") result.list = true;
    else if (arg === "--tool") result.tool = argv[++i] ?? null;
    else if (arg === "--args") {
      const raw = argv[++i] ?? "{}";
      try {
        result.args = JSON.parse(raw);
      } catch {
        console.error(`--args: не разобрать JSON: ${raw}`);
        process.exit(2);
      }
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Использование:",
          "  npm run probe -- --list",
          "  npm run probe -- --tool <имя> [--args '<json>']",
        ].join("\n"),
      );
      process.exit(0);
    }
  }
  return result;
}

const options = parseArgs(process.argv.slice(2));
if (!options.list && !options.tool) {
  console.error("Укажи --list или --tool <имя>. Пример: npm run probe -- --list");
  process.exit(2);
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(ROOT, "dist", "index.js")],
  cwd: ROOT,
  env: { ...process.env },
  stderr: "pipe",
});

const client = new Client({ name: "eva-mcp-probe", version: "0.0.0" });
await client.connect(transport);

try {
  if (options.list) {
    const { tools } = await client.listTools();
    console.log(`Инструментов: ${tools.length}`);
    for (const tool of tools) console.log(`  ${tool.name} — ${tool.description?.split("\n")[0] ?? ""}`);
  } else {
    const result = await client.callTool({ name: options.tool, arguments: options.args });
    for (const item of result.content ?? []) {
      if (item.type === "text") console.log(item.text);
    }
    if (result.isError) {
      console.error("\nИнструмент вернул ошибку.");
      process.exitCode = 1;
    }
  }
} finally {
  await client.close();
}
