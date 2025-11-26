import { describe, it, expect } from "vitest";
import {
  calculateTotalValue,
  calculateDailyPnl,
  calculateDailyPnlPercent,
  calculatePortfolioItemMetrics,
  calculatePortfolioMetrics,
  calculateTotalPortfolioValue,
  calculateTotalPortfolioPnl,
  formatCurrency,
  type PortfolioItem,
} from "../utils/portfolioCalculations";

describe("Portfolio Calculations", () => {
  // ============ calculateTotalValue ============
  describe("calculateTotalValue", () => {
    it("should calculate total value correctly", () => {
      // 100 shares × $150.00 = $15,000.00
      expect(calculateTotalValue(100, 150)).toBe(15000);
    });

    it("should handle decimal prices", () => {
      // 50 shares × $175.50 = $8,775.00
      expect(calculateTotalValue(50, 175.5)).toBe(8775);
    });

    it("should return undefined when price is undefined", () => {
      expect(calculateTotalValue(100, undefined)).toBeUndefined();
    });

    it("should return 0 when quantity is 0", () => {
      expect(calculateTotalValue(0, 150)).toBe(0);
    });

    it("should handle large quantities", () => {
      // 10,000 shares × $500.00 = $5,000,000
      expect(calculateTotalValue(10000, 500)).toBe(5000000);
    });
  });

  // ============ calculateDailyPnl ============
  describe("calculateDailyPnl", () => {
    it("should calculate positive P&L (profit)", () => {
      // 100 shares × ($175.00 - $150.00) = 100 × $25 = $2,500
      expect(calculateDailyPnl(100, 150, 175)).toBe(2500);
    });

    it("should calculate negative P&L (loss)", () => {
      // 100 shares × ($125.00 - $150.00) = 100 × (-$25) = -$2,500
      expect(calculateDailyPnl(100, 150, 125)).toBe(-2500);
    });

    it("should return 0 when price equals avgCost", () => {
      // 100 shares × ($150.00 - $150.00) = 0
      expect(calculateDailyPnl(100, 150, 150)).toBe(0);
    });

    it("should return undefined when price is undefined", () => {
      expect(calculateDailyPnl(100, 150, undefined)).toBeUndefined();
    });

    it("should handle decimal values", () => {
      // 50 shares × ($155.75 - $150.25) = 50 × $5.50 = $275
      expect(calculateDailyPnl(50, 150.25, 155.75)).toBe(275);
    });
  });

  // ============ calculateDailyPnlPercent ============
  describe("calculateDailyPnlPercent", () => {
    it("should calculate positive percentage", () => {
      // (($175 - $150) / $150) × 100 = 16.666...%
      const result = calculateDailyPnlPercent(150, 175);
      expect(result).toBeCloseTo(16.67, 1);
    });

    it("should calculate negative percentage", () => {
      // (($125 - $150) / $150) × 100 = -16.666...%
      const result = calculateDailyPnlPercent(150, 125);
      expect(result).toBeCloseTo(-16.67, 1);
    });

    it("should return 0 when price equals avgCost", () => {
      expect(calculateDailyPnlPercent(150, 150)).toBe(0);
    });

    it("should return undefined when price is undefined", () => {
      expect(calculateDailyPnlPercent(150, undefined)).toBeUndefined();
    });

    it("should return undefined when avgCost is 0 (prevent division by zero)", () => {
      expect(calculateDailyPnlPercent(0, 100)).toBeUndefined();
    });

    it("should handle 100% gain", () => {
      // (($300 - $150) / $150) × 100 = 100%
      expect(calculateDailyPnlPercent(150, 300)).toBe(100);
    });

    it("should handle 50% loss", () => {
      // (($75 - $150) / $150) × 100 = -50%
      expect(calculateDailyPnlPercent(150, 75)).toBe(-50);
    });
  });

  // ============ calculatePortfolioItemMetrics ============
  describe("calculatePortfolioItemMetrics", () => {
    const portfolioItem: PortfolioItem = {
      symbol: "AAPL",
      quantity: 100,
      avgCost: 150,
    };

    it("should calculate all metrics for a portfolio item", () => {
      const result = calculatePortfolioItemMetrics(portfolioItem, 175);

      expect(result.symbol).toBe("AAPL");
      expect(result.quantity).toBe(100);
      expect(result.avgCost).toBe(150);
      expect(result.currentPrice).toBe(175);
      expect(result.totalValue).toBe(17500); // 100 × $175
      expect(result.dailyPnl).toBe(2500); // 100 × ($175 - $150)
      expect(result.dailyPnlPercent).toBeCloseTo(16.67, 1); // 16.67%
    });

    it("should handle undefined price", () => {
      const result = calculatePortfolioItemMetrics(portfolioItem, undefined);

      expect(result.symbol).toBe("AAPL");
      expect(result.quantity).toBe(100);
      expect(result.avgCost).toBe(150);
      expect(result.currentPrice).toBeUndefined();
      expect(result.totalValue).toBeUndefined();
      expect(result.dailyPnl).toBeUndefined();
      expect(result.dailyPnlPercent).toBeUndefined();
    });

    it("should handle loss scenario", () => {
      const result = calculatePortfolioItemMetrics(portfolioItem, 120);

      expect(result.totalValue).toBe(12000); // 100 × $120
      expect(result.dailyPnl).toBe(-3000); // 100 × ($120 - $150)
      expect(result.dailyPnlPercent).toBe(-20); // -20%
    });
  });

  // ============ calculatePortfolioMetrics ============
  describe("calculatePortfolioMetrics", () => {
    const portfolio: PortfolioItem[] = [
      { symbol: "AAPL", quantity: 100, avgCost: 150 },
      { symbol: "GOOGL", quantity: 50, avgCost: 2500 },
      { symbol: "TSLA", quantity: 25, avgCost: 700 },
    ];

    const prices: Record<string, number> = {
      AAPL: 175,
      GOOGL: 2800,
      TSLA: 650,
    };

    it("should calculate metrics for entire portfolio", () => {
      const results = calculatePortfolioMetrics(portfolio, prices);

      expect(results).toHaveLength(3);

      // AAPL
      expect(results[0].symbol).toBe("AAPL");
      expect(results[0].totalValue).toBe(17500);
      expect(results[0].dailyPnl).toBe(2500);

      // GOOGL
      expect(results[1].symbol).toBe("GOOGL");
      expect(results[1].totalValue).toBe(140000); // 50 × $2800
      expect(results[1].dailyPnl).toBe(15000); // 50 × ($2800 - $2500)

      // TSLA
      expect(results[2].symbol).toBe("TSLA");
      expect(results[2].totalValue).toBe(16250); // 25 × $650
      expect(results[2].dailyPnl).toBe(-1250); // 25 × ($650 - $700)
    });

    it("should handle missing prices", () => {
      const partialPrices = { AAPL: 175 }; // Only AAPL has price
      const results = calculatePortfolioMetrics(portfolio, partialPrices);

      expect(results[0].currentPrice).toBe(175);
      expect(results[1].currentPrice).toBeUndefined();
      expect(results[2].currentPrice).toBeUndefined();
    });

    it("should handle empty portfolio", () => {
      const results = calculatePortfolioMetrics([], prices);
      expect(results).toHaveLength(0);
    });
  });

  // ============ calculateTotalPortfolioValue ============
  describe("calculateTotalPortfolioValue", () => {
    const portfolio: PortfolioItem[] = [
      { symbol: "AAPL", quantity: 100, avgCost: 150 },
      { symbol: "GOOGL", quantity: 50, avgCost: 2500 },
    ];

    it("should calculate total portfolio value", () => {
      const prices = { AAPL: 175, GOOGL: 2800 };
      // (100 × $175) + (50 × $2800) = $17,500 + $140,000 = $157,500
      expect(calculateTotalPortfolioValue(portfolio, prices)).toBe(157500);
    });

    it("should skip items without prices", () => {
      const prices = { AAPL: 175 }; // Only AAPL
      // 100 × $175 = $17,500
      expect(calculateTotalPortfolioValue(portfolio, prices)).toBe(17500);
    });

    it("should return 0 for empty portfolio", () => {
      expect(calculateTotalPortfolioValue([], { AAPL: 175 })).toBe(0);
    });

    it("should return 0 when no prices available", () => {
      expect(calculateTotalPortfolioValue(portfolio, {})).toBe(0);
    });
  });

  // ============ calculateTotalPortfolioPnl ============
  describe("calculateTotalPortfolioPnl", () => {
    const portfolio: PortfolioItem[] = [
      { symbol: "AAPL", quantity: 100, avgCost: 150 },
      { symbol: "GOOGL", quantity: 50, avgCost: 2500 },
      { symbol: "TSLA", quantity: 25, avgCost: 700 },
    ];

    it("should calculate total portfolio P&L", () => {
      const prices = { AAPL: 175, GOOGL: 2800, TSLA: 650 };
      // AAPL: 100 × ($175 - $150) = $2,500
      // GOOGL: 50 × ($2800 - $2500) = $15,000
      // TSLA: 25 × ($650 - $700) = -$1,250
      // Total: $2,500 + $15,000 - $1,250 = $16,250
      expect(calculateTotalPortfolioPnl(portfolio, prices)).toBe(16250);
    });

    it("should handle all losses", () => {
      const prices = { AAPL: 100, GOOGL: 2000, TSLA: 500 };
      // AAPL: 100 × ($100 - $150) = -$5,000
      // GOOGL: 50 × ($2000 - $2500) = -$25,000
      // TSLA: 25 × ($500 - $700) = -$5,000
      // Total: -$35,000
      expect(calculateTotalPortfolioPnl(portfolio, prices)).toBe(-35000);
    });

    it("should skip items without prices", () => {
      const prices = { AAPL: 175 };
      // Only AAPL: 100 × ($175 - $150) = $2,500
      expect(calculateTotalPortfolioPnl(portfolio, prices)).toBe(2500);
    });
  });

  // ============ formatCurrency ============
  describe("formatCurrency", () => {
    it("should format positive numbers", () => {
      expect(formatCurrency(1234.56)).toBe("1,234.56");
    });

    it("should format negative numbers", () => {
      expect(formatCurrency(-1234.56)).toBe("-1,234.56");
    });

    it("should format whole numbers with decimals", () => {
      expect(formatCurrency(1000)).toBe("1,000.00");
    });

    it("should format small decimals", () => {
      expect(formatCurrency(0.5)).toBe("0.50");
    });

    it("should return dash for undefined", () => {
      expect(formatCurrency(undefined)).toBe("-");
    });

    it("should format large numbers", () => {
      expect(formatCurrency(1234567.89)).toBe("1,234,567.89");
    });

    it("should format zero", () => {
      expect(formatCurrency(0)).toBe("0.00");
    });
  });
});
