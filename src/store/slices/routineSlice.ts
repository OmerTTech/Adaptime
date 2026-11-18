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
  RepeatFrequency,
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
import {
  dequeueWrite,
  enqueueWrite,
  flushWrites,
} from "@/services/offlineQueue";
import { getPlannedDayEnd } from "@/engine/timeEngine";

/** 409 çakışmasında bu cihazla sunucu arasındaki fark. */
export interface SyncConflictDiff {
  added: number;
  removed: number;
  changed: number;
}

interface ServerTaskLite {
  id: string;
  title?: string;
  status?: string;
}

function diffRoutine(
  tasks: TaskBlock[],
  server: unknown,
): SyncConflictDiff | null {
  if (!Array.isArray(server)) return null;
  const localById = new Map(tasks.map((task) => [task.id, task] as const));
  const serverById = new Map<string, ServerTaskLite>();
  for (const item of server as ServerTaskLite[]) {
    if (item && typeof item.id === "string") serverById.set(item.id, item);
  }

  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const id of localById.keys()) if (!serverById.has(id)) added += 1;
  for (const [id, remote] of serverById) {
    const local = localById.get(id);
    if (!local) removed += 1;
    else if (local.title !== remote.title || local.status !== remote.status)
      changed += 1;
  }
  return { added, removed, changed };
}

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

export interface PendingConflict {
  firstId: string;
  firstTitle: string;
  secondId: string;
  secondTitle: string;
}

interface RoutineState {
  currentRoutine: DayRoutine | null;
  preview: PreviewState | null;
  history: DayRoutine[];
  historyLoaded: boolean;
  lastSynced: number | null;
  /** Yeni eklenen/düzenlenen görev başka bir görevle çakışırsa doldurulur. */
  pendingConflict: PendingConflict | null;
  /** Sunucudaki son bilinen sürüm (409 çakışma kontrolü). */
  revision: number | null;
  /** Kayıt 409 aldı: otomatik kayıt durur, kararı kullanıcı verir. */
  syncConflict: boolean;
  /** Sunucuya ulaşılamadı: değişiklikler yerelde, bağlantı gelince gönderilir. */
  pendingSave: boolean;
  /** 409 anında bu cihazla sunucu arasındaki fark (yoksa null). */
  syncConflictDiff: SyncConflictDiff | null;
}

/** Çakışan ilk açık görevi döndürür (birlikte işaretliler hariç). */
function firstOverlap(tasks: TaskBlock[], task: TaskBlock): TaskBlock | undefined {
  if (!isScheduled(task) || task.parallel) return undefined;
  if (task.status === "completed" || task.status === "skipped") return undefined;
  return tasks.find(
    (other) =>
      other.id !== task.id &&
      !other.parallel &&
      isScheduled(other) &&
      other.status !== "completed" &&
      other.status !== "skipped" &&
      task.startTime! < other.endTime! &&
      other.startTime! < task.endTime!,
  );
}

export const loadTodayRoutine = createAsyncThunk(
  "routine/loadToday",
  async (token: string) => {
    const date = getTodayString();
    const data = await routineApi.get(date, token);
    if (!data) return null;
    return {
      routine: {
        id: data._id,
        date: data.date,
        tasks: mapApiTasks(data.tasks as ApiTask[]),
        dayEndTime: data.dayEndTime,
        streak: data.streak,
      } as DayRoutine,
      // Eski kayıtlarda revision yok: sıradaki kayıt koşulsuz gider.
      revision: data.revision ?? 0,
    };
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
  async (
    {
      routine,
      token,
      force = false,
    }: { routine: DayRoutine; token: string; force?: boolean },
    { getState },
  ) => {
    const at = Date.now();
    // Geçmiş bir günün planını bugünmüş gibi sunucuya yazma.
    if (routine.date !== getTodayString()) {
      return {
        at,
        revision: null as number | null,
        conflict: false,
        offline: false,
        diff: null as SyncConflictDiff | null,
      };
    }
    const baseRevision = (
      getState() as { routine: { revision: number | null } }
    ).routine.revision;
    const payload = {
      date: routine.date,
      tasks: routine.tasks,
      // Plandan hesaplanır; silinen görevlerin bıraktığı eski değer kaydedilmesin.
      dayEndTime: getPlannedDayEnd(routine.tasks, routine.dayEndTime),
      streak: routine.streak,
      ...(force || baseRevision === null ? {} : { baseRevision }),
    };
    const queueKey = `routine:${routine.date}`;

    try {
      const res = await routineApi.save(payload, token);
      // Sunucuya ulaştı: aynı gün için bekleyen kuyruk kaydı varsa düşür.
      void dequeueWrite(queueKey);
      return {
        at,
        revision: typeof res?.revision === "number" ? res.revision : null,
        conflict: false,
        offline: false,
        diff: null as SyncConflictDiff | null,
      };
    } catch (error) {
      const status = (error as { status?: number }).status;
      // 409: plan başka bir cihazda (ya da gece devrinde) değişti.
      if (status === 409) {
        return {
          at,
          revision: null as number | null,
          conflict: true,
          offline: false,
          diff: diffRoutine(
            routine.tasks,
            (error as { payload?: { serverTasks?: unknown } }).payload
              ?.serverTasks,
          ),
        };
      }
      // Doğrulama hataları (4xx) kuyruğa girmez; tekrar denemek sonucu değiştirmez.
      if (typeof status === "number" && status < 500) {
        return {
          at,
          revision: null as number | null,
          conflict: false,
          offline: false,
          diff: null as SyncConflictDiff | null,
        };
      }
      // Ağ hatası / sunucu hatası: isteğin kendisi IndexedDB kuyruğunda bekler,
      // sayfa yenilense de bağlantı gelince gönderilir.
      await enqueueWrite({
        key: queueKey,
        endpoint: "/api/routines",
        method: "POST",
        body: payload,
        token,
      });
      return {
        at,
        revision: null as number | null,
        conflict: false,
        offline: true,
        diff: null as SyncConflictDiff | null,
      };
    }
  },
);

/** IndexedDB'de bekleyen yazmaları gönderir (bağlantı gelince / açılışta). */
export const flushPendingWrites = createAsyncThunk(
  "routine/flushOfflineQueue",
  async () => flushWrites(),
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
    // Yeni gün yeni kayıt: dünün revision'ı ile koşulsuz yazma yapılmasın.
    state.revision = null;
    state.syncConflict = false;
    state.syncConflictDiff = null;
    state.pendingSave = false;
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
    pendingConflict: null,
    revision: null,
    syncConflict: false,
    pendingSave: false,
    syncConflictDiff: null,
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
        /** Göreve başlarken ilk 2 dakikada yapılacak tek adım. */
        firstAction?: string;
        parallel?: boolean;
        repeat?: RepeatFrequency;
        repeatDays?: number[];
        /** Verilirse görev yeni satır değil, bu görevin alt görevi olur. */
        parentId?: string;
        /** Hazır alt görev başlıkları. */
        subtasks?: string[];
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
        firstAction,
        parallel,
        repeat,
        repeatDays,
        parentId,
      } = action.payload;

      const parent = parentId
        ? state.currentRoutine.tasks.find((t) => t.id === parentId)
        : undefined;
      if (parent) {
        parent.subtasks = [
          ...(parent.subtasks ?? []),
          { id: generateId(), title, done: false },
        ];
        return;
      }
      const scheduled =
        typeof startTime === "number" &&
        typeof endTime === "number" &&
        endTime > startTime;
      const taskId = generateId();
      const task: TaskBlock = {
        id: taskId,
        title,
        // Varsayılan: saatsiz todo kalıcı (tamamlanana kadar her gün devreder),
        // saatli görev tek seferlik. Düzenleme ekranından değiştirilebilir.
        carryPolicy: scheduled ? "once" : "rolling",
        originId: taskId,
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
        ...(firstAction ? { firstAction } : {}),
        ...(parallel ? { parallel: true } : {}),
        ...(repeat ? { repeat, repeatDays } : {}),
        ...(action.payload.subtasks && action.payload.subtasks.length > 0
          ? {
              subtasks: action.payload.subtasks.map((sub) => ({
                id: generateId(),
                title: sub,
                done: false,
              })),
            }
          : {}),
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

      // Aynı saate denk gelen başka bir görev varsa kullanıcıya sor.
      const overlap = firstOverlap(state.currentRoutine.tasks, task);
      if (overlap) {
        state.pendingConflict = {
          firstId: overlap.id,
          firstTitle: overlap.title,
          secondId: task.id,
          secondTitle: task.title,
        };
      }
    },
    clearPendingConflict: (state) => {
      state.pendingConflict = null;
    },
    // Görevi kopyala: kopya yapılacaklar listesine düşer, kalemle düzenlenebilir.
    duplicateTask: (state, action: PayloadAction<string>) => {
      startTodayIfStale(state);
      const routine = state.currentRoutine;
      if (!routine) return;
      const task = routine.tasks.find((t) => t.id === action.payload);
      if (!task) return;
      const minutes =
        task.startTime && task.endTime
          ? Math.max(5, Math.round((task.endTime - task.startTime) / 60_000))
          : (task.estimatedMinutes ?? 30);
      const copyId = generateId();
      const copy: TaskBlock = {
        ...task,
        id: copyId,
        // Kopya yeni bir görev zinciridir; devir geçmişi taşınmaz.
        originId: copyId,
        carryCount: 0,
        title: `${task.title} (kopya)`,
        status: "pending",
        pausedDuration: 0,
        flowExtensions: 0,
        progress: 0,
        delayCount: 0,
        estimatedMinutes: minutes,
        createdAtClient: Date.now(),
        subtasks: (task.subtasks ?? []).map((s) => ({
          id: generateId(),
          title: s.title,
          done: false,
        })),
      };
      delete copy.startTime;
      delete copy.endTime;
      delete copy.originalDuration;
      delete copy.startedAt;
      delete copy.pausedAt;
      delete copy.completedAt;
      delete copy.carriedFrom;
      routine.tasks.push(copy);
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
      const detachedId = generateId();
      routine.tasks.push({
        id: detachedId,
        originId: detachedId,
        carryPolicy: "rolling",
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
    renameSubtask: (
      state,
      action: PayloadAction<{
        id: string;
        subtaskId: string;
        title: string;
      }>,
    ) => {
      const title = action.payload.title.trim();
      if (!title) return;
      const subtask = state.currentRoutine?.tasks
        .find((t) => t.id === action.payload.id)
        ?.subtasks?.find((s) => s.id === action.payload.subtaskId);
      if (!subtask) return;
      subtask.title = title;
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
        const overlap = firstOverlap(state.currentRoutine.tasks, task);
        if (overlap) {
          state.pendingConflict = {
            firstId: overlap.id,
            firstTitle: overlap.title,
            secondId: task.id,
            secondTitle: task.title,
          };
        }
      }
    },
    startTask: (state, action: PayloadAction<string>) => {
      startTodayIfStale(state);
      if (!state.currentRoutine) return;
      const task = state.currentRoutine.tasks.find(
        (t) => t.id === action.payload,
      );
      if (!task) return;
      // Saati olmayan görev "şimdi" başlar: tahmini süresi kadar planlanır.
      if (!isScheduled(task)) {
        const start = Math.floor(Date.now() / 60_000) * 60_000;
        const minutes = task.estimatedMinutes ?? 30;
        task.startTime = start;
        task.endTime = start + minutes * 60_000;
        task.originalDuration = minutes * 60_000;
        state.currentRoutine.tasks.sort((a, b) => {
          if (!isScheduled(a)) return 1;
          if (!isScheduled(b)) return -1;
          return a.startTime! - b.startTime!;
        });
        state.currentRoutine.dayEndTime = Math.max(
          state.currentRoutine.dayEndTime,
          task.endTime!,
        );
      }
      // Aynı anda birden çok görev yürüyebilir; diğerleri duraklatılmaz.
      task.status = "active";
      task.pausedAt = undefined;
      if (!task.startedAt) task.startedAt = Date.now();
    },
    // Bitiş süresini dakika cinsinden uzat/kısalt (en az 5 dakika kalır).
    adjustTaskEnd: (
      state,
      action: PayloadAction<{ id: string; minutes: number }>,
    ) => {
      const routine = state.currentRoutine;
      if (!routine) return;
      const task = routine.tasks.find((t) => t.id === action.payload.id);
      if (!task || !isScheduled(task)) return;
      const end = Math.max(
        task.startTime! + 5 * 60_000,
        task.endTime! + action.payload.minutes * 60_000,
      );
      task.endTime = end;
      task.originalDuration = end - task.startTime!;
      routine.dayEndTime = Math.max(
        routine.dayEndTime,
        ...routine.tasks.filter(isScheduled).map((t) => t.endTime!),
      );
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
    /**
     * Uygulama kapalıyken (veya sekme kapatılmışken) açık kalan odak süresini
     * sayma: son görülme anından sonraki boşluk duraklatma sayılır ve görev
     * duraklatılır. Böylece dönüldüğünde sayaç saatlerce "odak" göstermez.
     */
    reclaimFocusGap: (
      state,
      action: PayloadAction<{ id: string; lastSeenAt: number }>,
    ) => {
      if (!state.currentRoutine) return;
      const task = state.currentRoutine.tasks.find(
        (t) => t.id === action.payload.id,
      );
      if (!task || task.status !== "active") return;
      const activeStart =
        task.startedAt ?? task.startTime ?? action.payload.lastSeenAt;
      const elapsed = Math.max(
        0,
        Date.now() - activeStart - task.pausedDuration,
      );
      const gap = Math.min(
        Math.max(0, Date.now() - action.payload.lastSeenAt),
        elapsed,
      );
      if (gap < 60_000) return;
      task.pausedDuration += gap;
      task.status = "paused";
      task.pausedAt = Date.now();
    },
    /** "Bu süre sayılsın": geri alınan boşluk duraklatmadan düşülür. */
    undoReclaimFocus: (
      state,
      action: PayloadAction<{ id: string; gapMs: number }>,
    ) => {
      if (!state.currentRoutine) return;
      const task = state.currentRoutine.tasks.find(
        (t) => t.id === action.payload.id,
      );
      if (!task) return;
      task.pausedDuration = Math.max(
        0,
        task.pausedDuration - action.payload.gapMs,
      );
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
    // Planı kaldır: görev yapılacaklar listesine döner (saatleri silinir).
    unscheduleTask: (
      state,
      action: PayloadAction<{ id: string; estimatedMinutes?: number }>,
    ) => {
      startTodayIfStale(state);
      const routine = state.currentRoutine;
      if (!routine) return;
      const task = routine.tasks.find((t) => t.id === action.payload.id);
      if (!task) return;
      const minutes =
        action.payload.estimatedMinutes ??
        task.estimatedMinutes ??
        Math.max(
          5,
          Math.round(
            ((task.endTime ?? 0) - (task.startTime ?? 0)) / 60_000,
          ) || 30,
        );
      delete task.startTime;
      delete task.endTime;
      delete task.originalDuration;
      delete task.startedAt;
      delete task.pausedAt;
      task.pausedDuration = 0;
      task.estimatedMinutes = minutes;
      if (task.status === "active" || task.status === "paused") {
        task.status = "pending";
      }
      routine.dayEndTime = getPlannedDayEnd(
        routine.tasks,
        routine.tasks.filter(isScheduled).length > 0 ? routine.dayEndTime : 0,
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
      state.revision = null;
      state.syncConflict = false;
      state.syncConflictDiff = null;
      state.pendingSave = false;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(loadTodayRoutine.fulfilled, (state, action) => {
      const today = getTodayString();
      if (action.payload) {
        const routine = { ...action.payload.routine, date: today };
        routine.tasks = normalizeTaskDates(routine.tasks, today);
        state.currentRoutine = routine;
        state.revision = action.payload.revision;
      } else if (state.currentRoutine?.date !== today) {
        // Bugün için sunucuda kayıt yok: geçmiş günden kalan planı bugün gibi
        // gösterme, temiz bir gün başlat.
        state.currentRoutine = getInitialRoutine();
        state.preview = null;
        state.revision = null;
      }
      state.syncConflict = false;
      state.lastSynced = Date.now();
    });
    builder.addCase(loadRoutineHistory.fulfilled, (state, action) => {
      state.history = action.payload;
      state.historyLoaded = true;
    });
    builder.addCase(saveRoutineToBackend.fulfilled, (state, action) => {
      if (action.payload.offline) {
        state.pendingSave = true;
        return;
      }
      state.pendingSave = false;
      state.lastSynced = action.payload.at;
      state.syncConflictDiff = action.payload.diff ?? null;
      if (action.payload.conflict) {
        // Kullanıcı "sunucudan yükle" ya da "bu cihazı koru" diyene kadar
        // otomatik kayıt durur; aksi halde her değişiklik yeniden 409 alır.
        state.syncConflict = true;
        return;
      }
      state.syncConflict = false;
      if (action.payload.revision !== null) {
        state.revision = action.payload.revision;
      }
    });
    builder.addCase(flushPendingWrites.fulfilled, (state, action) => {
      if (action.payload.remaining === 0) {
        state.pendingSave = false;
        state.lastSynced = Date.now();
      }
    });
  },
});

export const addTask = routineSlice.actions.addTask;
export const duplicateTask = routineSlice.actions.duplicateTask;
export const removeTask = routineSlice.actions.removeTask;
export const addSubtasks = routineSlice.actions.addSubtasks;
export const toggleSubtask = routineSlice.actions.toggleSubtask;
export const renameSubtask = routineSlice.actions.renameSubtask;
export const detachSubtask = routineSlice.actions.detachSubtask;
export const moveTaskAsSubtask = routineSlice.actions.moveTaskAsSubtask;
export const updateTask = routineSlice.actions.updateTask;
export const startTask = routineSlice.actions.startTask;
export const adjustTaskEnd = routineSlice.actions.adjustTaskEnd;
export const clearPendingConflict = routineSlice.actions.clearPendingConflict;
export const adjustStartedAt = routineSlice.actions.adjustStartedAt;
export const pauseTask = routineSlice.actions.pauseTask;
export const resumeTask = routineSlice.actions.resumeTask;
export const reclaimFocusGap = routineSlice.actions.reclaimFocusGap;
export const undoReclaimFocus = routineSlice.actions.undoReclaimFocus;
export const skipTask = routineSlice.actions.skipTask;
export const completeTask = routineSlice.actions.completeTask;
export const applyModifiedTasks = routineSlice.actions.applyModifiedTasks;
export const setPreview = routineSlice.actions.setPreview;
export const clearPreview = routineSlice.actions.clearPreview;
export const recalcDayEndTime = routineSlice.actions.recalcDayEndTime;
export const migrateDates = routineSlice.actions.migrateDates;
export const unscheduleTask = routineSlice.actions.unscheduleTask;
export const scheduleTask = routineSlice.actions.scheduleTask;
export const resetDay = routineSlice.actions.resetDay;
export const abandonDay = routineSlice.actions.abandonDay;
export const resetStreak = routineSlice.actions.resetStreak;
export const setStreak = routineSlice.actions.setStreak;
export const resetRoutine = routineSlice.actions.resetRoutine;
export default routineSlice.reducer;
