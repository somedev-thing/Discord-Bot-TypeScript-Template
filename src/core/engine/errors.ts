/**
 * Engine error types. These are intentionally independent of the rest of the
 * app (`core/errors`) so the engine stays a self-contained, easily-testable unit.
 */

/** Base class for every error the message engine throws. */
export class EngineError extends Error {
    public constructor(message: string, options?: { cause?: unknown }) {
        super(message);
        this.name = new.target.name;
        if (options?.cause !== undefined) {
            this.cause = options.cause;
        }
    }
}

/**
 * Thrown by the validator when a template would violate Discord's Components V2
 * limits or structural rules. Carries every problem found so the author can fix
 * them all at once, rather than letting the Discord API reject the message.
 */
export class TemplateValidationError extends EngineError {
    public readonly issues: readonly string[];

    public constructor(issues: string[]) {
        super(`Template failed validation:\n${issues.map(i => `  - ${i}`).join('\n')}`);
        this.issues = issues;
    }
}

/** Thrown when a template references a theme name that is not registered. */
export class UnknownThemeError extends EngineError {}
