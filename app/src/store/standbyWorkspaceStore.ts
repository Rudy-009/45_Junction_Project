import { create } from 'zustand';
import type { WorkspaceSnapshot } from '@/types/standby';

type StandbyWorkspaceStore = {
  caseId: string | null;
  workspace: WorkspaceSnapshot | null;
  setWorkspace: (caseId: string, workspace: WorkspaceSnapshot) => void;
  clear: () => void;
};

export const useStandbyWorkspaceStore = create<StandbyWorkspaceStore>((set) => ({
  caseId: null,
  workspace: null,
  setWorkspace: (caseId, workspace) => set({ caseId, workspace }),
  clear: () => set({ caseId: null, workspace: null }),
}));
