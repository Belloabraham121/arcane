import "dotenv/config";
import { createPublicClient, decodeEventLog, http } from "viem";
import { somniaChain } from "../src/config/somnia-chain";

const platformAbi = [
  {
    type: "event",
    name: "RequestCreated",
    inputs: [
      { type: "uint256", name: "requestId", indexed: true },
      { type: "uint256", name: "agentId", indexed: true },
      { type: "uint256", name: "perAgentBudget", indexed: false },
      { type: "bytes", name: "payload", indexed: false },
      { type: "address[]", name: "subcommittee", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RequestFinalized",
    inputs: [
      { type: "uint256", name: "requestId", indexed: true },
      { type: "uint8", name: "status", indexed: false },
    ],
  },
  {
    type: "function",
    name: "hasRequest",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
] as const;

async function main() {
  const tx = process.argv[2] ?? "0xd3f62bec1fa197aa253a93ecd6674aa62b8343da312826f7ef09358f734cbfc2";
  const platform = "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776" as const;
  const rpc = process.env.SOMNIA_RPC_HTTP ?? "https://api.infra.testnet.somnia.network";

  const client = createPublicClient({ chain: somniaChain, transport: http(rpc) });
  const receipt = await client.getTransactionReceipt({ hash: tx as `0x${string}` });

  console.log("tx", tx, "block", receipt.blockNumber, "status", receipt.status);

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== platform.toLowerCase()) continue;
    try {
      const d = decodeEventLog({ abi: platformAbi, data: log.data, topics: log.topics });
      console.log("platform event:", d.eventName, d.args);
    } catch {
      /* ignore */
    }
  }

  const requestId = 2742184n;
  const has = await client.readContract({
    address: platform,
    abi: platformAbi,
    functionName: "hasRequest",
    args: [requestId],
  });
  console.log("hasRequest", requestId.toString(), has);

  const logs = await client.getLogs({
    address: platform,
    event: {
      type: "event",
      name: "RequestFinalized",
      inputs: [
        { type: "uint256", name: "requestId", indexed: true },
        { type: "uint8", name: "status", indexed: false },
      ],
    },
    args: { requestId },
    fromBlock: receipt.blockNumber,
    toBlock: "latest",
  });
  console.log("RequestFinalized logs since tx:", logs.length);
  for (const l of logs) console.log(" ", l.args);
}

main().catch(console.error);
