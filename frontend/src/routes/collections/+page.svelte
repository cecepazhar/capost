<script lang="ts">
  import { getWorkbench, newRequest, type CollectionItem, type WorkbenchRequest, type ParamRow } from '$lib/stores/workbench.svelte';
  import { showToast } from '$lib/stores/uiNotifications.svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import PageHead from '$lib/components/page/PageHead.svelte';
  import { methodText, methodShort } from '$lib/ui/http';
  import { exportCollectionFile, importFromFiles } from '$lib/ui/transfer';

  const wb = getWorkbench();
  const collections = $derived(wb.collections);

  let filter = $state('');
  let selectedId = $state<string | null>(page.url.searchParams.get('id') ?? wb.collections[0]?.id ?? null);
  let selectedReqId = $state<string | null>(null);
  let detailTab = $state<'params' | 'headers' | 'body' | 'auth' | 'scripts' | 'docs'>('params');
  let modalOpen = $state(false);
  let newName = $state('');
  let newDesc = $state('');
  let renaming = $state(false);

  const q = $derived(filter.trim().toLowerCase());
  const matches = (r: WorkbenchRequest) => !q || r.name.toLowerCase().includes(q) || r.url.toLowerCase().includes(q);
  const visible = $derived(q ? collections.filter((c) => c.name.toLowerCase().includes(q) || c.requests.some(matches)) : collections);
  const selected = $derived(collections.find((c) => c.id === selectedId) ?? visible[0] ?? null);
  const selectedReq = $derived(selected?.requests.find((r) => r.id === selectedReqId) ?? null);
  const totalRequests = $derived(collections.reduce((n, c) => n + c.requests.length, 0));

  /** Requests grouped by folder path, in collection order. */
  const groups = $derived.by(() => {
    if (!selected) return [] as { path: string; items: WorkbenchRequest[] }[];
    const showAll = selected.name.toLowerCase().includes(q);
    const map = new Map<string, WorkbenchRequest[]>();
    for (const r of selected.requests) {
      if (!showAll && !matches(r)) continue;
      const k = (r.folder ?? []).join(' / ');
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return [...map.entries()].map(([path, items]) => ({ path, items }));
  });

  const folderCount = (c: CollectionItem) =>
    new Set([...c.requests.map((r) => (r.folder ?? []).join('/')).filter(Boolean), ...Object.keys(c.folders ?? {})]).size;
  const enabledRows = (rows: ParamRow[] | undefined) => (rows ?? []).filter((r) => r.key);

  function selectCollection(id: string) {
    selectedId = id;
    selectedReqId = null;
    renaming = false;
  }
  function openModal() {
    newName = '';
    newDesc = '';
    modalOpen = true;
  }
  function create() {
    if (!newName.trim()) return showToast('Collection name is required', 'error');
    const col: CollectionItem = { id: crypto.randomUUID(), name: newName.trim(), description: newDesc.trim(), createdAt: Date.now(), requests: [] };
    wb.saveCollection(col);
    selectCollection(col.id);
    modalOpen = false;
    showToast(`Collection "${col.name}" created`, 'success');
  }
  function remove(col: CollectionItem) {
    if (!confirm(`Delete collection "${col.name}" and its ${col.requests.length} request(s)? This cannot be undone.`)) return;
    wb.deleteCollection(col.id);
    selectCollection(wb.collections[0]?.id ?? '');
    showToast('Collection deleted', 'info');
  }
  function openRequest(r: WorkbenchRequest, col: CollectionItem) {
    wb.newTab(r, { id: r.id, collectionId: col.id }, { preview: false });
    goto('/requests');
  }
  function addRequest(col: CollectionItem) {
    const r = wb.addRequestToCollection(col.id, newRequest({ name: 'New Request' }));
    if (r) openRequest(r, col);
  }
  function deleteRequest(col: CollectionItem, r: WorkbenchRequest) {
    if (!confirm(`Delete request "${r.name}"?`)) return;
    wb.deleteRequestFromCollection(col.id, r.id);
    if (selectedReqId === r.id) selectedReqId = null;
  }
  async function doImport() {
    const before = new Set(wb.collections.map((c) => c.id));
    await importFromFiles();
    const added = wb.collections.find((c) => !before.has(c.id));
    if (added) selectCollection(added.id);
  }
  const authSummary = (a: WorkbenchRequest['auth'] | undefined) =>
    !a || a.type === 'inherit' ? 'Inherit from parent' : a.type === 'none' ? 'No auth' : a.type.toUpperCase();
</script>

{#snippet rowsTable(rows: ParamRow[], empty: string)}
  {#if rows.length === 0}
    <p class="cp-muted">{empty}</p>
  {:else}
    <table class="cp-table">
      <thead><tr><th class="w-[38%]">Key</th><th>Value</th></tr></thead>
      <tbody>
        {#each rows as r (r.id)}
          <tr class={r.enabled ? '' : 'opacity-45'}>
            <td class="font-mono text-[12px]">{r.key}</td>
            <td class="font-mono text-[12px] break-all">{r.type === 'file' ? `📎 ${r.src ?? ''}` : r.value}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
{/snippet}

<div class="cp-view">
  <PageHead title="Collections" subtitle={`${collections.length} collections · ${totalRequests} requests`}>
    {#snippet actions()}
      <button class="cp-btn" onclick={doImport} title="Import Postman v2/v2.1, Insomnia, Bruno or CAPost files">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></svg>
        Import
      </button>
      <button class="cp-btn cp-btn-primary" onclick={openModal}>
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14" /></svg>
        New collection
      </button>
    {/snippet}
  </PageHead>

  {#if collections.length === 0}
    <div class="cp-empty flex-1">
      <div class="cp-empty-icon">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
      </div>
      <p class="text-[13px] font-medium text-neutral-800 dark:text-neutral-200">No collections yet</p>
      <p class="cp-muted max-w-sm">Import a Postman collection (v2 / v2.1), an Insomnia export or a Bruno file, or start an empty collection.</p>
      <div class="flex gap-2 mt-2">
        <button class="cp-btn" onclick={doImport}>Import file</button>
        <button class="cp-btn cp-btn-primary" onclick={openModal}>New collection</button>
      </div>
    </div>
  {:else}
    <div class="cp-body">
      <!-- 1 · collections -->
      <aside class="cp-side cp-pane w-64">
        <div class="p-2">
          <input class="cp-input !h-7" placeholder="Search collections & requests" bind:value={filter} />
        </div>
        <div class="cp-scroll px-1.5 pb-2 space-y-0.5">
          {#each visible as col (col.id)}
            <button class="cp-list-item {selected?.id === col.id ? 'is-active' : ''}" onclick={() => selectCollection(col.id)}>
              <svg class="w-4 h-4 shrink-0 {selected?.id === col.id ? 'text-brand-500' : 'text-neutral-400'}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
              <span class="flex-1 truncate font-medium">{col.name}</span>
              <span class="text-[11px] font-mono text-neutral-400">{col.requests.length}</span>
            </button>
          {:else}
            <p class="px-3 py-6 text-center cp-muted">Nothing matches “{filter}”.</p>
          {/each}
        </div>
      </aside>

      {#if selected}
        <!-- 2 · requests of the collection -->
        <section class="cp-pane w-[360px] shrink-0 border-r border-neutral-200 dark:border-neutral-800">
          <div class="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
            <div class="flex items-center gap-1">
              {#if renaming}
                <!-- svelte-ignore a11y_autofocus -->
                <input
                  autofocus
                  class="cp-input !h-7 font-semibold flex-1"
                  value={selected.name}
                  onblur={(e) => {
                    wb.renameCollection(selected.id, (e.target as HTMLInputElement).value.trim() || selected.name);
                    renaming = false;
                  }}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') renaming = false;
                  }}
                />
              {:else}
                <button class="flex-1 min-w-0 text-left" onclick={() => (selectedReqId = null)} title="Collection overview">
                  <h2 class="text-[13.5px] font-semibold text-neutral-900 dark:text-white truncate">{selected.name}</h2>
                </button>
              {/if}
              <button class="cp-icon-btn" title="Rename" aria-label="Rename collection" onclick={() => (renaming = true)}>
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M4 20h4L19 9l-4-4L4 16v4z" /></svg>
              </button>
              <button class="cp-icon-btn hover:!text-rose-500" title="Delete collection" aria-label="Delete collection" onclick={() => remove(selected)}>
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" /></svg>
              </button>
            </div>
            <div class="flex items-center gap-1.5 mt-2">
              <button class="cp-btn cp-btn-sm flex-1" onclick={() => addRequest(selected)}>+ Request</button>
              <button class="cp-btn cp-btn-sm flex-1" onclick={() => exportCollectionFile(selected.id)} title="Save as Postman Collection v2.1 (.json)">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M12 15V3m0 0l-4 4m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></svg>
                Export
              </button>
            </div>
          </div>
          <div class="cp-scroll py-1.5">
            {#if groups.length === 0}
              <div class="cp-empty">
                <p class="cp-muted">{selected.requests.length ? 'No requests match the search.' : 'No requests yet.'}</p>
              </div>
            {/if}
            {#each groups as g (g.path)}
              {#if g.path}
                <div class="flex items-center gap-1.5 px-4 pt-2.5 pb-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                  <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
                  <span class="truncate">{g.path}</span>
                </div>
              {/if}
              <div class="px-1.5">
                {#each g.items as r (r.id)}
                  <div class="group relative">
                    <button
                      class="cp-list-item !h-9 {selectedReqId === r.id ? 'is-active' : ''} {g.path ? 'pl-5' : ''}"
                      onclick={() => (selectedReqId = r.id)}
                      ondblclick={() => openRequest(r, selected)}
                      title="Double-click to open in the workbench"
                    >
                      <span class="w-10 shrink-0 font-mono text-[10.5px] font-bold {methodText(r.method)}">{methodShort(r.method)}</span>
                      <span class="flex-1 min-w-0 truncate">{r.name}</span>
                    </button>
                    <button class="cp-icon-btn !h-6 !w-6 absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 hover:!text-rose-500" aria-label="Delete request" onclick={() => deleteRequest(selected, r)}>
                      <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                {/each}
              </div>
            {/each}
          </div>
        </section>

        <!-- 3 · detail -->
        <section class="cp-pane flex-1">
          {#if selectedReq}
            {@const r = selectedReq}
            <div class="px-5 py-3 border-b border-neutral-200 dark:border-neutral-800">
              <div class="flex items-center gap-2">
                <span class="font-mono text-[12px] font-bold {methodText(r.method)}">{r.method}</span>
                <h3 class="flex-1 min-w-0 truncate text-[14px] font-semibold text-neutral-900 dark:text-white">{r.name}</h3>
                <button class="cp-btn cp-btn-primary cp-btn-sm" onclick={() => openRequest(r, selected)}>Open in workbench →</button>
              </div>
              <div class="mt-2 px-2.5 py-1.5 rounded-md bg-neutral-100 dark:bg-white/[0.04] font-mono text-[12px] text-neutral-700 dark:text-neutral-300 break-all">{r.url || '(no URL)'}</div>
              {#if r.folder?.length}<p class="mt-1.5 cp-muted">In {r.folder.join(' / ')}</p>{/if}
            </div>
            <div class="wb-tabs !px-3">
              {#each [['params', `Params (${enabledRows(r.params).length})`], ['headers', `Headers (${enabledRows(r.headers).length})`], ['body', `Body · ${r.body.type}`], ['auth', 'Auth'], ['scripts', 'Scripts'], ['docs', 'Docs']] as [k, label] (k)}
                <button class="wb-tab {detailTab === k ? 'is-active' : ''}" onclick={() => (detailTab = k as typeof detailTab)}>{label}</button>
              {/each}
            </div>
            <div class="cp-scroll p-5">
              {#if detailTab === 'params'}
                {@render rowsTable(enabledRows(r.params), 'No query parameters.')}
                {#if r.pathVars?.length}
                  <h4 class="cp-eyebrow mt-5 mb-2">Path variables</h4>
                  <dl class="cp-kv">
                    {#each r.pathVars as v (v.key)}<dt>:{v.key}</dt><dd>{v.value || '—'}</dd>{/each}
                  </dl>
                {/if}
              {:else if detailTab === 'headers'}
                {@render rowsTable(enabledRows(r.headers), 'No headers.')}
              {:else if detailTab === 'body'}
                {#if r.body.type === 'none'}
                  <p class="cp-muted">This request has no body.</p>
                {:else if r.body.type === 'json'}
                  <pre class="text-[12px] font-mono whitespace-pre-wrap break-all text-neutral-700 dark:text-neutral-300">{r.body.rawJson}</pre>
                {:else if r.body.type === 'form-data'}
                  {@render rowsTable(enabledRows(r.body.formData), 'No form fields.')}
                {:else if r.body.type === 'urlencoded'}
                  {@render rowsTable(enabledRows(r.body.urlencoded), 'No fields.')}
                {:else if r.body.type === 'binary'}
                  <p class="font-mono text-[12px]">{r.body.binaryPath || 'No file chosen'}</p>
                {:else}
                  <pre class="text-[12px] font-mono whitespace-pre-wrap break-all text-neutral-700 dark:text-neutral-300">{r.body.rawText}</pre>
                {/if}
              {:else if detailTab === 'auth'}
                <p class="text-[12.5px]">{authSummary(r.auth)}</p>
                {#if r.auth?.type === 'inherit'}
                  <p class="cp-muted mt-1">Uses the folder or collection auth ({authSummary(selected.auth)}).</p>
                {/if}
              {:else if detailTab === 'scripts'}
                <h4 class="cp-eyebrow mb-2">Pre-request</h4>
                {#if r.preRequestScript?.trim()}<pre class="text-[12px] font-mono whitespace-pre-wrap p-3 rounded-md bg-neutral-100 dark:bg-white/[0.04]">{r.preRequestScript}</pre>{:else}<p class="cp-muted">None</p>{/if}
                <h4 class="cp-eyebrow mt-5 mb-2">Post-response (tests)</h4>
                {#if r.testScript?.trim()}<pre class="text-[12px] font-mono whitespace-pre-wrap p-3 rounded-md bg-neutral-100 dark:bg-white/[0.04]">{r.testScript}</pre>{:else}<p class="cp-muted">None</p>{/if}
              {:else}
                {#if r.description?.trim()}<p class="text-[12.5px] whitespace-pre-wrap leading-relaxed">{r.description}</p>{:else}<p class="cp-muted">No description.</p>{/if}
              {/if}
            </div>
          {:else}
            <!-- collection overview -->
            <div class="cp-scroll p-5 space-y-6">
              <div>
                <h3 class="text-[15px] font-semibold text-neutral-900 dark:text-white">{selected.name}</h3>
                <p class="cp-muted mt-1">{selected.description || 'No description.'}</p>
              </div>
              <div class="grid grid-cols-2 xl:grid-cols-4 gap-px rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-neutral-200 dark:bg-neutral-800">
                {#each [['Requests', selected.requests.length], ['Folders', folderCount(selected)], ['Variables', selected.variables?.length ?? 0], ['Created', new Date(selected.createdAt).toLocaleDateString()]] as [k, v] (k)}
                  <div class="bg-white dark:bg-[#161616] px-4 py-3">
                    <div class="cp-eyebrow">{k}</div>
                    <div class="mt-1 text-[16px] font-semibold tabular-nums">{v}</div>
                  </div>
                {/each}
              </div>
              <div>
                <h4 class="cp-eyebrow mb-2">Auth</h4>
                <p class="text-[12.5px]">{authSummary(selected.auth)}</p>
              </div>
              <div>
                <h4 class="cp-eyebrow mb-2">Collection variables</h4>
                {#if selected.variables?.length}
                  <dl class="cp-kv">
                    {#each selected.variables as v (v.id)}<dt class={v.enabled ? '' : 'line-through'}>{v.key}</dt><dd>{v.value || '—'}</dd>{/each}
                  </dl>
                {:else}
                  <p class="cp-muted">None. Add them in the workbench via the collection's settings.</p>
                {/if}
              </div>
              <p class="cp-muted">Select a request to preview it, double-click to open it in the workbench.</p>
            </div>
          {/if}
        </section>
      {/if}
    </div>
  {/if}
</div>

{#if modalOpen}
  <div class="wb-overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && (modalOpen = false)}>
    <div class="wb-modal w-full max-w-sm" role="dialog" aria-modal="true" aria-labelledby="new-col-title">
      <div class="cp-card-head">
        <h3 id="new-col-title" class="cp-card-title">New collection</h3>
        <button class="cp-icon-btn" aria-label="Close" onclick={() => (modalOpen = false)}>
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <form
        class="cp-card-body space-y-3"
        onsubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <div>
          <label class="cp-label" for="col-name">Name</label>
          <!-- svelte-ignore a11y_autofocus -->
          <input id="col-name" class="cp-input" autofocus bind:value={newName} placeholder="e.g. Payment API" />
        </div>
        <div>
          <label class="cp-label" for="col-desc">Description <span class="text-neutral-400 font-normal">(optional)</span></label>
          <input id="col-desc" class="cp-input" bind:value={newDesc} placeholder="Short description" />
        </div>
        <div class="flex justify-end gap-2 pt-1">
          <button type="button" class="cp-btn cp-btn-ghost" onclick={() => (modalOpen = false)}>Cancel</button>
          <button type="submit" class="cp-btn cp-btn-primary">Create</button>
        </div>
      </form>
    </div>
  </div>
{/if}
