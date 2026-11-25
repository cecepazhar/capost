// Import / export actions shared by the workbench sidebar, Collections and Environments pages.
import { getWorkbench, type ImportResult } from '$lib/stores/workbench.svelte';
import { showToast } from '$lib/stores/uiNotifications.svelte';
import { saveTextFile, safeFileName, baseName } from '$lib/components/workbench/pickFile';

async function saveOrCopy(fileName: string, json: string, what: string) {
  try {
    const path = await saveTextFile(fileName, json);
    if (path) showToast(`${what} exported to ${baseName(path)}`, 'success');
  } catch (e: any) {
    try {
      await navigator.clipboard.writeText(json);
      showToast(`Could not save the file (${e?.message ?? e}). JSON copied to clipboard instead.`, 'error');
    } catch {
      showToast(`Export failed: ${e?.message ?? e}`, 'error');
    }
  }
}

export async function exportCollectionFile(colId: string) {
  const wb = getWorkbench();
  const json = wb.exportPostman(colId);
  if (!json) return showToast('Collection not found', 'error');
  const col = wb.collections.find((c) => c.id === colId);
  await saveOrCopy(`${safeFileName(col?.name ?? '', 'collection')}.postman_collection.json`, json, 'Collection');
}

export async function exportEnvironmentFile(envId: string) {
  const wb = getWorkbench();
  const json = wb.exportPostmanEnvironment(envId);
  if (!json) return showToast('Environment not found', 'error');
  const name = envId === 'globals' ? 'workspace' : (wb.environments.find((e) => e.id === envId)?.name ?? 'environment');
  const suffix = envId === 'globals' ? 'postman_globals' : 'postman_environment';
  await saveOrCopy(`${safeFileName(name, 'environment')}.${suffix}.json`, json, envId === 'globals' ? 'Globals' : 'Environment');
}

export function summarizeImport(r: ImportResult): string {
  const parts: string[] = [];
  if (r.collections) parts.push(`${r.collections} collection${r.collections > 1 ? 's' : ''}`);
  if (r.requests) parts.push(`${r.requests} request${r.requests > 1 ? 's' : ''}`);
  if (r.environments) parts.push(`${r.environments} environment${r.environments > 1 ? 's' : ''}`);
  if (r.globals) parts.push(`${r.globals} global${r.globals > 1 ? 's' : ''}`);
  return parts.length ? `Imported ${parts.join(', ')}` : 'Nothing to import';
}

/** Opens a file chooser and imports every selected Postman/Insomnia/Bruno/CAPost file. */
export function importFromFiles(accept = '.json,.bru,.txt'): Promise<ImportResult[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = accept;
    input.onchange = async () => {
      const wb = getWorkbench();
      const results: ImportResult[] = [];
      for (const f of Array.from(input.files ?? [])) {
        try {
          const r = wb.importText(await f.text(), f.name);
          results.push(r);
          showToast(`${f.name}: ${summarizeImport(r)}${r.warnings.length ? ` (${r.warnings.length} warning${r.warnings.length > 1 ? 's' : ''})` : ''}`, 'success');
        } catch (e: any) {
          showToast(`${f.name}: ${e?.message ?? 'import failed'}`, 'error');
        }
      }
      resolve(results);
    };
    input.click();
  });
}
