/**
 * Gateway event dispatcher. Maps a small set of discord.js gateway events to
 * application handlers (see {@link registerEvents}).
 */
export { registerEvents, type EventBindings } from './dispatcher.js';
