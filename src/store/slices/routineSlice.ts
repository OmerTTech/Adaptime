import {
  createSlice,
  createAsyncThunk,
  type PayloadAction,
} from "@reduxjs/toolkit";
import type { TaskBlock, DayRoutine, PreviewState } from "@/types";
import { getTodayString, generateId, getRandomColor } from "@/utils";

function normalizeTaskDates(
  tasks: TaskBlock[],
  targetDate: string,
): TaskBlock[] {
  const [y, m, d] = targetDate.split("-").map(Number);
  const targetMidnight = new Date(y, m - 1, d).getTime();
  return tasks.map((task) => {
    const taskMidnight = new Date(task.startTime).setHours(0, 0, 0, 0);
    const dayDiff = Math.round((targetMidnight - taskMidnight) / 86400000);
    if (dayDiff > 0 && dayDiff < 30) {
      const shift = dayDiff * 86400000;
      return {
        ...task,
        startTime: task.startTime + shift,
        endTime: task.endTime + shift,
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

export const saveRoutineToBackend = createAsyncThunk(
  "routine/save",
  async ({ routine, token }: { routine: DayRoutine; token: string }) => {
    await routineApi.save(
      {
        date: routine.date,
        tasks: routine.tasks.map(({ pausedAt: _pausedAt, ...t }) => t),
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
    lastSynced: null,
  } as RoutineState,
  reducers: {
    addTask: (
      state,
      action: PayloadAction<{
        title: string;
        startTime: number;
        endTime: number;
        color?: string;
      }>,
    ) => {
      if (!state.currentRoutine) return;
      const task: TaskBlock = {
        id: generateId(),
        title: action.payload.title,
        startTime: action.payload.startTime,
        endTime: action.payload.endTime,
        originalDuration: action.payload.endTime - action.payload.startTime,
        color: action.payload.color || getRandomColor(),
        status: "pending",
        pausedDuration: 0,
        flowExtensions: 0,
      };
      state.currentRoutine.tasks.push(task);
      state.currentRoutine.tasks.sort((a, b) => a.startTime - b.startTime);
      state.currentRoutine.dayEndTime = Math.max(
        state.currentRoutine.dayEndTime,
        task.endTime,
      );
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
      if (task) {
        task.status = "active";
        task.pausedAt = undefined;
        if (!task.startedAt) task.startedAt = Date.now();
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
        // Check if all tasks completed
        const allDone = state.currentRoutine.tasks.every(
          (t) => t.status === "completed",
        );
        if (allDone) {
          state.currentRoutine.streak += 1;
        }
      }
    },
    applyModifiedTasks: (state, action: PayloadAction<TaskBlock[]>) => {
      if (!state.currentRoutine) return;
      state.currentRoutine.tasks = action.payload;
      // Using options = flexibility = reward
      state.currentRoutine.streak += 1;
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
      state.currentRoutine.dayEndTime = Math.max(
        ...state.currentRoutine.tasks.map((t) => t.endTime),
      );
    },
    migrateDates: (state) => {
      if (!state.currentRoutine) return;
      state.currentRoutine.tasks = normalizeTaskDates(
        state.currentRoutine.tasks,
        getTodayString(),
      );
      state.currentRoutine.dayEndTime = Math.max(
        ...state.currentRoutine.tasks.map((t) => t.endTime),
        state.currentRoutine.dayEndTime,
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
    builder.addCase(saveRoutineToBackend.fulfilled, (state, action) => {
      state.lastSynced = action.payload;
    });
  },
});

export const addTask = routineSlice.actions.addTask;
export const removeTask = routineSlice.actions.removeTask;
export const updateTask = routineSlice.actions.updateTask;
export const startTask = routineSlice.actions.startTask;
export const pauseTask = routineSlice.actions.pauseTask;
export const resumeTask = routineSlice.actions.resumeTask;
export const skipTask = routineSlice.actions.skipTask;
export const completeTask = routineSlice.actions.completeTask;
export const applyModifiedTasks = routineSlice.actions.applyModifiedTasks;
export const setPreview = routineSlice.actions.setPreview;
export const clearPreview = routineSlice.actions.clearPreview;
export const recalcDayEndTime = routineSlice.actions.recalcDayEndTime;
export const migrateDates = routineSlice.actions.migrateDates;
export const resetDay = routineSlice.actions.resetDay;
export const abandonDay = routineSlice.actions.abandonDay;
export default routineSlice.reducer;
