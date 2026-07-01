const DURATION_PART = /(\d+)\s*(weeks?|w|days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)/gi;

const SECOND = 1;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** A parsed human duration. */
export interface ParsedDuration {
    seconds: number;
    expiresAt: Date;
    label: string;
}

/** Parses compact staff durations such as `30m`, `2h`, `7d`, or `1w 2d`. */
export function parseDuration(input: string, now: Date = new Date()): ParsedDuration | undefined {
    let seconds = 0;
    let matched = false;

    for (const match of input.matchAll(DURATION_PART)) {
        const amount = Number.parseInt(match[1] ?? '0', 10);
        const unit = (match[2] ?? '').toLowerCase();
        if (!Number.isFinite(amount) || amount <= 0) {
            continue;
        }
        matched = true;
        seconds += amount * unitSeconds(unit);
    }

    if (!matched || seconds <= 0) {
        return undefined;
    }

    return {
        seconds,
        expiresAt: new Date(now.getTime() + seconds * 1000),
        label: formatDuration(seconds),
    };
}

/** Formats seconds as a compact moderation duration. */
export function formatDuration(totalSeconds: number): string {
    const parts: string[] = [];
    let remaining = Math.max(0, Math.floor(totalSeconds));
    const units: Array<[string, number]> = [
        ['w', WEEK],
        ['d', DAY],
        ['h', HOUR],
        ['m', MINUTE],
        ['s', SECOND],
    ];

    for (const [label, seconds] of units) {
        const amount = Math.floor(remaining / seconds);
        if (amount > 0) {
            parts.push(`${amount}${label}`);
            remaining -= amount * seconds;
        }
    }

    return parts.length > 0 ? parts.join(' ') : '0s';
}

function unitSeconds(unit: string): number {
    if (unit === 'w' || unit.startsWith('week')) {
        return WEEK;
    }
    if (unit === 'd' || unit.startsWith('day')) {
        return DAY;
    }
    if (unit === 'h' || unit.startsWith('hour') || unit.startsWith('hr')) {
        return HOUR;
    }
    if (unit === 'm' || unit.startsWith('min')) {
        return MINUTE;
    }
    return SECOND;
}
