# Moderation Module

Module 1 implements slash-command moderation on top of the project command
framework and Components V2 message engine.

## Implemented

- Punishments: `/ban`, `/unban`, `/kick`, `/timeout`, `/remove-timeout`, `/warn`.
- Warning tools: `/warnings`, `/clear-warnings`.
- Message cleanup: `/purge` with amount, user, bot, and link filters.
- Channel tools: `/lock-channel`, `/unlock-channel`, `/slowmode`.
- Member tools: `/nickname-reset`, `/role add`, `/role remove`.
- History and staff context: `/case-history`, `/mod-note add|list|clear`.
- Settings: `/mod-logs`, `/mute-system`, `/appeal-link`.
- Bulk actions: `/mass-ban`, `/mass-timeout`.
- Temporary tools: optional ban duration on `/ban`, `/temporary-role add|remove`.

## Notes

All responses, DMs, and log messages are `MessageTemplate`s rendered by the
engine. The module does not request message-content or reaction intents; link
purges only match content that Discord makes available to the bot.
