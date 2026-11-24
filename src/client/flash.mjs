// Price-tick flash: when a displayed value changes, the element briefly glows
// cyan (up) or pink (down). The previous value is kept on the element, so the
// first render never flashes.
export function flashValue(element, value) {
  if (!element || !Number.isFinite(value)) return;
  const previous = Number(element.dataset.flashValue);
  element.dataset.flashValue = String(value);
  if (!Number.isFinite(previous) || previous === value) return;
  flash(element, value > previous ? 'up' : 'down');
}

export function flash(element, direction) {
  element.classList.remove('flash-up', 'flash-down');
  void element.offsetWidth; // restart the animation
  element.classList.add(direction === 'up' ? 'flash-up' : 'flash-down');
}

// For lists rebuilt with innerHTML: remember values by key across renders and
// flash the matching new elements. Returns a function to call after each render.
export function keyedFlasher() {
  const last = new Map();
  return (elements, keyOf, valueOf) => {
    for (const element of elements) {
      const key = keyOf(element), value = valueOf(element);
      if (!Number.isFinite(value)) continue;
      if (last.has(key) && last.get(key) !== value) flash(element, value > last.get(key) ? 'up' : 'down');
      last.set(key, value);
    }
  };
}
