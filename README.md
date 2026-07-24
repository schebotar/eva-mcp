# eva-mcp

MCP-сервер для работы с системой управления проектами **EvaProject** (EvaTeam).

Позволяет AI-агенту получать описание задач, комментарии, обновлять поля, работать со спринтами, требованиями, журналом работ и искать проекты/пользователей.

## Возможности

| Инструмент | Описание |
|-----------|----------|
| `get_task` | Получить задачу по коду: название, описание, статус, автор, исполнитель, проект, даты, **иерархические комментарии (треды)** и упомянутые задачи |
| `search_tasks` | Поиск задач по фильтрам: статус, исполнитель, проект, приоритет, тип, текстовый запрос, спринт, даты, **linked_to**, **no_sprint** |
| `count_tasks` | Подсчёт количества задач по фильтрам (те же фильтры, что и `search_tasks`) |
| `create_task` | Создать новую задачу в проекте |
| `update_task` | Обновление полей задачи (статус, исполнитель, приоритет, дедлайн, описание, спринты и др.) |
| `get_project` | Информация о проекте по коду |
| `search_projects` | Поиск проектов по названию |
| `search_users` | Поиск пользователей по имени, фамилии или логину |
| `get_statuses` | Справочник всех статусов задач с ID, названиями и кодами |
| `get_linked_tasks` | Связанные задачи: родительская, дочерние, depended, affected |
| `get_referencing_tasks` | **Обратный поиск связей**: кто ссылается на эту задачу (сгруппировано по типу связи) |
| `get_linked_tasks_batch` | **Батчевый get_linked_tasks**: связи для нескольких задач (до 50) за один вызов |
| `get_task_worklog` | Журнал работ (timetracker) по задаче |
| `log_work` | Списать время по задаче |
| `get_task_history` | История изменения статусов задачи |
| `get_sprint` | Информация о спринте: название, статус, проект, даты, владелец |
| `search_sprints` | Поиск спринтов по проекту, статусу, текстовому запросу |
| `create_sprint` | Создать новый спринт (список) в проекте |
| `add_comment` | Добавить комментарий к задаче (Markdown) |
| `get_requirement` | Получить требование из EvaReq по коду |
| `search_requirements` | Поиск требований по статусу, исполнителю, проекту, приоритету |

### 🆕 Новое в v0.6.0

#### Спринты, комментарии, требования, worklog и история
- **Спринты**: `get_sprint`, `search_sprints`, `create_sprint` — полноценная работа со спринтами
- **Комментарии**: `add_comment` — добавление комментариев с поддержкой Markdown и вложенных ответов
- **Требования**: `get_requirement`, `search_requirements` — работа с требованиями из EvaReq
- **Worklog**: `get_task_worklog`, `log_work` — журнал работ и списание времени
- **История**: `get_task_history` — отслеживание изменений статусов задачи
- **create_task**: создание задач через MCP

### 🆕 Новое в v0.5.0

#### Иерархические комментарии (треды) в `get_task`
Комментарии теперь отображаются в виде дерева с учётом вложенности — ответы на комментарии показываются с отступом и префиксом `↳`. Больше не плоский список: агент видит структуру обсуждения, кто кому ответил.

### 🆕 Новое в v0.4.0

#### Упрощение API: `get_task` теперь возвращает всё
Инструменты `get_task`, `get_task_comments` и `get_task_full` объединены в один `get_task` — теперь он всегда возвращает и задачу, и комментарии, и упомянутые задачи. Меньше путаницы, один вызов вместо двух.

#### `linked_to` в `count_tasks`
Параметр `linked_to` теперь доступен и в `count_tasks` — можно узнать количество задач, ссылающихся на указанную.

### v0.3.0

#### Обратный поиск связей (`get_referencing_tasks`)
Узнать, какие задачи ссылаются на указанную — в полях «родительская», depended, affected.

#### Батчевый `get_linked_tasks_batch`
Получить связи сразу для нескольких задач (до 50) — один вызов вместо N.

#### Упомянутые задачи в `get_task`
В ответе `get_task` теперь есть секция «Упомянутые задачи» — коды задач, найденные в тексте описания и комментариях.

#### Фильтр `linked_to` в `search_tasks`
Параметр `linked_to` позволяет найти задачи, которые ссылаются на указанную — можно комбинировать с другими фильтрами (статус, проект и т.д.).

## Установка

```bash
npm install
```

## Настройка

1. Скопируйте `.env.example` в `.env`:
   ```bash
   cp .env.example .env
   ```

2. Заполните переменные в `.env`:

   - **EVA_URL** — URL вашего экземпляра EvaTeam (например, `https://your-company.evateam.ru`)
   - **EVA_TOKEN** — API-токен

### Как получить API-токен

1. Авторизуйтесь в EvaTeam
2. Нажмите на аватар → **Моя страница**
3. Перейдите на вкладку **Безопасность**
4. Нажмите **Сгенерировать API токен**
5. Укажите имя токена и срок жизни, нажмите **Создать токен API**
6. Скопируйте токен и сохраните в `.env`

> ⚠️ Токен показывается только один раз. При утрате нужно сгенерировать новый.

## Запуск

Dev-режим (через tsx):
```bash
npm run dev
```

Production (компиляция + запуск):
```bash
npm run build
npm start
```

## Подключение к VS Code Copilot

Добавьте в `mcp.json` (в настройках VS Code):

```json
{
  "servers": {
    "eva-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "c:\\Users\\chebser\\Documents\\eva-mcp\\src\\index.ts"],
      "env": {
        "EVA_URL": "https://your-company.evateam.ru",
        "EVA_TOKEN": "your-api-token"
      }
    }
  }
}
```

## Пример использования

В диалоге с агентом:

> Посмотри задачу DEV-000123 и напиши код согласно описанию

Агент вызовет `get_task("DEV-000123")`, получит описание и комментарии, и использует их как ТЗ.

## Структура проекта

```
eva-mcp/
├── package.json
├── tsconfig.json
├── .env.example
├── README.md
└── src/
    ├── index.ts              # Точка входа: MCP-сервер, регистрация инструментов
    ├── eva-client.ts         # HTTP-клиент для JSON-RPC API EvaProject (класс EvaClient)
    ├── types.ts              # TypeScript-интерфейсы (TaskInfo, CommentInfo, BqlFilter, ...)
    ├── mappers.ts            # Мапперы сырых данных API → нормализованные
    ├── helpers/
    │   ├── build-task-filter.ts  # Построение BQL-фильтров
    │   ├── comment-tree.ts       # Форматирование дерева комментариев
    │   └── markdown.ts          # Конвертация HTML ↔ Markdown
    ├── tools/
    │   ├── task.tools.ts     # get_task, search_tasks, count_tasks, update_task, create_task
    │   ├── sprint.tools.ts   # get_sprint, search_sprints, create_sprint
    │   ├── user.tools.ts     # search_users, get_statuses
    │   ├── project.tools.ts  # search_projects, get_project
    │   ├── linked.tools.ts   # get_linked_tasks, get_referencing_tasks, get_linked_tasks_batch
    │   ├── worklog.tools.ts  # get_task_worklog, log_work
    │   ├── history.tools.ts  # get_task_history
    │   ├── comment.tools.ts  # add_comment
    │   ├── requirement.tools.ts  # get_requirement, search_requirements
    │   └── ...
    └── metrics/              # Scrum-метрики (burndown, velocity, cycle-time, cumulative-flow)
```

## Лицензия

MIT
