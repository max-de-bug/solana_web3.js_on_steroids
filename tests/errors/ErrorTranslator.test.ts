import { describe, it, expect } from 'vitest';
import { 
  ErrorTranslator, 
  SteroidError, 
  ErrorCode, 
  ErrorCategory 
} from '../../src/errors/index.js';

describe('SteroidError', () => {
  describe('Construction', () => {
    it('should create a SteroidError with all properties', () => {
      const error = new SteroidError({
        code: ErrorCode.INSUFFICIENT_FUNDS,
        category: ErrorCategory.TRANSACTION,
        userMessage: 'Not enough SOL',
        suggestion: 'Add more SOL',
        originalError: new Error('original'),
        context: { amount: 1000 },
      });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(SteroidError);
      expect(error.code).toBe(ErrorCode.INSUFFICIENT_FUNDS);
      expect(error.category).toBe(ErrorCategory.TRANSACTION);
      expect(error.userMessage).toBe('Not enough SOL');
      expect(error.suggestion).toBe('Add more SOL');
      expect(error.originalError).toBeInstanceOf(Error);
      expect(error.context).toEqual({ amount: 1000 });
    });

    it('should use userMessage as the Error message', () => {
      const error = new SteroidError({
        code: ErrorCode.USER_REJECTED,
        category: ErrorCategory.WALLET,
        userMessage: 'Transaction cancelled',
        suggestion: 'Approve in wallet',
      });

      expect(error.message).toBe('Transaction cancelled');
    });
  });

  describe('Helper methods', () => {
    it('should format user-friendly string', () => {
      const error = new SteroidError({
        code: ErrorCode.RATE_LIMITED,
        category: ErrorCategory.NETWORK,
        userMessage: 'Too many requests',
        suggestion: 'Wait and retry',
      });

      const userString = error.toUserFriendlyString();
      expect(userString).toContain('Too many requests');
      expect(userString).toContain('Wait and retry');
    });

    it('should format debug string', () => {
      const error = new SteroidError({
        code: ErrorCode.BLOCKHASH_EXPIRED,
        category: ErrorCategory.TRANSACTION,
        userMessage: 'Transaction expired',
        suggestion: 'Try again',
        originalError: new Error('blockhash not found'),
        context: { attempts: 3 },
      });

      const debugString = error.toDebugString();
      expect(debugString).toContain('TRANSACTION');
      expect(debugString).toContain('BLOCKHASH_EXPIRED');
      expect(debugString).toContain('blockhash not found');
      expect(debugString).toContain('attempts');
    });

    it('should identify SteroidErrors correctly', () => {
      const steroidError = new SteroidError({
        code: ErrorCode.UNKNOWN,
        category: ErrorCategory.SYSTEM,
        userMessage: 'Something went wrong',
        suggestion: 'Try again',
      });
      const regularError = new Error('Regular error');

      expect(SteroidError.isSteroidError(steroidError)).toBe(true);
      expect(SteroidError.isSteroidError(regularError)).toBe(false);
      expect(SteroidError.isSteroidError(null)).toBe(false);
      expect(SteroidError.isSteroidError(undefined)).toBe(false);
    });
  });
});

describe('ErrorTranslator', () => {
  describe('translate', () => {
    it('should translate user rejection errors', () => {
      const originalError = new Error('User rejected the request');
      const translated = ErrorTranslator.translate(originalError);

      expect(translated.code).toBe(ErrorCode.USER_REJECTED);
      expect(translated.category).toBe(ErrorCategory.WALLET);
      expect(translated.userMessage).toBe('Transaction cancelled');
      expect(translated.suggestion).toContain('approve');
    });

    it('should translate insufficient funds errors', () => {
      const originalError = new Error('insufficient funds for rent');
      const translated = ErrorTranslator.translate(originalError);

      expect(translated.code).toBe(ErrorCode.INSUFFICIENT_FUNDS);
      expect(translated.category).toBe(ErrorCategory.TRANSACTION);
      expect(translated.userMessage).toContain('Not enough SOL');
    });

    it('should translate blockhash expired errors', () => {
      const originalError = new Error('Blockhash not found');
      const translated = ErrorTranslator.translate(originalError);

      expect(translated.code).toBe(ErrorCode.BLOCKHASH_EXPIRED);
      expect(translated.category).toBe(ErrorCategory.TRANSACTION);
      expect(translated.userMessage).toBe('Transaction expired');
    });

    it('should translate rate limit errors', () => {
      const originalError = new Error('429 Too Many Requests');
      const translated = ErrorTranslator.translate(originalError);

      expect(translated.code).toBe(ErrorCode.RATE_LIMITED);
      expect(translated.category).toBe(ErrorCategory.NETWORK);
    });

    it('should translate slippage errors', () => {
      const originalError = new Error('Slippage tolerance exceeded');
      const translated = ErrorTranslator.translate(originalError);

      expect(translated.code).toBe(ErrorCode.SLIPPAGE_EXCEEDED);
      expect(translated.category).toBe(ErrorCategory.PROGRAM);
      expect(translated.userMessage).toContain('Price moved');
    });

    it('should translate connection errors', () => {
      const originalError = new Error('fetch failed: ECONNREFUSED');
      const translated = ErrorTranslator.translate(originalError);

      expect(translated.code).toBe(ErrorCode.CONNECTION_FAILED);
      expect(translated.category).toBe(ErrorCategory.NETWORK);
    });

    it('should translate simulation failed errors', () => {
      const originalError = new Error('Transaction simulation failed');
      const translated = ErrorTranslator.translate(originalError);

      expect(translated.code).toBe(ErrorCode.SIMULATION_FAILED);
      expect(translated.category).toBe(ErrorCategory.TRANSACTION);
    });

    it('should return unknown error for unrecognized patterns', () => {
      const originalError = new Error('some completely random error xyz123');
      const translated = ErrorTranslator.translate(originalError);

      expect(translated.code).toBe(ErrorCode.UNKNOWN);
      expect(translated.category).toBe(ErrorCategory.SYSTEM);
      expect(translated.originalError).toBe(originalError);
    });

    it('should preserve context when provided', () => {
      const originalError = new Error('User rejected');
      const context = { txId: '123', attempt: 1 };
      const translated = ErrorTranslator.translate(originalError, context);

      expect(translated.context).toEqual(context);
    });

    it('should return existing SteroidError as-is', () => {
      const steroidError = new SteroidError({
        code: ErrorCode.CUSTOM_PROGRAM_ERROR,
        category: ErrorCategory.PROGRAM,
        userMessage: 'Custom error',
        suggestion: 'Contact support',
      });
      const translated = ErrorTranslator.translate(steroidError);

      expect(translated).toBe(steroidError);
    });

    it('should handle string errors', () => {
      const translated = ErrorTranslator.translate('User denied the transaction');

      expect(translated.code).toBe(ErrorCode.USER_REJECTED);
      expect(translated.category).toBe(ErrorCategory.WALLET);
    });

    it('should handle object errors with message property', () => {
      const errorObj = { message: 'insufficient balance' };
      const translated = ErrorTranslator.translate(errorObj);

      expect(translated.code).toBe(ErrorCode.INSUFFICIENT_FUNDS);
    });
  });

  describe('Factory methods', () => {
    it('should create insufficientFunds error', () => {
      const error = ErrorTranslator.insufficientFunds(1_000_000_000);

      expect(error.code).toBe(ErrorCode.INSUFFICIENT_FUNDS);
      expect(error.suggestion).toContain('1');
      expect(error.suggestion).toContain('SOL');
    });

    it('should create userRejected error', () => {
      const error = ErrorTranslator.userRejected();

      expect(error.code).toBe(ErrorCode.USER_REJECTED);
      expect(error.category).toBe(ErrorCategory.WALLET);
    });

    it('should create blockhashExpired error', () => {
      const error = ErrorTranslator.blockhashExpired();

      expect(error.code).toBe(ErrorCode.BLOCKHASH_EXPIRED);
      expect(error.category).toBe(ErrorCategory.TRANSACTION);
    });

    it('should create rateLimited error', () => {
      const error = ErrorTranslator.rateLimited();

      expect(error.code).toBe(ErrorCode.RATE_LIMITED);
      expect(error.category).toBe(ErrorCategory.NETWORK);
    });

    it('should create simulationFailed error with details', () => {
      const error = ErrorTranslator.simulationFailed('InstructionError: 0x1');

      expect(error.code).toBe(ErrorCode.SIMULATION_FAILED);
      expect(error.context?.details).toBe('InstructionError: 0x1');
    });
  });
});
