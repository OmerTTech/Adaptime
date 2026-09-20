import {
  createSlice,
  createAsyncThunk,
  type PayloadAction,
} from "@reduxjs/toolkit";
import type { TaskBlock, DayRoutine, PreviewState } from "@/types";
import { isScheduled } from "@/types";
import { getTodayString, generateId, getRandomColor } from "@/utils";

function normalizeTaskDates(
  tasks: TaskBlock[],
  targetDate: string,
): TaskBlock[] {
  const [y, m, d] = targetDate.split("-").map(Number);
  const targetMidnight = new Date(y, m - 1, d).getTime();
  return tasks.map((task) => {
    if (!isScheduled(task)) return task;
    const taskMidnight = new Date(task.startTime!).setHours(0, 0, 0, 0);
    const dayDiff = Math.round((targetMidnight - taskMidnight) / 86400000);
    if (dayDiff > 0 && dayDiff < 30) {
      const shift = dayDiff * 86400000;
      return {
        ...task,
        startTime: task.startTime! + shift,
        endTime: task.endTime! + shift,
      };
    }
    return task;
  });
}
import { routineApi } from "@/services/api";

interface RoutineState {
  currentRoutine: DayRoutine | null;
  preview: PreviewState | null;
  history: DayRoutine[];
  historyLoaded: boolean;
  lastSynced: number | null;
}

export const loadTodayRoutine = createAsyncThunk(
  "routine/loadToday",
  async (token: string) => {
    const date = getTodayString();
    const data = await routineApi.get(date, token);
    if (!data) return null;
    return {
      id: data._id,
      date: data.date,
      tasks: data.tasks.map(({ _id, ...rest }) => ({
        ...rest,
        id: _id,
      })) as TaskBlock[],
      dayEndTime: data.dayEndTime,
      streak: data.streak,
    } as DayRoutine;
  },
);

export const loadRoutineHistory = createAsyncThunk(
  "routine/loadHistory",
  async ({ token, limit }: { token: string; limit?: number }) => {
    const data = await routineApi.getHistory(token, limit);
    return data.map((r) => ({
      id: r._id,
      date: r.date,
      dayEndTime: r.dayEndTime,
      streak: r.streak,
      tasks: r.tasks.map(({ _id, ...rest }) => ({
        ...rest,
        id: _id,
      })) as TaskBlock[],
    })) as DayRoutine[];
  },
);

export const saveRoutineToBackend = createAsyncThunk(
  "routine/save",
  async ({ routine, token }: { routine: DayRoutine; token: string }) => {
    await routineApi.save(
      {
        date: routine.date,
        tasks: routine.tasks,
        dayEndTime: routine.dayEndTime,
        streak: routine.streak,
      },
      token,
    );
    return Date.now();
  },
);

function getInitialRoutine(): DayRoutine {
  return {
    id: generateId(),
    date: getTodayString(),
    tasks: [],
    dayEndTime: Date.now(),
    streak: 0,
  };
}

const routineSlice = createSlice({
  name: "routine",
  initialState: {
    currentRoutine: getInitialRoutine(),
    preview: null,
    history: [],
    historyLoaded: false,
    lastSynced: null,
  } as RoutineState,
  reducers: {
    addTask: (
      state,
      action: PayloadAction<{
        title: string;
        startTime?: number;
        endTime?: number;
        estimatedMinutes?: number;
        color?: string;
      }>,
    ) => {
      if (!state.currentRoutine) return;
      const { title, startTime, endTime, estimatedMinutes, color } =
        action.payload;
      const scheduled =
        typeof startTime === "number" &&
        typeof endTime === "number" &&
        endTime > startTime;
      const task: TaskBlock = {
        id: generateId(),
        title,
        ...(scheduled
          ? {
              startTime,
              endTime,
              originalDuration: endTime! - startTime!,
            }
          : { estimatedMinutes }),
        color: color || getRandomColor(),
        status: "pending",
        pausedDuration: 0,
        flowExtensions: 0,
      };
      state.currentRoutine.tasks.push(task);
      if (scheduled) {
        state.currentRoutine.tasks.sort((a, b) => {
          if (!isScheduled(a)) return 1;
          if (!isScheduled(b)) return -1;
          return a.startTime! - b.startTime!;
        });
        state.currentRoutine.dayEndTime = Math.max(
          state.currentRoutine.dayEndTime,
          endTime!,
        );
      }
    },
    removeTask: (state, action: PayloadAction<string>) => {
      if (!state.currentRoutine) return;
      state.currentRoutine.tasks = state.currentRoutine.tasks.filter(
        (t) => t.id !== action.payload,
      );
    },
    updateTask: (
      state,
      action: PayloadAction<{ id: string; updates: Partial<TaskBlock> }>,
    ) => {
      if (!state.currentRoutine) return;
      const task = state.currentRoutine.tasks.find(
        (t) => t.id === action.payload.id,
      );
      if (task) {
        Object.assign(task, action.payload.updates);
      }
    },
    startTask: (state, action: PayloadAction<string>) => {
      if (!state.currentRoutine) return;
      const task = state.currentRoutine.tasks.find(
        (t) => t.id === action.payload,
      );
      if (task && isScheduled(task)) {
        task.status = "active";
        task.pausedAt = undefined;
        if (!task.startedAt) task.startedAt = Date.now();
      }
    },
    adjustStartedAt: (
      state,
      action: PayloadAction<{ id: string; startedAt: number }>,
    ) => {
      if (!state.currentRoutine) return;
      const task = state.currentRoutine.tasks.find(
        (t) => t.id === action.payload.id,
      );
      if (task) {
        task.startedAt = action.payload.startedAt;
      }
    },
    pauseTask: (state, action: PayloadAction<string>) => {
      if (!state.currentRoutine) return;
      const task = state.currentRoutine.tasks.find(
        (t) => t.id === action.payload,
      );
      if (task) {
        task.status = "paused";
        task.pausedAt = Date.now();
      }
    },
    resumeTask: (state, action: PayloadAction<string>) => {
      if (!state.currentRoutine) return;
      const task = state.currentRoutine.tasks.find(
        (t) => t.id === action.payload,
      );
      if (task && task.pausedAt) {
        const pauseMs = Date.now() - task.pausedAt;
        task.pausedDuration += pauseMs;
        task.pausedAt = undefined;
        task.status = "active";
      }
    },
    skipTask: (state, action: PayloadAction<string>) => {
      if (!state.currentRoutine) return;
      const task = state.currentRoutine.tasks.find(
        (t) => t.id === action.payload,
      );
      if (task) {
        task.status = "skipped";
      }
    },
    completeTask: (state, action: PayloadAction<string>) => {
      if (!state.currentRoutine) return;
      const task = state.currentRoutine.tasks.find(
        (t) => t.id === action.payload,
      );
      if (task) {
        task.status = "completed";
      }
    },
    resetStreak: (state) => {
      if (!state.currentRoutine) return;
      state.currentRoutine.streak = 0;
    },
    setStreak: (state, action: PayloadAction<number>) => {
      if (!state.currentRoutine) return;
      state.currentRoutine.streak = action.payload;
    },
    applyModifiedTasks: (state, action: PayloadAction<TaskBlock[]>) => {
      if (!state.currentRoutine) return;
      state.currentRoutine.tasks = action.payload;
      state.preview = null;
    },
    setPreview: (state, action: PayloadAction<PreviewState | null>) => {
      state.preview = action.payload;
    },
    clearPreview: (state) => {
      state.preview = null;
    },
    recalcDayEndTime: (state) => {
      if (!state.currentRoutine || state.currentRoutine.tasks.length === 0)
        return;
      const scheduledEnds = state.currentRoutine.tasks
        .filter(isScheduled)
        .map((t) => t.endTime!)
        .filter((v) => typeof v === "number");
      if (scheduledEnds.length === 0) {
        state.currentRoutine.dayEndTime = state.currentRoutine.dayEndTime || 0;
        return;
      }
      state.currentRoutine.dayEndTime = Math.max(...scheduledEnds);
    },
    migrateDates: (state) => {
      if (!state.currentRoutine) return;
      state.currentRoutine.tasks = normalizeTaskDates(
        state.currentRoutine.tasks,
        getTodayString(),
      );
      const scheduledEnds = state.currentRoutine.tasks
        .filter(isScheduled)
        .map((t) => t.endTime!)
        .filter((v) => typeof v === "number");
      state.currentRoutine.dayEndTime = Math.max(
        ...scheduledEnds,
        state.currentRoutine.dayEndTime,
      );
    },
    scheduleTask: (
      state,
      action: PayloadAction<{ id: string; startTime: number; endTime: number }>,
    ) => {
      if (!state.currentRoutine) return;
      const task = state.currentRoutine.tasks.find(
        (t) => t.id === action.payload.id,
      );
      if (!task) return;
      task.startTime = action.payload.startTime;
      task.endTime = action.payload.endTime;
      task.originalDuration = action.payload.endTime - action.payload.startTime;
      state.currentRoutine.tasks.sort((a, b) => {
        if (!isScheduled(a)) return 1;
        if (!isScheduled(b)) return -1;
        return a.startTime! - b.startTime!;
      });
      state.currentRoutine.dayEndTime = Math.max(
        state.currentRoutine.dayEndTime,
        action.payload.endTime,
      );
    },
    resetDay: (state) => {
      if (state.currentRoutine) {
        state.history.push(state.currentRoutine);
      }
      state.currentRoutine = getInitialRoutine();
      state.preview = null;
    },
    abandonDay: (state) => {
      if (state.currentRoutine) {
        state.currentRoutine.streak = 0;
        state.history.push(state.currentRoutine);
      }
      state.currentRoutine = getInitialRoutine();
      state.preview = null;
    },
    resetRoutine: (state) => {
      state.currentRoutine = getInitialRoutine();
      state.preview = null;
      state.history = [];
      state.historyLoaded = false;
      state.lastSynced = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(loadTodayRoutine.fulfilled, (state, action) => {
      if (action.payload) {
        const today = getTodayString();
        action.payload.tasks = normalizeTaskDates(action.payload.tasks, today);
        state.currentRoutine = action.payload;
      }
      state.lastSynced = Date.now();
    });
    builder.addCase(loadRoutineHistory.fulfilled, (state, action) => {
      state.history = action.payload;
      state.historyLoaded = true;
    });
    builder.addCase(saveRoutineToBackend.fulfilled, (state, action) => {
      state.lastSynced = action.payload;
    });
  },
});

export const addTask = routineSlice.actions.addTask;
export const removeTask = routineSlice.actions.removeTask;
export const updateTask = routineSlice.actions.updateTask;
export const startTask = routineSlice.actions.startTask;
export const adjustStartedAt = routineSlice.actions.adjustStartedAt;
export const pauseTask = routineSlice.actions.pauseTask;
export const resumeTask = routineSlice.actions.resumeTask;
export const skipTask = routineSlice.actions.skipTask;
export const completeTask = routineSlice.actions.completeTask;
export const applyModifiedTasks = routineSlice.actions.applyModifiedTasks;
export const setPreview = routineSlice.actions.setPreview;
export const clearPreview = routineSlice.actions.clearPreview;
export const recalcDayEndTime = routineSlice.actions.recalcDayEndTime;
export const migrateDates = routineSlice.actions.migrateDates;
export const scheduleTask = routineSlice.actions.scheduleTask;
export const resetDay = routineSlice.actions.resetDay;
export const abandonDay = routineSlice.actions.abandonDay;
export const resetStreak = routineSlice.actions.resetStreak;
export const setStreak = routineSlice.actions.setStreak;
export const resetRoutine = routineSlice.actions.resetRoutine;
export default routineSlice.reducer;
