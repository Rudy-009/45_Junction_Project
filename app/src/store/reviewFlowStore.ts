import { create } from 'zustand';
import type { FactCandidate, FactNormalizerArtifact } from '@/types/standby';

export type ReviewMode = 'RECOMMENDED' | 'CUSTOM';

type ReviewFlowState = {
  caseId: string | null;
  facts: FactCandidate[];
  normalizerArtifact: FactNormalizerArtifact | null;
  normalizerStatus: 'IDLE' | 'LOADING' | 'READY' | 'FAILED';
  normalizerError: string | null;
  mode: ReviewMode | null;
  setReviewContext: (next: {
    caseId: string;
    facts: FactCandidate[];
    normalizerArtifact: FactNormalizerArtifact | null;
  }) => void;
  setMode: (mode: ReviewMode) => void;
  setNormalizerLoading: (caseId: string) => void;
  setNormalizerArtifact: (caseId: string, artifact: FactNormalizerArtifact) => void;
  setNormalizerError: (caseId: string, message: string) => void;
  clear: () => void;
};

export const useReviewFlowStore = create<ReviewFlowState>((set) => ({
  caseId: null,
  facts: [],
  normalizerArtifact: null,
  normalizerStatus: 'IDLE',
  normalizerError: null,
  mode: null,
  setReviewContext: ({ caseId, facts, normalizerArtifact }) =>
    set({
      caseId,
      facts,
      normalizerArtifact,
      normalizerStatus: normalizerArtifact ? 'READY' : 'IDLE',
      normalizerError: null,
      mode: null,
    }),
  setMode: (mode) => set({ mode }),
  setNormalizerLoading: (caseId) => set((state) => state.caseId === caseId
    ? { normalizerStatus: 'LOADING', normalizerError: null }
    : state),
  setNormalizerArtifact: (caseId, normalizerArtifact) => set((state) => state.caseId === caseId
    ? { normalizerArtifact, normalizerStatus: 'READY', normalizerError: null }
    : state),
  setNormalizerError: (caseId, normalizerError) => set((state) => state.caseId === caseId
    ? { normalizerStatus: 'FAILED', normalizerError }
    : state),
  clear: () => set({
    caseId: null,
    facts: [],
    normalizerArtifact: null,
    normalizerStatus: 'IDLE',
    normalizerError: null,
    mode: null,
  }),
}));
