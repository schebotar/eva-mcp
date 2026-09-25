import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, posix, win32 } from "node:path";
import { parse as parseDotenv } from "dotenv";

/**
 * Откуда сервер берёт EVA_URL и EVA_TOKEN.
 *
 * Цепочка, первый непустой источник побеждает — отдельно для каждой переменной:
 *   1. переменные окружения процесса   — клиент передал явно
 *   2. ./.env в рабочей папке          — локально для проекта
 *   3. конфиг пользователя             — умолчание пользователя, путь — userConfigPath()
 *   4. .env в корне пакета             — только для клона репозитория
 *
 * Пункт 4 при запуске через npx бесполезен: пакет лежит в кэше npm, класть туда
 * .env не вариант. Для этого и нужен пункт 3 — одно место в профиле пользователя,
 * которое видно из любого MCP-клиента.
 */

export const CREDENTIAL_KEYS = ["EVA_URL", "EVA_TOKEN"] as const;
export type CredentialKey = (typeof CREDENTIAL_KEYS)[number];

export interface UserConfigPathOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  home?: string;
}

/**
 * Путь к конфигу пользователя (dotenv-формат):
 *   Linux и macOS — $XDG_CONFIG_HOME/eva-mcp/credentials, иначе ~/.config/eva-mcp/credentials
 *   Windows       — %LOCALAPPDATA%\eva-mcp\credentials
 *
 * На Windows — Local, а не Roaming: перемещаемый профиль уезжает на файловый сервер,
 * а в файле секрет. В XDG «локального, но не синхронизируемого» каталога нет, поэтому
 * на Linux и macOS — ~/.config, как у git и gh.
 *
 * Считается при вызове, а не при загрузке модуля: так окружение и домашнюю папку
 * можно подменить в проверках. Относительный XDG_CONFIG_HOME игнорируется —
 * спецификация XDG требует абсолютный путь.
 */
export function userConfigPath(options: UserConfigPathOptions = {}): string {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const path = platform === "win32" ? win32 : posix;

  const configured = platform === "win32" ? env.LOCALAPPDATA?.trim() : env.XDG_CONFIG_HOME?.trim();
  const fallback = platform === "win32" ? path.join(home, "AppData", "Local") : path.join(home, ".config");
  const base = configured && path.isAbsolute(configured) ? configured : fallback;
  return path.join(base, "eva-mcp", "credentials");
}

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
  /** Короткое имя для сообщений: «переменные окружения», «./.env», «конфиг пользователя», «.env пакета» */
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
  const configPath = options.userConfigPath ?? userConfigPath({ env });
  const cwdEnvPath = join(options.cwd, ".env");
  const pkgEnvPath = join(options.pkgRoot, ".env");

  const checked: CredentialSource[] = [
    { name: "переменные окружения", values: fromEnv(env) },
    { name: "./.env", path: cwdEnvPath, values: readDotenvFile(cwdEnvPath) },
    { name: "конфиг пользователя", path: configPath, values: readDotenvFile(configPath) },
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
export function ensureUserConfigTemplate(path: string): boolean {
  // 0o700 / 0o600: токен — секрет; на Windows права игнорируются.
  // Родители (например ~/.config) — общие, их создаём с обычными правами;
  // 0o700 — только свой каталог. Существующие каталоги не трогаем.
  const dir = dirname(path);
  mkdirSync(dirname(dir), { recursive: true });
  try {
    mkdirSync(dir, { mode: 0o700 });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
  }
  try {
    // "wx" — создать, только если файла нет: без гонки двух одновременных стартов
    writeFileSync(path, USER_CONFIG_TEMPLATE, { encoding: "utf8", mode: 0o600, flag: "wx" });
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw err;
  }
}

/**
 * Предупреждение, если файл с токеном доступен шире 0600: создан вручную,
 * распакован из архива. Права не меняем — файл пользователя, решать ему.
 * На Windows режимы POSIX не действуют, проверка не выполняется.
 */
export function describeLoosePermissions(
  path: string,
  platform: NodeJS.Platform = process.platform
): string | null {
  if (platform === "win32") return null;
  let mode: number;
  try {
    mode = statSync(path).mode & 0o777;
  } catch {
    return null; // файла нет — предупреждать не о чем
  }
  if ((mode & 0o077) === 0) return null;
  const octal = mode.toString(8).padStart(4, "0");
  return (
    `Предупреждение: ${path} доступен не только владельцу (права ${octal}), а в нём токен. ` +
    `Ограничьте: chmod 600 "${path}"`
  );
}

/** Сообщение для stderr, когда учётные данные не найдены */
export function describeMissing(result: Extract<CredentialsResult, { ok: false }>, createdTemplate: boolean, configPath: string): string {
  const lines = [`Ошибка: не найдены ${result.missing.join(" и ")}.`];
  if (createdTemplate) {
    lines.push(`Создан шаблон ${configPath} — заполните его и перезапустите MCP-клиент.`);
  } else if (existsSync(configPath)) {
    lines.push(`Заполните ${configPath} (сейчас там пусто: ${result.missing.join(", ")}) и перезапустите MCP-клиент.`);
  }
  lines.push(
    "Где искал: " +
      result.checked.map((s) => (s.path ? `${s.name} (${s.path})` : s.name)).join(", ")
  );
  return lines.join("\n");
}
