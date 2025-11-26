// src/components/PortfolioTable.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useWebSocketPrices } from "../Hooks/useWebSocketPrices";
import { usePortfolioStore } from "../store/Store";
import type { PortfolioItem } from "../store/Store";

type CombinedRow = PortfolioItem & {
  currentPrice?: number;
  totalValue?: number;
  dailyPnl?: number;
  dailyPnlPercent?: number;
};

export default function PortfolioTable() {
  const { prices, status } = useWebSocketPrices();
  const { portfolio, error, fetchPortfolio } = usePortfolioStore();

  // Fetch portfolio on mount
  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  // prevPrices ref to detect up/down flash
  const prevPricesRef = useRef<Record<string, number>>({});
  const [flashMap, setFlashMap] = useState<Record<string, "up" | "down" | "">>(
    {}
  );

  // when prices change, set flash for changed symbols
  useEffect(() => {
    const changed: Record<string, "up" | "down"> = {};
    for (const s of Object.keys(prices)) {
      const prev = prevPricesRef.current[s];
      const cur = prices[s];
      if (prev === undefined) continue; // first time, no flash
      if (cur > prev) changed[s] = "up";
      else if (cur < prev) changed[s] = "down";
    }
    if (Object.keys(changed).length > 0) {
      setFlashMap((m) => ({ ...m, ...changed }));
      // remove flash after 220ms
      const t = window.setTimeout(() => {
        setFlashMap((m) => {
          const copy = { ...m };
          for (const k of Object.keys(changed)) copy[k] = "";
          return copy;
        });
      }, 220);
      return () => clearTimeout(t);
    }
    // update prevPrices
    prevPricesRef.current = { ...prices };
  }, [prices]);

  // combined rows memoized
  const rows: CombinedRow[] = useMemo(() => {
    if (!portfolio) return [];
    return portfolio.map((p) => {
      const cp = prices[p.symbol];
      const totalValue = cp !== undefined ? +(cp * p.quantity) : undefined;
      const dailyPnl =
        cp !== undefined ? +(p.quantity * (cp - p.avgCost)) : undefined;
      const dailyPnlPercent =
        cp !== undefined ? +(((cp - p.avgCost) / p.avgCost) * 100) : undefined;
      return { ...p, currentPrice: cp, totalValue, dailyPnl, dailyPnlPercent };
    });
  }, [portfolio, prices]);

  // format helpers
  const fmt = (n?: number) =>
    n === undefined
      ? "-"
      : n.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

  if (error) {
    return (
      <div className="py-6 font-sans text-slate-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="m-0 text-xl font-semibold text-slate-50">Portfolio</h2>
          <div className="text-sm text-slate-500">Status: {status}</div>
        </div>
        <div className="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-lg text-center">
          Failed to load portfolio: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="py-6 font-sans text-slate-200">
      <div className="flex items-center justify-between mb-4">
        <h2 className="m-0 text-xl font-semibold text-slate-50">Portfolio</h2>
      </div>

      <div className="overflow-auto rounded-xl bg-slate-800 border border-slate-700">
        <table className="w-full border-collapse min-w-[720px]">
          <thead>
            <tr>
              <th className="p-3 px-4 text-left border-b border-slate-700 bg-slate-900 text-slate-400 font-medium uppercase text-xs tracking-wide sticky top-0">
                Symbol
              </th>
              <th className="p-3 px-4 text-left border-b border-slate-700 bg-slate-900 text-slate-400 font-medium uppercase text-xs tracking-wide sticky top-0">
                Quantity
              </th>
              <th className="p-3 px-4 text-left border-b border-slate-700 bg-slate-900 text-slate-400 font-medium uppercase text-xs tracking-wide sticky top-0">
                Avg Cost
              </th>
              <th className="p-3 px-4 text-left border-b border-slate-700 bg-slate-900 text-slate-400 font-medium uppercase text-xs tracking-wide sticky top-0">
                Current Price
              </th>
              <th className="p-3 px-4 text-left border-b border-slate-700 bg-slate-900 text-slate-400 font-medium uppercase text-xs tracking-wide sticky top-0">
                Total Value
              </th>
              <th className="p-3 px-4 text-left border-b border-slate-700 bg-slate-900 text-slate-400 font-medium uppercase text-xs tracking-wide sticky top-0">
                Daily P&L (%)
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center p-7 text-slate-500">
                  Loading portfolio...
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const flash = flashMap[r.symbol];
                const pnlClass =
                  r.dailyPnl && r.dailyPnl > 0
                    ? "text-emerald-500 font-semibold"
                    : r.dailyPnl && r.dailyPnl < 0
                    ? "text-red-500 font-semibold"
                    : "";
                const priceFlashClass =
                  flash === "up"
                    ? "bg-emerald-500/20 text-emerald-500"
                    : flash === "down"
                    ? "bg-red-500/20 text-red-500"
                    : "";
                return (
                  <tr
                    key={r.symbol}
                    className="hover:bg-slate-700 transition-colors"
                  >
                    <td className="p-3 px-4 text-left border-b border-slate-700 text-sm font-semibold text-slate-50">
                      {r.symbol}
                    </td>
                    <td className="p-3 px-4 text-left border-b border-slate-700 text-sm text-slate-200">
                      {r.quantity}
                    </td>
                    <td className="p-3 px-4 text-left border-b border-slate-700 text-sm text-slate-200">
                      {fmt(r.avgCost)}
                    </td>
                    <td className="p-3 px-4 text-left border-b border-slate-700 text-sm text-slate-200">
                      <span
                        className={`inline-block px-2 py-1.5 rounded transition-all duration-200 ${priceFlashClass}`}
                      >
                        {r.currentPrice === undefined
                          ? "-"
                          : fmt(r.currentPrice)}
                      </span>
                    </td>
                    <td className="p-3 px-4 text-left border-b border-slate-700 text-sm text-slate-200">
                      {r.totalValue === undefined ? "-" : fmt(r.totalValue)}
                    </td>
                    <td
                      className={`p-3 px-4 text-left border-b border-slate-700 text-sm ${pnlClass}`}
                    >
                      {r.dailyPnl === undefined
                        ? "-"
                        : `${fmt(r.dailyPnl)} (${r.dailyPnlPercent!.toFixed(
                            2
                          )}%)`}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
