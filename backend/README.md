# Arcane Backend

Infrastructure and folder layout for the Node.js API. Implementation lives under `src/` (not started yet).

API and protocol reference: [api-ref.md](./api-ref.md).

## Docker Compose (Postgres, Redis, RabbitMQ)

From this directory:

```bash
cp .env.example .env
npm install
npm run dev          # API on http://localhost:8080
docker compose up -d
docker compose ps
docker compose logs -f
docker compose down
```

| Service   | Port(s)      | Role (per api-ref)                                      |
| --------- | ------------ | ------------------------------------------------------- |
| Postgres  | 5434 (host)  | Prisma — change `POSTGRES_PORT` if it conflicts locally |
| Redis     | 6379         | BullMQ, ioredis — queues, cache, WebSocket coordination |
| RabbitMQ  | 5672, 15672  | Async messaging (management UI on 15672)                |

Images are built from `docker/postgres`, `docker/redis`, and `docker/rabbitmq`.

## Somnia LLM smoke test

TypeScript script to invoke [LLM Inference](https://docs.somnia.network/agents/base-agents/llm-inference) on testnet via the platform contract (no Solidity in this repo). It sends `createRequest` with a zero callback address, watches `RequestFinalized`, then reads `getRequest` and decodes the result — same pattern as the agents web app TypeScript snippet.

```bash
cd backend
npm install
cp .env.example .env
# Edit .env: set PRIVATE_KEY (wallet with testnet STT — ~0.24 STT per call)

npm run smoke:llm:check    # RPC + deposit quote + payload encode only
npm run smoke:llm          # live inferString call
npm run smoke:llm:tools    # inferToolsChat (no MCP URLs by default)
```

| Variable | Default |
| -------- | ------- |
| `SOMNIA_AGENT_PLATFORM` | Testnet `0x037Bb9…6776` |
| `SOMNIA_LLM_AGENT_ID` | `12847293847561029384` |
| `SOMNIA_RPC_HTTP` | `https://api.infra.testnet.somnia.network` |

Fund STT: [testnet faucet](https://testnet.somnia.network). Gas model: [Gas Fees](https://docs.somnia.network/agents/invoking-agents/gas-fees).

Logging uses **Winston** (`src/shared/logger.ts`): colorized dev output, JSON in production. Every request gets an `x-correlation-id` header and structured HTTP logs. Set `LOG_LEVEL=debug|info|warn|error`.

## Email → wallet (deterministic)

On sign-up/sign-in, derive a Somnia address from the user’s normalized email using a server-held `MASTER_SEED` (BIP-44). Same email always maps to the same address; private keys are encrypted at rest with `ENCRYPTION_SECRET_KEY`.

```bash
# Set MASTER_SEED + ENCRYPTION_SECRET_KEY in .env first
npm run demo:wallet -- agent@arcane.dev
```

Flow: `normalizeEmail` → `keccak256(email)` → index → `m/44'/60'/0'/0/<index>` → address. Wire `createWalletRecord(email)` into your auth handler after email verification; persist via Prisma when the DB layer lands.

## Auth API (email + password)

Register and sign-in from the frontend now hit the backend. On register, the server hashes the password (bcrypt), derives a deterministic Somnia wallet from email, stores encrypted key material in Postgres, and sets an **HttpOnly session cookie**.

## Agent strategy API

Persist auto vs custom strategy and protocol allocation (Uniswap, AAVE, Compound, Lido).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/agents/strategy` | Current user's strategy |
| `PUT` | `/api/v1/agents/strategy` | Upsert `{ strategyType, depositAmount?, poolAllocations?, subAgents? }` |
| `PATCH` | `/api/v1/agents/strategy/pool-allocations` | Update QuickSwap pool splits |
| `PATCH` | `/api/v1/agents/strategy/sub-agents` | Update sub-agent config |

Requires auth cookie. After pulling schema changes:

```bash
npm run db:upgrade       # migrate legacy protocol/JSON → pool_allocation table
npm run db:push          # or db:upgrade alone (includes push)
npm run dev              # http://localhost:8080

# Client: cp .env.local.example .env.local
```

Required env: `AUTH_JWT_SECRET`, `MASTER_SEED`, `ENCRYPTION_SECRET_KEY`, `DATABASE_URL`, `CORS_ORIGIN=http://localhost:3000`.

## QuickSwap & trading smoke tests (Phase 8)

Dev-only scripts — not used in production user flows.

```bash
npm run smoke:quickswap:pools    # list viable pools (all / auto / custom contexts)
npm run smoke:quickswap:quote    # USDCe→WSOMI quote + enriched pool metrics
npm run smoke:trading:cycle -- --email=you@example.com   # one live LLM cycle (needs active strategy + STT)
```

Integration tests (Postgres + Somnia RPC; mocked LLM for trading cycle):

```bash
docker compose up -d postgres
RUN_INTEGRATION_TESTS=1 npm test
```

| Test | What it verifies |
|------|------------------|
| `tests/integration/quickswap-pools.test.ts` | `GET /api/v1/quickswap/pools` returns ≥ 1 pool with TVL, volume, liquidity |
| `tests/integration/trading-cycle.test.ts` | Active strategy → `runTradingCycle` → cycle + quote action persisted |

### Dual-LLM trading (production path)

Each trading cycle:

1. **Somnia on-chain attestation** — `createRequest` on testnet (tx proof; result not used for trades). Requires agent wallet STT (~0.24 STT). Disable with `SOMNIA_ATTESTATION_ENABLED=false`.
2. **OpenAI** — `gpt-4o-mini` (default) drives tool calls and swap decisions. Set `OPENAI_API_KEY` in `.env`.

### Live Somnia LLM tests

Requires testnet STT. Two paths:

| Command | Payer | Purpose |
|---------|-------|---------|
| `npm run smoke:llm` | `PRIVATE_KEY` in `.env` | Basic `inferString` platform smoke |
| `npm run smoke:llm:tools` | `PRIVATE_KEY` | Basic `inferToolsChat` smoke |
| `npm run smoke:llm:trading -- --email=...` | **Agent wallet** | Full QuickSwap tool loop (`runLlmTradingCycle`) |

Automated LLM tests:

```bash
# Platform inferString + inferToolsChat (uses PRIVATE_KEY)
RUN_LLM_TESTS=1 PRIVATE_KEY=0x... npm run test:llm

# QuickSwap trading LLM cycle (uses agent wallet STT for your signup email)
RUN_LLM_TESTS=1 LLM_TEST_EMAIL=you@signup-email.com npm run test:llm
```

Fund the **agent wallet** (shown on dashboard / `GET /auth/me`) via [Somnia testnet faucet](https://testnet.somnia.network) before `test:llm` or `smoke:llm:trading`.

## Folder structure

```
backend/
├── api-ref.md              # External APIs & env checklist
├── docker-compose.yml
├── .env.example
├── docker/
│   ├── postgres/
│   ├── redis/
│   └── rabbitmq/
├── prisma/                 # Schema & migrations (future)
└── src/
    ├── api/                # Express REST + x402 routes
    ├── workers/            # BullMQ workers (agent cycles)
    ├── websocket/          # Socket.IO live feed
    ├── services/
    │   ├── somnia/         # Chain RPC, native agents
    │   ├── smart-account/  # ERC-4337 / Pimlico
    │   ├── identity/       # ERC-8004
    │   ├── payments/       # x402
    │   ├── reactivity/     # Somnia reactivity
    │   ├── defi/           # LiFi, protocol APIs
    │   ├── market-data/
    │   ├── llm/
    │   ├── auth/           # Privy
    │   └── storage/        # IPFS / Pinata
    ├── config/
    └── shared/
```
