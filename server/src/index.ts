import { buildApp } from "./app.js";
import { UpstageAgentProvider } from "./providers/upstage-agent-provider.js";

const isProduction = process.env.NODE_ENV === "production";
const allowAnonymous = process.env.STANDBY_ALLOW_ANONYMOUS !== "false";
const apiToken = process.env.STANDBY_API_TOKEN ?? (isProduction ? undefined : "local-dev-token");

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
  ...(process.env.UPSTAGE_AGENT_ID_STAGE_SPEC
    ? { STAGE_SPEC: process.env.UPSTAGE_AGENT_ID_STAGE_SPEC }
    : {}),
};
const configIds = {
  ...(process.env.UPSTAGE_CONFIG_ID_SCRIPT
    ? { SCRIPT: process.env.UPSTAGE_CONFIG_ID_SCRIPT }
    : {}),
  ...(process.env.UPSTAGE_CONFIG_ID_MASTER_CUE
    ? { MASTER_CUE: process.env.UPSTAGE_CONFIG_ID_MASTER_CUE }
    : {}),
  ...(process.env.UPSTAGE_CONFIG_ID_STAGE_SPEC
    ? { STAGE_SPEC: process.env.UPSTAGE_CONFIG_ID_STAGE_SPEC }
    : {}),
};
const productionAgentIds = {
  ...(process.env.UPSTAGE_AGENT_ID_FACT_NORMALIZER
    ? { FACT_NORMALIZER: process.env.UPSTAGE_AGENT_ID_FACT_NORMALIZER }
    : {}),
  ...(process.env.UPSTAGE_AGENT_ID_STORYBOARD_RECOMPOSER
    ? { STORYBOARD_RECOMPOSER: process.env.UPSTAGE_AGENT_ID_STORYBOARD_RECOMPOSER }
    : {}),
  ...(process.env.UPSTAGE_AGENT_ID_REHEARSAL_BRIEF
    ? { REHEARSAL_BRIEF: process.env.UPSTAGE_AGENT_ID_REHEARSAL_BRIEF }
    : {}),
};
const productionConfigIds = {
  ...(process.env.UPSTAGE_CONFIG_ID_FACT_NORMALIZER
    ? { FACT_NORMALIZER: process.env.UPSTAGE_CONFIG_ID_FACT_NORMALIZER }
    : {}),
  ...(process.env.UPSTAGE_CONFIG_ID_STORYBOARD_RECOMPOSER
    ? { STORYBOARD_RECOMPOSER: process.env.UPSTAGE_CONFIG_ID_STORYBOARD_RECOMPOSER }
    : {}),
  ...(process.env.UPSTAGE_CONFIG_ID_REHEARSAL_BRIEF
    ? { REHEARSAL_BRIEF: process.env.UPSTAGE_CONFIG_ID_REHEARSAL_BRIEF }
    : {}),
};

const upstageProvider = process.env.UPSTAGE_API_KEY
  ? new UpstageAgentProvider({
      apiKey: process.env.UPSTAGE_API_KEY,
      agentIds,
      configIds,
      productionAgentIds,
      productionConfigIds,
      pollIntervalMs: Number(process.env.UPSTAGE_POLL_INTERVAL_MS ?? 2_000),
      timeoutMs: Number(process.env.UPSTAGE_TIMEOUT_MS ?? 600_000),
    })
  : undefined;

const app = await buildApp({
  allowedOrigins,
  logger: true,
  allowAnonymous,
  ...(apiToken ? { apiToken } : {}),
  ...(upstageProvider
    ? {
        extractionProvider: upstageProvider,
        productionAgentProvider: upstageProvider,
        scriptProjectionProvider: upstageProvider,
      }
    : {}),
});
await app.listen({ host: "0.0.0.0", port });
