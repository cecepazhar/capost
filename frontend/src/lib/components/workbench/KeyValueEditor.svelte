<script lang="ts">
  import { uid, type ParamRow } from '$lib/stores/workbench.svelte';
  import { showToast } from '$lib/stores/uiNotifications.svelte';
  import { pickFile, baseName } from './pickFile';

  let {
    rows,
    onchange = () => {},
    keyPlaceholder = 'Key',
    valuePlaceholder = 'Value',
    vars = new Map<string, string>(),
    fixedKeys = false,
    allowFiles = false,
    bulkEdit = true
  }: {
    rows: ParamRow[];
    onchange?: () => void;
    keyPlaceholder?: string;
    valuePlaceholder?: string;
    vars?: Map<string, string>;
    /** Keys are derived elsewhere (path variables): no add/remove/rename. */
    fixedKeys?: boolean;
    /** form-data: rows can be text or file. */
    allowFiles?: boolean;
    bulkEdit?: boolean;
  } = $props();

  let bulk = $state(false);
  let bulkText = $state('');
  let host: HTMLDivElement;

  function toBulk() {
    bulkText = rows
      .filter((r) => r.key || r.value)
      .map((r) => `${r.enabled ? '' : '// '}${r.key}: ${r.value}`)
      .join('\n');
    bulk = true;
  }

  function fromBulk() {
    const next: ParamRow[] = [];
    for (const raw of bulkText.split(/\r?\n/)) {
      if (!raw.trim()) continue;
      const disabled = raw.trimStart().startsWith('//');
      const line = disabled ? raw.trimStart().slice(2) : raw;
      const idx = line.indexOf(':');
      const key = (idx >= 0 ? line.slice(0, idx) : line).trim();
      const value = idx >= 0 ? line.slice(idx + 1).trim() : '';
      if (key) next.push({ id: uid(), enabled: !disabled, key, value });
    }
    rows.splice(0, rows.length, ...next);
    bulk = false;
    onchange();
  }

  function add(focusKey = true) {
    rows.push({ id: uid(), enabled: true, key: '', value: '', type: allowFiles ? 'text' : undefined });
    onchange();
    if (focusKey) {
      requestAnimationFrame(() => {
        const inputs = host?.querySelectorAll<HTMLInputElement>('[data-kv-key]');
        inputs?.[inputs.length - 1]?.focus();
      });
    }
  }

  function remove(id: string) {
    const i = rows.findIndex((r) => r.id === id);
    if (i >= 0) rows.splice(i, 1);
    onchange();
  }

  async function chooseFile(r: ParamRow) {
    const p = await pickFile();
    if (p) {
      r.src = p;
      onchange();
    } else if (!('__TAURI_INTERNALS__' in window)) {
      showToast('File upload is only available in the desktop app', 'info');
    }
  }

  const VAR_RE = /\{\{([^{}]+?)\}\}/g;
  function unknownVars(s: string): boolean {
    if (!s || s.indexOf('{{') < 0) return false;
    for (const m of s.matchAll(VAR_RE)) {
      const n = m[1].trim();
      if (!vars.has(n) && !n.startsWith('$')) return true;
    }
    return false;
  }
  const cellBase =
    'w-full min-w-0 bg-transparent px-2.5 py-1.5 text-[12.5px] font-mono outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:bg-brand-500/[0.04]';
</script>

<div class="flex flex-col gap-2" bind:this={host}>
  {#if bulkEdit && !fixedKeys && !allowFiles}
    <div class="flex items-center justify-end gap-3 text-[11px]">
      {#if bulk}
        <button class="wb-link" onclick={fromBulk}>Key-value edit</button>
      {:else}
        <button class="wb-link" onclick={toBulk}>Bulk edit</button>
      {/if}
    </div>
  {/if}

  {#if bulk}
    <textarea
      bind:value={bulkText}
      onblur={fromBulk}
      rows="8"
      spellcheck="false"
      class="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent p-3 font-mono text-[12.5px] outline-none focus:border-brand-500/50"
      placeholder={'key: value\n// disabled: value'}
    ></textarea>
  {:else}
    <div class="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden divide-y divide-neutral-200 dark:divide-neutral-800">
      {#each rows as r (r.id)}
        <div class="group flex items-stretch divide-x divide-neutral-200 dark:divide-neutral-800 transition-opacity {r.enabled ? '' : 'opacity-50'}">
          {#if !fixedKeys}
            <label class="flex items-center justify-center w-9 shrink-0 cursor-pointer">
              <input type="checkbox" bind:checked={r.enabled} onchange={onchange} class="w-3.5 h-3.5 accent-brand-600 cursor-pointer" />
            </label>
          {/if}
          <input
            data-kv-key
            class="{cellBase} w-[34%] shrink-0 {fixedKeys ? 'text-neutral-500' : ''}"
            placeholder={keyPlaceholder}
            spellcheck="false"
            readonly={fixedKeys}
            bind:value={r.key}
            oninput={onchange}
          />
          {#if allowFiles}
            <select
              class="w-16 shrink-0 bg-transparent text-[11px] text-neutral-500 outline-none px-1"
              value={r.type ?? 'text'}
              onchange={(e) => {
                r.type = (e.target as HTMLSelectElement).value as 'text' | 'file';
                onchange();
              }}
              aria-label="Field type"
            >
              <option value="text">Text</option>
              <option value="file">File</option>
            </select>
          {/if}
          {#if allowFiles && r.type === 'file'}
            <button
              class="flex-1 min-w-0 flex items-center gap-2 px-2.5 py-1.5 text-left text-[12px] hover:bg-brand-500/[0.04]"
              onclick={() => chooseFile(r)}
              title={r.src || 'Choose file'}
            >
              <svg class="w-3.5 h-3.5 shrink-0 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" /><path d="M14 3v6h6" /></svg>
              {#if r.src}
                <span class="truncate font-mono">{baseName(r.src)}</span>
              {:else}
                <span class="text-neutral-400">Choose file…</span>
              {/if}
            </button>
          {:else}
            <input
              class="{cellBase} flex-1 {unknownVars(r.value) ? 'text-rose-500' : ''}"
              placeholder={valuePlaceholder}
              spellcheck="false"
              bind:value={r.value}
              oninput={onchange}
              onkeydown={(e) => {
                if (!fixedKeys && e.key === 'Tab' && !e.shiftKey && r === rows[rows.length - 1] && (r.key || r.value)) {
                  e.preventDefault();
                  add();
                }
              }}
            />
          {/if}
          {#if !fixedKeys}
            <button
              class="w-8 shrink-0 flex items-center justify-center text-neutral-400 opacity-0 group-hover:opacity-100 hover:text-rose-500 transition"
              title="Remove"
              aria-label="Remove row"
              onclick={() => remove(r.id)}
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          {/if}
        </div>
      {/each}
      {#if !fixedKeys}
        <button
          class="w-full text-left px-3 py-1.5 text-[12px] text-neutral-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition-colors"
          onclick={() => add()}
        >
          + Add row
        </button>
      {/if}
    </div>
  {/if}
</div>
