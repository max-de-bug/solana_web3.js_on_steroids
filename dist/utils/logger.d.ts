/**
 * Simple Logger utility to provide consistent prefixed logging.
 */
export declare class Logger {
    private prefix;
    private enabled;
    constructor(prefix: string, enabled?: boolean);
    log(level: 'info' | 'warn' | 'error', ...args: any[]): void;
    info(...args: any[]): void;
    warn(...args: any[]): void;
    error(...args: any[]): void;
    setEnabled(enabled: boolean): void;
}
