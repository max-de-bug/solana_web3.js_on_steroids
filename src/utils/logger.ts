/**
 * Simple Logger utility to provide consistent prefixed logging.
 */
export class Logger {
  constructor(
    private prefix: string,
    private enabled: boolean = false
  ) {}

  public log(level: 'info' | 'warn' | 'error', ...args: any[]): void {
    if (!this.enabled) return;

    const formattedPrefix = `[${this.prefix}]`;
    const finalArgs = [...args];
    
    if (typeof finalArgs[0] === 'string') {
      finalArgs[0] = `${formattedPrefix} ${finalArgs[0]}`;
    } else {
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
}
