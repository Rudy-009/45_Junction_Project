import type {
  FactCandidate,
  InternalSourceVersion,
  ProviderRunSummary,
} from "../domain/types.js";

export type ScriptProjectionProviderResult = {
  facts: FactCandidate[];
  run: ProviderRunSummary;
};

export interface ScriptProjectionProvider {
  projectScript(source: InternalSourceVersion): Promise<ScriptProjectionProviderResult>;
}
