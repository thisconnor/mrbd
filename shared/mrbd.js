/**
 * MRBD input model - maps desktop/touch input to the Meta Ray-Ban Display
 * interaction set (Neural Band gestures + temple touchpad), so apps can be
 * built and driven from a laptop.
 *
 *   pinch        primary select   (click / Enter / Space / tap)
 *   swipe-*      navigate         (arrow keys / touch swipe)
 *   back         dismiss          (Esc / Backspace)
 *
 *   MRBD.on("pinch", (e) => ...)   // e.type is the gesture name
 *   MRBD.on("gesture", (e) => ...) // fires for every gesture
 */
(function (global) {
  const listeners = Object.create(null);

  function on(type, fn) {
    (listeners[type] || (listeners[type] = [])).push(fn);
    return () => off(type, fn);
  }
  function off(type, fn) {
    const a = listeners[type];
    if (a) listeners[type] = a.filter((f) => f !== fn);
  }
  function emit(type) {
    (listeners[type] || []).forEach((fn) => fn({ type }));
    (listeners.gesture || []).forEach((fn) => fn({ type }));
  }

  const keyMap = {
    Enter: "pinch",
    " ": "pinch",
    ArrowUp: "swipe-up",
    ArrowDown: "swipe-down",
    ArrowLeft: "swipe-left",
    ArrowRight: "swipe-right",
    Escape: "back",
    Backspace: "back",
  };

  global.addEventListener("keydown", (e) => {
    const g = keyMap[e.key];
    if (!g) return;
    e.preventDefault();
    emit(g);
  });

  global.addEventListener("click", () => emit("pinch"));

  let sx = 0, sy = 0, tracking = false;
  global.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0];
    sx = t.clientX;
    sy = t.clientY;
    tracking = true;
  }, { passive: true });
  global.addEventListener("touchend", (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    if (Math.abs(dx) < 30 && Math.abs(dy) < 30) return emit("pinch");
    if (Math.abs(dx) > Math.abs(dy)) emit(dx > 0 ? "swipe-right" : "swipe-left");
    else emit(dy > 0 ? "swipe-down" : "swipe-up");
  }, { passive: true });

  global.MRBD = {
    on,
    off,
    GESTURES: ["pinch", "swipe-up", "swipe-down", "swipe-left", "swipe-right", "back"],
  };
})(window);
