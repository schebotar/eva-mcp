# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## О проекте

MCP-сервер (stdio) поверх JSON-RPC API EvaProject/EvaTeam: задачи, спринты, связи,
требования, worklog. Node.js + TypeScript (ESM, strict, NodeNext), Zod v4,
`@modelcontextprotocol/sdk`. Комментарии в коде, описания инструментов и ответы
пользователю — на русском.

## Команды

```bash
npm run dev            # запуск через tsx
npm run build          # tsc → dist/
npm start              # запуск собранного dist/index.js
npx tsc --noEmit       # проверка типов
```

Тестового фреймворка в репозитории нет — `npm test` не определён, и `npx tsc --noEmit`
это единственная автоматическая проверка. Поведение изменений проверяется прогоном
против живого инстанса: временный `test-*.local.ts` в корне (ESM, импорты `./src/...`),
запуск `npx tsx test-*.local.ts`, после прогона файл удалить. Писать в живую систему
только в тестовом проекте `mcp-test`, созданные объекты убирать за собой.

После `npm run build` MCP-сервер нужно перезапустить (в VS Code — `MCP: Restart Server`),
иначе клиент продолжит работать со старой сборкой и проверка окажется недостоверной.

`EVA_URL` и `EVA_TOKEN` обязательны: без них `index.ts` завершает процесс. Берутся из
`.env` (в `.gitignore`) или из окружения.

## Архитектура

Путь запроса: **инструмент → EvaClient → JSON-RPC → маппер → форматтер**.

- `src/index.ts` — регистрация. Собирает `ALL_TOOL_DEFS` и `ALL_HANDLERS`; на вызов
  перебирает обработчики по очереди и берёт первый результат, отличный от `null`.
- `src/tools/*.tools.ts` — модуль на предметную область. Экспортирует `xxxToolDefs` и
  `handleXxxToolCall(name, args, client)`, которая **возвращает `null`, если инструмент
  не её** — на этом и держится диспетчеризация.
- `src/eva-client.ts` — класс `EvaClient`, единственное место сетевых вызовов. Приватный
  `call<T>(method, kwargs, topLevel?)` формирует запрос JSON-RPC 2.2.
- `src/types.ts` — сырые типы (`EvaTaskRaw`) и нормализованные (`TaskInfo`) плюс
  `BqlFilter`; `src/mappers.ts` — чистые функции `Raw → Info`.
- Ответ инструмента всегда Markdown и собирается функцией-форматтером внутри модуля.

### Добавление инструмента

1. Zod-схема, `inputSchema.properties` и `required` — **три места, которые должны
   совпадать**: Zod проверяет фактические аргументы, `inputSchema` описывает их агенту.
2. Метод в `EvaClient`, типы Raw/Info в `types.ts`, маппер в `mappers.ts`.
3. `case` в `handleXxxToolCall`; имя инструмента — `snake_case`.
4. Новый **модуль** подключается в `index.ts` в трёх местах: импорт, `ALL_TOOL_DEFS`,
   `ALL_HANDLERS`.
5. Строка в таблицу README и в список в `.github/instructions/mcp-tools.instructions.md`.

### Отключённые модули

В `index.ts` закомментированы `metrics`, `reports`, `epic`, `attachment`, `follower`:
код в `src/tools/` и `src/metrics/` есть, но сервер эти инструменты не отдаёт. Не считай
их рабочими — сначала проверь, подключён ли модуль.

## Ловушки API, из-за которых код молча врёт

Полная справка — `.github/instructions/eva-api.instructions.md`. Самое важное:

- Отказ валидации приходит как **HTTP 200 с `result: null`**, а причина лежит в поле
  `abort`, не в `error`.
- **Неизвестные kwargs игнорируются молча** и могут сбросить `limit`: запрос вернёт весь
  инстанс (~13 700 задач) и упрётся в 502. Любой `list` — только с фильтром и/или срезом.
- `get` игнорирует позиционные `args` и вернёт первый попавшийся объект — объект задаётся
  через kwargs `id`/`code`/`filter`. `update`/`delete`/`do_publish`, наоборот, требуют id
  в `args[0]`.
- Фильтр задач по проекту — `["parent_id", "==", <UUID>]`; `["parent", "==", <код>]`
  молча возвращает 0 задач.
- Закрытые спринты и их задачи архивируются: без `include_archived: "true"` (строка, не
  булево) их не видно, а состав закрытого спринта возвращается неполным.
- Тексты в Eva — HTML: на запись `mdToHtml()`, на чтение `htmlToMd()`
  (`src/helpers/markdown.ts`).
- `priority` — число 0–4 (`ChoiceInt`); строковые алиасы конвертирует `mapPriority()`.
- `_acl_fields` / `_acl_obj` в ответе — права токена: `deny` означает, что поле скрыто.
  Это норма, а не сбой; поэтому списочные методы отбрасывают записи без `code`.

## Идентификаторы

`code` — основной идентификатор всех сущностей (`DEV-000003`, `SPR-000001`, код проекта;
для пользователей — `login`, то есть email). `id` — UUID вида `CmfTask:uuid`, нужен
только там, где API не принимает код. `name` не уникален и идентификатором не является.
В `description` параметра-идентификатора указывай тип, пример значения и откуда его взять.

Таблицы идентификаторов, полей BQL и приоритетов — в `.github/copilot-instructions.md`.
