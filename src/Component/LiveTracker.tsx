import { useEffect, useRef, useState } from "react";
import styles from "./LiveTracker.module.css";
import PortfolioTable from "./PortfolioTable";

type PriceMsg = { symbol: string; price: number };
type ConnStatus = "connected" | "reconnecting" | "disconnected" | "connecting";

const WS_URL = import.meta.env.VITE_WS_URL ?? "wss://api.mock-trading.com/live-feed";
const USE_MOCK = (import.meta.env.VITE_USE_MOCK ?? "true") === "true";

const FAVORITES_KEY = "trading-dashboard-favorites";

function loadFavorites(): Set<string> {
  try {
    const saved = localStorage.getItem(FAVORITES_KEY);
    return saved ? new Set(JSON.parse(saved)) : new Set();
  } catch {
    return new Set();
  }
}

function saveFavorites(favorites: Set<string>) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
}

export default function LiveTracker() {
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [lastError, setLastError] = useState<string | null>(null);
  const [latest, setLatest] = useState<Record<string, number>>({});
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);
  const wsRef = useRef<WebSocket | null>(null);
  const bufferRef = useRef<PriceMsg[]>([]);
  const backoffRef = useRef<number>(1000); // ms
  const reconnectTimerRef = useRef<number | null>(null);
  const closedExplicitlyRef = useRef(false);

  const toggleFavorite = (symbol: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      saveFavorites(next);
      return next;
    });
  };

  // -- function that actually creates socket --
  function createSocket() {
    setLastError(null);
    setStatus("connecting");

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        backoffRef.current = 1000; // reset backoff
        setStatus("connected");
        console.info("WS open", WS_URL);
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as PriceMsg;
          // simple validation
          if (data?.symbol && typeof data.price === "number") {
            bufferRef.current.push(data);
          } else {
            // ignore or push as raw
            console.warn("Ignored invalid message", ev.data);
          }
        } catch (err) {
          console.warn("Non-JSON or malformed ws message", ev.data);
        }
      };

      ws.onerror = (ev) => {
        console.error("WebSocket error", ev);
        setLastError("WebSocket error");
      };

      ws.onclose = (ev) => {
        console.warn("WebSocket closed", ev.code, ev.reason, "wasClean:", ev.wasClean);
        if (closedExplicitlyRef.current) {
          setStatus("disconnected");
          return;
        }
        // schedule reconnect
        setStatus("reconnecting");
        scheduleReconnect();
      };
    } catch (err: any) {
      console.error("Failed to create WebSocket:", err);
      setLastError(String(err?.message ?? err));
      setStatus("reconnecting");
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    const backoff = backoffRef.current;
    console.info(`Reconnecting in ${backoff}ms`);
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
    }
    reconnectTimerRef.current = window.setTimeout(() => {
      // exponential backoff up to 32000
      backoffRef.current = Math.min(32000, backoffRef.current * 2);
      createSocket();
    }, backoff);
  }

  // flush buffer every 200ms and set state once
  useEffect(() => {
    const flush = () => {
      if (bufferRef.current.length === 0) return;
      const copy = bufferRef.current.splice(0); // drain
      setLatest((prev) => {
        const next = { ...prev };
        for (const msg of copy) next[msg.symbol] = msg.price;
        return next;
      });
    };
    const id = window.setInterval(flush, 200);
    return () => clearInterval(id);
  }, []);

  // create ws or mock on mount
  useEffect(() => {
    if (USE_MOCK) {
      setStatus("connected");
      // simulator: emits random-ish messages every 500ms
      const symbols = ["AAPL", "GOOGL", "TSLA", "MSFT"];
      const t = window.setInterval(() => {
        const sym = symbols[Math.floor(Math.random() * symbols.length)];
        const price = +(100 + Math.random() * 3000).toFixed(2);
        bufferRef.current.push({ symbol: sym, price });
      }, 500);
      return () => clearInterval(t);
    }

    createSocket();

    return () => {
      // cleanup
      closedExplicitlyRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      const ws = wsRef.current;
      if (ws) {
        // only close if socket is OPEN or CONNECTING
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          try {
            ws.close();
          } catch (err) {
            console.warn("Error closing ws:", err);
          }
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount only
  const prevPrices = useRef<Record<string, number>>({});

  // Track price changes for color indicators
  const getPriceChange = (symbol: string, currentPrice: number) => {
    const prev = prevPrices.current[symbol];
    if (prev === undefined) return "neutral";
    if (currentPrice > prev) return "up";
    if (currentPrice < prev) return "down";
    return "neutral";
  };

  // Update previous prices after render
  useEffect(() => {
    prevPrices.current = { ...latest };
  }, [latest]);

  const statusClassMap: Record<ConnStatus, string> = {
    connected: styles.statusConnected,
    connecting: styles.statusConnecting,
    reconnecting: styles.statusReconnecting,
    disconnected: styles.statusDisconnected,
  };

  const bgClassMap: Record<ConnStatus, string> = {
    connected: styles.bgConnected,
    connecting: styles.bgConnecting,
    reconnecting: styles.bgReconnecting,
    disconnected: styles.bgDisconnected,
  };

  const priceClassMap = {
    up: styles.priceUp,
    down: styles.priceDown,
    neutral: styles.priceNeutral,
  };

  const symbols = Object.entries(latest);
  const favoriteSymbols = symbols.filter(([sym]) => favorites.has(sym));
  const otherSymbols = symbols;

  const renderPriceCard = (symbol: string, price: number, isWatchlist = false) => {
    const change = getPriceChange(symbol, price);
    const isFavorite = favorites.has(symbol);
    return (
      <div
        key={symbol}
        className={isWatchlist ? styles.watchlistCard : styles.priceCard}
      >
        <div className={styles.cardHeader}>
          <div className={styles.symbolClickable} onClick={() => toggleFavorite(symbol)}>
            <button
              className={`${styles.starButton} ${isFavorite ? styles.starFilled : styles.starEmpty}`}
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite(symbol);
              }}
              title={isFavorite ? "Remove from watchlist" : "Add to watchlist"}
            >
              {isFavorite ? "★" : "☆"}
            </button>
            <span>{symbol}</span>
          </div>
          <span className={`${styles.changeIndicator} ${priceClassMap[change]}`}>
            {change === "up" ? "▲" : change === "down" ? "▼" : "●"}
          </span>
        </div>
        <div className={`${styles.price} ${priceClassMap[change]}`}>
          ${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.title}>Trading Dashboard</h1>
        <div className={styles.statusWrapper}>
          <span
            className={`${styles.statusDot} ${bgClassMap[status]} ${status !== "connected" ? styles.statusDotPulse : ""}`}
          />
          <span className={`${styles.statusText} ${statusClassMap[status]}`}>
            {status}
          </span>
          {lastError && <span className={styles.errorText}>({lastError})</span>}
        </div>
      </div>

      {/* Watchlist Section */}
      <div className={styles.watchlistSection}>
        <h2 className={styles.sectionTitle}>
          <span>★</span> Watchlist
        </h2>
        {favoriteSymbols.length === 0 ? (
          <div className={styles.watchlistEmpty}>
            Click the star on any symbol to add it to your watchlist
          </div>
        ) : (
          <div className={styles.priceGrid}>
            {favoriteSymbols.map(([symbol, price]) => renderPriceCard(symbol, price, true))}
          </div>
        )}
      </div>

      {/* All Symbols Section */}
      <div className={styles.allSymbolsSection}>
        <h2 className={styles.sectionTitle}>All Symbols</h2>
        {symbols.length === 0 ? (
          <div className={styles.emptyState}>Waiting for price data...</div>
        ) : (
          <div className={styles.priceGrid}>
            {otherSymbols.map(([symbol, price]) => renderPriceCard(symbol, price, false))}
          </div>
        )}
      </div>

      <PortfolioTable />
      {/* Footer */}
      <div className={styles.footer}>
        <span>Live prices update every 500ms</span>
        <span>{symbols.length} symbols tracked</span>
      </div>
    </div>
  );
}
