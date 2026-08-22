import type {
  FactCandidate,
  InternalSourceVersion,
  ProviderRunSummary,
  SourceRole,
} from "../domain/types.js";

export type ExtractionProviderResult = {
  facts: FactCandidate[];
  sourceRuns: ProviderRunSummary[];
};

export interface ExtractionProvider {
  extract(sources: Map<SourceRole, InternalSourceVersion>): Promise<ExtractionProviderResult>;
}
