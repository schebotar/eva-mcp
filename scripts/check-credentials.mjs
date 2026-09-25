#!/usr/bin/env node
// npm run check: цепочка источников EVA_URL/EVA_TOKEN и шаблон конфига пользователя.
// Работает на собранном dist и во временных папках: настоящие HOME, .env и конфиг не трогает.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  USER_CONFIG_TEMPLATE,
  describeLoosePermissions,
  describeMissing,
  ensureUserConfigTemplate,
  resolveCredentials,
  userConfigPath,
} from "../dist/helpers/credentials.js";

const problems = [];
let passed = 0;

function expect(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else problems.push(`${name}: ожидалось ${JSON.stringify(expected)}, получено ${JSON.stringify(actual)}`);
}

const root = mkdtempSync(join(tmpdir(), "eva-mcp-check-"));
const home = join(root, "home");
const cwd = join(root, "project");
const pkgRoot = join(root, "package");
const configPath = join(home, ".config", "eva-mcp", "credentials");
for (const dir of [home, cwd, pkgRoot]) mkdirSync(dir, { recursive: true });

const dotenv = (url, token) => `EVA_URL=${url}\nEVA_TOKEN=${token}\n`;

/** Разложить источники по временным папкам и собрать цепочку */
function resolveWith({ env = {}, cwdEnv, userConfig, pkgEnv }) {
  rmSync(join(cwd, ".env"), { force: true });
  rmSync(configPath, { force: true });
  rmSync(join(pkgRoot, ".env"), { force: true });
  mkdirSync(join(home, ".config", "eva-mcp"), { recursive: true });
  if (cwdEnv !== undefined) writeFileSync(join(cwd, ".env"), cwdEnv);
  if (userConfig !== undefined) writeFileSync(configPath, userConfig);
  if (pkgEnv !== undefined) writeFileSync(join(pkgRoot, ".env"), pkgEnv);
  return resolveCredentials({ cwd, pkgRoot, env, userConfigPath: configPath });
}

const sourcesOf = (result) => (result.ok ? result.credentials.sources : { missing: result.missing });

try {
  // ── Путь к конфигу пользователя ──────────────────────────────
  expect("XDG_CONFIG_HOME абсолютный",
    userConfigPath({ platform: "linux", env: { XDG_CONFIG_HOME: "/xdg" }, home: "/home/u" }),
    "/xdg/eva-mcp/credentials");
  expect("XDG_CONFIG_HOME относительный → ~/.config",
    userConfigPath({ platform: "linux", env: { XDG_CONFIG_HOME: "xdg" }, home: "/home/u" }),
    "/home/u/.config/eva-mcp/credentials");
  expect("XDG_CONFIG_HOME пустой → ~/.config",
    userConfigPath({ platform: "linux", env: { XDG_CONFIG_HOME: " " }, home: "/home/u" }),
    "/home/u/.config/eva-mcp/credentials");
  expect("macOS без XDG → ~/.config",
    userConfigPath({ platform: "darwin", env: {}, home: "/Users/u" }),
    "/Users/u/.config/eva-mcp/credentials");
  expect("Windows: %LOCALAPPDATA%",
    userConfigPath({ platform: "win32", env: { LOCALAPPDATA: "D:\\Profile\\Local" }, home: "C:\\Users\\u" }),
    "D:\\Profile\\Local\\eva-mcp\\credentials");
  expect("Windows без LOCALAPPDATA → AppData\\Local",
    userConfigPath({ platform: "win32", env: {}, home: "C:\\Users\\u" }),
    "C:\\Users\\u\\AppData\\Local\\eva-mcp\\credentials");
  expect("Windows: APPDATA (Roaming) не влияет",
    userConfigPath({ platform: "win32", env: { APPDATA: "D:\\Roaming" }, home: "C:\\Users\\u" }),
    "C:\\Users\\u\\AppData\\Local\\eva-mcp\\credentials");
  expect("Windows: XDG_CONFIG_HOME не влияет",
    userConfigPath({ platform: "win32", env: { LOCALAPPDATA: "D:\\L", XDG_CONFIG_HOME: "/xdg" }, home: "C:\\Users\\u" }),
    "D:\\L\\eva-mcp\\credentials");
  expect("resolveCredentials берёт путь из того же env",
    resolveCredentials({ cwd, pkgRoot, env: { XDG_CONFIG_HOME: join(root, "xdg"), LOCALAPPDATA: join(root, "xdg") } })
      .checked.find((s) => s.name === "конфиг пользователя")?.path,
    join(root, "xdg", "eva-mcp", "credentials"));

  // ── Приоритет попарно ────────────────────────────────────────
  const env = { EVA_URL: "https://env.example", EVA_TOKEN: "env-token" };
  const both = (name) => ({ EVA_URL: name, EVA_TOKEN: name });
  expect("env сильнее ./.env",
    sourcesOf(resolveWith({ env, cwdEnv: dotenv("https://cwd.example", "cwd") })),
    both("переменные окружения"));
  expect("./.env сильнее конфига пользователя",
    sourcesOf(resolveWith({ cwdEnv: dotenv("https://cwd.example", "cwd"), userConfig: dotenv("https://user.example", "user") })),
    both("./.env"));
  expect("конфиг пользователя сильнее .env пакета",
    sourcesOf(resolveWith({ userConfig: dotenv("https://user.example", "user"), pkgEnv: dotenv("https://pkg.example", "pkg") })),
    both("конфиг пользователя"));
  expect(".env пакета — последний источник",
    sourcesOf(resolveWith({ pkgEnv: dotenv("https://pkg.example", "pkg") })),
    both(".env пакета"));

  // ── Приоритет по каждой переменной, а не по источнику ────────
  const mixed = resolveWith({ env: { EVA_URL: "https://env.example" }, userConfig: dotenv("https://user.example", "user-token") });
  expect("переменные из разных источников: источники", sourcesOf(mixed),
    { EVA_URL: "переменные окружения", EVA_TOKEN: "конфиг пользователя" });
  expect("переменные из разных источников: значения",
    mixed.ok && [mixed.credentials.url, mixed.credentials.token],
    ["https://env.example", "user-token"]);

  // ── Пустое значение = отсутствует ────────────────────────────
  expect("пустая переменная окружения пропускается",
    sourcesOf(resolveWith({ env: { EVA_URL: " ", EVA_TOKEN: "" }, userConfig: dotenv("https://user.example", "user") })),
    both("конфиг пользователя"));
  expect("пустое значение в файле пропускается",
    sourcesOf(resolveWith({ cwdEnv: "EVA_URL=\nEVA_TOKEN=  \n", pkgEnv: dotenv("https://pkg.example", "pkg") })),
    both(".env пакета"));
  expect("незаполненный шаблон = учётных данных нет",
    sourcesOf(resolveWith({ userConfig: USER_CONFIG_TEMPLATE })),
    { missing: ["EVA_URL", "EVA_TOKEN"] });
  expect("не хватает одной переменной",
    sourcesOf(resolveWith({ env: { EVA_URL: "https://env.example" } })),
    { missing: ["EVA_TOKEN"] });

  // ── process.env не мутируется ────────────────────────────────
  const before = { url: process.env.EVA_URL, token: process.env.EVA_TOKEN };
  resolveWith({ userConfig: dotenv("https://user.example", "user") });
  expect("process.env не меняется",
    { url: process.env.EVA_URL, token: process.env.EVA_TOKEN }, before);

  // ── Шаблон ───────────────────────────────────────────────────
  const freshPath = join(root, "fresh", "nested", "eva-mcp", "credentials");
  expect("шаблон: каталог создаётся, файл пишется", ensureUserConfigTemplate(freshPath), true);
  expect("шаблон: содержимое", readFileSync(freshPath, "utf8"), USER_CONFIG_TEMPLATE);
  expect("шаблон: повторный вызов ничего не делает", ensureUserConfigTemplate(freshPath), false);
  if (process.platform !== "win32") {
    expect("шаблон: права файла 0600", statSync(freshPath).mode & 0o777, 0o600);
    expect("шаблон: права своего каталога 0700", statSync(join(freshPath, "..")).mode & 0o777, 0o700);
    // Промежуточные каталоги (как ~/.config на свежей машине) — общие, не 0700
    expect("шаблон: промежуточный каталог не 0700",
      (statSync(join(root, "fresh", "nested")).mode & 0o777) !== 0o700, true);

    // Существующий свой каталог: права не меняем
    const openDir = join(root, "open", "eva-mcp");
    mkdirSync(openDir, { recursive: true });
    chmodSync(openDir, 0o755);
    ensureUserConfigTemplate(join(openDir, "credentials"));
    expect("шаблон: существующий каталог сохраняет права", statSync(openDir).mode & 0o777, 0o755);
  }

  writeFileSync(freshPath, dotenv("https://filled.example", "filled"));
  expect("заполненный файл не перезаписывается", ensureUserConfigTemplate(freshPath), false);
  expect("заполненный файл цел", readFileSync(freshPath, "utf8"), dotenv("https://filled.example", "filled"));

  // ── Предупреждение о правах шире 0600 ────────────────────────
  expect("права: на Windows не проверяются", describeLoosePermissions(freshPath, "win32"), null);
  expect("права: файла нет — молчит", describeLoosePermissions(join(root, "nope"), "linux"), null);
  if (process.platform !== "win32") {
    expect("права: 0600 — молчит", describeLoosePermissions(freshPath), null);
    chmodSync(freshPath, 0o644);
    const warning = describeLoosePermissions(freshPath);
    expect("права: 0644 — предупреждение с путём и режимом",
      Boolean(warning && warning.includes(freshPath) && warning.includes("0644")), true);
    expect("права: предупреждение не меняет файл", statSync(freshPath).mode & 0o777, 0o644);
    expect("права: в предупреждении нет значений", Boolean(warning && !warning.includes("filled")), true);
    chmodSync(freshPath, 0o640);
    expect("права: доступ группы — тоже предупреждение", describeLoosePermissions(freshPath) !== null, true);
  }

  // ── Сообщение в stderr: путь есть, значений нет ──────────────
  const missing = resolveWith({ env: { EVA_URL: "https://secret-url.example" } });
  const message = !missing.ok && describeMissing(missing, true, configPath);
  expect("сообщение называет путь конфига", Boolean(message && message.includes(configPath)), true);
  expect("сообщение не содержит значений", Boolean(message && !message.includes("secret-url")), true);
} finally {
  rmSync(root, { recursive: true, force: true });
}

if (problems.length) {
  console.log("\nЦепочка учётных данных — проблемы:");
  for (const text of problems) console.log(`  x ${text}`);
  process.exit(1);
}
console.log(`Цепочка учётных данных: ${passed} проверок пройдено.`);
