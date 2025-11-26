export type PortfolioItem = {
  symbol: string;
  quantity: number;
  avgCost: number;
};

export type CalculatedPortfolioItem = PortfolioItem & {
  currentPrice: number | undefined;
  totalValue: number | undefined;
  dailyPnl: number | undefined;
  dailyPnlPercent: number | undefined;
};

/**
 * Calculate total value of a position
 * Formula: quantity × currentPrice
 */
export function calculateTotalValue(
  quantity: number,
  currentPrice: number | undefined
): number | undefined {
  if (currentPrice === undefined) return undefined;
  return +(quantity * currentPrice);
}

/**
 * Calculate daily P&L (profit/loss) in dollars
 * Formula: quantity × (currentPrice - avgCost)
 */
export function calculateDailyPnl(
  quantity: number,
  avgCost: number,
  currentPrice: number | undefined
): number | undefined {
  if (currentPrice === undefined) return undefined;
  return +(quantity * (currentPrice - avgCost));
}

/**
 * Calculate daily P&L as percentage
 * Formula: ((currentPrice - avgCost) / avgCost) × 100
 */
export function calculateDailyPnlPercent(
  avgCost: number,
  currentPrice: number | undefined
): number | undefined {
  if (currentPrice === undefined) return undefined;
  if (avgCost === 0) return undefined; // Prevent division by zero
  return +(((currentPrice - avgCost) / avgCost) * 100);
}

/**
 * Calculate all portfolio metrics for a single item
 */
export function calculatePortfolioItemMetrics(
  item: PortfolioItem,
  currentPrice: number | undefined
): CalculatedPortfolioItem {
  return {
    ...item,
    currentPrice,
    totalValue: calculateTotalValue(item.quantity, currentPrice),
    dailyPnl: calculateDailyPnl(item.quantity, item.avgCost, currentPrice),
    dailyPnlPercent: calculateDailyPnlPercent(item.avgCost, currentPrice),
  };
}

/**
 * Calculate metrics for entire portfolio
 */
export function calculatePortfolioMetrics(
  portfolio: PortfolioItem[],
  prices: Record<string, number>
): CalculatedPortfolioItem[] {
  return portfolio.map((item) =>
    calculatePortfolioItemMetrics(item, prices[item.symbol])
  );
}

/**
 * Calculate total portfolio value (sum of all positions)
 */
export function calculateTotalPortfolioValue(
  portfolio: PortfolioItem[],
  prices: Record<string, number>
): number {
  return portfolio.reduce((total, item) => {
    const price = prices[item.symbol];
    if (price === undefined) return total;
    return total + item.quantity * price;
  }, 0);
}

/**
 * Calculate total portfolio P&L
 */
export function calculateTotalPortfolioPnl(
  portfolio: PortfolioItem[],
  prices: Record<string, number>
): number {
  return portfolio.reduce((total, item) => {
    const price = prices[item.symbol];
    if (price === undefined) return total;
    return total + item.quantity * (price - item.avgCost);
  }, 0);
}

/**
 * Format number to currency string
 */
export function formatCurrency(n: number | undefined): string {
  if (n === undefined) return "-";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
