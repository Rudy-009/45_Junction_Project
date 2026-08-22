import type {
  ProductionAgentFrozenInput,
  ProductionAgentRole,
} from "../domain/types.js";

export type ProductionAgentProviderResult = {
  output: unknown;
  provider_job_id: string;
  agent_id: string;
  config_id: string | null;
  adapter_version: string;
  raw_response_sha256: string;
  fallback_reason?: "UPSTAGE_RESPONSE_REJECTED";
};

export interface ProductionAgentProvider {
  configFingerprint(role: ProductionAgentRole): string;
  run(
    role: ProductionAgentRole,
    input: ProductionAgentFrozenInput,
  ): Promise<ProductionAgentProviderResult>;
}
