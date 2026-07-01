# Architecture

## Overview

vye-bot is a **standalone**, single-process Discord bot. It talks to three
external systems — the Discord gateway/REST API, Postgres, and Redis — and
nothing else. There is **no web dashboard** and no clustering/master-API layer.

```
                    ┌───────────────────────────┐
   Discord  ◀──────▶│         vye-bot           │
  (gateway +        │                           │
   REST)            │  start-bot.ts (boot)      │
                    │    │                      │
                    │    ├── core/client        │  discord.js Client (Guilds intent)
                    │    ├── core/events         │  gateway → router
                    │    ├── core/commands       │  command framework + router
                    │    ├── core/engine         │  Components V2 message engine
                    │    ├── core/config         │  zod-validated env
                    │    ├── core/logger/errors  │
                    │    ├── core/db  ───────────┼──▶ Postgres (Drizzle)
                    │    └── core/cache ─────────┼──▶ Redis (ioredis)
                    │                           │
                    │  modules/  (future feature modules)
                    │  commands/ (demo commands)
                    └───────────────────────────┘
```

Two hard design constraints shape everything:

1. **Components V2 exclusive.** Every message is built with our engine and sent
   with the `IsComponentsV2` flag. See [`MESSAGE-ENGINE.md`](MESSAGE-ENGINE.md).
2. **Slash + context-menu commands only.** No message-content intent, so the
   client requests only the `Guilds` gateway intent.

## Directory map

One line per folder — what lives there, and what does **not**.

```
src/
├── start-bot.ts          Boot sequence: connect infra, wire router, log in.
├── register-commands.ts  CLI entry to register/view/clear application commands.
│
├── core/                 Framework code shared by all features. No feature logic here.
│   ├── client.ts         Creates the discord.js Client (minimal intents, sharding-ready).
│   ├── logger.ts         pino root logger + childLogger(). Not feature-specific config.
│   ├── errors.ts         AppError types, toError(), global process error handlers.
│   │
│   ├── config/           Typed env loading + zod validation. The ONLY reader of process.env.
│   │   └── env.ts         Defines the schema and exports the `config` singleton.
│   │
│   ├── db/               Postgres + Drizzle. Lazy connect, fail-fast. No tables yet.
│   │   ├── client.ts      connectDatabase/getDb/disconnectDatabase.
│   │   └── schema/        Drizzle tables (empty; feature modules re-export here).
│   │
│   ├── cache/            Redis (ioredis). Lazy connect, fail-fast.
│   │   └── redis.ts       connectCache/getCache/disconnectCache.
│   │
│   ├── engine/          ★ The Components V2 message engine. See MESSAGE-ENGINE.md.
│   │   ├── ir.ts          The Block IR types (what you build messages from).
│   │   ├── renderer.ts    IR → discord.js builders. ONLY file importing component builders.
│   │   ├── sender.ts      send/edit/updateTemplate helpers.
│   │   ├── templating.ts  {placeholder} substitution.
│   │   ├── themes.ts      Theme registry + color resolution.
│   │   ├── validator.ts   Enforces Discord V2 limits before send.
│   │   ├── limits.ts       The V2 limit numbers + IsComponentsV2 flag value.
│   │   ├── registry.ts    defineTemplate/getTemplate.
│   │   └── errors.ts      Engine error types (self-contained).
│   │
│   ├── commands/        Command framework + interaction router. No specific commands.
│   │   ├── command.ts     Command / ComponentHandler types.
│   │   ├── custom-id.ts   The custom_id encode/parse convention.
│   │   ├── registry.ts    Registry builders + CooldownStore.
│   │   ├── router.ts      Dispatches interactions; friendly engine-rendered errors.
│   │   └── registration.ts REST registration (guild + global).
│   │
│   └── events/          Gateway event dispatcher (ready + interactionCreate).
│       └── dispatcher.ts
│
├── modules/             Feature modules (moderation, leveling, …). EMPTY for now.
│                        Each future feature gets a subfolder here.
│
└── commands/            The test/demo commands (ping, engine-demo, template-demo).
                         Real features live in modules/; these prove the engine works.
```

Docs live in `docs/`; agent orientation in `AGENTS.md`.

## Boot sequence

`src/start-bot.ts` runs these steps in order:

1. **`installGlobalErrorHandlers()`** — `unhandledRejection` is logged (process
   keeps running); `uncaughtException` is logged at fatal and exits 1 so a
   supervisor restarts a process in an unknown state.
2. **`connectDatabase()`** then **`connectCache()`** — both are required. Each
   opens a connection and does a round-trip (`select 1` / `PING`); if either is
   unreachable, boot throws and the process exits.
3. **`createClient()`** — the discord.js client with the `Guilds` intent.
4. **Build registries** — `buildCommandRegistry`, `buildComponentRegistry`, and a
   `CooldownStore` from `src/commands`.
5. **`createInteractionRouter(...)`** — the single interaction handler.
6. **`registerEvents(client, { onReady, onInteraction })`** — wires gateway
   events to the router.
7. **`registerShutdown(client)`** — on SIGINT/SIGTERM, destroys the client and
   disconnects Redis + Postgres.
8. **`client.login(token)`**.

Config (`src/core/config`) is validated the moment it is first imported, so a bad
env aborts before any of the above runs.

## Data flow: an interaction

```
Discord → Events.InteractionCreate
        → registerEvents (guard: log unexpected errors)
        → createInteractionRouter
            ├── chat/context command → CooldownStore → command.execute(interaction)
            ├── autocomplete          → command.autocomplete(...)
            └── component/modal       → parseCustomId → ComponentHandler.execute(...)
        → command builds a MessageTemplate
        → engine.sendTemplate / updateTemplate
            → render (resolve placeholders → validate → build builders + IsComponentsV2)
            → interaction.reply / update / followUp
```

## Scaling

The client is **sharding-ready** — nothing assumes a single process — but we run
single-process for now. When the bot approaches ~2,500 guilds, a
`ShardingManager` entry point can run `start-bot.ts` unchanged across shards.
This is intentionally not built yet.

## Why standalone (no dashboard)

The original template shipped a clustering/master-API layer (Express controllers,
a REST API for cross-process coordination). We removed it: this bot is a single
process with direct Postgres/Redis access, which is simpler to operate and
reason about. See [`TEMPLATE-ANALYSIS.md`](TEMPLATE-ANALYSIS.md).
