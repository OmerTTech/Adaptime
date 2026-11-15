import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import { store, persistor } from "@/store/store";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <App />
      </PersistGate>
    </Provider>
  </StrictMode>,
);

// PWA: uygulama kabuğunu önbelleğe alan service worker.
// Geliştirmede de kaydedilir ama ?dev=1 ile: önbellek yok, yalnızca push test edilebilir.
if ("serviceWorker" in navigator) {
  const url = import.meta.env.DEV ? "/sw.js?dev=1" : "/sw.js";
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(url).catch(() => {
      /* kayıt başarısızsa uygulama normal çalışır */
    });
  });
}
