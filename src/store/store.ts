import { combineReducers, configureStore } from "@reduxjs/toolkit";
import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
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

import routineReducer from "./slices/routineSlice";
import uiReducer from "./slices/uiSlice";

const rootReducer = combineReducers({
  routine: routineReducer,
  ui: uiReducer,
});

const persistConfig = {
  key: "adaptime-root",
  storage,
  version: 1,
  whitelist: ["routine"],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  devTools: import.meta.env.DEV,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
