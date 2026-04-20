/**
 * Log levels ordered by verbosity.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
/**
 * Lightweight, structured logger with:
 * - Configurable log levels (debug/info/warn/error)
 * - Timestamps on every line
 * - Consistent `[Component]` prefix for easy filtering
 *
 * @example
 * ```ts
 * const log = new Logger('SteroidConnection', true, 'info');
 * log.info('Connected to', endpoint);   // [19:03:12.045] [SteroidConnection] Connected to ...
 * log.debug('Raw payload', payload);    // suppressed when level is 'info'
 * ```
 */
export declare class Logger {
    private prefix;
    private enabled;
    private minLevel;
    constructor(prefix: string, enabled?: boolean, level?: LogLevel);
    log(level: LogLevel, ...args: any[]): void;
    debug(...args: any[]): void;
    info(...args: any[]): void;
    warn(...args: any[]): void;
    error(...args: any[]): void;
    setEnabled(enabled: boolean): void;
    setLevel(level: LogLevel): void;
}
