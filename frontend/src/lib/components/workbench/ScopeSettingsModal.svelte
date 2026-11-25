<script lang="ts">
  // Settings for a collection, a folder, or the global variables.
  import { getWorkbench, emptyAuth, type CollectionItem, type FolderMeta, type ParamRow } from '$lib/stores/workbench.svelte';
  import KeyValueEditor from './KeyValueEditor.svelte';
  import AuthEditor from './AuthEditor.svelte';
  import ScriptEditor from './ScriptEditor.svelte';

  let {
    target,
    onclose
  }: {
    target: { kind: 'collection'; col: CollectionItem } | { kind: 'folder'; col: CollectionItem; path: string[] } | { kind: 'globals' };
    onclose: () => void;
  } = $props();

  const wb = getWorkbench();

  type Pane = 'variables' | 'auth' | 'scripts' | 'docs';
  let pane = $state<Pane>(target.kind === 'folder' ? 'auth' : 'variables');

  // resolve the object being edited (folders get their meta created on demand)
  function folderMeta(): FolderMeta {
    if (target.kind !== 'folder') throw new Error('not a folder');
    const key = target.path.join('/');
    target.col.folders ??= {};
    target.col.folders[key] ??= {};
    return target.col.folders[key];
  }
  const scope: (CollectionItem | FolderMeta) | null =
    target.kind === 'collection' ? target.col : target.kind === 'folder' ? folderMeta() : null;
  if (scope && !scope.auth) scope.auth = emptyAuth(target.kind === 'folder' ? 'inherit' : 'none');
  if (target.kind === 'collection') target.col.variables ??= [];

  function changed() {
    if (target.kind === 'globals') wb.saveGlobals();
    else wb.touchCollections();
  }

  const title =
    target.kind === 'collection' ? target.col.name : target.kind === 'folder' ? target.path[target.path.length - 1] : 'Global variables';
  const subtitle = target.kind === 'collection' ? 'Collection settings' : target.kind === 'folder' ? 'Folder settings' : 'Available in every collection and environment';

  const panes: [Pane, string][] =
    target.kind === 'globals'
      ? [['variables', 'Variables']]
      : target.kind === 'collection'
        ? [['variables', 'Variables'], ['auth', 'Authorization'], ['scripts', 'Scripts'], ['docs', 'Description']]
        : [['auth', 'Authorization'], ['scripts', 'Scripts'], ['docs', 'Description']];

  const varRows = (): ParamRow[] =>
    (target.kind === 'globals' ? wb.globals : target.kind === 'collection' ? target.col.variables! : []) as ParamRow[];
</script>

<div class="wb-overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()} onkeydown={(e) => e.key === 'Escape' && onclose()}>
  <div class="wb-modal w-[min(860px,94vw)] h-[min(640px,88vh)] flex flex-col">
    <div class="flex items-center justify-between px-5 py-3 border-b border-neutral-200 dark:border-neutral-800">
      <div class="min-w-0">
        <h3 class="text-[14px] font-semibold truncate">{title}</h3>
        <p class="text-[11.5px] text-neutral-500">{subtitle}</p>
      </div>
      <button class="wb-btn" onclick={onclose}>Done</button>
    </div>
    {#if panes.length > 1}
      <div class="wb-tabs !px-4">
        {#each panes as [k, label] (k)}
          <button class="wb-tab {pane === k ? 'is-active' : ''}" onclick={() => (pane = k)}>{label}</button>
        {/each}
      </div>
    {/if}
    <div class="flex-1 min-h-0 overflow-y-auto p-5 wb-scroll select-text">
      {#if pane === 'variables'}
        <p class="text-[12px] text-neutral-500 mb-3">
          {#if target.kind === 'globals'}
            Lowest precedence: overridden by collection, environment and local variables.
          {:else}
            Used by every request in this collection. Environment variables with the same name take precedence. Scripts can change them with <code class="font-mono">pm.collectionVariables.set()</code>.
          {/if}
        </p>
        <KeyValueEditor rows={varRows()} onchange={changed} keyPlaceholder="Variable" valuePlaceholder="Value" />
      {:else if pane === 'auth' && scope}
        <AuthEditor
          auth={scope.auth!}
          onchange={changed}
          allowInherit={target.kind === 'folder'}
          inheritedFrom={target.kind === 'folder' ? 'parent folder or collection' : ''}
        />
      {:else if pane === 'scripts' && scope}
        <div class="h-[420px]">
          <ScriptEditor
            pre={scope.preRequestScript ?? ''}
            post={scope.testScript ?? ''}
            onPre={(v) => {
              scope.preRequestScript = v;
              changed();
            }}
            onPost={(v) => {
              scope.testScript = v;
              changed();
            }}
          />
        </div>
        <p class="mt-2 text-[11.5px] text-neutral-500">Runs for every request inside, in order: collection → folders → request.</p>
      {:else if pane === 'docs' && scope}
        <textarea
          class="w-full h-64 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent p-3 text-[12.5px] outline-none focus:border-brand-500/50"
          value={target.kind === 'collection' ? target.col.description : (scope as FolderMeta).description ?? ''}
          oninput={(e) => {
            const v = (e.target as HTMLTextAreaElement).value;
            if (target.kind === 'collection') target.col.description = v;
            else (scope as FolderMeta).description = v;
            changed();
          }}
          placeholder="Describe what this is for…"
        ></textarea>
      {/if}
    </div>
  </div>
</div>
