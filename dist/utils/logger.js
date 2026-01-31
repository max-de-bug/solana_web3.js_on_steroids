/**
 * Simple Logger utility to provide consistent prefixed logging.
 */
export class Logger {
    prefix;
    enabled;
    constructor(prefix, enabled = false) {
        this.prefix = prefix;
        this.enabled = enabled;
    }
    log(level, ...args) {
        if (!this.enabled)
            return;
        const formattedPrefix = `[${this.prefix}]`;
        const finalArgs = [...args];
        if (typeof finalArgs[0] === 'string') {
            finalArgs[0] = `${formattedPrefix} ${finalArgs[0]}`;
        }
        else {
            finalArgs.unshift(formattedPrefix);
        }
        switch (level) {
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
}
//# sourceMappingURL=logger.js.map