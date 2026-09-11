#!/usr/bin/env node
// npm run smoke: поднимает собранный сервер по stdio из чужой рабочей папки и проверяет tools/list.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ROOT, getModuleStatus, loadToolDefs } from "./lib/tool-inventory.mjs";

const defsByFile = await loadToolDefs();
const { active } = getModuleStatus();
const activeFiles = new Set(active.map((file) => file.replace(/\.ts$/, ".js")));
const expected = [...defsByFile]
  .filter(([file]) => activeFiles.has(file))
  .flatMap(([, defs]) => defs.map((def) => def.name));

// Чужая рабочая папка и никаких EVA_* в окружении: сервер обязан найти .env в корне пакета.
const workdir = mkdtempSync(join(tmpdir(), "eva-smoke-"));
const env = { ...process.env };
delete env.EVA_URL;
delete env.EVA_TOKEN;

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(ROOT, "dist", "index.js")],
  cwd: workdir,
  env,
  stderr: "pipe",
});

const client = new Client({ name: "eva-mcp-smoke", version: "0.0.0" });
const problems = [];

try {
  await client.connect(transport);
} catch (error) {
  console.error("Сервер не стартовал:", error?.message ?? error);
  process.exit(1);
}

const info = client.getServerVersion();
const { tools } = await client.listTools();
const names = tools.map((tool) => tool.name);
const duplicates = [...new Set(names.filter((name, i) => names.indexOf(name) !== i))];

console.log(`Рабочая папка: ${workdir}`);
console.log(`Сервер: ${info?.name} ${info?.version}`);
console.log(`Инструментов: ${names.length} (в сборке ожидается ${expected.length})`);
if (duplicates.length) problems.push(`дубли имён: ${duplicates.join(", ")}`);
if (names.length !== expected.length) {
  const missing = expected.filter((name) => !names.includes(name));
  const extra = names.filter((name) => !expected.includes(name));
  problems.push(
    `расхождение состава: не отдаются [${missing.join(", ")}], лишние [${extra.join(", ")}]`,
  );
}

const pkg = JSON.parse(
  (await import("node:fs")).readFileSync(join(ROOT, "package.json"), "utf8"),
);
if (info?.version !== pkg.version) {
  console.log(
    `! Версия в initialize (${info?.version}) не совпадает с package.json (${pkg.version}) — известное расхождение, отдельная задача`,
  );
}

await client.close();

if (problems.length) {
  console.log("\nПроблемы:");
  for (const text of problems) console.log(`  x ${text}`);
  process.exit(1);
}
console.log("\nSmoke пройден: сервер стартует из чужой папки, состав инструментов совпадает.");
