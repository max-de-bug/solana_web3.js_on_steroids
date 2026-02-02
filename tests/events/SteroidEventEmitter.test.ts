import { describe, it, expect, vi } from 'vitest';
import { SteroidEventEmitter } from '../../src/events/SteroidEventEmitter.js';

describe('SteroidEventEmitter', () => {
  it('should register and trigger listeners', () => {
    const emitter = new SteroidEventEmitter();
    const result: any[] = [];
    const listener = (data: any) => result.push(data);

    emitter.on('transaction:pending', listener);
    emitter.emit('transaction:pending', { stateId: 'tx-1' });

    expect(result).toEqual([{ stateId: 'tx-1' }]);
  });

  it('should support multiple listeners for the same event', () => {
    const emitter = new SteroidEventEmitter();
    let count = 0;
    
    emitter.on('connection:failover', () => count++);
    emitter.on('connection:failover', () => count++);

    emitter.emit('connection:failover', { from: 'a', to: 'b', reason: 'error' });
    expect(count).toBe(2);
  });

  it('should remove listeners with off()', () => {
    const emitter = new SteroidEventEmitter();
    let count = 0;
    const listener = () => count++;

    emitter.on('transaction:sent', listener);
    emitter.off('transaction:sent', listener);

    emitter.emit('transaction:sent', { stateId: 'tx-1', signature: 'sig', attempt: 1 });
    expect(count).toBe(0);
  });

  it('should support once() for single-fire events', () => {
    const emitter = new SteroidEventEmitter();
    let count = 0;

    emitter.once('transaction:confirmed', () => count++);

    emitter.emit('transaction:confirmed', { 
      stateId: 'tx-1', 
      signature: 'sig', 
      attempts: 1, 
      durationMs: 100 
    });
    emitter.emit('transaction:confirmed', { 
      stateId: 'tx-1', 
      signature: 'sig', 
      attempts: 1, 
      durationMs: 100 
    });

    expect(count).toBe(1);
  });

  it('should not break if a listener throws', () => {
    const emitter = new SteroidEventEmitter();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    emitter.on('transaction:failed', () => {
      throw new Error('Test Error');
    });
    
    let secondListenerCalled = false;
    emitter.on('transaction:failed', () => {
      secondListenerCalled = true;
    });

    emitter.emit('transaction:failed', { 
      stateId: 'tx-1', 
      error: new Error('Original'), 
      attempts: 1 
    });

    expect(secondListenerCalled).toBe(true);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
