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

  it('should confirm signature successfully', async () => {
    mockConnection.onSignature.mockImplementation((sig: string, callback: Function) => {
      // Simulate success callback after a short delay
      setTimeout(() => callback({ err: null }, {}), 10);
      return 123; // subscription ID
    });

    const result = await WebSocketConfirmation.confirmSignature(mockConnection, mockSignature, 'confirmed', 1000);
    
    expect(result).toBe(true);
    expect(mockConnection.onSignature).toHaveBeenCalledWith(mockSignature, expect.any(Function), 'confirmed');
    expect(mockConnection.removeSignatureListener).toHaveBeenCalledWith(123);
  });

  it('should return false on transaction error', async () => {
    mockConnection.onSignature.mockImplementation((sig: string, callback: Function) => {
      setTimeout(() => callback({ err: 'SomeError' }, {}), 10);
      return 123;
    });

    const result = await WebSocketConfirmation.confirmSignature(mockConnection, mockSignature, 'confirmed', 1000);
    
    expect(result).toBe(false);
    expect(mockConnection.removeSignatureListener).toHaveBeenCalledWith(123);
  });

  it('should return false on timeout', async () => {
    mockConnection.onSignature.mockReturnValue(123);

    const result = await WebSocketConfirmation.confirmSignature(mockConnection, mockSignature, 'confirmed', 50);
    
    expect(result).toBe(false);
    expect(mockConnection.removeSignatureListener).toHaveBeenCalledWith(123);
  });

  it('should handle subscription errors', async () => {
    mockConnection.onSignature.mockImplementation(() => {
      throw new Error('Subscription failed');
    });

    const result = await WebSocketConfirmation.confirmSignature(mockConnection, mockSignature, 'confirmed', 1000);
    
    expect(result).toBe(false);
  });
});
