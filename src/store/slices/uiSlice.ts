import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  ViewMode,
  PauseMode,
  PauseImpact,
  FlowMode,
  FlowImpact,
  EarlyFinishMode,
  EarlyFinishImpact,
} from "@/types";

type PreviewSource = "pause" | "flow" | "earlyFinish";
type AddModalMode = "manual" | "ai";

interface UIState {
  viewMode: ViewMode;
  isAddModalOpen: boolean;
  addModalMode: AddModalMode;
  activeTimerTaskId: string | null;
  showPreview: boolean;

  isPauseModalOpen: boolean;
  pausedTaskId: string | null;
  pauseDuration: number;

  isFlowModalOpen: boolean;
  flowTaskId: string | null;

  isEarlyFinishModalOpen: boolean;
  earlyFinishTaskId: string | null;

  isPreviewModalOpen: boolean;
  previewSource: PreviewSource;
  pendingPauseImpact: PauseImpact | null;
  pendingPauseMode: PauseMode | null;
  pendingFlowImpact: FlowImpact | null;
  pendingFlowMode: FlowMode | null;
  pendingEarlyFinishImpact: EarlyFinishImpact | null;
  pendingEarlyFinishMode: EarlyFinishMode | null;
}

const uiSlice = createSlice({
  name: "ui",
  initialState: {
    viewMode: "oclock",
    isAddModalOpen: false,
    addModalMode: "manual",
    activeTimerTaskId: null,
    showPreview: false,
    isPauseModalOpen: false,
    pausedTaskId: null,
    pauseDuration: 0,
    isFlowModalOpen: false,
    flowTaskId: null,
    isEarlyFinishModalOpen: false,
    earlyFinishTaskId: null,
    isPreviewModalOpen: false,
    previewSource: "pause",
    pendingPauseImpact: null,
    pendingPauseMode: null,
    pendingFlowImpact: null,
    pendingFlowMode: null,
    pendingEarlyFinishImpact: null,
    pendingEarlyFinishMode: null,
  } as UIState,
  reducers: {
    setViewMode: (state, action: PayloadAction<ViewMode>) => {
      state.viewMode = action.payload;
    },
    toggleViewMode: (state) => {
      state.viewMode = state.viewMode === "oclock" ? "timeline" : "oclock";
    },
    openAddModal: (state, action: PayloadAction<AddModalMode | undefined>) => {
      state.isAddModalOpen = true;
      state.addModalMode = action.payload || "manual";
    },
    closeAddModal: (state) => {
      state.isAddModalOpen = false;
      state.addModalMode = "manual";
    },
    setActiveTimerTask: (state, action: PayloadAction<string | null>) => {
      state.activeTimerTaskId = action.payload;
    },
    setShowPreview: (state, action: PayloadAction<boolean>) => {
      state.showPreview = action.payload;
    },

    // Pause
    openPauseModal: (
      state,
      action: PayloadAction<{ taskId: string; pauseDuration: number }>,
    ) => {
      state.isPauseModalOpen = true;
      state.pausedTaskId = action.payload.taskId;
      state.pauseDuration = action.payload.pauseDuration;
    },
    closePauseModal: (state) => {
      state.isPauseModalOpen = false;
      state.pausedTaskId = null;
      state.pauseDuration = 0;
    },
    selectPauseMode: (state, action: PayloadAction<PauseMode>) => {
      state.pendingPauseMode = action.payload;
    },
    setPendingPauseImpact: (state, action: PayloadAction<PauseImpact>) => {
      state.pendingPauseImpact = action.payload;
      state.isPauseModalOpen = false;
      state.isPreviewModalOpen = true;
      state.previewSource = "pause";
    },

    // Flow State
    openFlowModal: (state, action: PayloadAction<{ taskId: string }>) => {
      state.isFlowModalOpen = true;
      state.flowTaskId = action.payload.taskId;
    },
    closeFlowModal: (state) => {
      state.isFlowModalOpen = false;
      state.flowTaskId = null;
    },
    setPendingFlowImpact: (state, action: PayloadAction<FlowImpact>) => {
      state.pendingFlowImpact = action.payload;
      state.isFlowModalOpen = false;
      state.isPreviewModalOpen = true;
      state.previewSource = "flow";
    },

    // Early Finish
    openEarlyFinishModal: (
      state,
      action: PayloadAction<{ taskId: string }>,
    ) => {
      state.isEarlyFinishModalOpen = true;
      state.earlyFinishTaskId = action.payload.taskId;
    },
    closeEarlyFinishModal: (state) => {
      state.isEarlyFinishModalOpen = false;
      state.earlyFinishTaskId = null;
    },
    setPendingEarlyFinishImpact: (
      state,
      action: PayloadAction<EarlyFinishImpact>,
    ) => {
      state.pendingEarlyFinishImpact = action.payload;
      state.isEarlyFinishModalOpen = false;
      state.isPreviewModalOpen = true;
      state.previewSource = "earlyFinish";
    },

    // Preview
    openPreviewModal: (state) => {
      state.isPreviewModalOpen = true;
    },
    closePreviewModal: (state) => {
      state.isPreviewModalOpen = false;
      state.pendingPauseImpact = null;
      state.pendingPauseMode = null;
      state.pendingFlowImpact = null;
      state.pendingFlowMode = null;
      state.pendingEarlyFinishImpact = null;
      state.pendingEarlyFinishMode = null;
    },
    confirmAction: (state) => {
      state.isPreviewModalOpen = false;
      state.pendingPauseImpact = null;
      state.pendingPauseMode = null;
      state.pendingFlowImpact = null;
      state.pendingFlowMode = null;
      state.pendingEarlyFinishImpact = null;
      state.pendingEarlyFinishMode = null;
      state.pausedTaskId = null;
      state.pauseDuration = 0;
      state.flowTaskId = null;
      state.earlyFinishTaskId = null;
    },
    goBackFromPreview: (state) => {
      state.isPreviewModalOpen = false;
      state.pendingPauseImpact = null;
      state.pendingFlowImpact = null;
      state.pendingEarlyFinishImpact = null;

      if (state.previewSource === "pause") {
        state.isPauseModalOpen = true;
      } else if (state.previewSource === "flow") {
        state.isFlowModalOpen = true;
      } else if (state.previewSource === "earlyFinish") {
        state.isEarlyFinishModalOpen = true;
      }
    },
  },
});

export const {
  setViewMode,
  toggleViewMode,
  openAddModal,
  closeAddModal,
  setActiveTimerTask,
  setShowPreview,
  openPauseModal,
  closePauseModal,
  selectPauseMode,
  setPendingPauseImpact,
  openFlowModal,
  closeFlowModal,
  setPendingFlowImpact,
  openEarlyFinishModal,
  closeEarlyFinishModal,
  setPendingEarlyFinishImpact,
  openPreviewModal,
  closePreviewModal,
  confirmAction,
  goBackFromPreview,
} = uiSlice.actions;

export default uiSlice.reducer;
