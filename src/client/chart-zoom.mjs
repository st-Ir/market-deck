// TradingView-style navigation for inline SVG charts: wheel zooms around the
// cursor, drag pans, double-click resets. Listeners are delegated from a stable
// root because the charts re-render their <svg> on every change.
//
// plot: { left, width, total } in viewBox units (plot area inside the svg).
// onZoom(anchor, factor, svg): anchor is the cursor position as a 0–1 fraction of
// the plot; factor > 1 zooms out. onPan(shift, svg): shift is a fraction of the plot
// width (positive = move the view later in time). onReset(svg).
export function attachChartZoom(root, selector, { plot, onZoom, onPan, onReset }) {
  let drag = null;
  let frame = 0;
  let pendingShift = 0;

  const geometry = (svg, clientX) => {
    const rect = svg.getBoundingClientRect();
    const units = rect.width / plot.total;
    const anchor = ((clientX - rect.left) / units - plot.left) / plot.width;
    return { units, anchor: Math.max(0, Math.min(1, anchor)) };
  };

  root.addEventListener('wheel', (event) => {
    const svg = event.target.closest(selector);
    if (!svg) return;
    event.preventDefault();
    const { anchor } = geometry(svg, event.clientX);
    const delta = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY;
    onZoom(anchor, Math.exp(Math.max(-300, Math.min(300, delta)) * 0.0015), svg);
  }, { passive: false });

  root.addEventListener('pointerdown', (event) => {
    const svg = event.target.closest(selector);
    if (!svg || event.button !== 0) return;
    drag = { x: event.clientX, units: geometry(svg, event.clientX).units, id: event.pointerId, moved: false, svg };
  });

  root.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    if (!drag.moved) {
      if (Math.abs(dx) < 3) return;
      // Capture only once a drag starts, so clicks and double-clicks keep their target.
      drag.moved = true;
      root.setPointerCapture(event.pointerId);
      root.classList.add('chart-dragging');
    }
    drag.x = event.clientX;
    pendingShift -= dx / drag.units / plot.width;
    if (!frame) {
      const { svg } = drag;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const shift = pendingShift;
        pendingShift = 0;
        onPan(shift, svg);
      });
    }
  });

  const end = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    drag = null;
    root.classList.remove('chart-dragging');
    if (root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);

  root.addEventListener('dblclick', (event) => {
    const svg = event.target.closest(selector);
    if (svg) onReset(svg);
  });

  return { dragging: () => Boolean(drag?.moved) };
}

// Zooms / pans a numeric [start, end] window inside [min, max], keeping at
// least minSpan. Returns the new window.
export function zoomWindow(view, bounds, anchor, factor, minSpan) {
  const span = view.end - view.start;
  const next = Math.max(minSpan, Math.min(bounds.max - bounds.min, span * factor));
  const pivot = view.start + anchor * span;
  return clampWindow({ start: pivot - anchor * next, end: pivot - anchor * next + next }, bounds);
}

export function panWindow(view, bounds, shift) {
  const offset = shift * (view.end - view.start);
  return clampWindow({ start: view.start + offset, end: view.end + offset }, bounds);
}

function clampWindow(view, bounds) {
  const span = view.end - view.start;
  if (view.start < bounds.min) return { start: bounds.min, end: bounds.min + span };
  if (view.end > bounds.max) return { start: bounds.max - span, end: bounds.max };
  return view;
}

// Per-viewer memory of which series are switched off.
export function hiddenSeries(key) {
  let hidden = new Set();
  try { hidden = new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch {}
  return {
    has: (name) => hidden.has(name),
    toggle(name) {
      if (hidden.has(name)) hidden.delete(name); else hidden.add(name);
      try { localStorage.setItem(key, JSON.stringify([...hidden])); } catch {}
    },
  };
}
