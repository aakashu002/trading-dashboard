# Trading Dashboard

A real-time trading dashboard built with React, TypeScript, and WebSocket integration. The application displays live stock prices, portfolio tracking, and a customizable watchlist with persistent favorites.

## Project Overview

This trading dashboard provides:

- **Live Price Tracking**: Real-time stock price updates via WebSocket connection (with mock data fallback)
- **Portfolio Management**: View your portfolio holdings with calculated P&L (Profit & Loss)
- **Watchlist**: Add/remove favorite symbols with persistent storage (localStorage)
- **Price Change Indicators**: Visual indicators showing price movement direction (up/down/neutral)
- **Responsive Design**: Dark-themed UI that works across different screen sizes

### Key Features

| Feature | Description |
|---------|-------------|
| Real-time Updates | Prices update every 200ms via WebSocket buffering |
| Watchlist | Star symbols to add to your personal watchlist |
| Portfolio Table | View holdings, average cost, current price, total value, and daily P&L |
| Price Flash | Green/red flash animation on price changes |
| Connection Status | Live indicator showing WebSocket connection state |
| Lazy Loading | PortfolioTable is lazy-loaded for better initial performance |

## Tech Stack

### Core Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.2.0 | UI library |
| TypeScript | 5.9.3 | Type-safe JavaScript |
| Vite | 7.2.4 | Build tool & dev server |

### State Management & Styling

| Technology | Version | Purpose |
|------------|---------|---------|
| Zustand | 5.0.8 | Lightweight state management |
| Tailwind CSS | 4.1.17 | Utility-first CSS framework |
| CSS Modules | - | Scoped component styles |

### Testing

| Technology | Version | Purpose |
|------------|---------|---------|
| Vitest | 3.2.4 | Unit testing framework |
| Testing Library | 16.3.0 | React component testing |
| jsdom | 26.1.0 | DOM environment for tests |

### Development Tools

| Technology | Purpose |
|------------|---------|
| ESLint | Code linting |
| TypeScript ESLint | TypeScript-aware linting |

## Project Structure

```
trading-dashboard/
├── public/
│   └── portfolio.json          # Mock portfolio data
├── src/
│   ├── Component/
│   │   ├── LiveTracker.tsx     # Main dashboard component
│   │   ├── LiveTracker.module.css
│   │   └── PortfolioTable.tsx  # Portfolio table (lazy loaded)
│   ├── Hooks/
│   │   └── useWebSocketPrices.ts  # WebSocket hook
│   ├── store/
│   │   └── Store.ts            # Zustand stores (Portfolio + WebSocket)
│   ├── utils/
│   │   └── portfolioCalculations.ts  # Portfolio calculation utilities
│   ├── test/
│   │   ├── setup.ts            # Test setup
│   │   └── portfolioCalculations.test.ts  # Unit tests
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── package.json
├── vite.config.ts
├── vitest.config.ts
├── tsconfig.json
└── README.md
```

## Setup and Installation

### Prerequisites

- **Node.js**: Version 20.19.0 or higher (recommended: 22.x)
- **npm**: Version 10.x or higher
- **Git**: For cloning the repository

### Step 1: Clone the Repository

```bash
git clone https://github.com/aakashu002/trading-dashboard.git
cd trading-dashboard
```

### Step 2: Install Dependencies

```bash
npm install
```

This will install all required dependencies including React, Zustand, Tailwind CSS, and development tools.

### Step 3: Environment Configuration (Optional)

Create a `.env` file in the root directory to customize settings:

```env
# WebSocket URL (defaults to mock if not set)
VITE_WS_URL=wss://api.mock-trading.com/live-feed

# Enable/disable mock data (defaults to "true")
VITE_USE_MOCK=true
```

**Note**: By default, the app runs with mock data (`VITE_USE_MOCK=true`), which simulates WebSocket price updates without requiring a real server.

### Step 4: Add Portfolio Data

Ensure `public/portfolio.json` exists with your portfolio data:

```json
[
  { "symbol": "AAPL", "quantity": 100, "avgCost": 150.00 },
  { "symbol": "GOOGL", "quantity": 50, "avgCost": 2500.00 },
  { "symbol": "TSLA", "quantity": 25, "avgCost": 700.00 },
  { "symbol": "MSFT", "quantity": 75, "avgCost": 300.00 }
]
```

## Running the Application

### Development Mode

Start the development server with hot module replacement:

```bash
npm run dev
```

The application will be available at: **http://localhost:5173**

### Production Build

Create an optimized production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

### Running Tests

Run tests in watch mode:

```bash
npm run test
```

Run tests once (CI mode):

```bash
npm run test:run
```

### Linting

Check code for linting errors:

```bash
npm run lint
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run test` | Run tests in watch mode |
| `npm run test:run` | Run tests once |
| `npm run lint` | Run ESLint |

## How It Works

### Data Flow Architecture

```
┌─────────────────┐     500ms      ┌──────────┐     200ms     ┌─────────────┐
│ WebSocket/Mock  │ ────────────► │  Buffer  │ ───────────► │   Zustand   │
│ Price Generator │   push msg     │          │   flush       │   Store     │
└─────────────────┘                └──────────┘               └──────┬──────┘
                                                                     │
                                                          state change
                                                                     │
┌─────────────────┐                ┌──────────┐               ┌──────▼──────┐
│   UI Updates    │ ◄───────────── │ useMemo  │ ◄──────────── │  Component  │
│   (re-render)   │                │ recalcs  │               │ subscribes  │
└─────────────────┘                └──────────┘               └─────────────┘
```

### Portfolio Calculations

The app calculates the following metrics for each portfolio item:

| Metric | Formula |
|--------|---------|
| Total Value | `quantity × currentPrice` |
| Daily P&L | `quantity × (currentPrice - avgCost)` |
| Daily P&L % | `((currentPrice - avgCost) / avgCost) × 100` |

### State Management

The application uses two Zustand stores:

1. **usePortfolioStore**: Manages portfolio data fetching and caching
2. **useWebSocketStore**: Manages WebSocket connection, buffering, and price state

## Troubleshooting

### Common Issues

**1. Node.js version warning**

If you see engine warnings during `npm install`, upgrade Node.js to version 20.19.0 or higher:

```bash
# Using nvm
nvm install 22
nvm use 22
```

**2. WebSocket connection fails**

The app defaults to mock mode. To use a real WebSocket server:
- Set `VITE_USE_MOCK=false` in `.env`
- Ensure `VITE_WS_URL` points to a valid WebSocket endpoint

**3. Portfolio not loading**

Ensure `public/portfolio.json` exists and contains valid JSON array.

**4. Styles not loading**

Make sure Tailwind CSS is properly configured. Run:

```bash
npm run dev
```

And check the browser console for any CSS-related errors.

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add your feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

## License

This project is private and not licensed for public distribution.
