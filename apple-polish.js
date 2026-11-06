(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const activeSprings = new WeakMap();

  // Sample an under-damped second-order response into compositor-only WAAPI keyframes.
  // Card reorder uses Apple's momentum-style values: damping 0.8, response 0.4s.
  function springProgress(time, damping = 0.8, response = 0.4) {
    const angularFrequency = (2 * Math.PI) / response;
    if (damping >= 1) return 1 - Math.exp(-angularFrequency * time) * (1 + angularFrequency * time);
    const dampedFrequency = angularFrequency * Math.sqrt(1 - damping * damping);
    const ratio = damping / Math.sqrt(1 - damping * damping);
    return 1 - Math.exp(-damping * angularFrequency * time)
      * (Math.cos(dampedFrequency * time) + ratio * Math.sin(dampedFrequency * time));
  }

  function settleDraggedElement(element) {
    if (!element || reduceMotion.matches || typeof element.animate !== "function") return;
    activeSprings.get(element)?.cancel();
    const response = 0.4;
    const damping = 0.8;
    const duration = 520;
    const samples = 28;
    const keyframes = Array.from({ length: samples }, (_, index) => {
      const offset = index / (samples - 1);
      const progress = index === samples - 1 ? 1 : springProgress(offset * duration / 1000, damping, response);
      const scale = 0.985 + (1 - 0.985) * progress;
      return { offset, transform: `scale(${scale})`, opacity: Math.min(1, 0.66 + 0.34 * progress) };
    });
    const animation = element.animate(keyframes, { duration, easing: "linear" });
    activeSprings.set(element, animation);
    animation.addEventListener("finish", () => activeSprings.delete(element), { once: true });
    animation.addEventListener("cancel", () => activeSprings.delete(element), { once: true });
  }

  document.addEventListener("dragend", (event) => {
    settleDraggedElement(event.target.closest?.(".flight-card, .content-editor-transport-row"));
  });

  document.addEventListener("pointerdown", (event) => {
    const pressable = event.target.closest?.("button, a, summary");
    if (pressable) pressable.dataset.pointerPressed = "true";
  }, { passive: true });

  const clearPress = (event) => {
    const pressable = event.target.closest?.("[data-pointer-pressed]");
    pressable?.removeAttribute("data-pointer-pressed");
  };
  document.addEventListener("pointerup", clearPress, { passive: true });
  document.addEventListener("pointercancel", clearPress, { passive: true });
})();
