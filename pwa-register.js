(() => {
  "use strict";
  if (!("serviceWorker" in navigator)) return;
  if (!window.isSecureContext && location.hostname !== "127.0.0.1" && location.hostname !== "localhost") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("PWA service worker could not be registered.", error);
    });
  }, { once: true });
})();
