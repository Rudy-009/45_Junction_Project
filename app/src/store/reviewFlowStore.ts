import { create } from 'zustand';
import type { FactCandidate, FactNormalizerArtifact } from '@/types/standby';

export type ReviewMode = 'RECOMMENDED' | 'CUSTOM';

type ReviewFlowState = {
  caseId: string | null;
  facts: FactCandidate[];
  normalizerArtifact: FactNormalizerArtifact | null;
  mode: ReviewMode | null;
  setReviewContext: (next: {
    caseId: string;
    facts: FactCandidate[];
    normalizerArtifact: FactNormalizerArtifact | null;
  }) => void;
  setMode: (mode: ReviewMode) => void;
  clear: () => void;
};

export const useReviewFlowStore = create<ReviewFlowState>((set) => ({
  caseId: null,
  facts: [],
  normalizerArtifact: null,
  mode: null,
  setReviewContext: ({ caseId, facts, normalizerArtifact }) =>
    set({ caseId, facts, normalizerArtifact, mode: null }),
  setMode: (mode) => set({ mode }),
  clear: () => set({ caseId: null, facts: [], normalizerArtifact: null, mode: null }),
}));
