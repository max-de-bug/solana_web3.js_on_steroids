/**
 * Log levels ordered by verbosity.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
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
  private minLevel: number;

  constructor(
    private prefix: string,
    private enabled: boolean = false,
    level: LogLevel = 'info'
  ) {
    this.minLevel = LOG_LEVEL_PRIORITY[level];
  }

  public log(level: LogLevel, ...args: any[]): void {
    if (!this.enabled) return;
    if (LOG_LEVEL_PRIORITY[level] < this.minLevel) return;

    const timestamp = new Date().toISOString().slice(11, 23); // HH:mm:ss.SSS
    const formattedPrefix = `[${timestamp}] [${this.prefix}]`;
    const finalArgs = [...args];

    if (typeof finalArgs[0] === 'string') {
      finalArgs[0] = `${formattedPrefix} ${finalArgs[0]}`;
    } else {
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

  public debug(...args: any[]): void {
    this.log('debug', ...args);
  }

  public info(...args: any[]): void {
    this.log('info', ...args);
  }

  public warn(...args: any[]): void {
    this.log('warn', ...args);
  }

  public error(...args: any[]): void {
    this.log('error', ...args);
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public setLevel(level: LogLevel): void {
    this.minLevel = LOG_LEVEL_PRIORITY[level];
  }
}
