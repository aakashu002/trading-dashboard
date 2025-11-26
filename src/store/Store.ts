import { create } from "zustand";

// ============ Portfolio Store ============

export type PortfolioItem = {
  symbol: string;
  quantity: number;
  avgCost: number;
};

type PortfolioState = {
  portfolio: PortfolioItem[] | null;
  error: string | null;
  isLoading: boolean;
  fetchPortfolio: () => Promise<void>;
};

const PORTFOLIO_URL = "/portfolio.json";

export const usePortfolioStore = create<PortfolioState>((set, get) => ({
  portfolio: null,
  error: null,
  isLoading: false,

  fetchPortfolio: async () => {
    // Prevent duplicate fetches
    if (get().isLoading) return;

    set({ isLoading: true, error: null });

    try {
      const res = await fetch(PORTFOLIO_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as PortfolioItem[];
      set({ portfolio: data, isLoading: false });
    } catch (err) {
      // retry once after 3s
      setTimeout(async () => {
        try {
          const r2 = await fetch(PORTFOLIO_URL);
          if (!r2.ok) throw new Error(`HTTP ${r2.status}`);
          const d2 = (await r2.json()) as PortfolioItem[];
          set({ portfolio: d2, isLoading: false, error: null });
        } catch (err2: unknown) {
          const message = err2 instanceof Error ? err2.message : String(err2);
          set({ error: message, isLoading: false });
        }
      }, 3000);
    }
  },
}));

// ============ WebSocket Prices Store ============

export type ConnStatus = "connected" | "reconnecting" | "disconnected" | "connecting";
export type PriceMsg = { symbol: string; price: number };

const WS_URL = import.meta.env.VITE_WS_URL ?? "wss://api.mock-trading.com/live-feed";
const USE_MOCK = (import.meta.env.VITE_USE_MOCK ?? "true") === "true";

type WebSocketState = {
  prices: Record<string, number>;
  status: ConnStatus;
  // Internal refs stored in closure, not in state
  _internals: {
    ws: WebSocket | null;
    buffer: PriceMsg[];
    backoff: number;
    reconnectTimer: number | null;
    flushTimer: number | null;
    mockTimer: number | null;
    closedExplicitly: boolean;
    initialized: boolean;
  };
  // Actions
  connect: () => void;
  disconnect: () => void;
  _updatePrices: (newPrices: Record<string, number>) => void;
  _setStatus: (status: ConnStatus) => void;
};

export const useWebSocketStore = create<WebSocketState>((set, get) => ({
  prices: {},
  status: "connecting",
  _internals: {
    ws: null,
    buffer: [],
    backoff: 1000,
    reconnectTimer: null,
    flushTimer: null,
    mockTimer: null,
    closedExplicitly: false,
    initialized: false,
  },

  _updatePrices: (newPrices) => set({ prices: newPrices }),
  _setStatus: (status) => set({ status }),

  connect: () => {
    const internals = get()._internals;

    // Prevent multiple initializations
    if (internals.initialized) return;
    internals.initialized = true;

    // Start flush interval
    internals.flushTimer = window.setInterval(() => {
      const { buffer } = get()._internals;
      if (buffer.length === 0) return;
      const batch = buffer.splice(0);
      set((state) => {
        const next = { ...state.prices };
        for (const m of batch) next[m.symbol] = m.price;
        return { prices: next };
      });
    }, 200);

    if (USE_MOCK) {
      set({ status: "connected" });
      const symbols = ["AAPL", "GOOGL", "TSLA", "MSFT", "AMZN"];
      internals.mockTimer = window.setInterval(() => {
        const sym = symbols[Math.floor(Math.random() * symbols.length)];
        const price = +(100 + Math.random() * 3000).toFixed(2);
        get()._internals.buffer.push({ symbol: sym, price });
      }, 500);
      return;
    }

    const createSocket = () => {
      const internals = get()._internals;
      set({ status: "connecting" });

      try {
        const ws = new WebSocket(WS_URL);
        internals.ws = ws;

        ws.onopen = () => {
          internals.backoff = 1000;
          set({ status: "connected" });
        };

        ws.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data) as PriceMsg;
            if (data?.symbol && typeof data.price === "number") {
              internals.buffer.push(data);
            }
          } catch {
            // ignore invalid messages
          }
        };

        ws.onerror = () => {
          set({ status: "reconnecting" });
        };

        ws.onclose = () => {
          if (internals.closedExplicitly) {
            set({ status: "disconnected" });
            return;
          }
          set({ status: "reconnecting" });
          scheduleReconnect();
        };
      } catch {
        set({ status: "reconnecting" });
        scheduleReconnect();
      }
    };

    const scheduleReconnect = () => {
      const internals = get()._internals;
      const backoff = internals.backoff;
      if (internals.reconnectTimer) {
        window.clearTimeout(internals.reconnectTimer);
      }
      internals.reconnectTimer = window.setTimeout(() => {
        internals.backoff = Math.min(32000, internals.backoff * 2);
        createSocket();
      }, backoff);
    };

    createSocket();
  },

  disconnect: () => {
    const internals = get()._internals;
    internals.closedExplicitly = true;
    internals.initialized = false;

    if (internals.reconnectTimer) {
      window.clearTimeout(internals.reconnectTimer);
      internals.reconnectTimer = null;
    }

    if (internals.flushTimer) {
      window.clearInterval(internals.flushTimer);
      internals.flushTimer = null;
    }

    if (internals.mockTimer) {
      window.clearInterval(internals.mockTimer);
      internals.mockTimer = null;
    }

    const ws = internals.ws;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    internals.ws = null;

    set({ status: "disconnected" });
  },
}));
