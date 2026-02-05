/**
 * SteroidEventEmitter - Browser-compatible event emitter for transaction lifecycle events.
 * 
 * Provides real-time callbacks for transaction states and connection health,
 * enabling reactive UIs that respond to the library's internal resilience mechanisms.
 */

/**
 * Event payload types for all supported events.
 */
export type SteroidEventMap = {
  // Transaction lifecycle events
  'transaction:pending': { stateId: string };
  'transaction:simulated': { stateId: string; computeUnits?: number };
  'transaction:sent': { stateId: string; signature: string; attempt: number };
  'transaction:confirmed': { 
    stateId: string; 
    signature: string; 
    attempts: number; 
    durationMs: number;
  };
  'transaction:failed': { stateId: string; error: Error; attempts: number };
  'transaction:expired': { stateId: string; signature?: string; attempts: number };
  'transaction:aborted': { stateId: string; signature?: string };
  
  // Connection events
  'connection:failover': { from: string; to: string; reason: string };
  'connection:health': { endpoint: string; healthy: boolean; latency?: number };
};

export type SteroidEventKey = keyof SteroidEventMap;
export type SteroidEventListener<K extends SteroidEventKey> = (data: SteroidEventMap[K]) => void;

/**
 * Lightweight, browser-compatible EventEmitter implementation.
 * Does not depend on Node.js 'events' module for maximum portability.
 */
export class SteroidEventEmitter {
  private listeners: Map<SteroidEventKey, Set<SteroidEventListener<any>>> = new Map();

  /**
   * Register an event listener.
   */
  on<K extends SteroidEventKey>(event: K, listener: SteroidEventListener<K>): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return this;
  }

  /**
   * Remove an event listener.
   */
  off<K extends SteroidEventKey>(event: K, listener: SteroidEventListener<K>): this {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(listener);
      if (eventListeners.size === 0) {
        this.listeners.delete(event);
      }
    }
    return this;
  }

  /**
   * Register a one-time event listener that auto-removes after first invocation.
   */
  once<K extends SteroidEventKey>(event: K, listener: SteroidEventListener<K>): this {
    const wrappedListener: SteroidEventListener<K> = (data) => {
      this.off(event, wrappedListener);
      listener(data);
    };
    return this.on(event, wrappedListener);
  }

  /**
   * Emit an event to all registered listeners.
   * @returns true if there were listeners, false otherwise
   */
  emit<K extends SteroidEventKey>(event: K, data: SteroidEventMap[K]): boolean {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners || eventListeners.size === 0) {
      return false;
    }

    // Create a copy to avoid mutation during iteration
    const listenersArray = Array.from(eventListeners);
    for (const listener of listenersArray) {
      try {
        listener(data);
      } catch (error) {
        // Prevent listener errors from breaking the emission chain
        console.error(`[SteroidEventEmitter] Error in listener for '${event}':`, error);
      }
    }

    return true;
  }

  /**
   * Remove all listeners for a specific event, or all events if none specified.
   */
  removeAllListeners(event?: SteroidEventKey): this {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }

  /**
   * Get the number of listeners for a specific event.
   */
  listenerCount(event: SteroidEventKey): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  /**
   * Get all registered event names.
   */
  eventNames(): SteroidEventKey[] {
    return Array.from(this.listeners.keys());
  }
}
