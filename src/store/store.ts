import { combineReducers, configureStore, createListenerMiddleware } from "@reduxjs/toolkit";
import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
  type PersistConfig,
  type PersistedState,
} from "redux-persist";

const createNoopStorage = () => ({
  getItem() {
    return Promise.resolve(null);
  },
  setItem(_key: string, _value: string) {
    return Promise.resolve();
  },
  removeItem() {
    return Promise.resolve();
  },
});

const storage = (() => {
  if (typeof window === "undefined") return createNoopStorage();
  try {
    const s = window.localStorage;
    const key = "__redux_persist_test__";
    s.setItem(key, "test");
    s.removeItem(key);
    return {
      getItem(key: string) {
        return Promise.resolve(s.getItem(key));
      },
      setItem(key: string, value: string) {
        return Promise.resolve(s.setItem(key, value));
      },
      removeItem(key: string) {
        return Promise.resolve(s.removeItem(key));
      },
    };
  } catch {
    return createNoopStorage();
  }
})();

import routineReducer, {
  normalizePersistedRoutine,
  completeTask,
} from "./slices/routineSlice";
import { spawnNextOccurrence } from "./repeatSpawner";
import type { DayRoutine, TaskBlock } from "@/types";
import uiReducer from "./slices/uiSlice";
import mentorReducer from "./slices/mentorSlice";
import focusReducer from "./slices/focusSlice";
import diaryReducer from "./slices/diarySlice";

const rootReducer = combineReducers({
  routine: routineReducer,
  ui: uiReducer,
  mentor: mentorReducer,
  focus: focusReducer,
  diary: diaryReducer,
});

const persistConfig: PersistConfig<ReturnType<typeof rootReducer>> = {
  key: "adaptime-root",
  storage,
  version: 3,
  whitelist: ["routine", "focus"],
  // Eski sürümlerde alt görevler yalnızca `_id` taşıyordu; istemci `id` bekliyor.
  migrate: async (state: PersistedState) => {
    const persisted = state as
      | { routine?: { currentRoutine?: DayRoutine | null; history?: DayRoutine[] } }
      | undefined;
    const routine = persisted?.routine;
    if (!routine) return state;
    routine.currentRoutine = normalizePersistedRoutine(
      routine.currentRoutine ?? null,
    );
    routine.history = (routine.history ?? []).map(
      (day) => normalizePersistedRoutine(day) ?? day,
    );
    return state;
  },
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

// Tekrarlayan görev tamamlanınca bir sonraki örnek hedef güne yazılır.
const repeatMiddleware = createListenerMiddleware();
repeatMiddleware.startListening({
  actionCreator: completeTask,
  effect: async (action, api) => {
    const state = api.getState() as {
      routine: { currentRoutine: { tasks: TaskBlock[] } | null };
    };
    const task = state.routine.currentRoutine?.tasks.find(
      (t) => t.id === action.payload,
    );
    if (!task?.repeat) return;
    const token = localStorage.getItem("adaptime-token");
    if (!token) return;
    try {
      await spawnNextOccurrence(task, token);
    } catch {
      /* Ağ hatası: tekrar planı sessizce atlanır */
    }
  },
});

export const store = configureStore({
  reducer: persistedReducer,
  devTools: import.meta.env.DEV,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }).prepend(repeatMiddleware.middleware),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
