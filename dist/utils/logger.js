const LOG_LEVEL_PRIORITY = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
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
export class Logger {
    prefix;
    enabled;
    minLevel;
    constructor(prefix, enabled = false, level = 'info') {
        this.prefix = prefix;
        this.enabled = enabled;
        this.minLevel = LOG_LEVEL_PRIORITY[level];
    }
    log(level, ...args) {
        if (!this.enabled)
            return;
        if (LOG_LEVEL_PRIORITY[level] < this.minLevel)
            return;
        const timestamp = new Date().toISOString().slice(11, 23); // HH:mm:ss.SSS
        const formattedPrefix = `[${timestamp}] [${this.prefix}]`;
        const finalArgs = [...args];
        if (typeof finalArgs[0] === 'string') {
            finalArgs[0] = `${formattedPrefix} ${finalArgs[0]}`;
        }
        else {
            finalArgs.unshift(formattedPrefix);
        }
        switch (level) {
            case 'debug':
                console.debug(...finalArgs);
                break;
            case 'info':
                console.log(...finalArgs);
                break;
            case 'warn':
                console.warn(...finalArgs);
                break;
            case 'error':
                console.error(...finalArgs);
                break;
        }
    }
    debug(...args) {
        this.log('debug', ...args);
    }
    info(...args) {
        this.log('info', ...args);
    }
    warn(...args) {
        this.log('warn', ...args);
    }
    error(...args) {
        this.log('error', ...args);
    }
    setEnabled(enabled) {
        this.enabled = enabled;
    }
    setLevel(level) {
        this.minLevel = LOG_LEVEL_PRIORITY[level];
    }
}
//# sourceMappingURL=logger.js.map