/**
 * Error categories for routing and handling
 */
export enum ErrorCategory {
  /** Transaction-related errors (send, confirm, simulate) */
  TRANSACTION = 'TRANSACTION',
  /** Wallet-related errors (connection, signing) */
  WALLET = 'WALLET',
  /** Network/RPC-related errors (connection, timeout) */
  NETWORK = 'NETWORK',
  /** On-chain program errors (custom program codes) */
  PROGRAM = 'PROGRAM',
  /** System-level errors (unknown, internal) */
  SYSTEM = 'SYSTEM',
}

/**
 * Specific error codes for programmatic handling
 */
export enum ErrorCode {
  // Transaction errors
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  BLOCKHASH_EXPIRED = 'BLOCKHASH_EXPIRED',
  SIMULATION_FAILED = 'SIMULATION_FAILED',
  TRANSACTION_TIMEOUT = 'TRANSACTION_TIMEOUT',
  SIGNATURE_VERIFICATION_FAILED = 'SIGNATURE_VERIFICATION_FAILED',

  // Wallet errors
  USER_REJECTED = 'USER_REJECTED',
  NOT_CONNECTED = 'NOT_CONNECTED',
  NETWORK_MISMATCH = 'NETWORK_MISMATCH',
  UNSUPPORTED_OPERATION = 'UNSUPPORTED_OPERATION',

  // Network errors
  RPC_ERROR = 'RPC_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  REQUEST_TIMEOUT = 'REQUEST_TIMEOUT',

  // Program errors
  ACCOUNT_NOT_FOUND = 'ACCOUNT_NOT_FOUND',
  SLIPPAGE_EXCEEDED = 'SLIPPAGE_EXCEEDED',
  PROGRAM_ERROR = 'PROGRAM_ERROR',
  CUSTOM_PROGRAM_ERROR = 'CUSTOM_PROGRAM_ERROR',

  // System errors
  UNKNOWN = 'UNKNOWN',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * Options for creating a SteroidError
 */
export interface SteroidErrorOptions {
  code: ErrorCode;
  category: ErrorCategory;
  userMessage: string;
  suggestion: string;
  originalError?: Error | unknown;
  context?: Record<string, unknown>;
}

/**
 * Unified error class for the Steroid library.
 * Provides user-friendly messages and actionable suggestions.
 */
export class SteroidError extends Error {
  /** Machine-readable error code */
  public readonly code: ErrorCode;

  /** Error category for routing */
  public readonly category: ErrorCategory;

  /** Human-friendly message for end users */
  public readonly userMessage: string;

  /** Actionable suggestion to resolve the issue */
  public readonly suggestion: string;

  /** Preserved original error for debugging */
  public readonly originalError?: Error | unknown;

  /** Additional context information */
  public readonly context?: Record<string, unknown>;

  constructor(options: SteroidErrorOptions) {
    super(options.userMessage);
    this.name = 'SteroidError';
    this.code = options.code;
    this.category = options.category;
    this.userMessage = options.userMessage;
    this.suggestion = options.suggestion;
    this.originalError = options.originalError;
    this.context = options.context;

    // Maintain proper stack trace (V8 specific)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SteroidError);
    }
  }

  /**
   * Returns a formatted string with user message and suggestion
   */
  public toUserFriendlyString(): string {
    return `${this.userMessage}\n💡 ${this.suggestion}`;
  }

  /**
   * Returns a detailed string for debugging
   */
  public toDebugString(): string {
    const original = this.originalError instanceof Error
      ? this.originalError.message
      : String(this.originalError);

    return [
      `[${this.category}] ${this.code}: ${this.userMessage}`,
      `Suggestion: ${this.suggestion}`,
      this.context ? `Context: ${JSON.stringify(this.context)}` : null,
      `Original: ${original}`,
    ].filter(Boolean).join('\n');
  }

  /**
   * Checks if an error is a SteroidError
   */
  public static isSteroidError(error: unknown): error is SteroidError {
    return error instanceof SteroidError;
  }
}
