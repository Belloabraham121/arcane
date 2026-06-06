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
| Postgres  | 5432         | Prisma — agents, signals, decisions, reputation         |
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
