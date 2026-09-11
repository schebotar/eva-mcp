#!/usr/bin/env node
// npm run check: типы проверяет tsc, здесь — состав инструментов и его синхронность с документацией.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ROOT,
  documentedCounts,
  fileLines,
  getModuleStatus,
  loadToolDefs,
  readmeToolNames,
} from "./lib/tool-inventory.mjs";

const problems = [];
const warnings = [];

const { active, disabled } = getModuleStatus();
const defsByFile = await loadToolDefs();

const asCompiled = (moduleFile) => moduleFile.replace(/\.ts$/, ".js");
const activeFiles = new Set(active.map(asCompiled));

const activeNames = [];
const disabledNames = [];

for (const [file, defs] of defsByFile) {
  const names = defs.map((def) => def?.name).filter(Boolean);
  if (activeFiles.has(file)) activeNames.push(...names);
  else disabledNames.push(...names);

  for (const def of defs) {
    if (!def?.name) {
      problems.push(`${file}: определение без name`);
      continue;
    }
    if (!def.description?.trim()) problems.push(`${def.name}: пустое description`);

    const properties = def.inputSchema?.properties ?? {};
    const required = def.inputSchema?.required ?? [];
    for (const key of required) {
      if (!(key in properties)) {
        problems.push(`${def.name}: required "${key}" отсутствует в inputSchema.properties`);
      }
    }
    for (const [key, value] of Object.entries(properties)) {
      if (!value?.description?.trim()) problems.push(`${def.name}: у параметра "${key}" нет description`);
    }
  }
}

for (const moduleFile of active) {
  const compiled = asCompiled(moduleFile);
  if (!defsByFile.has(compiled)) problems.push(`активный модуль не собран: dist/tools/${compiled}`);
}

const duplicates = [...new Set(activeNames.filter((name, i) => activeNames.indexOf(name) !== i))];
if (duplicates.length) problems.push(`дубли имён среди активных инструментов: ${duplicates.join(", ")}`);

const counts = documentedCounts();
if (counts.agentsMd === null) {
  problems.push("AGENTS.md: не найдено число инструментов в разделе «Состояние сборки»");
} else if (counts.agentsMd !== activeNames.length) {
  problems.push(`AGENTS.md: заявлено ${counts.agentsMd} инструментов, в сборке ${activeNames.length}`);
}
if (counts.toolsAgentsMd === null) {
  problems.push("src/tools/AGENTS.md: не найден заголовок «Полный список инструментов (N)»");
} else if (counts.toolsAgentsMd !== activeNames.length) {
  problems.push(`src/tools/AGENTS.md: заявлено ${counts.toolsAgentsMd}, в сборке ${activeNames.length}`);
}

const readme = readmeToolNames();
if (!readme) {
  warnings.push("README: не найден раздел «Возможности» — сверка списка пропущена");
} else {
  const missing = activeNames.filter((name) => !readme.has(name));
  const extra = [...readme].filter((name) => !activeNames.includes(name));
  if (missing.length) problems.push(`README: не описаны активные инструменты — ${missing.join(", ")}`);
  if (extra.length) problems.push(`README: описаны несуществующие инструменты — ${extra.join(", ")}`);
}

// Файлы правил: источник один — AGENTS.md; вендорные допустимы только как загрузчики ≤5 строк.
for (const loader of ["CLAUDE.md", "GEMINI.md", ".github/copilot-instructions.md"]) {
  const lines = fileLines(ROOT, loader);
  if (lines === null) continue;
  if (lines > 5) problems.push(`${loader}: загрузчик на ${lines} строк — допустимо не больше 5`);
  if (!readFileSync(join(ROOT, loader), "utf8").includes("AGENTS.md")) {
    problems.push(`${loader}: загрузчик не ссылается на AGENTS.md`);
  }
}
for (const path of [".github/instructions", ".cursor/rules"]) {
  if (existsSync(join(ROOT, path))) {
    problems.push(`${path}: правила живут только в AGENTS.md (+ загрузчики)`);
  }
}

console.log(`Активных модулей: ${active.length}, инструментов: ${activeNames.length}`);
console.log(`Выключенных модулей: ${disabled.length}, их инструментов: ${disabledNames.length}`);
for (const file of disabled) console.log(`  выключен: ${file}`);
if (warnings.length) {
  console.log("\nПредупреждения:");
  for (const text of warnings) console.log(`  ! ${text}`);
}
if (problems.length) {
  console.log("\nПроблемы:");
  for (const text of problems) console.log(`  x ${text}`);
  process.exit(1);
}
console.log("\nСостав инструментов и документация согласованы.");
