<script lang="ts">
  import { getWorkbench, type CollectionItem, type WorkbenchRequest } from '$lib/stores/workbench.svelte';
  import { showToast } from '$lib/stores/uiNotifications.svelte';
  import { goto } from '$app/navigation';

  const wb = getWorkbench();
  let collections = $state(wb.collections);
  let isModalOpen = $state(false);
  let newColName = $state('');
  let newColDesc = $state('');
  let expandedColId = $state<string | null>(null);
  let activeCollectionId = $state<string | null>(null);

  function openNewCollectionModal() {
    newColName = '';
    newColDesc = '';
    isModalOpen = true;
  }

  function createCollection() {
    if (!newColName.trim()) {
      showToast('Collection name is required', 'error');
      return;
    }

    const newCollection: CollectionItem = {
      id: crypto.randomUUID(),
      name: newColName.trim(),
      description: newColDesc.trim() || 'New collection',
      createdAt: Date.now(),
      requests: []
    };
    wb.saveCollection(newCollection);
    collections = wb.collections;
    isModalOpen = false;
    activeCollectionId = newCollection.id;
    expandedColId = newCollection.id;
    showToast(`Collection "${newCollection.name}" created`, 'success');
  }

  function toggleCollection(id: string) {
    expandedColId = expandedColId === id ? null : id;
    activeCollectionId = id;
  }

  function loadRequest(req: WorkbenchRequest) {
    wb.loadRequest(req);
    goto('/');
  }

  function deleteCollection(id: string) {
    wb.deleteCollection(id);
    collections = wb.collections;
    if (activeCollectionId === id) activeCollectionId = null;
    if (expandedColId === id) expandedColId = null;
  }

  function addRequestToActiveCollection() {
    if (!activeCollectionId) {
      showToast('Select a collection first to add the current request', 'error');
      return;
    }
    const reqCopy = JSON.parse(JSON.stringify(wb.currentRequest)) as WorkbenchRequest;
    reqCopy.id = crypto.randomUUID();
    reqCopy.name = reqCopy.name || 'New Request';
    wb.addRequestToCollection(activeCollectionId, reqCopy);
    collections = wb.collections;
    showToast('Request saved to collection', 'success');
  }

  function formatDate(ts: number) {
    return new Date(ts).toLocaleDateString();
  }
</script>

<div class="flex flex-col h-full max-w-5xl mx-auto p-6 space-y-5">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-lg font-bold text-neutral-900 dark:text-white">Collections</h1>
      <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
        {collections.length} collections · {collections.reduce((acc, c) => acc + c.requests.length, 0)} total requests
      </p>
    </div>
    <div class="flex items-center gap-2">
      <button
        onclick={openNewCollectionModal}
        class="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 rounded-lg text-xs font-semibold text-white shadow-sm flex items-center gap-1.5 transition-colors"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
        </svg>
        <span>New Collection</span>
      </button>
    </div>
  </div>

  <!-- Collections List -->
  <div class="space-y-3">
    {#if collections.length === 0}
      <div class="text-center py-12">
        <svg class="w-12 h-12 mx-auto text-neutral-300 dark:text-neutral-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <p class="text-sm text-neutral-400 dark:text-neutral-500">No collections yet. Create one to organize your API requests.</p>
      </div>
    {:else}
      {#each collections as col (col.id)}
        <div
          class="bg-white dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden transition-colors {expandedColId === col.id ? 'ring-2 ring-indigo-500/20' : ''}"
        >
          <!-- Collection Row -->
          <div
            class="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors"
            role="button"
            tabindex="0"
            onclick={() => toggleCollection(col.id)}
            onkeydown={(e) => e.key === 'Enter' && toggleCollection(col.id)}
          >
            <div class="flex items-center gap-3 min-w-0">
              <svg class="w-5 h-5 text-neutral-400 dark:text-neutral-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <div class="min-w-0">
                <h3 class="text-sm font-semibold text-neutral-900 dark:text-white truncate">{col.name}</h3>
                <p class="text-xs text-neutral-500 dark:text-neutral-400 truncate mt-0.5">{col.description}</p>
              </div>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <span class="text-[11px] font-mono text-neutral-400 dark:text-neutral-500">{col.requests.length} req</span>
              <span class="text-[11px] text-neutral-400 dark:text-neutral-500">{formatDate(col.createdAt)}</span>
              <button
                onclick={(e) => {
                  e.stopPropagation();
                  deleteCollection(col.id);
                }}
                class="p-1 text-neutral-300 dark:text-neutral-600 hover:text-rose-500 transition-colors"
                title="Delete collection"
                aria-label={`Delete ${col.name}`}
              >
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              <svg
                class="w-4 h-4 text-neutral-400 transition-transform {expandedColId === col.id ? 'rotate-90' : ''}"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>

          <!-- Expanded Requests -->
          {#if expandedColId === col.id}
            <div class="border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/30 p-3">
              <div class="flex items-center justify-between mb-2">
                <span class="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                  Requests in this collection
                </span>
                <button
                  onclick={() => addRequestToActiveCollection()}
                  class="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5"
                >
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Add current request</span>
                </button>
              </div>

              {#if col.requests.length === 0}
                <p class="text-xs text-neutral-400 dark:text-neutral-500 italic py-3 text-center">No requests in this collection yet.</p>
              {:else}
                <div class="space-y-1">
                  {#each col.requests as req (req.id)}
                    <button
                      onclick={() => loadRequest(req)}
                      class="w-full flex items-center justify-between px-3 py-2 bg-white dark:bg-neutral-900/80 border border-neutral-200 dark:border-neutral-800 rounded-lg text-left hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors group"
                    >
                      <div class="flex items-center gap-2.5 min-w-0">
                        <span
                          class="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded {req.method === 'GET'
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : req.method === 'POST'
                            ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                            : req.method === 'DELETE'
                            ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                            : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'}"
                        >
                          {req.method}
                        </span>
                        <span class="text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate max-w-[200px]">{req.name || req.url}</span>
                      </div>
                      <span class="text-[11px] font-mono text-neutral-400 dark:text-neutral-500 truncate ml-3 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors shrink-0 max-w-[200px]">{req.url}</span>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  <!-- New Collection Modal -->
  {#if isModalOpen}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div class="w-full max-w-sm bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-2xl space-y-3.5 text-xs text-neutral-800 dark:text-neutral-200">
        <div class="flex items-center justify-between pb-2 border-b border-neutral-200 dark:border-neutral-800">
          <h3 class="text-sm font-bold text-neutral-900 dark:text-white">New Collection</h3>
          <button onclick={() => (isModalOpen = false)} class="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-white" aria-label="Close">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="space-y-2.5">
          <div>
            <label class="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 mb-1">Collection Name *</label>
            <input
              type="text"
              bind:value={newColName}
              placeholder="e.g. Internal APIs, Payment Endpoints"
              class="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label class="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 mb-1">Description (Optional)</label>
            <input
              type="text"
              bind:value={newColDesc}
              placeholder="Short description"
              class="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
          <button onclick={() => (isModalOpen = false)} class="px-3 py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-800 dark:hover:text-white rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onclick={createCollection}
            class="px-3.5 py-1.5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 rounded-lg shadow-sm transition-colors"
          >
            Create Collection
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
