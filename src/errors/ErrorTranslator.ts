import { SteroidError, ErrorCode, ErrorCategory } from './SteroidError.js';

/**
 * Pattern definition for error matching
 */
interface ErrorPattern {
  patterns: (string | RegExp)[];
  code: ErrorCode;
  category: ErrorCategory;
  userMessage: string;
  suggestion: string;
}

/**
 * Error translation patterns ordered by priority.
 * More specific patterns should come first.
 */
const ERROR_PATTERNS: ErrorPattern[] = [
  // === USER REJECTION (highest priority) ===
  {
    patterns: ['user rejected', 'user denied', 'user cancelled', 'rejected the request'],
    code: ErrorCode.USER_REJECTED,
    category: ErrorCategory.WALLET,
    userMessage: 'Transaction cancelled',
    suggestion: 'Click approve in your wallet to confirm the transaction',
  },

  // === WALLET ERRORS ===
  {
    patterns: ['wallet not connected', 'wallet is not connected', 'not connected'],
    code: ErrorCode.NOT_CONNECTED,
    category: ErrorCategory.WALLET,
    userMessage: 'Wallet not connected',
    suggestion: 'Connect your wallet to continue',
  },
  {
    patterns: ['network mismatch', 'wrong network', 'incorrect network'],
    code: ErrorCode.NETWORK_MISMATCH,
    category: ErrorCategory.WALLET,
    userMessage: 'Wrong network selected',
    suggestion: 'Switch to the correct network in your wallet',
  },

  // === INSUFFICIENT FUNDS ===
  {
    patterns: ['insufficient funds', 'insufficient balance', '0x1', 'not enough sol', 'insufficient lamports'],
    code: ErrorCode.INSUFFICIENT_FUNDS,
    category: ErrorCategory.TRANSACTION,
    userMessage: 'Not enough SOL for this transaction',
    suggestion: 'Add more SOL to your wallet to cover the transaction and fees',
  },

  // === BLOCKHASH EXPIRED ===
  {
    patterns: ['blockhash not found', 'blockhash expired', 'block height exceeded', 'blockheight exceeded'],
    code: ErrorCode.BLOCKHASH_EXPIRED,
    category: ErrorCategory.TRANSACTION,
    userMessage: 'Transaction expired',
    suggestion: 'Try again - the network was busy',
  },

  // === SLIPPAGE (DEX-specific) ===
  {
    patterns: ['slippage', 'exceeds desired slippage', '0x26', '0x1771', 'price impact too high'],
    code: ErrorCode.SLIPPAGE_EXCEEDED,
    category: ErrorCategory.PROGRAM,
    userMessage: 'Price moved too much',
    suggestion: 'Increase slippage tolerance or reduce trade size',
  },

  // === ACCOUNT NOT FOUND ===
  {
    patterns: ['accountnotfound', 'account not found', 'account does not exist'],
    code: ErrorCode.ACCOUNT_NOT_FOUND,
    category: ErrorCategory.PROGRAM,
    userMessage: "Account doesn't exist",
    suggestion: 'Verify the address is correct and the account exists',
  },

  // === SIMULATION FAILED ===
  {
    patterns: ['simulation failed', 'transaction simulation failed', 'preflight'],
    code: ErrorCode.SIMULATION_FAILED,
    category: ErrorCategory.TRANSACTION,
    userMessage: 'Transaction would fail',
    suggestion: 'Check your balances and transaction parameters, then try again',
  },

  // === RATE LIMITING ===
  {
    patterns: ['rate limit', '429', 'too many requests', 'request limit'],
    code: ErrorCode.RATE_LIMITED,
    category: ErrorCategory.NETWORK,
    userMessage: 'Too many requests',
    suggestion: 'Wait a moment and try again',
  },

  // === TIMEOUT ===
  {
    patterns: ['timeout', 'timed out', 'deadline exceeded'],
    code: ErrorCode.REQUEST_TIMEOUT,
    category: ErrorCategory.NETWORK,
    userMessage: 'Request timed out',
    suggestion: 'Check your connection and try again',
  },

  // === CONNECTION ERRORS ===
  {
    patterns: ['connection', 'network error', 'fetch failed', 'econnrefused', 'enotfound', 'network request failed'],
    code: ErrorCode.CONNECTION_FAILED,
    category: ErrorCategory.NETWORK,
    userMessage: 'Network connection issue',
    suggestion: 'Check your internet connection and try again',
  },

  // === SIGNATURE VERIFICATION ===
  {
    patterns: ['signature verification', 'invalid signature', 'failed to verify'],
    code: ErrorCode.SIGNATURE_VERIFICATION_FAILED,
    category: ErrorCategory.TRANSACTION,
    userMessage: 'Signature verification failed',
    suggestion: 'Try signing the transaction again',
  },

  // === PROGRAM ERRORS (generic) ===
  {
    patterns: ['program error', 'custom program error', /custom program error: (0x)?[0-9a-f]+/i],
    code: ErrorCode.PROGRAM_ERROR,
    category: ErrorCategory.PROGRAM,
    userMessage: 'Program execution failed',
    suggestion: 'The transaction could not be processed. Try again or contact support',
  },
];

/**
 * Translates raw Solana errors into user-friendly SteroidErrors.
 */
export class ErrorTranslator {
  /**
   * Translates an error into a SteroidError with user-friendly messaging.
   * @param error - The original error to translate
   * @param context - Optional additional context
   * @returns A SteroidError with actionable information
   */
  public static translate(
    error: unknown,
    context?: Record<string, unknown>
  ): SteroidError {
    // Already a SteroidError, return as-is
    if (SteroidError.isSteroidError(error)) {
      return error;
    }

    const errorMessage = ErrorTranslator.extractErrorMessage(error);
    const lowerMessage = errorMessage.toLowerCase();

    // Find matching pattern
    for (const pattern of ERROR_PATTERNS) {
      const isMatch = pattern.patterns.some((p) => {
        if (typeof p === 'string') {
          return lowerMessage.includes(p.toLowerCase());
        }
        return p.test(errorMessage);
      });

      if (isMatch) {
        return new SteroidError({
          code: pattern.code,
          category: pattern.category,
          userMessage: pattern.userMessage,
          suggestion: pattern.suggestion,
          originalError: error,
          context,
        });
      }
    }

    // No pattern matched - return unknown error
    return new SteroidError({
      code: ErrorCode.UNKNOWN,
      category: ErrorCategory.SYSTEM,
      userMessage: 'Something went wrong',
      suggestion: 'Please try again. If the problem persists, contact support',
      originalError: error,
      context,
    });
  }

  /**
   * Extracts a string message from various error types
   */
  private static extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      // Check for nested error messages (common in Solana errors)
      const anyError = error as any;
      if (anyError.logs?.length) {
        return `${error.message} | ${anyError.logs.join(' ')}`;
      }
      if (anyError.data?.logs?.length) {
        return `${error.message} | ${anyError.data.logs.join(' ')}`;
      }
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    if (typeof error === 'object' && error !== null) {
      const obj = error as Record<string, unknown>;
      if ('message' in obj && typeof obj.message === 'string') {
        return obj.message;
      }
      return JSON.stringify(error);
    }

    return String(error);
  }

  /**
   * Creates a SteroidError for insufficient funds
   */
  public static insufficientFunds(requiredAmount?: number): SteroidError {
    const suggestion = requiredAmount
      ? `Add at least ${requiredAmount / 1_000_000_000} SOL to your wallet`
      : 'Add more SOL to your wallet to cover the transaction and fees';

    return new SteroidError({
      code: ErrorCode.INSUFFICIENT_FUNDS,
      category: ErrorCategory.TRANSACTION,
      userMessage: 'Not enough SOL for this transaction',
      suggestion,
    });
  }

  /**
   * Creates a SteroidError for user rejection
   */
  public static userRejected(): SteroidError {
    return new SteroidError({
      code: ErrorCode.USER_REJECTED,
      category: ErrorCategory.WALLET,
      userMessage: 'Transaction cancelled',
      suggestion: 'Click approve in your wallet to confirm the transaction',
    });
  }

  /**
   * Creates a SteroidError for expired blockhash
   */
  public static blockhashExpired(): SteroidError {
    return new SteroidError({
      code: ErrorCode.BLOCKHASH_EXPIRED,
      category: ErrorCategory.TRANSACTION,
      userMessage: 'Transaction expired',
      suggestion: 'Try again - the network was busy',
    });
  }

  /**
   * Creates a SteroidError for rate limiting
   */
  public static rateLimited(): SteroidError {
    return new SteroidError({
      code: ErrorCode.RATE_LIMITED,
      category: ErrorCategory.NETWORK,
      userMessage: 'Too many requests',
      suggestion: 'Wait a moment and try again',
    });
  }

  /**
   * Creates a SteroidError for simulation failures
   */
  public static simulationFailed(details?: string): SteroidError {
    return new SteroidError({
      code: ErrorCode.SIMULATION_FAILED,
      category: ErrorCategory.TRANSACTION,
      userMessage: 'Transaction would fail',
      suggestion: 'Check your balances and transaction parameters, then try again',
      context: details ? { details } : undefined,
    });
  }
}
