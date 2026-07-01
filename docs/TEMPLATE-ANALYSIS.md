# Template Analysis

> Phase 0 deliverable. This documents the template we started from, what we keep,
> what we restructure, and **why**. Everything described here as "removed" is still
> recoverable from git history at commit `7b331a1` (the last commit before this work
> began).

## 1. What the template is

The starting point is the **[Discord-Bot-TypeScript-Template](https://github.com/KevinNovak/Discord-Bot-TypeScript-Template)**
by Kevin Novak — a mature, embed-centric discord.js v14 boilerplate. It is a
general-purpose template that ships a lot of features (i18n, clustering, jobs,
reactions, triggers) most of which are **out of scope** for this project.

### Inventory (as found)

| Area | Detail |
| --- | --- |
| Package manager | **npm** (`package-lock.json` present) |
| discord.js | `^14.22.1` — **supports Components V2** (V2 landed in 14.19.0) ✅ |
| Module system | **ESM** (`"type": "module"`), TS source uses explicit `.js` import specifiers |
| TypeScript | `target es2021`, `module es2022`, `moduleResolution node`, **`strict: false`**, `experimentalDecorators` + `emitDecoratorMetadata` on |
| Config | JSON files in `config/` loaded via `createRequire(...)('../config/config.json')` — **secrets live in a committed-shaped JSON file**, not env |
| Validation | `class-validator` + `class-transformer` + `reflect-metadata` for config models |
| i18n | `linguini` + `lang/*.json`, heavily **embed-oriented** (`Lang.getEmbed(...)`) |
| Commands | `Command` interface (`names`, `cooldown`, `deferType`, `requireClientPerms`, `autocomplete?`, `execute`); metadata declared separately in `metadata.ts`; commands hand-wired into an array in `start-bot.ts` |
| Command registration | `CommandRegistrationService` — **global scope only** (`Routes.applicationCommands`), no guild-scoped path |
| Events | `Bot` model wires raw client events → handler classes in `src/events/` |
| Interactions | Button routing by exact `customId` match against a `button.ids` array — **no parameterized custom_id convention** |
| Messaging | `InteractionUtils` (nice `IGNORED_ERRORS` swallow pattern), embed/string based |
| Logging | `pino` + `pino-pretty`, static `Logger`, driven by `config.json` |
| Scaling | `ShardingManager` (`start-manager.ts`) **plus** a clustering/master-API layer (`express`, `controllers/`, `models/cluster-api`, `models/master-api`) |
| Jobs | `node-schedule`-based; only job is `update-server-count` (posts to bot-list sites) |
| Reactions / Triggers | Present, and **depend on message content / reaction intents** |
| Process mgmt | `pm2` (`process.json`) |
| Tooling | ESLint flat config (strict-ish, typed), Prettier (100 width, 4-space, single quote, `arrowParens: avoid`), Vitest |

## 2. The two hard constraints that reshape everything

1. **Components V2 exclusive.** Every message sets `MessageFlags.IsComponentsV2`
   (`32768`). That flag **disables `content`, `embeds`, `poll`, and `stickers`**.
   The template's entire messaging surface (`Lang.getEmbed`, `InteractionUtils.send`
   with embeds/strings) is therefore a dead end for us — there is no fallback path.
   This is the reason we build our own engine.
2. **All secrets via env.** The template's `config/*.json` approach is replaced by a
   typed, `zod`-validated env loader. No secret is ever committed.

## 3. What we keep

- **npm**, **ESM + explicit `.js` specifiers**, the **Prettier/ESLint conventions**
  (unchanged — they are good and consistent), and **Vitest**.
- **discord.js `^14.22.1`** — already V2-capable. No upgrade needed; we just install.
  (We pin `>= 14.19.3` conceptually as the V2 floor.)
- The **`Command` + `deferType` pattern** and the **`IGNORED_ERRORS` swallow pattern**
  from `InteractionUtils` — reimplemented inside `src/core/` rather than imported, so
  the new architecture is self-contained.
- The **command-registration approach** (diff local vs remote), extended with a
  **guild-scoped path** for fast dev iteration.
- **pino** logging (rebuilt to be env-driven).

## 4. What we restructure, and why

We build a clean `src/core/` runtime as specified in the project brief, rather than
extending the template's `src/events` / `src/services` in place. A hybrid (half
embed/lang/JSON-config, half engine/env) would be actively confusing for the future
agents and humans who will maintain this — so the conflicting legacy is removed, not
left as dead code.

| Removed | Reason |
| --- | --- |
| `config/*.json` + `class-validator`/`class-transformer`/`reflect-metadata` | Replaced by `src/core/config` (dotenv + zod). Secrets must be env. |
| `lang/` + `linguini` + `Lang` service | i18n is **embed-centric** and out of scope. Messaging now flows through the engine. |
| `src/controllers`, `src/models/cluster-api`, `src/models/master-api`, `master-api-service`, `express` | Clustering / master-API dashboard. Project is **standalone, no web dashboard**. |
| `src/start-manager.ts`, clustering config | Sharding stays *possible* (the client is sharding-ready) but we run **single-process for now**. |
| `src/events/message-handler`, `trigger-handler`, `src/triggers`, `src/reactions`, `reaction-handler` | Require the **message-content / reaction intents** we are explicitly not using (slash + context-menu only). |
| `src/jobs`, `node-schedule`, `update-server-count-job` | No scheduled work needed yet; bot-list posting is out of scope. |
| `src/commands/chat\|message\|user/*` (help/info/dev/test/view-date-*) | Embed/lang based. Replaced by engine-driven demo commands. |
| `pm2` / `process.json` | Lean deps; production process management can be re-added when deploying. |
| Misc utils (`format-utils`, `remove-markdown`, `luxon`, `filesize`, `node-fetch`, etc.) | Tied to the embed/lang stack; reintroduce focused utilities only as the engine needs them. |

### Dependencies added

`drizzle-orm`, `postgres` (driver), `ioredis`, `dotenv`, `zod` (runtime);
`drizzle-kit`, `tsx` (dev). `pino`/`pino-pretty` retained.

## 5. New directory shape (target)

```
src/
  core/
    config/      typed env loading + validation (zod)
    db/          Postgres + Drizzle (lazy, optional)
    cache/       Redis / ioredis (lazy, optional)
    engine/      the Components V2 message/template engine  ← the priority
    commands/    command framework + interaction router
    events/      gateway event dispatcher
    client.ts    discord.js client (minimal intents, sharding-ready)
    logger.ts    structured logging
    errors.ts    error types + global + per-interaction handling
  modules/       future feature modules (empty for now)
  commands/      test/demo commands (ping, engine-demo, template-demo)
  start-bot.ts   boot sequence
docs/            all documentation
```

## 6. Compatibility / config decisions

- **`tsconfig`**: flip **`strict: true`**, move to `module/moduleResolution NodeNext`
  (enforces the `.js` specifier style the template already uses), `target es2022`,
  drop decorators (no longer needed without class-validator).
- **DB & Redis are lazy and optional.** If their env vars are present we connect and
  fail fast on an unreachable server; if absent we log a warning and continue, so the
  engine is fully testable with **no infrastructure**.
- **Command registration gains a guild scope** (`DEV_GUILD_ID`) for instant updates
  during development, with the existing global path preserved for production.
