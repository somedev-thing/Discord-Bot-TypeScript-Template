# The Message Engine

The engine is the **only** way this bot builds and sends messages. It is a small,
declarative layer on top of discord.js **Components V2**. Feature code describes a
message as data (an intermediate representation, "IR") and the engine turns that
into discord.js builders, validates it against Discord's limits, assigns component
ids, substitutes placeholders, and always sets the `IsComponentsV2` flag.

> **The rule:** never import a discord.js component builder (`ContainerBuilder`,
> `TextDisplayBuilder`, `ButtonBuilder`, …) outside `src/core/engine/renderer.ts`.
> If you need something the IR can't express, extend the IR and the renderer —
> don't reach around the engine.

Everything lives in `src/core/engine/` and is re-exported from
`src/core/engine/index.ts`.

## Quick start

```ts
import { sendTemplate, type MessageTemplate } from '../core/engine/index.js';

const template: MessageTemplate = {
    theme: 'success',
    blocks: [
        {
            type: 'container',
            accent: 'success',
            children: [{ type: 'text', content: '# Hi {user.name}!' }],
        },
    ],
};

await sendTemplate(interaction, template, { user: { name: 'Ada' } });
```

## Public API

| Symbol | What it does |
| --- | --- |
| `render(template, ctx?, opts?)` | IR → `{ components, flags }`. Validates + builds. |
| `sendTemplate(target, template, ctx?, opts?)` | Reply to an interaction / follow up / send to a channel. |
| `editTemplate(target, template, ctx?, opts?)` | Edit the bot's reply (`editReply`) or a `Message` (`edit`). |
| `updateTemplate(componentIntr, template, ctx?, opts?)` | Update the message a button/select came from, in place. |
| `defineTemplate(name, factory)` | Register a reusable, named template factory. |
| `getTemplate(name)` / `listTemplates()` | Look up / list registered templates. |
| `defineTheme(theme)` / `getTheme` / `requireTheme` / `listThemes` | Manage themes. |
| `resolveColor(theme, color)` | Resolve a color token to an RGB int. |
| `resolveText(text, ctx?, opts?)` | Standalone `{placeholder}` substitution. |
| `validate(template)` | Throw `TemplateValidationError` if a template breaks a V2 limit. |
| `V2Limits`, `IS_COMPONENTS_V2_FLAG` | The enforced limits and the flag value. |
| Types | `MessageTemplate`, `Block`, `ContainerChild`, `Interactive`, `Accessory`, `RenderContext`, … |

`ctx` is a `RenderContext` (values for `{placeholder}`s). `opts` is
`{ defaultTheme?, missing?, ephemeral?, files? }` depending on the function.

## The IR: block reference

A `MessageTemplate` is `{ theme?: string; blocks: Block[] }`. `blocks` is the
message's top-level list. Here is every block, with an example.

### `text` — a Text Display

Markdown text. This is the workhorse block.

```ts
{ type: 'text', content: '# Title\nSome **markdown** body with {placeholders}.' }
```

### `section` — text with a trailing accessory

1–3 lines of text with a button **or** a thumbnail to the right.

```ts
// Thumbnail accessory
{
    type: 'section',
    text: ['**Left text**', 'A second line.'],
    accessory: { kind: 'thumbnail', url: 'https://…/img.png', description: 'alt text' },
}

// Button accessory
{
    type: 'section',
    text: ['**Left text**'],
    accessory: { kind: 'button', button: { style: 'link', label: 'Open', url: 'https://…' } },
}
```

### `container` — a grouped, accent-colored box

Holds up to 10 child blocks (any block **except another container**). Optional
accent color bar and spoiler blur.

```ts
{
    type: 'container',
    accent: 'success',      // number | hex string | palette name; omit for theme default
    spoiler: false,
    children: [
        { type: 'text', content: 'Inside a container.' },
        { type: 'separator' },
    ],
}
```

### `separator` — a divider / spacer

```ts
{ type: 'separator', divider: true, spacing: 'large' } // divider defaults true, spacing 'small'
```

### `media` — an image gallery

1–10 images.

```ts
{
    type: 'media',
    items: [
        { url: 'https://…/a.png', description: 'A' },
        { url: 'https://…/b.png', spoiler: true },
    ],
}
```

### `file` — an uploaded file

The `url` must be an `attachment://<filename>` reference; supply the actual file
via the `files` send option.

```ts
// template
{ type: 'file', url: 'attachment://report.txt' }

// send call
await sendTemplate(interaction, template, {}, {
    files: [{ attachment: Buffer.from('hello'), name: 'report.txt' }],
});
```

### `actions` — a row of interactive components

Up to **5 buttons**, or exactly **1 select** (they can't mix in one row).

```ts
// Buttons
{
    type: 'actions',
    components: [
        { type: 'button', style: 'primary', label: 'Go', customId: 'demo:go' },
        { type: 'button', style: 'danger', label: 'Delete', customId: 'demo:del:42' },
        { type: 'button', style: 'link', label: 'Docs', url: 'https://…' },
    ],
}

// Select
{
    type: 'actions',
    components: [
        {
            type: 'select',
            customId: 'demo:pick',
            placeholder: 'Choose…',
            minValues: 1,
            maxValues: 1,
            options: [
                { label: 'One', value: '1', description: 'first', default: true },
                { label: 'Two', value: '2', emoji: '2️⃣' },
            ],
        },
    ],
}
```

Button styles: `'primary' | 'secondary' | 'success' | 'danger' | 'link'`. A
`link` button needs `url` and no `customId`; every other style needs a `customId`
(and no `url`). `customId`s follow the [routing convention](COMMANDS.md#the-custom_id-convention).

## Templating (`{placeholder}`)

Any text is scanned for `{name}` / `{dotted.path}` tokens and resolved against the
`RenderContext`:

1. **direct key** — `context['user.name']`, then
2. **dotted path** — `context.user.name`.

Only `[A-Za-z0-9_.]` is allowed inside braces; nothing is ever evaluated as code.

```ts
resolveText('Hi {user.name}, {count} new', { user: { name: 'Ada' }, count: 3 });
// 'Hi Ada, 3 new'
```

Unresolved tokens are left as-is by default (`missing: 'keep'`) so the gap is
obvious during development; pass `missing: 'empty'` to blank them instead.
Commands typically build a context like:

```ts
const ctx = {
    user: { id: i.user.id, name: i.user.username, mention: `<@${i.user.id}>` },
    guild: i.guild ? { id: i.guild.id, name: i.guild.name } : { name: 'DM' },
};
```

## Themes

A theme is `{ name, accent, palette }`. `accent` is the default container accent;
`palette` maps names (e.g. `success`) to RGB ints. Built-in themes: `default`,
`success`, `danger`, `warning`, `info`. A template's `theme` (or the
`DEFAULT_THEME` env / `defaultTheme` render option) selects one.

A container `accent` may be:

- a number — `0x5865f2`,
- a hex string — `'#5865f2'` (3- or 6-digit),
- a palette/semantic name — `'success'`, or
- omitted — uses the theme's default accent.

Register your own:

```ts
import { defineTheme } from '../core/engine/index.js';
defineTheme({ name: 'brand', accent: 0xff8800, palette: { highlight: 0xffcc00 } });
```

## Template registry

`defineTemplate` registers a reusable factory and returns it callable:

```ts
export const welcome = defineTemplate('welcome', (p: { name: string }) => ({
    theme: 'success',
    blocks: [{ type: 'text', content: `Welcome, ${p.name}!` }],
}));

await sendTemplate(channel, welcome({ name: 'Ada' }));
```

The `defineTemplate` call registers by name as a side effect, so importing the
module that defines a template is enough to register it.

## Enforced Discord limits

The validator runs on every render (after placeholder substitution, so character
counts are accurate) and throws `TemplateValidationError` listing **all** problems
at once. Current limits (`src/core/engine/limits.ts`):

| Limit | Value |
| --- | --- |
| Total components per message (nested counted) | 40 |
| Top-level blocks | 10 |
| Total text across all Text Displays | 4000 chars |
| Children per container | 10 |
| Container nesting | not allowed |
| Section text lines | 1–3 |
| Media gallery items | 1–10 |
| Buttons per action row | 5 |
| Select mixing with buttons | not allowed (select is alone in its row) |
| Select options | 25 |
| Button label | 80 chars |
| `custom_id` | 100 chars |
| Select placeholder | 150 chars |
| Thumbnail / media description | 1024 chars |
| `IsComponentsV2` flag | `1 << 15` (32768) |

Source: <https://docs.discord.com/developers/components/reference>. If Discord
changes a limit, update `limits.ts` only — the validator reads nothing else.

## Component ids vs `custom_id`

Components V2 gives every component an incremental **numeric `id`** (distinct from
a button's routing `custom_id`). The renderer assigns these ids automatically and
sequentially (starting at 1, in build order including nested components) via
`setId(...)`. You never manage numeric ids yourself. You **do** choose
`custom_id`s for interactive components — see the convention in
[`COMMANDS.md`](COMMANDS.md#the-custom_id-convention).

## Sending, editing, updating

- **`sendTemplate(target, …)`** — `target` is a repliable interaction (replies, or
  follows up if already replied) or a channel (`send`).
- **`editTemplate(target, …)`** — edit the bot's own interaction reply, or a
  concrete `Message`.
- **`updateTemplate(componentInteraction, …)`** — from a button/select handler,
  re-render the source message in place.

> **Why no deferral?** The `IsComponentsV2` flag cannot be attached at
> `deferReply` time (Discord only allows `Ephemeral` there). So the framework
> replies **directly** rather than deferring. If a command needs >3s of work,
> handle that explicitly; the demo commands reply immediately.

## How to add a new block type

1. **IR** — add the block interface to `src/core/engine/ir.ts` and include it in
   the `Block` union (and `ContainerChild` if it may nest in a container).
2. **Validator** — add a `case` in `visit()` in `validator.ts`: count its
   components, check any limits, validate sub-fields.
3. **Renderer** — add a `case` in `buildBlock()` (and `addContainerChild()` if it
   can live in a container) in `renderer.ts`, building the discord.js builder and
   calling `.setId(allocId())`. Handle placeholder substitution in `resolveBlock`
   if the block carries text.
4. **Docs** — add it to the block reference above.
5. **Test** — add a case to the engine tests and render it.

Because the IR is a discriminated union on `type`, TypeScript will point you at
every `switch` that needs a new `case`.
