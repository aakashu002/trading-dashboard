// src/hooks/useWebSocketPrices.ts
import { useEffect } from "react";
import { useWebSocketStore } from "../store/Store";
export type { ConnStatus, PriceMsg } from "../store/Store";

/**
 * useWebSocketPrices
 * - returns { prices, status }
 * - prices is a Record<symbol, price>
 * - implements buffering (200ms flush) and reconnect backoff
 */
export function useWebSocketPrices() {
  const prices = useWebSocketStore((state) => state.prices);
  const status = useWebSocketStore((state) => state.status);
  const connect = useWebSocketStore((state) => state.connect);
  const disconnect = useWebSocketStore((state) => state.disconnect);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return { prices, status };
}
