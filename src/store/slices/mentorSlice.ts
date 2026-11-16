import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type {
  AccountabilityState,
  AccountabilitySummary,
  ActivityKind,
  ActivityLogEntry,
  AiStatus,
  DailyLaunch,
  MentorAction,
  MentorCheck,
  MentorSettings,
} from "@/types";
import { accountabilityApi } from "@/services/api";

interface MentorState {
  loaded: boolean;
  loading: boolean;
  error: string | null;
  settings: MentorSettings | null;
  pending: MentorCheck[];
  checks: MentorCheck[];
  activities: ActivityLogEntry[];
  summary: AccountabilitySummary | null;
  nextCheckAt: number | null;
  ai: AiStatus | null;
  dailyLaunch: DailyLaunch | null;
  reply: { message: string; source: "ai" | "fallback"; at: number } | null;
  answering: boolean;
  savingSettings: boolean;
  firstSteps: {
    taskId: string;
    steps: string[];
    source: "ai" | "fallback";
    minutes?: number;
  } | null;
  firstStepsLoading: boolean;
}

const initialState: MentorState = {
  loaded: false,
  loading: false,
  error: null,
  settings: null,
  pending: [],
  checks: [],
  activities: [],
  summary: null,
  nextCheckAt: null,
  ai: null,
  dailyLaunch: null,
  reply: null,
  answering: false,
  savingSettings: false,
  firstSteps: null,
  firstStepsLoading: false,
};

export const loadAccountabilityState = createAsyncThunk(
  "mentor/loadState",
  async (token: string) => accountabilityApi.getState(token),
);

export const saveMentorSettings = createAsyncThunk(
  "mentor/saveSettings",
  async ({ token, patch }: { token: string; patch: Partial<MentorSettings> }) =>
    accountabilityApi.updateSettings(patch, token),
);

export const requestMentorCheck = createAsyncThunk(
  "mentor/requestCheck",
  async (token: string) => accountabilityApi.requestCheck(token),
);

export const answerMentorCheck = createAsyncThunk(
  "mentor/answerCheck",
  async (
    {
      token,
      checkId,
      action,
      note,
      minutes,
      taskId,
    }: {
      token: string;
      checkId?: string;
      action: MentorAction;
      note?: string;
      minutes?: number;
      taskId?: string;
    },
  ) => accountabilityApi.respond({ checkId, action, note, minutes, taskId }, token),
);

export const logActivityThunk = createAsyncThunk(
  "mentor/logActivity",
  async (
    {
      token,
      kind,
      taskId,
      taskTitle,
      note,
    }: {
      token: string;
      kind: ActivityKind;
      taskId?: string;
      taskTitle?: string;
      note?: string;
    },
  ) => {
    await accountabilityApi.logActivity({ kind, taskId, taskTitle, note }, token);
    return { kind, taskId, taskTitle, note, at: Date.now() };
  },
);

export const loadDailyLaunch = createAsyncThunk(
  "mentor/dailyLaunch",
  async (arg: string | { token: string; refresh?: boolean; count?: number }) => {
    const token = typeof arg === "string" ? arg : arg.token;
    const refresh = typeof arg === "string" ? false : Boolean(arg.refresh);
    const count = typeof arg === "string" ? 3 : (arg.count ?? 3);
    return accountabilityApi.dailyLaunch(token, refresh, count);
  },
);

export const requestFirstSteps = createAsyncThunk(
  "mentor/firstSteps",
  async ({
    token,
    taskId,
    title,
    notes,
    minutes,
  }: {
    token: string;
    taskId: string;
    title?: string;
    notes?: string | null;
    minutes?: number;
  }) => accountabilityApi.firstSteps({ taskId, title, notes, minutes }, token),
);

export const saveFocusSession = createAsyncThunk(
  "mentor/saveFocusSession",
  async ({
    token,
    mode,
    plannedMinutes,
    actualMinutes,
    completed,
    taskId,
    taskTitle,
    startedAt,
    endedAt,
  }: {
    token: string;
    mode: "focus" | "short_break" | "long_break";
    plannedMinutes: number;
    actualMinutes: number;
    completed: boolean;
    taskId?: string | null;
    taskTitle?: string | null;
    startedAt: number;
    endedAt?: number;
  }) =>
    accountabilityApi.saveFocusSession(
      {
        mode,
        plannedMinutes,
        actualMinutes,
        completed,
        taskId,
        taskTitle,
        startedAt,
        endedAt,
      },
      token,
    ),
);

const mentorSlice = createSlice({
  name: "mentor",
  initialState,
  reducers: {
    clearReply: (state) => {
      state.reply = null;
    },
    clearFirstSteps: (state) => {
      state.firstSteps = null;
    },
    clearMentor: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadAccountabilityState.pending, (state) => {
        state.loading = true;
      })
      .addCase(loadAccountabilityState.fulfilled, (state, action) => {
        const data = action.payload as AccountabilityState;
        state.loading = false;
        state.loaded = true;
        state.error = null;
        state.settings = data.settings;
        state.pending = data.pending;
        state.checks = data.checks;
        state.activities = data.activities;
        state.summary = data.summary;
        state.nextCheckAt = data.nextCheckAt;
        state.ai = data.ai;
      })
      .addCase(loadAccountabilityState.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? "Mentor verisi yüklenemedi";
      })
      .addCase(saveMentorSettings.pending, (state) => {
        state.savingSettings = true;
      })
      .addCase(saveMentorSettings.fulfilled, (state, action) => {
        state.savingSettings = false;
        state.settings = action.payload.settings;
        state.nextCheckAt = action.payload.nextCheckAt;
      })
      .addCase(saveMentorSettings.rejected, (state, action) => {
        state.savingSettings = false;
        state.error = action.error.message ?? "Ayarlar kaydedilemedi";
      })
      .addCase(requestMentorCheck.fulfilled, (state, action) => {
        const check = action.payload.check;
        if (check && !state.pending.some((c) => c._id === check._id)) {
          state.pending = [check, ...state.pending];
        }
        if (check && !state.checks.some((c) => c._id === check._id)) {
          state.checks = [check, ...state.checks];
        }
      })
      .addCase(requestMentorCheck.rejected, (state, action) => {
        state.error = action.error.message ?? "Kontrol oluşturulamadı";
      })
      .addCase(loadDailyLaunch.rejected, (state, action) => {
        state.error = action.error.message ?? "Günlük başlangıç oluşturulamadı";
      })
      .addCase(answerMentorCheck.pending, (state) => {
        state.answering = true;
      })
      .addCase(answerMentorCheck.fulfilled, (state, action) => {
        state.answering = false;
        state.reply = {
          message: action.payload.reply,
          source: action.payload.replySource,
          at: Date.now(),
        };
        const answeredId = action.payload.check?._id;
        if (answeredId) {
          state.pending = state.pending.filter((c) => c._id !== answeredId);
          state.checks = state.checks.map((c) =>
            c._id === answeredId ? { ...c, status: "answered" } : c,
          );
        }
      })
      .addCase(answerMentorCheck.rejected, (state, action) => {
        state.answering = false;
        state.error = action.error.message ?? "Cevap kaydedilemedi";
      })
      .addCase(logActivityThunk.fulfilled, (state, action) => {
        const { kind, taskId, taskTitle, note, at } = action.payload;
        state.activities = [
          {
            _id: `local-${at}`,
            dateKey: state.summary?.dateKey ?? "",
            kind,
            taskId: taskId ?? null,
            taskTitle: taskTitle ?? null,
            note: note ?? null,
            source: "manual",
            startedAt: at,
            endedAt: null,
            durationMs: 0,
          },
          ...state.activities,
        ];
      })
      .addCase(loadDailyLaunch.fulfilled, (state, action) => {
        state.dailyLaunch = action.payload.launch;
      })
      .addCase(requestFirstSteps.pending, (state) => {
        state.firstStepsLoading = true;
      })
      .addCase(requestFirstSteps.fulfilled, (state, action) => {
        state.firstStepsLoading = false;
        state.firstSteps = {
          taskId: action.meta.arg.taskId,
          steps: action.payload.steps,
          source: action.payload.source,
        };
      })
      .addCase(requestFirstSteps.rejected, (state, action) => {
        state.firstStepsLoading = false;
        state.error = action.error.message ?? "Adımlar oluşturulamadı";
      });
  },
});

export const { clearReply, clearFirstSteps, clearMentor } = mentorSlice.actions;

export default mentorSlice.reducer;
