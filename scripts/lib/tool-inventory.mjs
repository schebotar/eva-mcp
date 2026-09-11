// Общий инвентарь инструментов: используется check-tools.mjs и smoke-mcp.mjs.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Активные и выключенные модули инструментов — по импортам в src/index.ts. */
export function getModuleStatus(root = ROOT) {
  const src = readFileSync(join(root, "src", "index.ts"), "utf8");
  const active = [];
  const disabled = [];
  for (const line of src.split("\n")) {
    const match = line.match(/import \{[^}]*ToolDefs[^}]*\} from "\.\/tools\/([\w.-]+)\.js";/);
    if (!match) continue;
    const file = `${match[1]}.ts`;
    if (line.trim().startsWith("//")) disabled.push(file);
    else active.push(file);
  }
  return { active, disabled };
}

/** Определения инструментов из собранных модулей dist/tools/*.tools.js. */
export async function loadToolDefs(root = ROOT) {
  const dir = join(root, "dist", "tools");
  if (!existsSync(dir)) {
    throw new Error("нет dist/tools — сначала выполни npm run build (или npm run check)");
  }
  const byFile = new Map();
  const files = readdirSync(dir).filter((f) => f.endsWith(".tools.js")).sort();
  for (const file of files) {
    const module = await import(pathToFileURL(join(dir, file)).href);
    const defs = [];
    for (const [name, value] of Object.entries(module)) {
      if (Array.isArray(value) && name.endsWith("ToolDefs")) defs.push(...value);
    }
    byFile.set(file, defs);
  }
  return byFile;
}

/** Имена инструментов из таблицы «Возможности» в README. */
export function readmeToolNames(root = ROOT) {
  const text = readFileSync(join(root, "README.md"), "utf8");
  const section = text.split(/^## /m).find((part) => part.startsWith("Возможности"));
  if (!section) return null;
  const names = new Set();
  for (const line of section.split("\n")) {
    const match = line.match(/^\|\s*`([a-z_][a-z0-9_]*)`\s*\|/);
    if (match) names.add(match[1]);
  }
  return names;
}

/** Числа инструментов, заявленные в документации. */
export function documentedCounts(root = ROOT) {
  const agentsMd = readFileSync(join(root, "AGENTS.md"), "utf8");
  const toolsAgentsMd = readFileSync(join(root, "src", "tools", "AGENTS.md"), "utf8");
  const pick = (text, re) => {
    const match = text.match(re);
    return match ? Number(match[1]) : null;
  };
  return {
    agentsMd: pick(agentsMd, /Инструментов сервер отдаёт \*\*(\d+)\*\*/),
    toolsAgentsMd: pick(toolsAgentsMd, /## Полный список инструментов \((\d+)\)/),
  };
}

export function fileLines(root, relative) {
  const path = join(root, relative);
  return existsSync(path) ? readFileSync(path, "utf8").trimEnd().split("\n").length : null;
}
