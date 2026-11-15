import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { DiaryEntry, TaskSuggestion } from "@/types";
import { diaryApi } from "@/services/api";

interface DiaryState {
  entries: DiaryEntry[];
  current: DiaryEntry | null;
  loading: boolean;
  saving: boolean;
  deleting: boolean;
  suggestions: TaskSuggestion[] | null;
  suggestionsSource: "ai" | "fallback" | null;
  suggestLoading: boolean;
  reflection: string | null;
  reflectionSource: "ai" | "fallback" | null;
  reflecting: boolean;
  error: string | null;
}

const initialState: DiaryState = {
  entries: [],
  current: null,
  loading: false,
  saving: false,
  deleting: false,
  suggestions: null,
  suggestionsSource: null,
  suggestLoading: false,
  reflection: null,
  reflectionSource: null,
  reflecting: false,
  error: null,
};

export const loadDiaryEntries = createAsyncThunk(
  "diary/list",
  async (token: string) => diaryApi.list(token),
);

export const loadDiaryEntry = createAsyncThunk(
  "diary/get",
  async ({ token, date }: { token: string; date: string }, { rejectWithValue }) => {
    try {
      return await diaryApi.get(date, token);
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Yüklenemedi");
    }
  },
);

export const saveDiaryEntry = createAsyncThunk(
  "diary/save",
  async (
    { token, entry }: { token: string; entry: DiaryEntry },
    { dispatch },
  ) => {
    const saved = await diaryApi.save(entry.dateKey, entry, token);
    dispatch(loadDiaryEntries(token));
    return saved;
  },
);

export const deleteDiaryEntry = createAsyncThunk(
  "diary/delete",
  async ({ token, date }: { token: string; date: string }, { dispatch }) => {
    await diaryApi.remove(date, token);
    dispatch(loadDiaryEntries(token));
    return date;
  },
);

export const suggestDiaryTasks = createAsyncThunk(
  "diary/suggestTasks",
  async ({ token, date }: { token: string; date: string }) =>
    diaryApi.suggestTasks(date, token),
);

export const reflectDiary = createAsyncThunk(
  "diary/reflect",
  async ({ token, date }: { token: string; date: string }) =>
    diaryApi.reflect(date, token),
);

const diarySlice = createSlice({
  name: "diary",
  initialState,
  reducers: {
    setDiaryDraft: (state, action: { payload: DiaryEntry | null; type: string }) => {
      state.current = action.payload;
    },
    clearSuggestions: (state) => {
      state.suggestions = null;
      state.suggestionsSource = null;
    },
    clearReflection: (state) => {
      state.reflection = null;
      state.reflectionSource = null;
    },
    clearDiary: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadDiaryEntries.fulfilled, (state, action) => {
        state.entries = action.payload;
      })
      .addCase(loadDiaryEntry.pending, (state) => {
        state.loading = true;
      })
      .addCase(loadDiaryEntry.fulfilled, (state, action) => {
        state.loading = false;
        state.current = action.payload;
        state.suggestions = null;
        state.reflection = null;
      })
      .addCase(loadDiaryEntry.rejected, (state, action) => {
        state.loading = false;
        state.error =
          typeof action.payload === "string" ? action.payload : "Günlük yüklenemedi";
      })
      .addCase(saveDiaryEntry.pending, (state) => {
        state.saving = true;
      })
      .addCase(saveDiaryEntry.fulfilled, (state, action) => {
        state.saving = false;
        state.current = action.payload;
        state.entries = [
          action.payload,
          ...state.entries.filter((e) => e.dateKey !== action.payload.dateKey),
        ].sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
      })
      .addCase(saveDiaryEntry.rejected, (state, action) => {
        state.saving = false;
        state.error = action.error.message ?? "Günlük kaydedilemedi";
      })
      .addCase(deleteDiaryEntry.pending, (state) => {
        state.deleting = true;
      })
      .addCase(deleteDiaryEntry.fulfilled, (state, action) => {
        state.deleting = false;
        state.entries = state.entries.filter((e) => e.dateKey !== action.payload);
        if (state.current?.dateKey === action.payload) state.current = null;
      })
      .addCase(deleteDiaryEntry.rejected, (state, action) => {
        state.deleting = false;
        state.error = action.error.message ?? "Silinemedi";
      })
      .addCase(suggestDiaryTasks.pending, (state) => {
        state.suggestLoading = true;
      })
      .addCase(suggestDiaryTasks.fulfilled, (state, action) => {
        state.suggestLoading = false;
        state.suggestions = action.payload.suggestions;
        state.suggestionsSource = action.payload.source;
      })
      .addCase(suggestDiaryTasks.rejected, (state, action) => {
        state.suggestLoading = false;
        state.error = action.error.message ?? "Görev önerisi üretilemedi";
      })
      .addCase(reflectDiary.pending, (state) => {
        state.reflecting = true;
      })
      .addCase(reflectDiary.fulfilled, (state, action) => {
        state.reflecting = false;
        state.reflection = action.payload.message;
        state.reflectionSource = action.payload.source;
      })
      .addCase(reflectDiary.rejected, (state, action) => {
        state.reflecting = false;
        state.error = action.error.message ?? "Yorum üretilemedi";
      });
  },
});

export const {
  setDiaryDraft,
  clearSuggestions,
  clearReflection,
  clearDiary,
} = diarySlice.actions;

export default diarySlice.reducer;
