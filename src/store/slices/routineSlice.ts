import {
  createSlice,
  createAsyncThunk,
  type PayloadAction,
} from "@reduxjs/toolkit";
import type {
  TaskBlock,
  DayRoutine,
  PreviewState,
  TaskPriority,
  TaskCategory,
} from "@/types";
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
import { getPlannedDayEnd } from "@/engine/timeEngine";

// Sunucudan gelen görev/alt görevler `_id` taşır; istemci `id` bekler.
type ApiTask = Partial<TaskBlock> & { _id?: string };

function withSubtaskIds(task: TaskBlock): TaskBlock {
  if (!task.subtasks || task.subtasks.length === 0) return task;
  return {
    ...task,
    subtasks: task.subtasks.map((sub) => ({
      ...sub,
      id: sub.id ?? String((sub as { _id?: string })._id ?? generateId()),
    })),
  };
}

function mapApiTasks(tasks: ApiTask[]): TaskBlock[] {
  return tasks.map(({ _id, ...rest }) =>
    withSubtaskIds({
      ...rest,
      id: rest.id ?? String(_id ?? generateId()),
    } as TaskBlock),
  );
}

/** Tarayıcıda saklanan eski planlarda alt görevler yalnızca `_id` taşıyabilir. */
export function normalizePersistedRoutine(
  routine: DayRoutine | null,
): DayRoutine | null {
  if (!routine) return routine;
  return { ...routine, tasks: routine.tasks.map(withSubtaskIds) };
}

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
      tasks: mapApiTasks(data.tasks as ApiTask[]),
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
      tasks: mapApiTasks(r.tasks as ApiTask[]),
    })) as DayRoutine[];
  },
);

export const saveRoutineToBackend = createAsyncThunk(
  "routine/save",
  async ({ routine, token }: { routine: DayRoutine; token: string }) => {
    // Geçmiş bir günün planını bugünmüş gibi sunucuya yazma.
    if (routine.date !== getTodayString()) return Date.now();
    await routineApi.save(
      {
        date: routine.date,
        tasks: routine.tasks,
        // Plandan hesaplanır; silinen görevlerin bıraktığı eski değer kaydedilmesin.
        dayEndTime: getPlannedDayEnd(routine.tasks, routine.dayEndTime),
        streak: routine.streak,
      },
      token,
    );
    return Date.now();
  },
);

/**
 * Gün devri: tarayıcıda kalan plan dünün/geçmiş bir günün tarihini taşıyorsa
 * yeni plana geç. Aksi halde eklenen görevler eski tarihe kaydedilir ve
 * istatistikler/mentor (bugünü okur) hiç değişmez.
 */
function startTodayIfStale(state: RoutineState) {
  const today = getTodayString();
  if (!state.currentRoutine || state.currentRoutine.date !== today) {
    state.currentRoutine = getInitialRoutine();
    state.preview = null;
  }
}

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
        priority?: TaskPriority;
        category?: TaskCategory;
        deadline?: number;
        description?: string;
      }>,
    ) => {
      startTodayIfStale(state);
      if (!state.currentRoutine) return;
      const {
        title,
        startTime,
        endTime,
        estimatedMinutes,
        color,
        priority,
        category,
        deadline,
        description,
      } = action.payload;
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
        priority: priority ?? "medium",
        category: category ?? "work",
        createdAtClient: Date.now(),
        progress: 0,
        delayCount: 0,
        ...(deadline ? { deadline } : {}),
        ...(description ? { description } : {}),
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
    addSubtasks: (
      state,
      action: PayloadAction<{ id: string; titles: string[] }>,
    ) => {
      const task = state.currentRoutine?.tasks.find(
        (t) => t.id === action.payload.id,
      );
      if (!task) return;
      const existing = task.subtasks ?? [];
      task.subtasks = [
        ...existing,
        ...action.payload.titles.map((title) => ({
          id: generateId(),
          title,
          done: false,
        })),
      ];
    },
    moveTaskAsSubtask: (
      state,
      action: PayloadAction<{ id: string; parentId: string }>,
    ) => {
      const routine = state.currentRoutine;
      if (!routine) return;
      const task = routine.tasks.find((t) => t.id === action.payload.id);
      const parent = routine.tasks.find(
        (t) => t.id === action.payload.parentId,
      );
      if (!task || !parent || task.id === parent.id) return;
      const done = task.status === "completed";
      parent.subtasks = [
        ...(parent.subtasks ?? []),
        {
          id: generateId(),
          title: task.title,
          done,
          ...(done ? { doneAt: Date.now() } : {}),
        },
        // Taşınan görevin kendi alt görevleri de onunla birlikte gelir.
        ...(task.subtasks ?? []).map((sub) => ({ ...sub, id: generateId() })),
      ];
      routine.tasks = routine.tasks.filter((t) => t.id !== task.id);
      routine.dayEndTime = getPlannedDayEnd(routine.tasks, routine.dayEndTime);
    },
    detachSubtask: (
      state,
      action: PayloadAction<{ id: string; subtaskId: string }>,
    ) => {
      const routine = state.currentRoutine;
      if (!routine) return;
      const parent = routine.tasks.find((t) => t.id === action.payload.id);
      const sub = parent?.subtasks?.find(
        (s) => s.id === action.payload.subtaskId,
      );
      if (!parent || !sub) return;
      parent.subtasks = (parent.subtasks ?? []).filter(
        (s) => s.id !== sub.id,
      );
      // Saatsiz (Yapılacaklar) görev olarak geri döner.
      routine.tasks.push({
        id: generateId(),
        title: sub.title,
        color: parent.color,
        status: sub.done ? "completed" : "pending",
        pausedDuration: 0,
        flowExtensions: 0,
        priority: parent.priority ?? "medium",
        category: parent.category ?? "work",
        createdAtClient: Date.now(),
        progress: 0,
        delayCount: 0,
        ...(sub.done ? { completedAt: sub.doneAt ?? Date.now() } : {}),
      });
    },
    toggleSubtask: (
      state,
      action: PayloadAction<{ id: string; subtaskId: string }>,
    ) => {
      const subtask = state.currentRoutine?.tasks
        .find((t) => t.id === action.payload.id)
        ?.subtasks?.find((s) => s.id === action.payload.subtaskId);
      if (!subtask) return;
      subtask.done = !subtask.done;
      subtask.doneAt = subtask.done ? Date.now() : undefined;
    },
    updateTask: (
      state,
      action: PayloadAction<{ id: string; updates: Partial<TaskBlock> }>,
    ) => {
      startTodayIfStale(state);
      if (!state.currentRoutine) return;
      const task = state.currentRoutine.tasks.find(
        (t) => t.id === action.payload.id,
      );
      if (task) {
        Object.assign(task, action.payload.updates);
      }
    },
    startTask: (state, action: PayloadAction<string>) => {
      startTodayIfStale(state);
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
      startTodayIfStale(state);
      if (!state.currentRoutine) return;
      const task = state.currentRoutine.tasks.find(
        (t) => t.id === action.payload,
      );
      if (task) {
        task.status = "completed";
        task.completedAt = Date.now();
        task.progress = 100;
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
      startTodayIfStale(state);
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
      const today = getTodayString();
      if (action.payload) {
        action.payload.tasks = normalizeTaskDates(action.payload.tasks, today);
        state.currentRoutine = { ...action.payload, date: today };
      } else if (state.currentRoutine?.date !== today) {
        // Bugün için sunucuda kayıt yok: geçmiş günden kalan planı bugün gibi
        // gösterme, temiz bir gün başlat.
        state.currentRoutine = getInitialRoutine();
        state.preview = null;
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
export const addSubtasks = routineSlice.actions.addSubtasks;
export const toggleSubtask = routineSlice.actions.toggleSubtask;
export const detachSubtask = routineSlice.actions.detachSubtask;
export const moveTaskAsSubtask = routineSlice.actions.moveTaskAsSubtask;
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
