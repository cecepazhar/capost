// Light/dark theme store. Applies `.dark` class to <html> for Tailwind CSS reactivity.

export type ThemeName = 'dark' | 'light';

const STORAGE_KEY = 'capost-theme';

const state = $state<{ name: ThemeName }>({ name: 'dark' });

export function getTheme() {
  return state;
}

export function isDark(): boolean {
  return state.name === 'dark';
}

/** Mirrors the choice onto <html> so Tailwind's `dark:` variants follow along. */
function applyToDocument(name: ThemeName) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', name === 'dark');
  syncWindowBackground(name);
}

/** The native window/WebView background shows through while the window is being resized or
 *  maximized, before the page repaints. Match it to the theme so light mode never flashes the
 *  dark startup colour. Silently does nothing outside Tauri. */
function syncWindowBackground(name: ThemeName) {
  if (!(typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window)) return;
  const color = name === 'dark' ? '#0e0e0e' : '#f5f5f5';
  import('@tauri-apps/api/window')
    .then(({ getCurrentWindow }) => getCurrentWindow().setBackgroundColor(color))
    .catch(() => {});
  import('@tauri-apps/api/webview')
    .then(({ getCurrentWebview }) => getCurrentWebview().setBackgroundColor(color))
    .catch(() => {});
}

export function setTheme(name: ThemeName) {
  state.name = name;
  applyToDocument(name);
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {
    // Private mode / blocked storage: the theme still applies for this session.
  }
}

export function toggleTheme() {
  setTheme(state.name === 'dark' ? 'light' : 'dark');
}

/** Reads the saved choice once at startup. Defaults to dark, as CAPost always has. */
export function initTheme() {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    saved = null;
  }
  setTheme(saved === 'light' ? 'light' : 'dark');
}
