import { buildApp } from "./app.js";
import { UpstageAgentProvider } from "./providers/upstage-agent-provider.js";

const isProduction = process.env.NODE_ENV === "production";
const allowAnonymous = process.env.STANDBY_ALLOW_ANONYMOUS !== "false";
const apiToken = process.env.STANDBY_API_TOKEN ?? (isProduction ? undefined : "local-dev-token");
const upstageAgentDefaults = {
  extraction: {
    script: "agt_7yeqpDe7zmwCGVWoMY377j",
    masterCue: "agt_FkyNiySGY4WACFvMNV5DRQ",
    stageSpec: "agt_PxbxmhXXT8iqdzs5WmHfUz",
    config: {
      script: "1",
      masterCue: "3",
      stageSpec: "1",
      factNormalizer: "1",
      storyboardRecomposer: "1",
      rehearsalBrief: "1",
    },
  },
  production: {
    factNormalizer: "agt_6tn639gGApNdV9SdRfAjnE",
    storyboardRecomposer: "agt_go8aoJTVDvEwK8mwXh5gEi",
    rehearsalBrief: "agt_9iLkb7fqwdEtaBv48t9tQA",
    config: {
      factNormalizer: "1",
      storyboardRecomposer: "1",
      rehearsalBrief: "1",
    },
  },
};

const allowedOrigins = (process.env.STANDBY_ALLOWED_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const port = Number(process.env.PORT ?? 8787);
const sharedAgentId = process.env.UPSTAGE_AGENT_ID;
const scriptAgentId = process.env.UPSTAGE_AGENT_ID_SCRIPT ?? sharedAgentId;
const masterCueAgentId = process.env.UPSTAGE_AGENT_ID_MASTER_CUE ?? sharedAgentId;
const agentIds = {
  ...(scriptAgentId || upstageAgentDefaults.extraction.script
    ? { SCRIPT: scriptAgentId ?? upstageAgentDefaults.extraction.script }
    : {}),
  ...(masterCueAgentId || upstageAgentDefaults.extraction.masterCue
    ? { MASTER_CUE: masterCueAgentId ?? upstageAgentDefaults.extraction.masterCue }
    : {}),
  ...(process.env.UPSTAGE_AGENT_ID_STAGE_SPEC || upstageAgentDefaults.extraction.stageSpec
    ? { STAGE_SPEC: process.env.UPSTAGE_AGENT_ID_STAGE_SPEC ?? upstageAgentDefaults.extraction.stageSpec }
    : {}),
};
const configIds = {
  ...(process.env.UPSTAGE_CONFIG_ID_SCRIPT || upstageAgentDefaults.extraction.config.script
    ? { SCRIPT: process.env.UPSTAGE_CONFIG_ID_SCRIPT ?? upstageAgentDefaults.extraction.config.script }
    : {}),
  ...(process.env.UPSTAGE_CONFIG_ID_MASTER_CUE || upstageAgentDefaults.extraction.config.masterCue
    ? { MASTER_CUE: process.env.UPSTAGE_CONFIG_ID_MASTER_CUE ?? upstageAgentDefaults.extraction.config.masterCue }
    : {}),
  ...(process.env.UPSTAGE_CONFIG_ID_STAGE_SPEC || upstageAgentDefaults.extraction.config.stageSpec
    ? { STAGE_SPEC: process.env.UPSTAGE_CONFIG_ID_STAGE_SPEC ?? upstageAgentDefaults.extraction.config.stageSpec }
    : {}),
};
const productionAgentIds = {
  ...(process.env.UPSTAGE_AGENT_ID_FACT_NORMALIZER || upstageAgentDefaults.production.factNormalizer
    ? { FACT_NORMALIZER: process.env.UPSTAGE_AGENT_ID_FACT_NORMALIZER ?? upstageAgentDefaults.production.factNormalizer }
    : {}),
  ...(process.env.UPSTAGE_AGENT_ID_STORYBOARD_RECOMPOSER || upstageAgentDefaults.production.storyboardRecomposer
    ? {
      STORYBOARD_RECOMPOSER:
        process.env.UPSTAGE_AGENT_ID_STORYBOARD_RECOMPOSER
        ?? upstageAgentDefaults.production.storyboardRecomposer,
    }
    : {}),
  ...(process.env.UPSTAGE_AGENT_ID_REHEARSAL_BRIEF || upstageAgentDefaults.production.rehearsalBrief
    ? { REHEARSAL_BRIEF: process.env.UPSTAGE_AGENT_ID_REHEARSAL_BRIEF ?? upstageAgentDefaults.production.rehearsalBrief }
    : {}),
};
const productionConfigIds = {
  ...(process.env.UPSTAGE_CONFIG_ID_FACT_NORMALIZER || upstageAgentDefaults.production.config.factNormalizer
    ? { FACT_NORMALIZER: process.env.UPSTAGE_CONFIG_ID_FACT_NORMALIZER ?? upstageAgentDefaults.production.config.factNormalizer }
    : {}),
  ...(process.env.UPSTAGE_CONFIG_ID_STORYBOARD_RECOMPOSER || upstageAgentDefaults.production.config.storyboardRecomposer
    ? {
      STORYBOARD_RECOMPOSER:
        process.env.UPSTAGE_CONFIG_ID_STORYBOARD_RECOMPOSER
        ?? upstageAgentDefaults.production.config.storyboardRecomposer,
    }
    : {}),
  ...(process.env.UPSTAGE_CONFIG_ID_REHEARSAL_BRIEF || upstageAgentDefaults.production.config.rehearsalBrief
    ? { REHEARSAL_BRIEF: process.env.UPSTAGE_CONFIG_ID_REHEARSAL_BRIEF ?? upstageAgentDefaults.production.config.rehearsalBrief }
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
