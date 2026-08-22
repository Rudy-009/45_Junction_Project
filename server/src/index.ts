import { buildApp } from "./app.js";
import { UpstageAgentProvider } from "./providers/upstage-agent-provider.js";
import { createSupabaseAuthenticator } from "./security/supabase-auth.js";

const isProduction = process.env.NODE_ENV === "production";
const supabaseUrl = process.env.SUPABASE_URL;
const authenticateToken = supabaseUrl
  ? createSupabaseAuthenticator({
      projectUrl: supabaseUrl,
      audience: process.env.SUPABASE_JWT_AUDIENCE ?? "authenticated",
    })
  : undefined;
const apiToken = process.env.STANDBY_API_TOKEN ?? (isProduction ? undefined : "local-dev-token");
if (isProduction && !authenticateToken) {
  throw new Error("SUPABASE_URL is required in production for user JWT verification.");
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
      timeoutMs: Number(process.env.UPSTAGE_TIMEOUT_MS ?? 600_000),
    })
  : undefined;

const app = await buildApp({
  allowedOrigins,
  logger: true,
  ...(authenticateToken ? { authenticateToken } : {}),
  ...(apiToken ? { apiToken } : {}),
  ...(extractionProvider ? { extractionProvider } : {}),
});
await app.listen({ host: "0.0.0.0", port });
