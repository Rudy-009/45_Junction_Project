import { buildApp } from "./app.js";

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

const app = await buildApp({ apiToken, allowedOrigins, logger: true });
await app.listen({ host: "0.0.0.0", port });
