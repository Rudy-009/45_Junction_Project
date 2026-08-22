import { create } from 'zustand';
import type { CueSheet, Cue, CueEvent } from '../types/cue-sheet';
import type { ValidationResult, Contradiction } from '../types/validation';
import type { Revision } from '../types/ui';
import { validateCueSheet } from '../validator';
export { useStandbyWorkspaceStore } from './standbyWorkspaceStore';
export { useReviewFlowStore, type ReviewMode } from './reviewFlowStore';

interface CueSheetStore {
  // Data
  cueSheet: CueSheet | null;
  validationResult: ValidationResult | null;
  
  // UI State
  selectedCueId: string | null;
  selectedEventId: string | null;
  popupEventId: string | null;
  revisions: Revision[];
  
  // Actions
  loadCueSheet: (data: CueSheet) => void;
  clearCueSheet: () => void;
  updateCue: (cueId: string, updater: (cue: Cue) => Cue) => void;
  updateEvent: (cueId: string, eventId: string, updater: (event: CueEvent) => CueEvent) => void;
  addCue: (cue: Cue, afterCueId?: string) => void;
  removeCue: (cueId: string) => void;
  addEvent: (cueId: string, event: CueEvent) => void;
  removeEvent: (cueId: string, eventId: string) => void;
  
  // Validation
  runValidation: () => void;
  getContradictionsForCue: (cueId: string) => Contradiction[];
  
  // UI
  selectCue: (cueId: string | null) => void;
  selectEvent: (eventId: string | null) => void;
  setPopupEvent: (eventId: string | null) => void;
  
  // Revision
  saveRevision: (author: string) => void;
  commitCueSheet: (
    data: CueSheet,
    changes: Revision['changes'],
    author: string,
  ) => void;
  loadRevision: (revisionId: string) => void;
}

export const useCueSheetStore = create<CueSheetStore>((set, get) => ({
  // Initial state
  cueSheet: null,
  validationResult: null,
  selectedCueId: null,
  selectedEventId: null,
  popupEventId: null,
  revisions: [],

  // Load cue sheet and auto-validate
  loadCueSheet: (data) => {
    const firstCue = data.cues[0] ?? null;
    set({
      cueSheet: data,
      selectedCueId: firstCue?.cue_id ?? null,
      selectedEventId: firstCue?.events[0]?.event_id ?? null,
      popupEventId: null,
      revisions: [],
    });
    get().runValidation();
  },

  clearCueSheet: () => set({
    cueSheet: null,
    validationResult: null,
    selectedCueId: null,
    selectedEventId: null,
    popupEventId: null,
    revisions: [],
  }),

  // Update a specific cue
  updateCue: (cueId, updater) => {
    const { cueSheet } = get();
    if (!cueSheet) return;
    const nextCues = cueSheet.cues.map(c => c.cue_id === cueId ? updater(c) : c);
    set({ cueSheet: { ...cueSheet, cues: nextCues } });
    get().runValidation();
  },

  // Update a specific event within a cue
  updateEvent: (cueId, eventId, updater) => {
    const { cueSheet } = get();
    if (!cueSheet) return;
    const nextCues = cueSheet.cues.map(c => {
      if (c.cue_id !== cueId) return c;
      return { ...c, events: c.events.map(e => e.event_id === eventId ? updater(e) : e) };
    });
    set({ cueSheet: { ...cueSheet, cues: nextCues } });
    get().runValidation();
  },

  // Add a new cue
  addCue: (cue, afterCueId) => {
    const { cueSheet } = get();
    if (!cueSheet) return;
    let nextCues: Cue[];
    if (afterCueId) {
      const idx = cueSheet.cues.findIndex(c => c.cue_id === afterCueId);
      nextCues = [...cueSheet.cues.slice(0, idx + 1), cue, ...cueSheet.cues.slice(idx + 1)];
    } else {
      nextCues = [...cueSheet.cues, cue];
    }
    set({ cueSheet: { ...cueSheet, cues: nextCues } });
    get().runValidation();
  },

  // Remove a cue
  removeCue: (cueId) => {
    const { cueSheet } = get();
    if (!cueSheet) return;
    set({ cueSheet: { ...cueSheet, cues: cueSheet.cues.filter(c => c.cue_id !== cueId) } });
    get().runValidation();
  },

  // Add event to a cue
  addEvent: (cueId, event) => {
    get().updateCue(cueId, (c) => ({ ...c, events: [...c.events, event] }));
  },

  // Remove event from a cue
  removeEvent: (cueId, eventId) => {
    get().updateCue(cueId, (c) => ({ ...c, events: c.events.filter(e => e.event_id !== eventId) }));
  },

  // Run validation
  runValidation: () => {
    const { cueSheet } = get();
    if (!cueSheet) {
      set({ validationResult: null });
      return;
    }
    const result = validateCueSheet(cueSheet);
    set({ validationResult: result });
  },

  // Get contradictions for a specific cue
  getContradictionsForCue: (cueId) => {
    const { validationResult } = get();
    if (!validationResult) return [];
    return validationResult.contradictions.filter(c => c.cue_id === cueId);
  },

  // UI actions
  selectCue: (cueId) => set({ selectedCueId: cueId }),
  selectEvent: (eventId) => set({ selectedEventId: eventId }),
  setPopupEvent: (eventId) => set({ popupEventId: eventId }),

  // Save revision
  saveRevision: (author) => {
    const { cueSheet, revisions } = get();
    if (!cueSheet) return;
    const revision: Revision = {
      id: `rev-${revisions.length + 1}`,
      savedAt: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
      author,
      changes: [],
      snapshot: structuredClone(cueSheet),
    };
    set({ revisions: [revision, ...revisions] });
  },

  commitCueSheet: (data, changes, author) => {
    const { revisions, selectedCueId, selectedEventId } = get();
    const nextCueId = data.cues.some((cue) => cue.cue_id === selectedCueId)
      ? selectedCueId
      : data.cues[0]?.cue_id ?? null;
    const nextEventId = data.cues.some((cue) => cue.events.some((event) => event.event_id === selectedEventId))
      ? selectedEventId
      : data.cues.find((cue) => cue.cue_id === nextCueId)?.events[0]?.event_id ?? null;
    const revision: Revision = {
      id: `rev-${revisions.length + 1}`,
      savedAt: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
      author,
      changes: structuredClone(changes),
      snapshot: structuredClone(data),
    };
    set({
      cueSheet: structuredClone(data),
      validationResult: validateCueSheet(data),
      selectedCueId: nextCueId,
      selectedEventId: nextEventId,
      revisions: [revision, ...revisions],
    });
  },

  loadRevision: (revisionId) => {
    const revision = get().revisions.find((candidate) => candidate.id === revisionId);
    if (!revision) return;
    const cueSheet = structuredClone(revision.snapshot);
    set({ cueSheet, validationResult: validateCueSheet(cueSheet) });
  },
}));
