# Motor Equity Compass

An automotive sales desk simulator and ownership digital twin designed to model real-world vehicle equity, depreciation crossovers, and total cost of ownership (TCO) side-by-side with lot inventory.

🔗 **Live Application:** [motor-equity-compass.lovable.app](https://motor-equity-compass.lovable.app)

---

## ⚡ Overview

Motor Equity Compass bridges dealership lot management and consumer finance clarity. Instead of looking solely at a monthly note, the application models true monthly cash outlay by pairing real-time loan amortization against vehicle operational costs (fuel economy, maintenance index, depreciation, and equity crossover points).

### Key Features

- **Dealership Desk Simulator:** Adjust vehicle price, down payment, trade allowance, APR, and terms (48–84 months) with instant payment calculations.
- **Equity Crossover & Depreciation Twin:** Visualizes loan payoff curves against estimated vehicle depreciation to pinpoint the exact month of positive trade equity.
- **Real-Time VIN Decoding & Specs:** Integrates with the public NHTSA VPIC API to resolve VINs into displacement, cylinder counts, and drive type.
- **EPA Fuel & Maintenance Indexing:** Connects to Fueleconomy.gov endpoints and algorithmic brand-level maintenance curves to project realistic operational overhead.
- **Google Sheets & CRM Sync:** Ingests live dealership inventory directly via Google Apps Script web endpoints.
- **Mobile-First PWA:** Built to run responsively on mobile devices and showroom tablets.

---

## 🛠️ Tech Stack

- **Framework:** [TanStack Start](https://tanstack.com/start) / React with TypeScript
- **Styling & UI:** Tailwind CSS, Radix UI primitives, Lucide Icons
- **Database & Backend:** Supabase, Drizzle ORM
- **Runtime & Bundler:** Vite, Bun / Node.js
- **Prototyping & CI/CD:** [Lovable](https://lovable.dev) with automatic GitHub sync

---

## 🚀 Getting Started

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) (v18+) or [Bun](https://bun.sh/) installed locally.

### Installation

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/Rogerrobert9595/motor-equity-compass.git](https://github.com/Rogerrobert9595/motor-equity-compass.git)
   cd motor-equity-compass