# Conventions

## Language & tooling

- **TypeScript strict mode** is on (`tsconfig.json`). No `any` in public APIs.
- **ESM** with explicit `.js` import specifiers (NodeNext resolution). Import
  `'./foo.js'` even though the file is `foo.ts`.
- **Prettier** (4-space indent, 100 print width, single quotes, `arrowParens:
  avoid`, trailing commas es5). Run `npm run format:fix`.
- **ESLint** (typed, `import/order` alphabetized with newlines between groups,
  explicit return types, `typedef` requires parameter annotations). Run
  `npm run lint:fix`. Note: string literals must use single quotes — avoid
  apostrophes in strings (they force Prettier to double-quote and conflict), or
  reword.
- Before committing, `npm run typecheck && npm run lint && npm run format` should
  all pass.

## The engine rule (most important)

**All messages go through the engine.** Never import a discord.js component
builder (`ContainerBuilder`, `TextDisplayBuilder`, `ButtonBuilder`,
`ActionRowBuilder`, `SectionBuilder`, `SeparatorBuilder`, `MediaGalleryBuilder`,
`FileBuilder`, `ThumbnailBuilder`, `StringSelectMenuBuilder`, …) anywhere except
`src/core/engine/renderer.ts`. Feature code builds a `MessageTemplate` and calls
`sendTemplate` / `editTemplate` / `updateTemplate`.

Command/attachment builders (`SlashCommandBuilder`, `ContextMenuCommandBuilder`)
are **not** component builders and are fine to use in command files.

## `custom_id` format

```
<namespace>:<action>[:<arg>...]
```

Build with `customId(namespace, action, ...args)`; parse with `parseCustomId`.
Parts must not contain `:`; total ≤ 100 chars. See
[`COMMANDS.md`](COMMANDS.md#the-custom_id-convention).

## Component ids

Components V2 numeric component ids are assigned automatically by the renderer
(sequential from 1). Never call `setId` yourself and never hand-manage them —
that's the engine's job. You only manage `custom_id`s.

## Error handling

- Throw real `Error`s (or the app's `AppError` subclasses in `core/errors.ts`:
  `ConfigError`, `DatabaseError`, `CacheError`). Wrap unknown causes with
  `{ cause }`.
- Use `toError(unknown)` to normalize a caught value before logging.
- In commands/handlers, **just throw** — the router logs it and shows the user a
  themed error message. Don't swallow errors silently.
- Global handlers (installed at boot): `unhandledRejection` → log & continue;
  `uncaughtException` → log fatal & exit 1.

## Logging

- Use the pino logger from `core/logger.ts`. `logger.info('msg')` or
  `logger.error({ err }, 'msg')` (structured fields first, message second).
- Scope logs to a subsystem with `childLogger({ mod: 'name' })`.
- Never `console.log` in committed code.
- Pretty in dev, JSON lines in prod (driven by `LOG_PRETTY` / `NODE_ENV`).

## Configuration

- **Never read `process.env` directly.** Import `config` from `core/config`. It is
  validated with zod at first import; a bad env aborts boot with a clear message.
- All secrets are env vars. `.env` is gitignored and must never be committed. Keep
  [`.env.example`](../.env.example) exhaustive and commented.

## Database & cache

- Both are **required** infrastructure, connected at boot. Use `getDb()` and
  `getCache()`; they throw if called before connect (which only happens if boot
  failed).
- Feature tables: define Drizzle tables in your module and re-export them from
  `src/core/db/schema/index.ts` so migrations and the typed `db` see them.

## Environment variables

Defined and validated in `src/core/config/env.ts`.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | no | `development` | `development` \| `production` \| `test`. |
| `LOG_LEVEL` | no | `debug` (dev) / `info` (prod) | `trace`…`fatal` \| `silent`. |
| `LOG_PRETTY` | no | `true` (dev) / `false` (prod) | Pretty-print vs JSON logs. |
| `DISCORD_TOKEN` | **yes** | — | Bot token. |
| `DISCORD_CLIENT_ID` | **yes** | — | Application (client) id, for command registration. |
| `DEV_GUILD_ID` | no | — | Guild for instant guild-scoped command registration. |
| `DEV_USER_IDS` | no | `[]` | Comma-separated owner/developer user ids. |
| `DATABASE_URL` | **yes** | — | Postgres connection string (percent-encode reserved chars). |
| `REDIS_URL` | **yes** | — | Redis connection string. |
| `DEFAULT_THEME` | no | `default` | Theme used by templates that don't name one. |

## File & naming conventions

- Files: `kebab-case.ts`. Types/interfaces/classes: `PascalCase`. Functions/vars:
  `camelCase`. Constants: `UPPER_SNAKE_CASE`.
- Barrels: each `core/*` folder has an `index.ts` exposing its public API; import
  from the barrel, not deep paths, when consuming another subsystem.
- Every public/exported engine and framework API carries TSDoc.
