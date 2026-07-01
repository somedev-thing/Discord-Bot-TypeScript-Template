# CLAUDE.md

Guidance for Claude Code when working in this repository. For a fuller
orientation (every custom API + where it lives), read [`AGENTS.md`](AGENTS.md).

## Project overview

`vye-bot` — a closed-source, multi-server Discord bot. TypeScript (strict) + ESM,
Node ≥ 20, discord.js **Components V2**, Postgres (Drizzle), Redis (ioredis).
Slash + context-menu commands only. **No** AI/LLM, **no** music/voice, **no** web
dashboard. Single process, sharding-ready.

## The rule that overrides everything

**All messages go through the message engine.** Never import a discord.js
_component_ builder (`ContainerBuilder`, `TextDisplayBuilder`, `ButtonBuilder`,
`ActionRowBuilder`, …) outside `src/core/engine/renderer.ts`. Build a
`MessageTemplate` and send it via `sendTemplate` / `editTemplate` /
`updateTemplate`. (`SlashCommandBuilder` / `ContextMenuCommandBuilder` are fine —
they are command builders, not component builders.)

## Essential commands

```bash
npm install
cp .env.example .env            # fill in DISCORD_TOKEN, DISCORD_CLIENT_ID, DATABASE_URL, REDIS_URL
npm run dev                     # run in watch mode (tsx)
npm start                       # build + run

npm run typecheck               # tsc --noEmit
npm run lint / lint:fix
npm run format / format:fix
npm test                        # vitest

npm run commands:register:guild # instant guild registration (needs DEV_GUILD_ID)
npm run commands:register       # global (slow to propagate)
npm run commands:view / :clear

npm run db:generate / db:migrate / db:push / db:studio
```

## Architecture (short)

```
src/core/      framework: engine, commands, config, db, cache, events, client, logger, errors
src/modules/   feature modules — empty; new features go here
src/commands/  demo commands (ping, engine-demo, template-demo)
src/start-bot.ts  boot;  src/register-commands.ts  command CLI
docs/          ARCHITECTURE, MESSAGE-ENGINE, COMMANDS, CONVENTIONS, TEMPLATE-ANALYSIS
```

- **Config**: `src/core/config` — zod-validated env; the only reader of
  `process.env`. Import `config`, never `process.env`.
- **DB/Redis**: required; connected at boot (fail-fast). Use `getDb()` / `getCache()`.
- **Commands**: define a `ChatCommand` / `MessageCommand` / `UserCommand` and a
  `ComponentHandler`; the router dispatches, enforces cooldowns, and renders
  friendly errors. `custom_id` format is `namespace:action:...args`.
- **Boot**: `installGlobalErrorHandlers` → connect DB+Redis → client → registries
  → router → events → login. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Conventions

- TypeScript strict; no `any` in public APIs. ESM with explicit `.js` import
  specifiers. Prettier (4-space, single quotes) + typed ESLint. Avoid apostrophes
  in string literals (Prettier/ESLint quote conflict) or reword.
- Feature code lives in `src/modules/<feature>/`; re-export Drizzle tables from
  `src/core/db/schema/index.ts`.
- Before finishing: `npm run typecheck && npm run lint && npm run format` must pass.
- Keep `.env.example` and `docs/` in sync with the code. `.env` is gitignored —
  never commit secrets.

## Adding features

- **Command**: create in `src/modules/<feature>/`, add to the exported `commands`
  array, run `commands:register:guild`. See [`docs/COMMANDS.md`](docs/COMMANDS.md).
- **New message block type**: extend `ir.ts` → `validator.ts` → `renderer.ts` →
  docs → tests. See [`docs/MESSAGE-ENGINE.md`](docs/MESSAGE-ENGINE.md).
