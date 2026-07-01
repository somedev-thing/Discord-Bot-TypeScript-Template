/**
 * CLI entry point for registering / viewing / clearing application commands.
 *
 * Usage (via npm scripts):
 *   npm run commands:view              # list globally-registered commands
 *   npm run commands:register          # register globally
 *   npm run commands:register:guild    # register to DEV_GUILD_ID (instant)
 *   npm run commands:clear             # clear global commands
 *   npm run commands:clear:guild       # clear DEV_GUILD_ID commands
 *
 * Raw: tsx src/register-commands.ts <view|register|clear> [global|guild]
 */
import { commands } from './commands/index.js';
import {
    clearCommands,
    registerCommands,
    type RegistrationScope,
    viewCommands,
} from './core/commands/index.js';
import { toError } from './core/errors.js';
import { logger } from './core/logger.js';

async function main(): Promise<void> {
    const action = process.argv[2] ?? 'view';
    const scope: RegistrationScope = process.argv[3] === 'guild' ? 'guild' : 'global';
    const bodies = commands.map(command => command.data);

    switch (action) {
        case 'register':
            await registerCommands(bodies, scope);
            break;
        case 'clear':
            await clearCommands(scope);
            break;
        case 'view': {
            const remote = await viewCommands(scope);
            logger.info(
                { scope, commands: remote.map(command => command.name) },
                'Currently registered commands'
            );
            break;
        }
        default:
            logger.error(`Unknown action '${action}'. Use: view | register | clear [global|guild]`);
            process.exitCode = 1;
    }
}

main().catch(error => {
    logger.error({ err: toError(error) }, 'Command registration failed');
    process.exitCode = 1;
});
