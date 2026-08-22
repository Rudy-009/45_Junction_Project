import { buildApp } from "./app.js";
import { UpstageAgentProvider } from "./providers/upstage-agent-provider.js";

const isProduction = process.env.NODE_ENV === "production";
const apiToken = process.env.STANDBY_API_TOKEN ?? (isProduction ? "" : "local-dev-token");
if (!apiToken) {
  throw new Error("STANDBY_API_TOKEN is required in production.");
}

const allowedOrigins = (process.env.STANDBY_ALLOWED_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const port = Number(process.env.PORT ?? 8787);
const sharedAgentId = process.env.UPSTAGE_AGENT_ID;
const scriptAgentId = process.env.UPSTAGE_AGENT_ID_SCRIPT ?? sharedAgentId;
const masterCueAgentId = process.env.UPSTAGE_AGENT_ID_MASTER_CUE ?? sharedAgentId;
const agentIds = {
  ...(scriptAgentId ? { SCRIPT: scriptAgentId } : {}),
  ...(masterCueAgentId ? { MASTER_CUE: masterCueAgentId } : {}),
};
const configIds = {
  ...(process.env.UPSTAGE_CONFIG_ID_SCRIPT
    ? { SCRIPT: process.env.UPSTAGE_CONFIG_ID_SCRIPT }
    : {}),
  ...(process.env.UPSTAGE_CONFIG_ID_MASTER_CUE
    ? { MASTER_CUE: process.env.UPSTAGE_CONFIG_ID_MASTER_CUE }
    : {}),
};

const extractionProvider = process.env.UPSTAGE_API_KEY
  ? new UpstageAgentProvider({
      apiKey: process.env.UPSTAGE_API_KEY,
      agentIds,
      configIds,
      pollIntervalMs: Number(process.env.UPSTAGE_POLL_INTERVAL_MS ?? 2_000),
      timeoutMs: Number(process.env.UPSTAGE_TIMEOUT_MS ?? 120_000),
    })
  : undefined;

const app = await buildApp({
  apiToken,
  allowedOrigins,
  logger: true,
  ...(extractionProvider ? { extractionProvider } : {}),
});
await app.listen({ host: "0.0.0.0", port });
