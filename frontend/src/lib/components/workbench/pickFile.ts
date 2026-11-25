/** Native file picker (Tauri). Returns an absolute path, or null when cancelled/unavailable. */
export async function pickFile(title = 'Choose file'): Promise<string | null> {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const res = await open({ multiple: false, directory: false, title });
    if (!res) return null;
    return Array.isArray(res) ? (res[0] ?? null) : String(res);
  } catch {
    return null;
  }
}

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Sanitises a name for use as a file name (keeps letters, digits, space, dash, underscore, dot). */
export function safeFileName(name: string, fallback = 'export'): string {
  const s = name.replace(/[^\p{L}\p{N}\-_. ]+/gu, '').trim();
  return s || fallback;
}

/**
 * Save text to a file chosen by the user. In the desktop app the native "Save as" dialog
 * and the write both happen in Rust (no fs-scope limits). In a plain browser it downloads.
 * Returns the saved path / file name, or null when the user cancelled.
 */
export async function saveTextFile(defaultName: string, contents: string): Promise<string | null> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke<string | null>('save_text_file', { defaultName, contents })) ?? null;
  }
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return defaultName;
}

export function baseName(path: string | undefined): string {
  if (!path) return '';
  return path.split(/[\\/]/).pop() ?? path;
}
