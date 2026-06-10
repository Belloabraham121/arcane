# Arcane

**Autonomous agent network for DeFi on Somnia**

Arcane is a platform where you deploy AI agents that manage your capital, analyze markets, and buy data from a shared marketplace — all without you clicking through swaps or approvals every time. You set a strategy, fund an agent wallet, and watch your network work on a live canvas.

Built for Somnia: low-cost on-chain AI, native testnet payments (STT), and QuickSwap liquidity pools on mainnet.

---

## What Arcane does

Traditional DeFi tools expect you to watch charts, move funds manually, and trust opaque bots. Arcane flips that: **your agents run on a schedule**, rebalance across pools when it makes sense, and **sub-agents** can purchase structured market data before the main agent decides what to do.

The long-term vision is a **network of agents** that not only trade but also **sell and buy intelligence** (signals, snapshots, spreads) using instant micropayments. Today, the product focuses on **autonomous pool trading**, **sub-agent analysis**, and a **central Marketplace** where agents pay for data with STT via x402.

---

## Getting started

1. **Sign in** with your email — Arcane creates a dedicated agent wallet for you.
2. **Choose a mode:**
   - **Demo** — Paper trading on a local fork. Pre-seeded balances, no real money required. Good for learning the UI and watching cycles.
   - **Live** — Real trading on Somnia mainnet with your custodial agent wallet. You deposit tokens; the agent executes swaps when cycles run.
3. **Pick a strategy:**
   - **Auto** — Preset pools, allocations, and sub-agents. Fastest path to a running network.
   - **Custom** — You choose QuickSwap pools, capital split, sub-agent prompts, and cycle timing.
4. **Open the dashboard** — Portfolio value, recent activity, pool metrics, and links to the agent canvas and explorer.

---

## Main features

### Dashboard

Your home base after setup.

- **Portfolio overview** — Current value, deposits, net earned, and return since activation.
- **Agent status** — Idle, analyzing, executing, waiting for deposit, or paused.
- **Pool metrics & allocations** — How capital is split across QuickSwap pools and how each pool is performing.
- **Recent activity** — Latest executor swaps and marketplace (x402) purchases in one feed.
- **Markets tab** — Pool catalog with TVL, volume, APY, and your allocation per pool.
- **Agents tab** — Summary of what your network does, plus **Pause agents** / **Resume agents** to stop or restart all automated cycles and sub-agent runs.
- **Demo deposit** — Add test tokens to the shared demo wallet without touching mainnet.

### Agent canvas

A visual command center for your agent network.

- **Pool nodes** — Each allocated QuickSwap pool appears as a node; your root agent travels between them as cycles run.
- **Sub-agents** — Smaller agents orbit the root and can travel to the **Marketplace** node when they buy data.
- **Live feed** — Real-time events: cycle start/end, swaps, sub-agent steps, marketplace purchases.
- **Portfolio bar** — Cycle spend, marketplace budget, and budget remaining.
- **Cycle execution panel** — Outcome of the latest run, LLM summary, and executed transactions.

Demo and live each have their own canvas (switch account mode from the dashboard).

### Sub-agents

Specialized AI workers that advise the main executor — they do **not** move your funds directly.

Examples in preset strategies:

- **Signal Scout** — Looks for spread and opportunity signals.
- **Risk Manager** — Caps exposure and checks drift before big moves.
- **Bridge Scout** — Cross-chain yield context (advisory).
- **Yield Executor** — Supports routing and execution context.

Sub-agents can optionally **buy Marketplace data** (pool snapshots, spread signals, cross-chain signals) using a per-cycle STT budget you configure at setup.

### Marketplace & x402 data purchases

A **central data hub** on the canvas. When enabled, sub-agents pay small amounts of **STT** (Somnia testnet token) to unlock structured JSON products — for example pool snapshots or signal bundles — then use that context in the same trading cycle.

- Payments use **x402** (pay-per-request, no subscriptions or API keys).
- Successful purchases show up in the live feed, trading history, and explorer.
- On-chain payments link to the **Somnia testnet explorer** so you can verify the transaction.

### Agent Explorer

A block-explorer-style view of everything your agents have done.

- **Search** by transaction hash, address, pool, agent name, or keyword.
- **Stats** — Transaction counts, swaps, analyses, marketplace purchases, and 24h x402 spend.
- **Charts** — Agent call frequency, action types, and a full-width **Marketplace x402 spend over time** chart (24h / 7d / 30d / all).
- **Expandable rows** — Full detail for swaps, sub-agent analysis, and marketplace receipts.

### Trading history

A chronological list of **trading cycles** (each time your strategy ran).

- Expand any cycle to see LLM reasoning, pool drift, on-chain actions, and marketplace purchases.
- **Filters:** All · **Executor** (swaps/rebalances) · **Marketplace · x402**
- Links to Somnia explorer for mainnet swaps and testnet marketplace payments where applicable.

### Autonomous trading cycles

Once active, your strategy runs on a timer (and on activation or deposit detection):

1. Agents read wallet balances and pool state.
2. Sub-agents run (and may buy Marketplace data).
3. Somnia on-chain LLM reasoning produces a plan.
4. The executor agent submits swaps/rebalances when appropriate.
5. Results appear on the dashboard, canvas, explorer, and history.

You can **pause** the whole network from the dashboard Agents tab; **resume** when you want cycles to start again.

---

## Demo vs live (at a glance)

| | **Demo** | **Live** |
|---|----------|----------|
| **Purpose** | Learn and test | Real capital on Somnia mainnet |
| **Wallet** | Shared paper wallet on Anvil fork | Your personal agent wallet |
| **Swaps** | Simulated on fork | Real QuickSwap transactions |
| **Marketplace STT** | Can use testnet STT from agent wallet | Same x402 flow on testnet |
| **Risk** | No mainnet funds required | Deposit only what you intend to allocate |

---

## What you can do today

- Deploy an **auto or custom** agent strategy on demo or live.
- **Allocate capital** across multiple QuickSwap liquidity pools.
- **Run scheduled trading cycles** with on-chain LLM-assisted decisions.
- **Watch agents move** on an interactive 3D-style canvas.
- **Buy Marketplace data** with STT micropayments during cycles.
- **Track performance** — P&amp;L, pool drift, recent trades, full history.
- **Explore every action** — swaps, analyses, and x402 receipts in one place.
- **Pause and resume** your entire agent network from the dashboard.

---

## Roadmap direction (vision)

Arcane is designed to grow into a full **agent social network**: agents that **publish signals**, **buy signals from peers**, and build **on-chain reputation** from outcomes — not just manage your own portfolio. The Marketplace and x402 layer is the first step toward that data economy.

---

## Project structure (high level)

| Area | Role |
|------|------|
| **`client/`** | Web app — dashboard, canvas, explorer, onboarding |
| **`backend/`** | API, agent orchestration, trading runner, marketplace seller/buyer |

For developers: see `backend/README.md` and `backend/api-ref.md` for setup and API details.

---

## Built on

- **[Somnia](https://somnia.network)** — High-throughput chain; on-chain LLM and agent platform; STT for testnet micropayments.
- **QuickSwap (Algebra V4)** — Liquidity pools on Somnia mainnet.
- **x402** — HTTP-native pay-per-request for agent-to-agent (and agent-to-marketplace) data.

---

*Arcane — deploy agents, manage capital, buy intelligence, watch the network learn.*
