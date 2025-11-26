// src/hooks/useWebSocketPrices.ts
import { useEffect, useRef, useState } from "react";

export type ConnStatus = "connected" | "reconnecting" | "disconnected" | "connecting";
export type PriceMsg = { symbol: string; price: number };

const WS_URL = import.meta.env.VITE_WS_URL ?? "wss://api.mock-trading.com/live-feed";
const USE_MOCK = (import.meta.env.VITE_USE_MOCK ?? "true") === "true";

/**
 * useWebSocketPrices
 * - returns { prices, status }
 * - prices is a Record<symbol, price>
 * - implements buffering (200ms flush) and reconnect backoff
 */
export function useWebSocketPrices() {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<ConnStatus>("connecting");

  const wsRef = useRef<WebSocket | null>(null);
  const bufferRef = useRef<PriceMsg[]>([]);
  const backoffRef = useRef<number>(1000);
  const reconnectTimerRef = useRef<number | null>(null);
  const closedExplicitlyRef = useRef(false);

  function createSocket() {
    setStatus("connecting");
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        backoffRef.current = 1000;
        setStatus("connected");
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as PriceMsg;
          if (data?.symbol && typeof data.price === "number") {
            bufferRef.current.push(data);
          }
        } catch {
          // ignore invalid messages
        }
      };

      ws.onerror = () => {
        setStatus("reconnecting");
      };

      ws.onclose = (ev) => {
        if (closedExplicitlyRef.current) {
          setStatus("disconnected");
          return;
        }
        setStatus("reconnecting");
        scheduleReconnect();
      };
    } catch (err) {
      setStatus("reconnecting");
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    const backoff = backoffRef.current;
    if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = window.setTimeout(() => {
      backoffRef.current = Math.min(32000, backoffRef.current * 2);
      createSocket();
    }, backoff);
  }

  // flush buffer to state every 200ms
  useEffect(() => {
    const id = window.setInterval(() => {
      if (bufferRef.current.length === 0) return;
      const batch = bufferRef.current.splice(0);
      setPrices((prev) => {
        const next = { ...prev };
        for (const m of batch) next[m.symbol] = m.price;
        return next;
      });
    }, 200);
    return () => clearInterval(id);
  }, []);

  // mount: either mock or real socket
  useEffect(() => {
    if (USE_MOCK) {
      setStatus("connected");
      const symbols = ["AAPL", "GOOGL", "TSLA", "MSFT", "AMZN"];
      const t = window.setInterval(() => {
        const sym = symbols[Math.floor(Math.random() * symbols.length)];
        const price = +(100 + Math.random() * 3000).toFixed(2);
        bufferRef.current.push({ symbol: sym, price });
      }, 500);
      return () => clearInterval(t);
    }

    createSocket();

    return () => {
      closedExplicitlyRef.current = true;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      const ws = wsRef.current;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { prices, status };
}
