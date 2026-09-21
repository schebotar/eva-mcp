import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseDotenv } from "dotenv";

/**
 * Откуда сервер берёт EVA_URL и EVA_TOKEN.
 *
 * Цепочка, первый непустой источник побеждает — отдельно для каждой переменной:
 *   1. переменные окружения процесса   — клиент передал явно
 *   2. ./.env в рабочей папке          — локально для проекта
 *   3. ~/.eva-mcp                      — умолчание пользователя
 *   4. .env в корне пакета             — только для клона репозитория
 *
 * Пункт 4 при запуске через npx бесполезен: пакет лежит в кэше npm, класть туда
 * .env не вариант. Для этого и нужен пункт 3 — одно место в домашней папке,
 * которое видно из любого MCP-клиента.
 */

export const CREDENTIAL_KEYS = ["EVA_URL", "EVA_TOKEN"] as const;
export type CredentialKey = (typeof CREDENTIAL_KEYS)[number];

/** Пользовательский конфиг: dotenv-файл в домашней папке */
export const USER_CONFIG_PATH = join(homedir(), ".eva-mcp");

/** Шаблон, который сервер создаёт при первом запуске без учётных данных */
export const USER_CONFIG_TEMPLATE = [
  "# eva-mcp: учётные данные EvaTeam. Заполните и перезапустите MCP-клиент.",
  "# EVA_URL   — адрес инстанса, например https://your-instance.evateam.ru",
  "# EVA_TOKEN — API-токен: профиль пользователя → «Безопасность» → «Сгенерировать API токен»",
  "EVA_URL=",
  "EVA_TOKEN=",
  "",
].join("\n");

export interface CredentialSource {
  /** Короткое имя для сообщений: «переменные окружения», «./.env», «~/.eva-mcp», «.env пакета» */
  name: string;
  /** Путь к файлу; у переменных окружения его нет */
  path?: string;
  values: Partial<Record<CredentialKey, string>>;
}

export interface Credentials {
  url: string;
  token: string;
  /** Имя источника для каждой переменной — чтобы в stderr было видно, откуда что взято */
  sources: Record<CredentialKey, string>;
}

export type CredentialsResult =
  | { ok: true; credentials: Credentials; checked: CredentialSource[] }
  | { ok: false; missing: CredentialKey[]; checked: CredentialSource[] };

export interface ResolveOptions {
  cwd: string;
  pkgRoot: string;
  env?: NodeJS.ProcessEnv;
  userConfigPath?: string;
}

/** Прочитать dotenv-файл, если он есть; пустые значения считаются отсутствующими */
function readDotenvFile(path: string): Partial<Record<CredentialKey, string>> {
  if (!existsSync(path)) return {};
  const parsed = parseDotenv(readFileSync(path, "utf8"));
  const values: Partial<Record<CredentialKey, string>> = {};
  for (const key of CREDENTIAL_KEYS) {
    const value = parsed[key]?.trim();
    if (value) values[key] = value;
  }
  return values;
}

function fromEnv(env: NodeJS.ProcessEnv): Partial<Record<CredentialKey, string>> {
  const values: Partial<Record<CredentialKey, string>> = {};
  for (const key of CREDENTIAL_KEYS) {
    const value = env[key]?.trim();
    if (value) values[key] = value;
  }
  return values;
}

/** Собрать учётные данные по цепочке источников, не трогая process.env */
export function resolveCredentials(options: ResolveOptions): CredentialsResult {
  const env = options.env ?? process.env;
  const userConfigPath = options.userConfigPath ?? USER_CONFIG_PATH;
  const cwdEnvPath = join(options.cwd, ".env");
  const pkgEnvPath = join(options.pkgRoot, ".env");

  const checked: CredentialSource[] = [
    { name: "переменные окружения", values: fromEnv(env) },
    { name: "./.env", path: cwdEnvPath, values: readDotenvFile(cwdEnvPath) },
    { name: "~/.eva-mcp", path: userConfigPath, values: readDotenvFile(userConfigPath) },
    { name: ".env пакета", path: pkgEnvPath, values: readDotenvFile(pkgEnvPath) },
  ];

  const found: Partial<Record<CredentialKey, { value: string; source: string }>> = {};
  for (const key of CREDENTIAL_KEYS) {
    const source = checked.find((s) => s.values[key]);
    if (source) found[key] = { value: source.values[key]!, source: source.name };
  }

  const missing = CREDENTIAL_KEYS.filter((key) => !found[key]);
  if (missing.length > 0) {
    return { ok: false, missing, checked };
  }

  return {
    ok: true,
    checked,
    credentials: {
      url: found.EVA_URL!.value,
      token: found.EVA_TOKEN!.value,
      sources: { EVA_URL: found.EVA_URL!.source, EVA_TOKEN: found.EVA_TOKEN!.source },
    },
  };
}

/**
 * Создать шаблон пользовательского конфига, если файла ещё нет.
 * Возвращает true, если файл создан этим вызовом.
 */
export function ensureUserConfigTemplate(path: string = USER_CONFIG_PATH): boolean {
  if (existsSync(path)) return false;
  // 0o600: токен — секрет; на Windows права игнорируются
  writeFileSync(path, USER_CONFIG_TEMPLATE, { encoding: "utf8", mode: 0o600 });
  return true;
}

/** Сообщение для stderr, когда учётные данные не найдены */
export function describeMissing(result: Extract<CredentialsResult, { ok: false }>, createdTemplate: boolean, userConfigPath: string = USER_CONFIG_PATH): string {
  const lines = [`Ошибка: не найдены ${result.missing.join(" и ")}.`];
  if (createdTemplate) {
    lines.push(`Создан шаблон ${userConfigPath} — заполните его и перезапустите MCP-клиент.`);
  } else if (existsSync(userConfigPath)) {
    lines.push(`Заполните ${userConfigPath} (сейчас там пусто: ${result.missing.join(", ")}) и перезапустите MCP-клиент.`);
  }
  lines.push(
    "Где искал: " +
      result.checked.map((s) => (s.path ? `${s.name} (${s.path})` : s.name)).join(", ")
  );
  return lines.join("\n");
}
