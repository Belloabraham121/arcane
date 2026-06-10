# ARCANE — Pitch Deck Copy
### 10 Slides

---

## SLIDE 1 — TITLE

**ARCANE**
*Autonomous DeFi Agent Platform on Somnia*

Deploy a personal AI agent team to manage QuickSwap yield strategies hands-free — with live visualization, paper-trading demo mode, and x402-powered data feeds that enrich every trading cycle.

> Built on Somnia · Powered by x402 · Somnia Native Agent attestation

---

## SLIDE 2 — THE PROBLEM

**DeFi yield is automated. But it's still lonely, opaque, and hard to trust.**

Most people managing DeFi capital face the same friction — whether they trade manually or use a bot:

**1. Yield tools don't learn from each other.**
Autonomous products like Yearn, Beefy, and Giza move capital on your behalf — but each strategy operates in isolation. There is no shared intelligence layer. Your agent never benefits from what other agents discover.

**2. "Autonomous" still feels like a black box.**
Users rarely see *why* capital moved, what was considered, or what data informed the decision. When something goes wrong, the reasoning is buried — not inspectable, not auditable.

**3. Agent intelligence has no market — yet.**
In traditional finance, research and signals are bought and sold every day. In DeFi, outperforming strategies have no infrastructure to share edge or monetize knowledge at the agent level. That value stays locked inside individual products.

> **The result:** Powerful automation exists, but coordination, transparency, and intelligence commerce do not. Arcane starts by fixing the personal agent experience — and builds toward the network layer.

---

## SLIDE 3 — THE PRODUCT

**Your agent command center on Somnia.**

Arcane is a personal autonomous agent platform. Each user deploys their own agent team — a root orchestrator and specialized sub-agents — that manages capital across QuickSwap liquidity pools without manual trading.

**What users get today:**

**Hands-off capital management**
Your agent rebalances and swaps across selected QuickSwap pools on a schedule you control. Deposit once, configure your strategy, and let the agent run.

**A team, not a single bot**
Root Orchestrator, Yield Executor, Signal Scout, and Risk Manager work together each cycle — analyzing pool drift, evaluating opportunities, and executing moves within your risk limits.

**Demo or Live**
Try everything risk-free in **Demo** mode (paper trading on a local fork with pre-seeded balances), then switch to **Live** mode on Somnia mainnet when you're ready to deploy real capital.

**Full visibility**
Dashboard portfolio metrics, trading history, and a live agent canvas show exactly what your agents are doing — pool by pool, cycle by cycle.

> **Arcane is not a trading terminal you operate. It is an agent platform you configure, launch, and watch.**

---

## SLIDE 4 — HOW IT WORKS

**Simple for users. Autonomous underneath.**

**For a user, it takes four steps:**

1. **Sign up** with email and password — Arcane provisions a dedicated agent wallet for your account
2. **Choose Demo or Live** — paper trade on a fork, or trade on Somnia mainnet with your own agent wallet
3. **Pick Auto or Custom strategy** — use Arcane's preset agent team and pool allocation, or configure QuickSwap pools and sub-agents yourself
4. **Deposit and activate** — fund your agent wallet (demo or live), launch your strategy, and watch agents run in the live canvas and explorer

**Each trading cycle, your agent team:**

→ Pulls live QuickSwap pool data — TVL, volume, liquidity, APR, and your portfolio drift across selected pools

→ Runs sub-agents in parallel — Signal Scout scans for rebalance opportunities; Risk Manager caps exposure per pool

→ Optionally purchases enriched data from the **Arcane Marketplace** via x402 micropayments in STT — pool snapshots, spread signals, and cross-chain advisories — before making decisions

→ Executes rebalances and swaps on QuickSwap (Algebra V4) — no wallet pop-ups, no manual approvals

→ Records every action in your trading explorer — swaps, rebalances, sub-agent analysis, and marketplace receipts

**On Live mode**, each cycle also produces a Somnia on-chain attestation — a verifiable proof that your agent invoked Somnia's native LLM inference layer.

---

## SLIDE 5 — YOUR AGENT TEAM

**One user. One agent network. Full transparency.**

Every Arcane user runs a personal agent hierarchy — not a social feed of strangers, but a coordinated team working on your portfolio.

**Root Orchestrator**
Portfolio-level strategy. Decides when to rebalance, which pools to prioritize, and how to route capital across your allocation.

**Yield Executor**
Executes capital moves — swaps and rebalances across your active QuickSwap pools.

**Signal Scout**
Monitors APR shifts, pool drift, and rebalance opportunities. Can optionally consume paid data from the Arcane Marketplace before each cycle.

**Risk Manager**
Limits exposure per pool and pauses risky routes before they execute.

**The live canvas**
Watch root and sub-agents move between pool nodes in real time as cycles run. See portfolio value, last executed transactions, and cycle outcomes — demo fork or Somnia mainnet.

**Cycle control**
Pause and resume agents anytime. Configure cycle interval (minimum 5 minutes for custom strategies). Switch between Demo and Live without losing your setup.

> **Your agents work for you — visibly, continuously, and without manual intervention.**

---

## SLIDE 6 — THE DATA MARKETPLACE (x402)

**Machine-to-machine payments that make agents smarter — live today.**

Arcane ships a working x402 marketplace where your sub-agents autonomously purchase data products before each trading cycle. No subscriptions. No API keys. No human approval.

**What's in the catalog today:**

| Product | What it provides |
|---|---|
| Pool snapshot bundle | Liquidity, APR, price, and drift context for your selected QuickSwap pools |
| Spread / rebalance signal | Proactive rebalance opportunity derived from portfolio drift and wallet balances |
| Cross-chain yield advisory | Bridge Scout read-only advisory — illustrative until cross-chain execution ships |

**How payment works:**

Your sub-agent requests a data endpoint. The server responds HTTP 402 — "this product costs X STT." The agent signs the payment, retries, and receives the payload. The entire cycle takes seconds. Payments settle in **Somnia native token (STT)** at sub-cent gas on Somnia testnet.

Every purchase appears in your Explorer with transaction links and spend charts — full audit trail.

**Why this matters:**

This is the first working layer of agent commerce in Arcane — agents paying for intelligence autonomously. The peer-to-peer signal economy (agents buying signals from *other users' agents*) is the next phase. The payment rail is already proven.

> **x402 is not a slide-deck feature. It is live infrastructure your agents use today.**

---

## SLIDE 7 — WHY SOMNIA

**Arcane is Somnia-native by design — not chain-agnostic.**

**1. Native agent infrastructure**

Somnia's LLM Inference Agent runs within validator consensus. On Live cycles, Arcane records an on-chain attestation for every agent decision — a verifiable proof that Somnia's native inference layer was invoked. As Somnia's agent platform matures, Arcane is positioned to deepen this integration.

**2. Sub-cent fees — viable agent micropayments**

Arcane agents execute frequent trading cycles and x402 data purchases. On Ethereum, the gas cost of a micropayment can exceed the payment itself. On Somnia, STT micropayments for agent data are economically trivial — making machine-to-machine commerce viable at scale.

**3. The DeFi venue Arcane routes through today: QuickSwap**

Arcane agents actively trade QuickSwap liquidity pools on Somnia — rebalancing USDCe, WSOMI, and WETH pairs. Every active Live agent drives swap volume and liquidity activity on Somnia's primary DEX.

**The ecosystem fit:**

Arcane is not competing with Somnia's protocols. It is the agent layer on top of them — starting with QuickSwap yield management and expanding to additional Somnia venues as adapters ship.

**What's coming on Somnia:**

On-chain reputation (ERC-8004), Reactivity-driven settlement, and multi-protocol routing (Standard Protocol, DreamDEX, Jumper, LI.FI) are on the roadmap — each deepening Arcane's Somnia-native moat.

> **Arcane is built where agent infrastructure and DeFi liquidity live together — on Somnia.**

---

## SLIDE 8 — MARKET OPPORTUNITY

**Three converging markets. One product path.**

**Autonomous agents in DeFi**

The agentic AI category in crypto is moving from experiment to infrastructure. Projects like Giza, Olas Network, and Virtuals Protocol have shown demand for hands-off on-chain capital management. The addressable market is any DeFi TVL that could eventually flow through agent-managed positions — currently over $100 billion across chains.

**Arcane's entry point:** Personal agent deployment with demo mode — lowering the barrier from "connect wallet and hope" to "sign up, paper trade, go live."

**Agent intelligence commerce**

Traditional finance spends hundreds of billions annually on market intelligence and signal services. DeFi has data businesses (Nansen, Dune, Messari) but no agent-to-agent commerce layer. Arcane's x402 marketplace is the first working rail — agents paying for data autonomously. The peer signal economy expands this into a network-scale opportunity.

**The x402 economy**

Coinbase's x402 protocol opens machine-to-machine payment infrastructure for AI systems. Arcane is among the first products running real x402 payments in production agent loops — not as a demo, but as part of every enriched trading cycle.

**Somnia's positioning**

As Somnia positions itself as the agentic L1 — native LLM, sub-cent fees, high throughput — Arcane is building the consumer-facing agent product on top of that stack.

> **Today's product: personal yield agents. Tomorrow's market: the intelligence layer on all of DeFi.**

---

## SLIDE 9 — TRACTION & ROADMAP

**What's live today:**

**Product (shipped)**
- Email signup with dedicated agent wallet (Demo and Live modes)
- Onboarding: account mode → Auto/Custom strategy → pool allocation → deposit → activate
- Autonomous QuickSwap trading cycles with root + sub-agent orchestration
- Real-time agent canvas (pool node visualization) and trading explorer
- Portfolio dashboard — current value, P&L, return since activation, recent trades
- x402 Marketplace — sub-agents purchase pool snapshots, spread signals, and advisories in STT
- Marketplace spend tracking, receipts, and transaction links in Explorer
- Pause/resume agents, edit strategy, switch Demo ↔ Live
- Somnia on-chain attestation on Live cycles

**Infrastructure (shipped)**
- Full-stack backend (Node.js, PostgreSQL, Redis, WebSocket live feed)
- Demo mode on Anvil fork with paper trading and pre-seeded balances
- Live mode on Somnia mainnet with custodial agent wallet execution

---

**Phase 2 — Agent network & reputation**
- Peer-to-peer signal marketplace — users' agents sell signals to other agents via x402
- ERC-8004 identity and on-chain reputation scoring (accuracy, consistency, longevity)
- Reputation tiers with gated signal pricing (Ghost → Oracle)
- Dispute mechanism with STT staking and on-chain verdict
- Somnia Reactivity for automatic signal settlement at expiry
- Public agent profiles and performance leaderboard

**Phase 3 — Multi-protocol & scale**
- Additional Somnia protocol adapters (Standard Protocol, DreamDEX, Jumper, LI.FI)
- ERC-4337 smart account upgrade path
- Institutional signal API and public SDK for third-party agent strategies
- Signal aggregator tier for top-reputation agents

**Phase 4 — Network economy**
- Cross-chain capital management
- Agent NFT marketplace and DAO governance
- Cross-chain ERC-8004 reputation portability
- Agent-as-a-service for non-crypto-native users

**Target milestones:**
- Near term: 50+ active agent strategies, 500+ x402 marketplace purchases
- 6 months: 1,000+ active agents, $500k+ TVL, peer signal marketplace live

---

## SLIDE 10 — THE CLOSE

**This is not another yield aggregator. This is not another trading bot.**

Arcane is the agent platform Somnia's DeFi ecosystem needs — starting with what works today and building toward the network layer DeFi has never had.

**What we've built:**
A working personal agent platform where users deploy an AI agent team, manage QuickSwap yield autonomously, visualize every cycle in real time, and enrich decisions with x402 data purchases — with a risk-free demo mode that lets anyone try before they deposit.

**What this creates for Somnia:**
Every Live agent routes capital through QuickSwap on Somnia mainnet. Every x402 marketplace payment settles on Somnia. As the agent network grows, Arcane drives swap volume, on-chain activity, and TVL across the ecosystem.

**What this creates for users:**
- Hands-off QuickSwap yield management with full visibility
- A personal agent team you configure, pause, and inspect anytime
- Paper trading in Demo mode — no deposit required to experience the product
- Autonomous data purchases that make agents smarter every cycle

**Where we're going:**

> Today, Arcane gives every user their own autonomous agent team on Somnia.
> Tomorrow, those agents share intelligence, build reputation, and trade signals peer-to-peer — on infrastructure that's already live.
>
> **That is Arcane.**

---

*Arcane — Encode Club Agentathon 2026*
*Built on Somnia · x402 · QuickSwap · Somnia Native Agents*
