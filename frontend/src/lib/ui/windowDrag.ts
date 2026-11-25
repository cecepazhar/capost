// The one place that turns a mousedown on the frameless title area into a window drag or a
// maximize toggle. Everything else (Tauri's `data-tauri-drag-region`, `-webkit-app-region`,
// separate `dblclick` handlers) is deliberately NOT used: stacking them made a double-click
// toggle maximize twice (maximize → restore flicker) and fired several drags per click.
//
// The second click of a double-click is detected through `e.detail === 2` on mousedown, the
// same way Tauri does it: once a drag starts, the OS drag loop swallows the mouseup, so a
// `dblclick` event is unreliable.

import { invoke } from '@tauri-apps/api/core';

const INTERACTIVE = 'button, input, textarea, a, select, label, [role="button"], [contenteditable="true"], .no-drag';

let toggling = false;

export async function toggleMaximize(): Promise<void> {
  if (toggling) return;
  toggling = true;
  try {
    await invoke('window_maximize');
  } catch {
    // Browser preview: no window to resize.
  } finally {
    // Ignore further toggles until the OS has finished the resize animation.
    setTimeout(() => (toggling = false), 250);
  }
}

export function dragOrMaximize(e: MouseEvent): void {
  if (e.button !== 0) return;
  const target = e.target as HTMLElement | null;
  if (target?.closest(INTERACTIVE)) return;
  // Nested drag areas must not each start a drag for the same click.
  e.stopPropagation();
  if (e.detail === 2) {
    e.preventDefault();
    void toggleMaximize();
  } else if (e.detail === 1) {
    invoke('window_start_dragging').catch(() => {});
  }
}
