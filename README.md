# vye-bot

A closed-source, multi-server Discord bot built on **discord.js** and **Components V2**.

Every message this bot sends is built with Discord's Components V2 system (the
`IsComponentsV2` message flag). Because that flag disables `content`, `embeds`,
`stickers`, and `poll`, there is no legacy fallback — so we ship our own
declarative **message engine** that is the single source of truth for building
messages. Feature code never touches discord.js component builders directly.

## Stack

| Concern  | Choice                                                          |
| -------- | --------------------------------------------------------------- |
| Language | TypeScript (strict), ESM, Node ≥ 20                             |
| Gateway  | discord.js ≥ 14.19.3 (Components V2)                            |
| Database | Postgres via **Drizzle ORM** (`postgres` driver) — **required** |
| Cache    | Redis via **ioredis** — **required**                            |
| Config   | env vars, validated with **zod** (`dotenv`)                     |
| Logging  | **pino** (pretty in dev, JSON in prod)                          |
| Commands | slash + context-menu only (no message-content intent)           |

Explicitly **out of scope, permanently**: no AI/LLM features, no music/voice, no
web dashboard.

## Install

```bash
npm install
cp .env.example .env   # then fill in the values (see below)
```

## Configure

All configuration is via environment variables. Copy `.env.example` to `.env`
and fill it in. Required: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DATABASE_URL`,
`REDIS_URL`. The full, commented list lives in [`.env.example`](.env.example) and
[`docs/CONVENTIONS.md`](docs/CONVENTIONS.md#environment-variables). The bot
validates env on boot and refuses to start with a clear error if anything is
missing or malformed.

## Run

```bash
npm run dev                    # watch mode (tsx), reads .env
npm start                      # build + run compiled output
```

The bot connects to Postgres and Redis on boot and **fails fast** if either is
unreachable.

## Register commands

Commands must be registered with Discord before they appear. Guild-scoped
registration is instant (great for dev); global can take up to an hour.

```bash
# Set DEV_GUILD_ID in .env first for instant guild commands:
npm run commands:register:guild

# Or register globally:
npm run commands:register

npm run commands:view          # list what's registered
npm run commands:clear         # remove all (global)
```

Once registered, try the demo commands that exercise the engine end-to-end:
`/ping`, `/engine-demo` (one of every block type + a button that edits the
message), and `/template-demo` (a registered template with `{placeholder}`
substitution).

## Database migrations

```bash
npm run db:generate            # generate SQL from src/core/db/schema
npm run db:migrate             # apply migrations
npm run db:push                # push schema directly (dev)
npm run db:studio              # open Drizzle Studio
```

## Scripts

| Script                          | Purpose                      |
| ------------------------------- | ---------------------------- |
| `npm run dev`                   | Run in watch mode            |
| `npm start`                     | Build and run                |
| `npm run build`                 | Compile to `dist/`           |
| `npm run typecheck`             | `tsc --noEmit`               |
| `npm run lint` / `lint:fix`     | ESLint                       |
| `npm run format` / `format:fix` | Prettier                     |
| `npm test`                      | Vitest                       |
| `npm run commands:*`            | Register/view/clear commands |
| `npm run db:*`                  | Drizzle migrations           |

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the big picture, directory map, boot sequence.
- [`docs/MESSAGE-ENGINE.md`](docs/MESSAGE-ENGINE.md) — the message engine (the most important doc).
- [`docs/COMMANDS.md`](docs/COMMANDS.md) — adding commands and interaction handlers.
- [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) — coding conventions, `custom_id` format, env vars.
- [`AGENTS.md`](AGENTS.md) — orientation for AI agents: where everything is and how to use it.
- [`docs/TEMPLATE-ANALYSIS.md`](docs/TEMPLATE-ANALYSIS.md) — what we started from and why we restructured.
