import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSocketConfirmation } from '../../src/connection/WebSocketConfirmation.js';

describe('WebSocketConfirmation', () => {
  let mockConnection: any;
  const mockSignature = '2z7vAnS1uh1981S88mnyfFp72R1X54D2t7S1vC9S2mnyfFp72R1X54D2t7S1vC9S2mnyfFp72R1X54D2t7S1vC9S2mnyfFp72R1X';

  beforeEach(() => {
    mockConnection = {
      onSignature: vi.fn(),
      removeSignatureListener: vi.fn(),
    };
  });

  it('should return "confirmed" on successful signature confirmation', async () => {
    mockConnection.onSignature.mockImplementation((sig: string, callback: Function) => {
      // Simulate success callback after a short delay
      setTimeout(() => callback({ err: null }, {}), 10);
      return 123; // subscription ID
    });

    const result = await WebSocketConfirmation.confirmSignature(mockConnection, mockSignature, 'confirmed', 1000);
    
    expect(result).toBe('confirmed');
    expect(mockConnection.onSignature).toHaveBeenCalledWith(mockSignature, expect.any(Function), 'confirmed');
    expect(mockConnection.removeSignatureListener).toHaveBeenCalledWith(123);
  });

  it('should return "error" on transaction error', async () => {
    mockConnection.onSignature.mockImplementation((sig: string, callback: Function) => {
      setTimeout(() => callback({ err: 'SomeError' }, {}), 10);
      return 123;
    });

    const result = await WebSocketConfirmation.confirmSignature(mockConnection, mockSignature, 'confirmed', 1000);
    
    expect(result).toBe('error');
    expect(mockConnection.removeSignatureListener).toHaveBeenCalledWith(123);
  });

  it('should return "timeout" on timeout', async () => {
    mockConnection.onSignature.mockReturnValue(123);

    const result = await WebSocketConfirmation.confirmSignature(mockConnection, mockSignature, 'confirmed', 50);
    
    expect(result).toBe('timeout');
    expect(mockConnection.removeSignatureListener).toHaveBeenCalledWith(123);
  });

  it('should return "timeout" on subscription errors', async () => {
    mockConnection.onSignature.mockImplementation(() => {
      throw new Error('Subscription failed');
    });

    const result = await WebSocketConfirmation.confirmSignature(mockConnection, mockSignature, 'confirmed', 1000);
    
    expect(result).toBe('timeout');
  });

  describe('isConfirmed (backwards-compatible helper)', () => {
    it('should return true when result is "confirmed"', async () => {
      mockConnection.onSignature.mockImplementation((sig: string, callback: Function) => {
        setTimeout(() => callback({ err: null }, {}), 10);
        return 123;
      });

      const result = await WebSocketConfirmation.isConfirmed(mockConnection, mockSignature, 'confirmed', 1000);
      expect(result).toBe(true);
    });

    it('should return false when result is "error"', async () => {
      mockConnection.onSignature.mockImplementation((sig: string, callback: Function) => {
        setTimeout(() => callback({ err: 'SomeError' }, {}), 10);
        return 123;
      });

      const result = await WebSocketConfirmation.isConfirmed(mockConnection, mockSignature, 'confirmed', 1000);
      expect(result).toBe(false);
    });

    it('should return false when result is "timeout"', async () => {
      mockConnection.onSignature.mockReturnValue(123);

      const result = await WebSocketConfirmation.isConfirmed(mockConnection, mockSignature, 'confirmed', 50);
      expect(result).toBe(false);
    });
  });
});
