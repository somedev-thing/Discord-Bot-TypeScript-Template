# Commands & Interactions

The command framework lives in `src/core/commands/` and is re-exported from
`src/core/commands/index.js`. It handles slash commands, context-menu commands,
autocomplete, cooldowns, and routing of component (button/select) and modal
interactions.

The demo commands in `src/commands/` are working examples — read them alongside
this doc.

## Anatomy of a command

A command is an object implementing one of the `Command` types (`ChatCommand`,
`MessageCommand`, `UserCommand`). It has:

- **`kind`** — `'chat' | 'message' | 'user'`.
- **`data`** — the registration payload (name/description/options/type). Build it
  with discord.js `SlashCommandBuilder` / `ContextMenuCommandBuilder` — those are
  *command* builders, not *component* builders, so they're allowed anywhere.
- **`cooldown?`** — `{ uses, seconds }` per-user rate limit.
- **`execute(interaction)`** — the handler. Build a `MessageTemplate` and send it
  via the engine.
- Chat commands may also have **`autocomplete?`** and **`subcommands?`**.

## Add a slash command

```ts
// src/modules/example/hello.ts
import { type ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

import type { ChatCommand } from '../../core/commands/index.js';
import { type MessageTemplate, sendTemplate } from '../../core/engine/index.js';

export const hello: ChatCommand = {
    kind: 'chat',
    cooldown: { uses: 3, seconds: 10 },
    data: new SlashCommandBuilder()
        .setName('hello')
        .setDescription('Say hello')
        .addStringOption(o => o.setName('name').setDescription('Who to greet'))
        .toJSON(),

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const name = interaction.options.getString('name') ?? interaction.user.username;
        const template: MessageTemplate = {
            blocks: [{ type: 'text', content: `Hello, **${name}**!` }],
        };
        await sendTemplate(interaction, template, {}, { ephemeral: true });
    },
};
```

Then add it to the exported list (for now, `src/commands/index.ts`; feature
modules will export their own and be aggregated):

```ts
export const commands: Command[] = [ping, engineDemo, templateDemo, hello];
```

Finally register with Discord: `npm run commands:register:guild` (dev) or
`npm run commands:register` (global).

## Subcommands

Provide a `subcommands` map and the router dispatches by
`interaction.options.getSubcommand()`, falling back to `execute`:

```ts
export const settings: ChatCommand = {
    kind: 'chat',
    data: new SlashCommandBuilder()
        .setName('settings')
        .setDescription('Manage settings')
        .addSubcommand(s => s.setName('view').setDescription('View settings'))
        .addSubcommand(s => s.setName('reset').setDescription('Reset settings'))
        .toJSON(),
    async execute() {}, // fallback (e.g. no subcommand)
    subcommands: {
        async view(interaction) { /* … */ },
        async reset(interaction) { /* … */ },
    },
};
```

## Autocomplete

```ts
export const search: ChatCommand = {
    kind: 'chat',
    data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('Search')
        .addStringOption(o => o.setName('q').setDescription('Query').setAutocomplete(true))
        .toJSON(),
    async execute(interaction) { /* … */ },
    async autocomplete(interaction, focused) {
        const results = await lookup(String(focused.value));
        return results.map(r => ({ name: r.label, value: r.id })); // router slices to 25
    },
};
```

## Context-menu commands

```ts
import { ApplicationCommandType, ContextMenuCommandBuilder } from 'discord.js';
import type { MessageCommand } from '../../core/commands/index.js';

export const report: MessageCommand = {
    kind: 'message',
    data: new ContextMenuCommandBuilder()
        .setName('Report Message')
        .setType(ApplicationCommandType.Message)
        .toJSON(),
    async execute(interaction) {
        // interaction.targetMessage is available
        await sendTemplate(interaction, someTemplate, {}, { ephemeral: true });
    },
};
```

Use `kind: 'user'` and `ApplicationCommandType.User` for a user context menu
(`interaction.targetUser`).

## Component & modal interactions (buttons, selects, modals)

Interactive components are routed by their `custom_id` **namespace** to a
`ComponentHandler`.

```ts
import type { ComponentHandler } from '../../core/commands/index.js';
import { updateTemplate } from '../../core/engine/index.js';

export const exampleComponents: ComponentHandler = {
    namespace: 'example',
    async execute(interaction, id) {
        // id = { namespace, action, args, raw }
        if (!interaction.isMessageComponent()) return; // ignore modal submits here
        if (id.action === 'refresh') {
            await updateTemplate(interaction, buildTemplate({ page: Number(id.args[0]) }));
        }
    },
};
```

Register the handler in the component list (currently
`src/commands/index.ts` → `componentHandlers`). Build the matching `custom_id`
with the helper:

```ts
import { customId } from '../../core/commands/index.js';
// in a template:
{ type: 'button', style: 'primary', label: 'Next', customId: customId('example', 'refresh', '2') }
```

## The `custom_id` convention

```
<namespace>:<action>[:<arg>...]
```

- **namespace** — routes to a `ComponentHandler` (usually the module/feature name).
- **action** — what to do (`'refresh'`, `'delete'`, …).
- **args** — optional positional strings.

Build with `customId(namespace, action, ...args)` and read with
`parseCustomId(raw)`. Parts are joined with `:` and must not contain `:`. The
whole string must be ≤ 100 chars (the engine validator enforces this). For state
larger than a few ids, store it in Postgres/Redis and put a key in the args.

## Cooldowns

Set `cooldown: { uses, seconds }` on a command. The router checks it per user and,
when exceeded, replies with a friendly (engine-rendered) "slow down" notice. No
cooldown field = no limit.

## Error handling

Every command/handler runs inside the router's `try/catch`. On an unexpected
throw, the router logs the error (with the interaction id as a reference) and
sends the user a themed error message through the engine. You generally don't need
your own top-level try/catch — throw and let the router report it.

## Registration: guild vs global

| | Guild (`:guild`) | Global |
| --- | --- | --- |
| Speed | Instant | Up to ~1 hour |
| Scope | One `DEV_GUILD_ID` server | Every server |
| Use for | Development | Production |

`registerCommands` does a bulk overwrite (idempotent PUT). `npm run commands:view`
lists what's registered; `commands:clear` removes them.
