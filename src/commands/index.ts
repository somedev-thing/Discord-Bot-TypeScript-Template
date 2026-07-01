/**
 * Test / demo commands.
 *
 * These exercise the message engine end-to-end. Real feature commands will live
 * in `src/modules/`, but they register the same way: add the command to
 * {@link commands} and any component handlers to {@link componentHandlers}.
 *
 * Importing this module also registers demo templates (e.g. `demo.welcome`) as a
 * side effect of the `defineTemplate` calls in the command files.
 */
import type { Command, ComponentHandler } from '../core/commands/index.js';

import { moderationCommands } from '../modules/moderation/index.js';
import { engineDemo, engineDemoHandler } from './engine-demo.js';
import { ping } from './ping.js';
import { templateDemo } from './template-demo.js';

/** All registerable commands. */
export const commands: Command[] = [ping, engineDemo, templateDemo, ...moderationCommands];

/** All component (button/select/modal) handlers, dispatched by custom_id namespace. */
export const componentHandlers: ComponentHandler[] = [engineDemoHandler];
