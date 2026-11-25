<script lang="ts">
  import { getWorkbench, newRequest, type CollectionItem, type WorkbenchRequest } from '$lib/stores/workbench.svelte';
  import { showToast } from '$lib/stores/uiNotifications.svelte';
  import { goto } from '$app/navigation';
  import PageHead from '$lib/components/page/PageHead.svelte';
  import { methodText, methodShort } from '$lib/ui/http';
  import { exportCollectionFile, importFromFiles } from '$lib/ui/transfer';

  const wb = getWorkbench();
  const collections = $derived(wb.collections);

  let filter = $state('');
  let selectedId = $state<string | null>(wb.collections[0]?.id ?? null);
  let modalOpen = $state(false);
  let newName = $state('');
  let newDesc = $state('');
  let renaming = $state(false);

  const visible = $derived(
    filter.trim()
      ? collections.filter((c) => {
          const q = filter.toLowerCase();
          return c.name.toLowerCase().includes(q) || c.requests.some((r) => r.name.toLowerCase().includes(q) || r.url.toLowerCase().includes(q));
        })
      : collections
  );
  const selected = $derived(collections.find((c) => c.id === selectedId) ?? visible[0] ?? null);
  const totalRequests = $derived(collections.reduce((n, c) => n + c.requests.length, 0));

  /** Requests grouped by folder path, in collection order. */
  const groups = $derived.by(() => {
    if (!selected) return [] as { path: string; items: WorkbenchRequest[] }[];
    const q = filter.trim().toLowerCase();
    const map = new Map<string, WorkbenchRequest[]>();
    for (const r of selected.requests) {
      if (q && !selected.name.toLowerCase().includes(q) && !r.name.toLowerCase().includes(q) && !r.url.toLowerCase().includes(q)) continue;
      const k = (r.folder ?? []).join(' / ');
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return [...map.entries()].map(([path, items]) => ({ path, items }));
  });

  const folderCount = (c: CollectionItem) =>
    new Set([...c.requests.map((r) => (r.folder ?? []).join('/')).filter(Boolean), ...Object.keys(c.folders ?? {})]).size;

  function openModal() {
    newName = '';
    newDesc = '';
    modalOpen = true;
  }
  function create() {
    if (!newName.trim()) return showToast('Collection name is required', 'error');
    const col: CollectionItem = { id: crypto.randomUUID(), name: newName.trim(), description: newDesc.trim(), createdAt: Date.now(), requests: [] };
    wb.saveCollection(col);
    selectedId = col.id;
    modalOpen = false;
    showToast(`Collection "${col.name}" created`, 'success');
  }
  function remove(col: CollectionItem) {
    if (!confirm(`Delete collection "${col.name}" and its ${col.requests.length} request(s)? This cannot be undone.`)) return;
    wb.deleteCollection(col.id);
    selectedId = wb.collections[0]?.id ?? null;
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
  async function doImport() {
    const before = new Set(wb.collections.map((c) => c.id));
    await importFromFiles();
    const added = wb.collections.find((c) => !before.has(c.id));
    if (added) selectedId = added.id;
  }
</script>

<div class="cp-page h-full">
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
    <div class="cp-card cp-empty">
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
    <div class="grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] gap-5 flex-1 min-h-[420px]">
      <!-- list -->
      <div class="cp-card flex flex-col min-h-0 overflow-hidden">
        <div class="p-2 border-b border-neutral-200 dark:border-neutral-800">
          <input class="cp-input" placeholder="Search collections & requests" bind:value={filter} />
        </div>
        <div class="flex-1 min-h-0 overflow-y-auto wb-scroll p-1.5 space-y-0.5">
          {#each visible as col (col.id)}
            <button
              class="w-full text-left px-2.5 py-2 rounded-lg transition-colors {selected?.id === col.id ? 'bg-brand-500/10 text-neutral-900 dark:text-white' : 'hover:bg-neutral-100 dark:hover:bg-white/[0.04]'}"
              onclick={() => {
                selectedId = col.id;
                renaming = false;
              }}
            >
              <div class="flex items-center gap-2">
                <svg class="w-4 h-4 shrink-0 {selected?.id === col.id ? 'text-brand-500' : 'text-neutral-400'}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
                <span class="flex-1 truncate text-[12.5px] font-medium">{col.name}</span>
                <span class="text-[11px] font-mono text-neutral-400">{col.requests.length}</span>
              </div>
            </button>
          {:else}
            <p class="px-3 py-6 text-center cp-muted">Nothing matches “{filter}”.</p>
          {/each}
        </div>
      </div>

      <!-- detail -->
      {#if selected}
        <div class="cp-card flex flex-col min-h-0 overflow-hidden">
          <div class="flex items-start justify-between gap-3 px-4 py-3.5 border-b border-neutral-200 dark:border-neutral-800">
            <div class="min-w-0">
              {#if renaming}
                <!-- svelte-ignore a11y_autofocus -->
                <input
                  autofocus
                  class="cp-input !h-7 font-semibold"
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
                <h2 class="text-[14px] font-semibold text-neutral-900 dark:text-white truncate">{selected.name}</h2>
              {/if}
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 cp-muted">
                <span>{selected.requests.length} requests</span>
                <span>{folderCount(selected)} folders</span>
                <span>{selected.variables?.length ?? 0} variables</span>
                {#if selected.auth && selected.auth.type !== 'none' && selected.auth.type !== 'inherit'}<span>Auth: {selected.auth.type}</span>{/if}
                <span>Created {new Date(selected.createdAt).toLocaleDateString()}</span>
              </div>
              {#if selected.description}
                <p class="mt-1.5 text-[12px] text-neutral-600 dark:text-neutral-400 line-clamp-2">{selected.description}</p>
              {/if}
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button class="cp-btn cp-btn-sm" onclick={() => addRequest(selected)}>+ Request</button>
              <button class="cp-btn cp-btn-sm" onclick={() => exportCollectionFile(selected.id)} title="Save as Postman Collection v2.1 (.json)">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M12 15V3m0 0l-4 4m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></svg>
                Export
              </button>
              <button class="cp-icon-btn" title="Rename" aria-label="Rename collection" onclick={() => (renaming = true)}>
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M4 20h4L19 9l-4-4L4 16v4z" /></svg>
              </button>
              <button class="cp-icon-btn hover:!text-rose-500" title="Delete" aria-label="Delete collection" onclick={() => remove(selected)}>
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" /></svg>
              </button>
            </div>
          </div>

          <div class="flex-1 min-h-0 overflow-y-auto wb-scroll">
            {#if groups.length === 0}
              <div class="cp-empty">
                <p class="cp-muted">{selected.requests.length ? 'No requests match the search.' : 'This collection has no requests yet.'}</p>
                {#if !selected.requests.length}<button class="cp-btn cp-btn-sm mt-1" onclick={() => addRequest(selected)}>Add a request</button>{/if}
              </div>
            {/if}
            {#each groups as g (g.path)}
              {#if g.path}
                <div class="sticky top-0 z-[1] flex items-center gap-1.5 px-4 h-8 bg-neutral-50 dark:bg-[#1d1d1d] border-b border-neutral-100 dark:border-neutral-800/70 text-[11.5px] font-medium text-neutral-500 dark:text-neutral-400">
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
                  {g.path}
                </div>
              {/if}
              {#each g.items as r (r.id)}
                <button class="cp-row w-full text-left group" onclick={() => openRequest(r, selected)} title="Open in workbench">
                  <span class="w-12 shrink-0 font-mono text-[11px] font-bold {methodText(r.method)}">{methodShort(r.method)}</span>
                  <span class="w-56 shrink-0 truncate text-[12.5px] text-neutral-800 dark:text-neutral-200">{r.name}</span>
                  <span class="flex-1 min-w-0 truncate font-mono text-[11.5px] text-neutral-400">{r.url}</span>
                  <svg class="w-3.5 h-3.5 shrink-0 text-neutral-300 group-hover:text-brand-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7" /></svg>
                </button>
              {/each}
            {/each}
          </div>
        </div>
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
