# Design Notes & Architecture Review

This document covers the key architectural decisions made in building the Trading Dashboard, focusing on state management, WebSocket handling, and testing strategy.

---

## Table of Contents

1. [State Management Architecture](#state-management-architecture)
2. [WebSocket Connection & Cleanup Logic](#websocket-connection--cleanup-logic)
3. [Testing Strategy](#testing-strategy)

---

## State Management Architecture

### Why Zustand Over Redux?

After evaluating both Redux and Zustand for this real-time trading application, **Zustand** was chosen for the following reasons:

| Criteria | Redux | Zustand | Winner |
|----------|-------|---------|--------|
| Bundle Size | ~7KB (+ toolkit) | ~1KB | Zustand |
| Boilerplate | High (actions, reducers, selectors) | Minimal | Zustand |
| Learning Curve | Steeper | Gentle | Zustand |
| Real-time Performance | Good (with optimization) | Excellent (built-in) | Zustand |
| DevTools | Excellent | Good | Redux |
| Middleware | Rich ecosystem | Simple, sufficient | Redux |

**Key Decision Factors:**

1. **Minimal Boilerplate**: Trading dashboards need rapid iteration. Zustand's simple API (`create()`) allows defining state and actions in one place without action types, reducers, or dispatch.

2. **Built-in Performance**: Zustand uses shallow comparison by default and only re-renders components that subscribe to changed state slices.

3. **No Provider Required**: Unlike Redux, Zustand doesn't need a `<Provider>` wrapper, simplifying the component tree.

4. **Bundle Size**: For a real-time app where every millisecond counts, Zustand's ~1KB footprint vs Redux's ~7KB+ matters.

### State Structure

The application uses two separate stores to maintain separation of concerns:

```typescript
// Store.ts

// ============ Portfolio Store ============
// Handles static portfolio data (fetched once)
usePortfolioStore = {
  portfolio: PortfolioItem[] | null,  // User's holdings
  error: string | null,                // Fetch error message
  isLoading: boolean,                  // Loading state
  fetchPortfolio: () => Promise<void>  // Fetch action with retry
}

// ============ WebSocket Store ============
// Handles real-time price data (updates continuously)
useWebSocketStore = {
  prices: Record<string, number>,      // { AAPL: 150.25, GOOGL: 2800 }
  status: ConnStatus,                  // "connected" | "connecting" | etc.
  _internals: { ... },                 // Buffer, timers, WebSocket ref
  connect: () => void,                 // Initialize connection
  disconnect: () => void               // Cleanup connection
}
```

### Handling Rapid Real-Time Updates

The critical challenge in a trading dashboard is handling **high-frequency updates** (potentially 100+ messages/second) without causing performance degradation. Here's how we solved it:

#### 1. Message Buffering Strategy

```typescript
// Problem: Updating React state on every WebSocket message = performance disaster
// Solution: Buffer messages, flush periodically

_internals: {
  buffer: PriceMsg[],      // Accumulates incoming messages
  flushTimer: number | null // 200ms interval
}

// On WebSocket message: push to buffer (no React state update)
ws.onmessage = (ev) => {
  const data = JSON.parse(ev.data);
  internals.buffer.push(data);  // ← No setState here!
};

// Every 200ms: batch update React state
internals.flushTimer = window.setInterval(() => {
  if (buffer.length === 0) return;

  const batch = buffer.splice(0);  // Drain buffer

  set((state) => {
    const next = { ...state.prices };
    for (const m of batch) next[m.symbol] = m.price;
    return { prices: next };  // ← Single setState for N messages
  });
}, 200);
```

**Performance Impact:**

| Approach | Messages/sec | React Updates/sec | Performance |
|----------|-------------|-------------------|-------------|
| Direct setState | 100 | 100 | Poor (jank) |
| Buffered (200ms) | 100 | 5 | Excellent |

#### 2. Selective Subscriptions

Zustand allows components to subscribe to specific state slices:

```typescript
// Component only re-renders when `prices` changes
const prices = useWebSocketStore((state) => state.prices);

// Component only re-renders when `status` changes
const status = useWebSocketStore((state) => state.status);

// vs. Redux where you'd need `useSelector` with careful memoization
```

#### 3. Computed Values with useMemo

Portfolio calculations are derived from prices, not stored:

```typescript
const rows = useMemo(() => {
  return portfolio.map((item) => ({
    ...item,
    currentPrice: prices[item.symbol],
    totalValue: prices[item.symbol] * item.quantity,
    dailyPnl: item.quantity * (prices[item.symbol] - item.avgCost),
    // ... more calculations
  }));
}, [portfolio, prices]);  // Only recalculates when dependencies change
```

**Why not store calculated values?**
- Derived state should be computed, not stored
- Avoids synchronization issues
- `useMemo` ensures calculations only run when inputs change

#### 4. State Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Application State                            │
├─────────────────────────────────┬───────────────────────────────────┤
│      usePortfolioStore          │       useWebSocketStore           │
│  ┌───────────────────────────┐  │  ┌─────────────────────────────┐  │
│  │ portfolio: [              │  │  │ prices: {                   │  │
│  │   { symbol, qty, avgCost }│  │  │   AAPL: 175.50,            │  │
│  │ ]                         │  │  │   GOOGL: 2801.25           │  │
│  │ error: null               │  │  │ }                          │  │
│  │ isLoading: false          │  │  │ status: "connected"        │  │
│  └───────────────────────────┘  │  │ _internals: { buffer, ws } │  │
│                                 │  └─────────────────────────────┘  │
│  Fetched once on mount          │  Updated every 200ms (buffered)   │
└─────────────────────────────────┴───────────────────────────────────┘
                    │                              │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │      PortfolioTable         │
                    │  ┌───────────────────────┐  │
                    │  │ useMemo(() => {       │  │
                    │  │   // Combine portfolio │  │
                    │  │   // with live prices  │  │
                    │  │   // Calculate P&L     │  │
                    │  │ }, [portfolio, prices])│  │
                    │  └───────────────────────┘  │
                    │  Derived state, not stored  │
                    └─────────────────────────────┘
```

---

## WebSocket Connection & Cleanup Logic

### Design Goals

1. **Single Connection**: Only one WebSocket connection regardless of how many components need prices
2. **Auto-Reconnect**: Automatically reconnect with exponential backoff on disconnection
3. **Proper Cleanup**: No memory leaks or zombie connections
4. **Mock Support**: Development mode with simulated data

### Connection Lifecycle

```
┌─────────────┐     connect()      ┌─────────────┐
│   Initial   │ ─────────────────► │ Connecting  │
│   State     │                    │             │
└─────────────┘                    └──────┬──────┘
                                          │
                              ┌───────────┴───────────┐
                              │                       │
                         onopen()               onerror()/onclose()
                              │                       │
                              ▼                       ▼
                    ┌─────────────┐         ┌─────────────────┐
                    │  Connected  │         │  Reconnecting   │
                    │             │         │  (with backoff) │
                    └──────┬──────┘         └────────┬────────┘
                           │                         │
                      onclose()              setTimeout(backoff)
                           │                         │
                           ▼                         │
                    ┌─────────────┐                  │
                    │ Reconnecting│ ◄────────────────┘
                    └─────────────┘
                           │
                     disconnect()
                           │
                           ▼
                    ┌─────────────┐
                    │ Disconnected│
                    │  (cleanup)  │
                    └─────────────┘
```

### Implementation Details

#### 1. Connection Initialization

```typescript
connect: () => {
  const internals = get()._internals;

  // Prevent multiple connections
  if (internals.initialized) return;
  internals.initialized = true;

  // Start buffer flush interval
  internals.flushTimer = window.setInterval(() => {
    // ... flush logic
  }, 200);

  // Mock mode for development
  if (USE_MOCK) {
    set({ status: "connected" });
    internals.mockTimer = window.setInterval(() => {
      // Generate fake price data
    }, 500);
    return;
  }

  // Real WebSocket connection
  createSocket();
}
```

#### 2. Exponential Backoff Reconnection

```typescript
const scheduleReconnect = () => {
  const internals = get()._internals;
  const backoff = internals.backoff;  // Starts at 1000ms

  // Clear any existing timer
  if (internals.reconnectTimer) {
    window.clearTimeout(internals.reconnectTimer);
  }

  // Schedule reconnection with current backoff
  internals.reconnectTimer = window.setTimeout(() => {
    // Double backoff for next attempt (max 32 seconds)
    internals.backoff = Math.min(32000, internals.backoff * 2);
    createSocket();
  }, backoff);
};

// Backoff sequence: 1s → 2s → 4s → 8s → 16s → 32s → 32s → ...
```

**Why Exponential Backoff?**
- Prevents server overload during outages
- Allows time for network recovery
- Balances responsiveness with resource efficiency

#### 3. Comprehensive Cleanup

```typescript
disconnect: () => {
  const internals = get()._internals;

  // Mark as explicitly closed (prevents auto-reconnect)
  internals.closedExplicitly = true;
  internals.initialized = false;

  // Clear reconnect timer
  if (internals.reconnectTimer) {
    window.clearTimeout(internals.reconnectTimer);
    internals.reconnectTimer = null;
  }

  // Clear flush interval
  if (internals.flushTimer) {
    window.clearInterval(internals.flushTimer);
    internals.flushTimer = null;
  }

  // Clear mock timer (if in mock mode)
  if (internals.mockTimer) {
    window.clearInterval(internals.mockTimer);
    internals.mockTimer = null;
  }

  // Close WebSocket connection
  const ws = internals.ws;
  if (ws && (ws.readyState === WebSocket.OPEN ||
             ws.readyState === WebSocket.CONNECTING)) {
    try {
      ws.close();
    } catch {
      /* ignore close errors */
    }
  }
  internals.ws = null;

  set({ status: "disconnected" });
}
```

#### 4. Hook Integration

The `useWebSocketPrices` hook provides a clean interface:

```typescript
export function useWebSocketPrices() {
  // Subscribe to specific state slices
  const prices = useWebSocketStore((state) => state.prices);
  const status = useWebSocketStore((state) => state.status);
  const connect = useWebSocketStore((state) => state.connect);
  const disconnect = useWebSocketStore((state) => state.disconnect);

  // Lifecycle management
  useEffect(() => {
    connect();      // Initialize on mount
    return () => {
      disconnect(); // Cleanup on unmount
    };
  }, [connect, disconnect]);

  return { prices, status };
}
```

**Why This Pattern?**

| Concern | Solution |
|---------|----------|
| Multiple components need prices | Zustand store is singleton; all share one connection |
| Component unmounts/remounts | `connect()` checks `initialized` flag, won't duplicate |
| App unmounts | `disconnect()` cleans up everything |
| Hot module reload (dev) | Cleanup runs, fresh connection on reload |

### Memory Leak Prevention Checklist

| Resource | Cleanup Method | When |
|----------|----------------|------|
| WebSocket | `ws.close()` | `disconnect()` |
| Flush Interval | `clearInterval(flushTimer)` | `disconnect()` |
| Mock Interval | `clearInterval(mockTimer)` | `disconnect()` |
| Reconnect Timer | `clearTimeout(reconnectTimer)` | `disconnect()` |
| Message Buffer | `buffer.splice(0)` | Each flush |

---

## Testing Strategy

### Overview

The testing strategy focuses on **Unit Tests** for the core business logic (portfolio calculations) rather than integration tests for UI components. This decision was made because:

1. **Business Logic is Critical**: Incorrect P&L calculations directly impact user decisions
2. **UI is Presentation**: The UI simply displays calculated values
3. **Real-time Testing is Complex**: Integration testing WebSocket behavior requires complex mocking
4. **ROI Optimization**: Unit tests provide highest confidence-to-effort ratio for financial calculations

### Test Pyramid Applied

```
                    ┌─────────────────┐
                    │   E2E Tests     │  ← Not implemented (complex, slow)
                    │    (Manual)     │
                    └────────┬────────┘
                             │
               ┌─────────────┴─────────────┐
               │    Integration Tests      │  ← Limited (component rendering)
               │   (Future consideration)  │
               └─────────────┬─────────────┘
                             │
    ┌────────────────────────┴────────────────────────┐
    │                 Unit Tests                      │  ← PRIMARY FOCUS
    │  (Portfolio calculations, formatting, etc.)    │
    │                 37 tests                        │
    └─────────────────────────────────────────────────┘
```

### What We Test (Unit Tests)

#### 1. Individual Calculation Functions

```typescript
// calculateTotalValue
describe("calculateTotalValue", () => {
  it("should calculate total value correctly", () => {
    // 100 shares × $150.00 = $15,000.00
    expect(calculateTotalValue(100, 150)).toBe(15000);
  });

  it("should return undefined when price is undefined", () => {
    expect(calculateTotalValue(100, undefined)).toBeUndefined();
  });
});
```

**Why?** Total value is displayed to users and used in further calculations. Errors here cascade.

#### 2. P&L Calculations (Profit & Loss)

```typescript
// calculateDailyPnl
describe("calculateDailyPnl", () => {
  it("should calculate positive P&L (profit)", () => {
    // 100 shares × ($175 - $150) = $2,500 profit
    expect(calculateDailyPnl(100, 150, 175)).toBe(2500);
  });

  it("should calculate negative P&L (loss)", () => {
    // 100 shares × ($125 - $150) = -$2,500 loss
    expect(calculateDailyPnl(100, 150, 125)).toBe(-2500);
  });
});
```

**Why?** P&L is the most critical metric for traders. Sign errors or calculation mistakes are unacceptable.

#### 3. Percentage Calculations

```typescript
// calculateDailyPnlPercent
describe("calculateDailyPnlPercent", () => {
  it("should handle division by zero", () => {
    expect(calculateDailyPnlPercent(0, 100)).toBeUndefined();
  });

  it("should calculate 100% gain", () => {
    // ($300 - $150) / $150 × 100 = 100%
    expect(calculateDailyPnlPercent(150, 300)).toBe(100);
  });
});
```

**Why?** Edge cases like division by zero can crash the app or show NaN/Infinity.

#### 4. Aggregate Functions

```typescript
// calculateTotalPortfolioValue
describe("calculateTotalPortfolioValue", () => {
  it("should sum all positions", () => {
    const portfolio = [
      { symbol: "AAPL", quantity: 100, avgCost: 150 },
      { symbol: "GOOGL", quantity: 50, avgCost: 2500 },
    ];
    const prices = { AAPL: 175, GOOGL: 2800 };

    // (100 × $175) + (50 × $2800) = $157,500
    expect(calculateTotalPortfolioValue(portfolio, prices)).toBe(157500);
  });

  it("should skip items without prices", () => {
    // Only AAPL has a price
    expect(calculateTotalPortfolioValue(portfolio, { AAPL: 175 })).toBe(17500);
  });
});
```

**Why?** Aggregations must handle partial data gracefully (not all symbols may have prices).

#### 5. Formatting Functions

```typescript
// formatCurrency
describe("formatCurrency", () => {
  it("should format with thousand separators", () => {
    expect(formatCurrency(1234567.89)).toBe("1,234,567.89");
  });

  it("should handle undefined gracefully", () => {
    expect(formatCurrency(undefined)).toBe("-");
  });
});
```

**Why?** Display formatting affects UX but shouldn't throw errors on edge cases.

### Test Coverage Summary

| Category | Tests | Coverage |
|----------|-------|----------|
| `calculateTotalValue` | 5 | Normal, decimals, undefined, zero, large numbers |
| `calculateDailyPnl` | 5 | Profit, loss, break-even, undefined, decimals |
| `calculateDailyPnlPercent` | 7 | Positive, negative, zero, undefined, div-by-zero, 100%, -50% |
| `calculatePortfolioItemMetrics` | 3 | Full calculation, undefined price, loss |
| `calculatePortfolioMetrics` | 3 | Multiple items, partial prices, empty |
| `calculateTotalPortfolioValue` | 4 | Sum, partial, empty portfolio, no prices |
| `calculateTotalPortfolioPnl` | 3 | Mixed P&L, all loss, partial |
| `formatCurrency` | 7 | Positive, negative, whole, small, undefined, large, zero |
| **Total** | **37** | |

### Why Not Integration Tests?

| Test Type | Pros | Cons | Decision |
|-----------|------|------|----------|
| Unit (calculations) | Fast, reliable, easy to maintain | Doesn't test UI | **Implemented** |
| Integration (components) | Tests real UI behavior | Requires DOM, complex setup | Future |
| E2E (Cypress/Playwright) | Tests full user flows | Slow, flaky, hard to maintain | Not needed |

**For this application:**
- Core logic (calculations) is tested thoroughly
- UI is straightforward (displays calculated values)
- WebSocket behavior is complex to mock reliably
- Time investment favors unit tests

### Running Tests

```bash
# Watch mode (development)
npm run test

# Single run (CI/CD)
npm run test:run

# Output
# ✓ src/test/portfolioCalculations.test.ts (37 tests) 36ms
# Test Files  1 passed (1)
# Tests       37 passed (37)
```

### Future Testing Considerations

If expanding test coverage, priority would be:

1. **Integration tests for PortfolioTable** - Verify rows render correctly with mock data
2. **Hook tests for useWebSocketPrices** - Test connection lifecycle
3. **Store tests for Zustand** - Test state transitions

---

## Summary

| Area | Approach | Key Benefit |
|------|----------|-------------|
| State Management | Zustand with buffering | High-frequency updates without performance issues |
| WebSocket | Centralized store with auto-reconnect | Single connection, resilient to network issues |
| Testing | Unit tests on calculations | High confidence in critical business logic |

This architecture prioritizes **performance** (buffering, selective subscriptions), **reliability** (reconnection, cleanup), and **correctness** (comprehensive unit tests on financial calculations).
