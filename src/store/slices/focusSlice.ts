import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type FocusPhase = "idle" | "focus" | "break";

interface FocusState {
  phase: FocusPhase;
  running: boolean;
  taskId: string | null;
  workMinutes: number;
  breakMinutes: number;
  startedAt: number | null;
  endsAt: number | null;
  remainingSec: number;
  completedToday: number;
}

export const FOCUS_PRESETS = [
  { label: "25 / 5", work: 25, break: 5 },
  { label: "25 / 15", work: 25, break: 15 },
  { label: "50 / 10", work: 50, break: 10 },
];

const initialState: FocusState = {
  phase: "idle",
  running: false,
  taskId: null,
  workMinutes: 25,
  breakMinutes: 5,
  startedAt: null,
  endsAt: null,
  remainingSec: 25 * 60,
  completedToday: 0,
};

const focusSlice = createSlice({
  name: "focus",
  initialState,
  reducers: {
    setDurations: (
      state,
      action: PayloadAction<{ workMinutes: number; breakMinutes: number }>,
    ) => {
      state.workMinutes = Math.min(180, Math.max(5, action.payload.workMinutes));
      state.breakMinutes = Math.min(60, Math.max(1, action.payload.breakMinutes));
      if (state.phase === "idle") {
        state.remainingSec = state.workMinutes * 60;
      }
    },
    setFocusTask: (state, action: PayloadAction<string | null>) => {
      state.taskId = action.payload;
    },
    startSession: (state, action: PayloadAction<{ at?: number } | undefined>) => {
      const now = action.payload?.at ?? Date.now();
      state.phase = "focus";
      state.running = true;
      state.startedAt = now;
      state.endsAt = now + state.workMinutes * 60_000;
      state.remainingSec = state.workMinutes * 60;
    },
    pauseSession: (state, action: PayloadAction<{ at?: number } | undefined>) => {
      const now = action.payload?.at ?? Date.now();
      if (!state.running || !state.endsAt) return;
      state.remainingSec = Math.max(0, Math.round((state.endsAt - now) / 1000));
      state.endsAt = null;
      state.running = false;
    },
    resumeSession: (state, action: PayloadAction<{ at?: number } | undefined>) => {
      const now = action.payload?.at ?? Date.now();
      if (state.running) return;
      state.endsAt = now + state.remainingSec * 1000;
      state.running = true;
    },
    stopSession: (state) => {
      state.phase = "idle";
      state.running = false;
      state.startedAt = null;
      state.endsAt = null;
      state.remainingSec = state.workMinutes * 60;
    },
    completePhase: (state, action: PayloadAction<{ at?: number } | undefined>) => {
      const now = action.payload?.at ?? Date.now();
      if (state.phase === "focus") {
        state.completedToday += 1;
        state.phase = "break";
        state.running = true;
        state.startedAt = now;
        state.endsAt = now + state.breakMinutes * 60_000;
        state.remainingSec = state.breakMinutes * 60;
        return;
      }
      state.phase = "idle";
      state.running = false;
      state.startedAt = null;
      state.endsAt = null;
      state.remainingSec = state.workMinutes * 60;
    },
    syncCompletedToday: (state, action: PayloadAction<number>) => {
      state.completedToday = action.payload;
    },
  },
});

export const {
  setDurations,
  setFocusTask,
  startSession,
  pauseSession,
  resumeSession,
  stopSession,
  completePhase,
  syncCompletedToday,
} = focusSlice.actions;

export default focusSlice.reducer;
