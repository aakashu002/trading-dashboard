import { lazy, Suspense, useEffect, useRef, useState } from "react";
import styles from "./LiveTracker.module.css";
import { useWebSocketPrices } from "../Hooks/useWebSocketPrices";
import type { ConnStatus } from "../store/Store";

const PortfolioTable = lazy(() => import("./PortfolioTable"));

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
  const { prices, status } = useWebSocketPrices();
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);
  const prevPrices = useRef<Record<string, number>>({});

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
    prevPrices.current = { ...prices };
  }, [prices]);

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

  const symbols = Object.entries(prices);
  const favoriteSymbols = symbols.filter(([sym]) => favorites.has(sym));
  const otherSymbols = symbols;

  const renderPriceCard = (
    symbol: string,
    price: number,
    isWatchlist = false
  ) => {
    const change = getPriceChange(symbol, price);
    const isFavorite = favorites.has(symbol);
    return (
      <div
        key={symbol}
        className={isWatchlist ? styles.watchlistCard : styles.priceCard}
      >
        <div className={styles.cardHeader}>
          <div
            className={styles.symbolClickable}
            onClick={() => toggleFavorite(symbol)}
          >
            <button
              className={`${styles.starButton} ${
                isFavorite ? styles.starFilled : styles.starEmpty
              }`}
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
          <span
            className={`${styles.changeIndicator} ${priceClassMap[change]}`}
          >
            {change === "up" ? "▲" : change === "down" ? "▼" : "●"}
          </span>
        </div>
        <div className={`${styles.price} ${priceClassMap[change]}`}>
          $
          {price.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
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
            className={`${styles.statusDot} ${bgClassMap[status]} ${
              status !== "connected" ? styles.statusDotPulse : ""
            }`}
          />
          <span className={`${styles.statusText} ${statusClassMap[status]}`}>
            {status}
          </span>
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
            {favoriteSymbols.map(([symbol, price]) =>
              renderPriceCard(symbol, price, true)
            )}
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
            {otherSymbols.map(([symbol, price]) =>
              renderPriceCard(symbol, price, false)
            )}
          </div>
        )}
      </div>

      <Suspense
        fallback={
          <div className="py-6 text-center text-slate-500">
            Loading portfolio...
          </div>
        }
      >
        <PortfolioTable />
      </Suspense>
      {/* Footer */}
      <div className={styles.footer}>
        <span>Live prices update every 200ms</span>
        <span>{symbols.length} symbols tracked</span>
      </div>
    </div>
  );
}
