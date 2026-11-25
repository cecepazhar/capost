<script lang="ts">
  import {
    getWorkbench,
    METHODS,
    buildRequest,
    toCurl,
    parseCurl,
    splitUrlParams,
    syncPathVars,
    newRequest,
    uid,
    type HttpMethod,
    type BodyType,
    type CollectionItem,
    type WorkbenchRequest,
    type HistoryEntry
  } from '$lib/stores/workbench.svelte';
  import { copyText } from '$lib/utils/clipboard';
  import { showToast } from '$lib/stores/uiNotifications.svelte';
  import { goto } from '$app/navigation';
  import { tick } from 'svelte';
  import CodeEditor from './workbench/CodeEditor.svelte';
  import KeyValueEditor from './workbench/KeyValueEditor.svelte';
  import AuthEditor from './workbench/AuthEditor.svelte';
  import ScriptEditor from './workbench/ScriptEditor.svelte';
  import ScopeSettingsModal from './workbench/ScopeSettingsModal.svelte';
  import { pickFile, baseName } from './workbench/pickFile';
  import { exportCollectionFile, exportEnvironmentFile } from '$lib/ui/transfer';
  import { renderVisualizer } from '$lib/scripting/visualizer';

  const wb = getWorkbench();

  const tab = $derived(wb.activeTab);
  const req = $derived(tab.request);
  const resp = $derived(tab.response);
  const report = $derived(tab.report);
  const colId = $derived(tab.sourceCollectionId);
  const vars = $derived(wb.variables(colId));
  const authSource = $derived(wb.effectiveAuth(tab));

  // ---------- layout prefs ----------
  function pref<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem('capost_wb_' + k);
      return v == null ? d : (JSON.parse(v) as T);
    } catch {
      return d;
    }
  }
  function savePref(k: string, v: unknown) {
    try {
      localStorage.setItem('capost_wb_' + k, JSON.stringify(v));
    } catch {}
  }
  let sidebarW = $state(pref('sidebarW', 272));
  let sidebarOpen = $state(pref('sidebarOpen', true));
  let split = $state(pref('split', 0.5));
  let vertical = $state(pref('vertical', false));
  let sideTab = $state<'collections' | 'history'>('collections');
  let filter = $state('');
  let reqPane = $state<'params' | 'headers' | 'auth' | 'body' | 'scripts'>('params');
  let respPane = $state<'body' | 'headers' | 'tests' | 'console' | 'visualize' | 'request'>('body');
  let respRaw = $state(false);
  let respWrap = $state(pref('wrap', false));

  let splitHost: HTMLDivElement;
  let urlInput: HTMLInputElement;
  let tabStrip: HTMLDivElement;
  let urlScroll = $state(0);

  function drag(e: PointerEvent, move: (ev: PointerEvent) => void, done: () => void) {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      done();
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  }
  function dragSplit(e: PointerEvent) {
    const rect = splitHost.getBoundingClientRect();
    drag(
      e,
      (ev) => {
        const r = vertical ? (ev.clientY - rect.top) / rect.height : (ev.clientX - rect.left) / rect.width;
        split = Math.min(0.8, Math.max(0.2, r));
      },
      () => savePref('split', split)
    );
  }
  function dragSidebar(e: PointerEvent) {
    const startX = e.clientX;
    const startW = sidebarW;
    drag(
      e,
      (ev) => (sidebarW = Math.min(480, Math.max(200, startW + ev.clientX - startX))),
      () => savePref('sidebarW', sidebarW)
    );
  }

  // ---------- helpers ----------
  const METHOD_TEXT: Record<HttpMethod, string> = {
    GET: 'text-emerald-600 dark:text-emerald-400',
    POST: 'text-amber-600 dark:text-amber-400',
    PUT: 'text-sky-600 dark:text-sky-400',
    PATCH: 'text-violet-600 dark:text-violet-400',
    DELETE: 'text-rose-600 dark:text-rose-400',
    HEAD: 'text-teal-600 dark:text-teal-400',
    OPTIONS: 'text-neutral-500 dark:text-neutral-400'
  };
  const METHOD_SHORT: Record<HttpMethod, string> = { GET: 'GET', POST: 'POST', PUT: 'PUT', PATCH: 'PATCH', DELETE: 'DEL', HEAD: 'HEAD', OPTIONS: 'OPT' };

  function changed() {
    wb.markDirty(tab);
  }

  function statusTone(s: number) {
    if (s === 0 || s >= 500) return 'bg-rose-500/12 text-rose-600 dark:text-rose-400';
    if (s >= 400) return 'bg-amber-500/12 text-amber-600 dark:text-amber-400';
    if (s >= 300) return 'bg-sky-500/12 text-sky-600 dark:text-sky-400';
    return 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400';
  }
  function fmtSize(b: number) {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(2)} MB`;
  }
  function fmtTime(ms: number) {
    return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
  }
  function ago(ts: number) {
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.round(s / 60)}m`;
    if (s < 86400) return `${Math.round(s / 3600)}h`;
    return `${Math.round(s / 86400)}d`;
  }
  function authFromLabel(from: string): string {
    if (from === 'collection') return 'collection';
    if (from.startsWith('folder:')) return `folder “${from.slice(7).split('/').pop()}”`;
    if (from === 'none') return 'nothing (No Auth)';
    return from;
  }

  // URL highlighting segments
  const urlSegments = $derived.by(() => {
    const out: { text: string; kind: 'plain' | 'ok' | 'bad' | 'path' }[] = [];
    const s = req.url;
    const re = /\{\{([^{}]+?)\}\}|\/:([A-Za-z_][\w-]*)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      if (m.index > last) out.push({ text: s.slice(last, m.index), kind: 'plain' });
      if (m[1] !== undefined) {
        const n = m[1].trim();
        out.push({ text: m[0], kind: vars.has(n) || n.startsWith('$') ? 'ok' : 'bad' });
      } else {
        out.push({ text: '/', kind: 'plain' });
        out.push({ text: m[0].slice(1), kind: 'path' });
      }
      last = m.index + m[0].length;
    }
    if (last < s.length) out.push({ text: s.slice(last), kind: 'plain' });
    return out;
  });
  const resolvedUrl = $derived.by(() => {
    if (!req.url.includes('{{') && !req.url.includes('/:') && !req.params.some((p) => p.enabled && p.key) && authSource.auth.type !== 'apikey')
      return '';
    try {
      return buildRequest(req, vars, authSource.auth).url;
    } catch {
      return '';
    }
  });

  function onUrlInput() {
    syncPathVars(req);
    changed();
  }
  function onUrlPaste(e: ClipboardEvent) {
    const text = e.clipboardData?.getData('text') ?? '';
    if (/^\s*curl\s/i.test(text)) {
      e.preventDefault();
      const parsed = parseCurl(text);
      if (parsed) {
        Object.assign(req, { ...parsed, id: req.id, folder: req.folder, name: req.name === 'Untitled Request' ? parsed.name : req.name });
        changed();
        showToast('cURL imported', 'success');
      }
    }
  }
  function onUrlCommit() {
    if (req.url.includes('?')) {
      splitUrlParams(req);
      syncPathVars(req);
      changed();
    }
  }

  // ---------- response ----------
  const contentType = $derived(resp ? (Object.entries(resp.headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? '') : '');
  const respLang = $derived.by<'json' | 'xml' | 'html' | 'javascript' | 'text'>(() => {
    if (!resp) return 'text';
    const ct = contentType.toLowerCase();
    if (ct.includes('json')) return 'json';
    if (ct.includes('html')) return 'html';
    if (ct.includes('xml')) return 'xml';
    if (ct.includes('javascript')) return 'javascript';
    const head = resp.body.trimStart()[0];
    if (head === '{' || head === '[') return 'json';
    if (head === '<') return 'html';
    return 'text';
  });
  const respBody = $derived.by(() => {
    if (!resp) return '';
    if (respRaw || respLang !== 'json' || resp.body.length > 8 * 1048576) return resp.body;
    try {
      return JSON.stringify(JSON.parse(resp.body), null, 2);
    } catch {
      return resp.body;
    }
  });
  const sentRequest = $derived.by(() => {
    try {
      return buildRequest(req, vars, authSource.auth);
    } catch {
      return null;
    }
  });
  const testStats = $derived.by(() => {
    const t = (report?.tests ?? []).filter((x) => !x.skipped);
    return { total: t.length, passed: t.filter((x) => x.passed).length };
  });
  const visualHtml = $derived(
    report?.visualizer ? renderVisualizer(report.visualizer.template, report.visualizer.data, typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) : ''
  );
  $effect(() => {
    if (!report?.visualizer && respPane === 'visualize') respPane = 'body';
  });
  const consoleCount = $derived((report?.logs.length ?? 0) + (report?.errors.length ?? 0));

  // ---------- actions ----------
  async function send() {
    if (!req.url.trim()) {
      showToast('Enter a request URL first', 'error');
      urlInput?.focus();
      return;
    }
    if (respPane === 'request') respPane = 'body';
    const r = await wb.send(tab);
    if (r && report && report.errors.length && respPane === 'body') respPane = 'console';
    else if (r && tab.report?.tests.length && respPane === 'body' && testStats.passed < testStats.total) {
      /* keep body; the Tests badge turns red */
    }
  }

  let saveMenu = $state(false);
  function save() {
    if (tab.sourceId && tab.sourceCollectionId && wb.saveTab(tab)) {
      showToast('Saved', 'success');
      return;
    }
    saveMenu = true;
  }
  function saveInto(id: string | null) {
    let target = id;
    if (!target) {
      const name = prompt('New collection name', 'My Collection');
      if (!name) return;
      target = uid();
      wb.saveCollection({ id: target, name, description: '', createdAt: Date.now(), requests: [] });
    }
    wb.saveTab(tab, target);
    saveMenu = false;
    showToast('Saved to collection', 'success');
  }

  let curlOpen = $state(false);
  let importOpen = $state(false);
  let importText = $state('');
  let importWarnings = $state<string[]>([]);
  let dragOver = $state(false);
  let settingsOpen = $state(false);
  let scopeTarget = $state<
    { kind: 'collection'; col: CollectionItem } | { kind: 'folder'; col: CollectionItem; path: string[] } | { kind: 'globals' } | null
  >(null);

  function reportImport(total: { requests: number; environments: number; globals: number; warnings: string[] }) {
    const parts = [`${total.requests} request(s)`];
    if (total.environments) parts.push(`${total.environments} environment(s)`);
    if (total.globals) parts.push(`${total.globals} global(s)`);
    showToast(`Imported ${parts.join(', ')}`, 'success');
    importWarnings = total.warnings;
    if (!total.warnings.length) importOpen = false;
  }

  async function importFiles(files: FileList | File[] | null) {
    if (!files) return;
    const total = { requests: 0, environments: 0, globals: 0, warnings: [] as string[] };
    let ok = false;
    for (const f of Array.from(files)) {
      try {
        const r = wb.importText(await f.text(), f.name);
        total.requests += r.requests;
        total.environments += r.environments;
        total.globals += r.globals;
        total.warnings.push(...r.warnings.filter((w) => !total.warnings.includes(w)));
        ok = true;
        if (r.collections) { for (const c of wb.collections.slice(0, r.collections)) expanded[c.id] = true; savePref('expanded', expanded); }
      } catch (e: any) {
        showToast(`${f.name}: ${e?.message ?? 'import failed'}`, 'error');
      }
    }
    if (ok) {
      if (total.warnings.length) importOpen = true;
      reportImport(total);
    }
  }
  function importPasted() {
    try {
      const r = wb.importText(importText);
      importText = '';
      if (r.collections) { for (const c of wb.collections.slice(0, r.collections)) expanded[c.id] = true; savePref('expanded', expanded); }
      reportImport(r);
    } catch (e: any) {
      showToast(e?.message ?? 'Import failed', 'error');
    }
  }

  // ---------- collection tree ----------
  interface TreeNode {
    name: string;
    path: string[];
    folders: TreeNode[];
    requests: WorkbenchRequest[];
  }
  function buildTree(col: CollectionItem, q: string): TreeNode {
    const root: TreeNode = { name: '', path: [], folders: [], requests: [] };
    const nodeFor = (path: string[]) => {
      let n = root;
      for (let i = 0; i < path.length; i++) {
        let c = n.folders.find((f) => f.name === path[i]);
        if (!c) {
          c = { name: path[i], path: path.slice(0, i + 1), folders: [], requests: [] };
          n.folders.push(c);
        }
        n = c;
      }
      return n;
    };
    if (!q) for (const k of Object.keys(col.folders ?? {})) nodeFor(k.split('/'));
    for (const r of col.requests) {
      if (q && !(r.name.toLowerCase().includes(q) || r.url.toLowerCase().includes(q))) continue;
      nodeFor(r.folder ?? []).requests.push(r);
    }
    return root;
  }
  const query = $derived(filter.trim().toLowerCase());
  const trees = $derived(
    wb.collections
      .map((c) => ({ col: c, tree: buildTree(c, query) }))
      .filter(({ col, tree }) => !query || col.name.toLowerCase().includes(query) || tree.requests.length || tree.folders.length)
  );
  const filteredHistory = $derived.by(() => {
    const list = query ? wb.history.filter((h) => h.url.toLowerCase().includes(query)) : wb.history;
    return list.slice(0, 150);
  });

  let expanded = $state<Record<string, boolean>>(pref('expanded', {}));
  const fkey = (cid: string, path: string[]) => `${cid}::${path.join('/')}`;
  function toggle(key: string) {
    expanded[key] = !expanded[key];
    savePref('expanded', expanded);
  }
  let renaming = $state<string | null>(null);

  function newCollection() {
    const id = uid();
    wb.saveCollection({ id, name: 'New Collection', description: '', createdAt: Date.now(), requests: [], variables: [], folders: {} });
    expanded[id] = true;
    renaming = id;
  }
  function addRequest(col: CollectionItem, folder?: string[]) {
    const r = wb.addRequestToCollection(col.id, newRequest({ name: 'New Request', folder: folder?.length ? folder : undefined, auth: { ...newRequest().auth, type: 'inherit' } }));
    if (r) wb.newTab(r, { id: r.id, collectionId: col.id });
    expanded[col.id] = true;
    if (folder) expanded[fkey(col.id, folder)] = true;
    tick().then(() => urlInput?.focus());
  }
  function addFolder(col: CollectionItem, parent: string[]) {
    const name = prompt('Folder name', 'New Folder');
    if (!name?.trim()) return;
    const p = wb.addFolder(col.id, parent, name.trim().replace(/\//g, '-'));
    expanded[col.id] = true;
    if (p) {
      expanded[fkey(col.id, parent)] = true;
      expanded[fkey(col.id, p)] = true;
    }
  }
  function openFromTree(r: WorkbenchRequest, col: CollectionItem, pin = false) {
    wb.newTab(r, { id: r.id, collectionId: col.id }, { preview: !pin });
  }
  function openHistory(h: HistoryEntry) {
    wb.newTab({ ...h.request, id: uid() }, { id: `hist:${h.id}`, collectionId: null }, { preview: true, response: h.response ?? null });
  }
  async function exportCollection(id: string) {
    await exportCollectionFile(id);
  }

  // ---------- tabs ----------
  let tabMenu = $state<{ x: number; y: number; id: string } | null>(null);
  let tabListOpen = $state(false);
  let tabListFilter = $state('');

  $effect(() => {
    const id = wb.activeTabId;
    tick().then(() => tabStrip?.querySelector(`[data-tab-id="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  });

  function onStripWheel(e: WheelEvent) {
    if (!tabStrip || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
    tabStrip.scrollLeft += e.deltaY;
    e.preventDefault();
  }
  function tabTitle(t: (typeof wb.tabs)[number]) {
    const col = wb.collections.find((c) => c.id === t.sourceCollectionId);
    const where = col ? [col.name, ...(t.request.folder ?? [])].join(' / ') + '\n' : '';
    return `${where}${t.request.method} ${t.request.url || '(no URL)'}${t.preview ? '\n(preview — double-click to keep open)' : ''}`;
  }
  function revealInSidebar(id: string) {
    const t = wb.tabs.find((x) => x.id === id);
    if (!t?.sourceCollectionId) return;
    sidebarOpen = true;
    sideTab = 'collections';
    expanded[t.sourceCollectionId] = true;
    const path = t.request.folder ?? [];
    for (let i = 1; i <= path.length; i++) expanded[fkey(t.sourceCollectionId, path.slice(0, i))] = true;
  }

  // ---------- keyboard ----------
  function onKey(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') {
      tabMenu = null;
      tabListOpen = false;
      saveMenu = false;
      settingsOpen = false;
    }
    if (!mod || e.altKey) return;
    const k = e.key.toLowerCase();
    if (e.key === 'Tab') {
      e.preventDefault();
      wb.cycleTab(e.shiftKey ? -1 : 1);
    } else if (k === 'enter') {
      e.preventDefault();
      send();
    } else if (e.shiftKey && k === 't') {
      e.preventDefault();
      if (!wb.reopenClosedTab()) showToast('No recently closed tabs', 'info');
    } else if (e.shiftKey) {
      return;
    } else if (k === 's') {
      e.preventDefault();
      save();
    } else if (k === 't' || k === 'n') {
      e.preventDefault();
      wb.newTab();
      tick().then(() => urlInput?.focus());
    } else if (k === 'w') {
      e.preventDefault();
      e.stopPropagation();
      wb.closeTab(tab.id);
    } else if (k === 'l') {
      e.preventDefault();
      urlInput?.focus();
      urlInput?.select();
    } else if (k === 'b') {
      e.preventDefault();
      sidebarOpen = !sidebarOpen;
      savePref('sidebarOpen', sidebarOpen);
    }
  }

  const enabledCount = (rows: { enabled: boolean; key: string }[]) => rows.filter((r) => r.enabled && r.key).length;
  const hasScript = $derived(!!(req.preRequestScript?.trim() || req.testScript?.trim()));
</script>

<svelte:window onkeydown={onKey} />

{#snippet methodTag(m: HttpMethod)}
  <span class="w-9 shrink-0 text-[10px] font-bold font-mono {METHOD_TEXT[m]}">{METHOD_SHORT[m]}</span>
{/snippet}

{#snippet folderNode(col: CollectionItem, node: TreeNode, depth: number)}
  {#each node.folders as f (f.path.join('/'))}
    {@const key = fkey(col.id, f.path)}
    {@const open = expanded[key] || !!query}
    <div>
      <div class="group flex items-center h-7 rounded-md hover:bg-neutral-200/60 dark:hover:bg-white/[0.04] transition-colors" style="padding-left:{depth * 12}px">
        <button class="flex items-center gap-1.5 flex-1 min-w-0 h-full px-1.5 text-left" onclick={() => toggle(key)}>
          <svg class="w-3 h-3 shrink-0 text-neutral-400 transition-transform duration-150 {open ? 'rotate-90' : ''}" fill="currentColor" viewBox="0 0 20 20"><path d="M7 5l6 5-6 5z" /></svg>
          <svg class="w-3.5 h-3.5 shrink-0 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
          {#if renaming === key}
            <!-- svelte-ignore a11y_autofocus -->
            <input
              autofocus
              value={f.name}
              onclick={(e) => e.stopPropagation()}
              onblur={(e) => {
                const v = (e.target as HTMLInputElement).value.trim().replace(/\//g, '-');
                if (v && v !== f.name) wb.renameFolder(col.id, f.path, v);
                renaming = null;
              }}
              onkeydown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') renaming = null;
              }}
              class="flex-1 min-w-0 h-5 px-1 rounded bg-white dark:bg-neutral-900 border border-brand-500/50 text-[12.5px] outline-none"
            />
          {:else}
            <span class="truncate text-[12.5px]" ondblclick={() => (renaming = key)} role="presentation">{f.name}</span>
          {/if}
        </button>
        <div class="flex items-center pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button class="wb-mini" title="Add request" aria-label="Add request" onclick={() => addRequest(col, f.path)}>
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <button class="wb-mini" title="Add subfolder" aria-label="Add subfolder" onclick={() => addFolder(col, f.path)}>
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><path d="M12 11v5M9.5 13.5h5" /></svg>
          </button>
          <button class="wb-mini" title="Folder settings (auth, scripts)" aria-label="Folder settings" onclick={() => (scopeTarget = { kind: 'folder', col, path: f.path })}>
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h10M4 18h6" /><circle cx="18" cy="16" r="3" /></svg>
          </button>
          <button
            class="wb-mini hover:!text-rose-500"
            title="Delete folder"
            aria-label="Delete folder"
            onclick={() => confirm(`Delete folder "${f.name}" and everything inside it?`) && wb.deleteFolder(col.id, f.path)}
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" /></svg>
          </button>
        </div>
      </div>
      {#if open}
        {@render folderNode(col, f, depth + 1)}
      {/if}
    </div>
  {/each}
  {#each node.requests as r (r.id)}
    {@const active = tab.sourceId === r.id}
    <div
      class="group flex items-center h-7 rounded-md transition-colors {active ? 'bg-brand-500/10 text-neutral-900 dark:text-white' : 'hover:bg-neutral-200/60 dark:hover:bg-white/[0.04]'}"
      style="padding-left:{depth * 12 + 18}px"
    >
      <button
        class="flex items-center gap-2 flex-1 min-w-0 h-full px-1.5 text-left"
        onclick={() => openFromTree(r, col)}
        ondblclick={() => openFromTree(r, col, true)}
        title={`${r.method} ${r.url}`}
      >
        {@render methodTag(r.method)}
        <span class="truncate text-[12.5px]">{r.name}</span>
      </button>
      <button
        class="wb-mini mr-1 opacity-0 group-hover:opacity-100 hover:!text-rose-500"
        title="Delete request"
        aria-label="Delete request"
        onclick={() => wb.deleteRequestFromCollection(col.id, r.id)}
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
  {/each}
{/snippet}

<div class="wb flex h-full w-full min-h-0 min-w-0 select-none text-neutral-800 dark:text-neutral-200">
  <!-- ================= Sidebar ================= -->
  {#if sidebarOpen}
    <aside
      class="relative flex flex-col shrink-0 min-h-0 border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-[#131313] {dragOver ? 'ring-2 ring-inset ring-brand-500/50' : ''}"
      style="width:{sidebarW}px"
      ondragover={(e) => {
        e.preventDefault();
        dragOver = true;
      }}
      ondragleave={() => (dragOver = false)}
      ondrop={(e) => {
        e.preventDefault();
        dragOver = false;
        importFiles(e.dataTransfer?.files ?? null);
      }}
    >
      <div class="flex items-center gap-1 p-2">
        <div class="relative flex-1">
          <svg class="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input
            bind:value={filter}
            placeholder="Filter"
            class="w-full h-7 pl-7 pr-2 rounded-md bg-white dark:bg-white/[0.04] border border-neutral-200 dark:border-neutral-800 text-[12px] outline-none focus:border-brand-500/50 transition-colors"
          />
        </div>
        <button class="wb-icon" title="New collection" aria-label="New collection" onclick={newCollection}>
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><path d="M12 11v5M9.5 13.5h5" /></svg>
        </button>
        <button
          class="wb-icon"
          title="Import (Postman, Insomnia, Bruno, cURL)"
          aria-label="Import"
          onclick={() => {
            importWarnings = [];
            importOpen = true;
          }}
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></svg>
        </button>
      </div>

      <div class="flex px-2 gap-1 text-[12px]">
        {#each [['collections', 'Collections'], ['history', 'History']] as [k, label] (k)}
          <button
            class="flex-1 h-7 rounded-md transition-colors {sideTab === k ? 'bg-white dark:bg-white/[0.06] text-neutral-900 dark:text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'}"
            onclick={() => (sideTab = k as any)}>{label}</button
          >
        {/each}
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto px-1.5 py-2 wb-scroll">
        {#if sideTab === 'collections'}
          {#if trees.length === 0}
            <div class="px-3 py-8 text-center text-[12px] text-neutral-400 space-y-2">
              <p>{query ? 'Nothing matches the filter.' : 'No collections yet.'}</p>
              {#if !query}<p>Create one or drop a Postman / Insomnia / Bruno file here.</p>{/if}
            </div>
          {/if}
          {#each trees as { col, tree } (col.id)}
            {@const open = expanded[col.id] || !!query}
            <div class="mb-0.5">
              <div class="group flex items-center h-7 rounded-md hover:bg-neutral-200/60 dark:hover:bg-white/[0.04] transition-colors">
                <button class="flex items-center gap-1.5 flex-1 min-w-0 h-full px-1.5 text-left" onclick={() => toggle(col.id)}>
                  <svg class="w-3 h-3 shrink-0 text-neutral-400 transition-transform duration-150 {open ? 'rotate-90' : ''}" fill="currentColor" viewBox="0 0 20 20"><path d="M7 5l6 5-6 5z" /></svg>
                  {#if renaming === col.id}
                    <!-- svelte-ignore a11y_autofocus -->
                    <input
                      autofocus
                      value={col.name}
                      onclick={(e) => e.stopPropagation()}
                      onblur={(e) => {
                        wb.renameCollection(col.id, (e.target as HTMLInputElement).value.trim() || col.name);
                        renaming = null;
                      }}
                      onkeydown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') renaming = null;
                      }}
                      class="flex-1 min-w-0 h-5 px-1 rounded bg-white dark:bg-neutral-900 border border-brand-500/50 text-[12.5px] outline-none"
                    />
                  {:else}
                    <span class="truncate text-[12.5px] font-medium" ondblclick={() => (renaming = col.id)} role="presentation">{col.name}</span>
                    <span class="text-[10.5px] text-neutral-400">{col.requests.length}</span>
                  {/if}
                </button>
                <div class="flex items-center pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button class="wb-mini" title="Add request" aria-label="Add request" onclick={() => addRequest(col)}>
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14" /></svg>
                  </button>
                  <button class="wb-mini" title="Add folder" aria-label="Add folder" onclick={() => addFolder(col, [])}>
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><path d="M12 11v5M9.5 13.5h5" /></svg>
                  </button>
                  <button class="wb-mini" title="Collection settings (variables, auth, scripts)" aria-label="Collection settings" onclick={() => (scopeTarget = { kind: 'collection', col })}>
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h10M4 18h6" /><circle cx="18" cy="16" r="3" /></svg>
                  </button>
                  <button class="wb-mini" title="Export as Postman v2.1" aria-label="Export collection" onclick={() => exportCollection(col.id)}>
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M12 15V3m0 0l-4 4m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></svg>
                  </button>
                  <button
                    class="wb-mini hover:!text-rose-500"
                    title="Delete collection"
                    aria-label="Delete collection"
                    onclick={() => confirm(`Delete collection "${col.name}" and its ${col.requests.length} request(s)?`) && wb.deleteCollection(col.id)}
                  >
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" /></svg>
                  </button>
                </div>
              </div>
              {#if open}
                <div class="ml-2">
                  {@render folderNode(col, tree, 0)}
                  {#if !tree.folders.length && !tree.requests.length}
                    <p class="pl-6 py-1 text-[11.5px] text-neutral-400">Empty</p>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        {:else}
          {#if filteredHistory.length === 0}
            <p class="px-3 py-8 text-center text-[12px] text-neutral-400">No requests sent yet.</p>
          {:else}
            <div class="flex justify-end px-1 pb-1">
              <button class="text-[11px] text-neutral-400 hover:text-rose-500 transition-colors" onclick={() => confirm('Clear all history?') && wb.clearHistory()}>Clear</button>
            </div>
          {/if}
          {#each filteredHistory as h (h.id)}
            <button class="w-full flex items-center gap-2 h-8 px-1.5 rounded-md text-left hover:bg-neutral-200/60 dark:hover:bg-white/[0.04] transition-colors" onclick={() => openHistory(h)} title={h.url}>
              {@render methodTag(h.method)}
              <span class="flex-1 min-w-0 truncate text-[12px] font-mono text-neutral-600 dark:text-neutral-400">{h.url.replace(/^https?:\/\//, '')}</span>
              <span class="text-[10.5px] font-mono {h.status >= 400 || h.status === 0 ? 'text-rose-500' : 'text-emerald-500'}">{h.status || 'ERR'}</span>
              <span class="w-6 text-right text-[10.5px] text-neutral-400">{ago(h.timestamp)}</span>
            </button>
          {/each}
        {/if}
      </div>

      <div
        class="absolute top-0 right-0 h-full w-1.5 translate-x-1/2 cursor-col-resize z-10 hover:bg-brand-500/40 active:bg-brand-500/60 transition-colors"
        role="separator"
        aria-orientation="vertical"
        onpointerdown={dragSidebar}
      ></div>
    </aside>
  {/if}

  <!-- ================= Main ================= -->
  <section class="flex-1 min-w-0 min-h-0 flex flex-col">
    <!-- Tab strip -->
    <div class="flex items-stretch h-9 shrink-0 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-[#131313]">
      <button
        class="wb-icon !h-9 !w-9 !rounded-none border-r border-neutral-200 dark:border-neutral-800"
        title="Toggle sidebar (Ctrl+B)"
        aria-label="Toggle sidebar"
        onclick={() => {
          sidebarOpen = !sidebarOpen;
          savePref('sidebarOpen', sidebarOpen);
        }}
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>
      </button>
      <div class="flex-1 min-w-0 flex items-stretch overflow-x-auto wb-scroll-x" bind:this={tabStrip} onwheel={onStripWheel} role="tablist">
        {#each wb.tabs as t (t.id)}
          {@const active = t.id === tab.id}
          <div
            data-tab-id={t.id}
            class="group relative shrink-0 flex items-center gap-1.5 pl-3 pr-1 max-w-[220px] border-r border-neutral-200 dark:border-neutral-800 cursor-pointer transition-colors {active
              ? 'bg-white dark:bg-[#161616] text-neutral-900 dark:text-white'
              : 'text-neutral-500 hover:bg-white/60 dark:hover:bg-white/[0.03]'}"
            role="tab"
            tabindex="0"
            aria-selected={active}
            title={tabTitle(t)}
            onclick={() => wb.setActiveTab(t.id)}
            ondblclick={() => wb.pinTab(t.id)}
            onauxclick={(e) => e.button === 1 && wb.closeTab(t.id)}
            oncontextmenu={(e) => {
              e.preventDefault();
              tabMenu = { x: e.clientX, y: e.clientY, id: t.id };
            }}
            onkeydown={(e) => e.key === 'Enter' && wb.setActiveTab(t.id)}
          >
            {#if active}<span class="absolute inset-x-0 top-0 h-[2px] bg-brand-500"></span>{/if}
            <span class="text-[10px] font-bold font-mono {METHOD_TEXT[t.request.method]}">{METHOD_SHORT[t.request.method]}</span>
            <span class="truncate text-[12px] {t.preview ? 'italic' : ''}">{t.request.name}</span>
            {#if t.sending}
              <span class="w-3 h-3 shrink-0 rounded-full border-2 border-brand-500 border-t-transparent animate-spin"></span>
            {/if}
            <button
              class="relative w-5 h-5 shrink-0 flex items-center justify-center rounded hover:bg-neutral-200 dark:hover:bg-white/10"
              aria-label="Close tab"
              onclick={(e) => {
                e.stopPropagation();
                wb.closeTab(t.id);
              }}
            >
              {#if t.dirty}
                <span class="w-2 h-2 rounded-full bg-brand-500 group-hover:hidden"></span>
              {/if}
              <svg
                class="w-3 h-3 {t.dirty ? 'hidden group-hover:block' : active ? '' : 'opacity-0 group-hover:opacity-100'}"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2.5"><path d="M6 18L18 6M6 6l12 12" /></svg
              >
            </button>
          </div>
        {/each}
        <button class="wb-icon !h-9 !w-9 !rounded-none shrink-0" title="New tab (Ctrl+T)" aria-label="New tab" onclick={() => wb.newTab()}>
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>
      <!-- all tabs -->
      <div class="relative flex items-center border-l border-neutral-200 dark:border-neutral-800">
        <button
          class="wb-icon !h-9 !w-9 !rounded-none"
          title="All open tabs"
          aria-label="All open tabs"
          onclick={() => {
            tabListFilter = '';
            tabListOpen = !tabListOpen;
          }}
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6" /></svg>
          {#if wb.tabs.length > 1}<span class="absolute top-1 right-1 text-[9px] font-mono text-neutral-400">{wb.tabs.length}</span>{/if}
        </button>
        {#if tabListOpen}
          <button class="fixed inset-0 z-30 cursor-default" aria-label="Close menu" onclick={() => (tabListOpen = false)}></button>
          <div class="wb-pop absolute right-0 top-9 z-40 w-80 p-1">
            <!-- svelte-ignore a11y_autofocus -->
            <input
              autofocus
              bind:value={tabListFilter}
              placeholder="Search open tabs"
              class="w-full h-7 px-2 mb-1 rounded-md bg-neutral-100 dark:bg-white/[0.05] text-[12px] outline-none"
              onkeydown={(e) => {
                if (e.key === 'Enter') {
                  const first = wb.tabs.find((t) => t.request.name.toLowerCase().includes(tabListFilter.toLowerCase()));
                  if (first) wb.setActiveTab(first.id);
                  tabListOpen = false;
                }
              }}
            />
            <div class="max-h-80 overflow-y-auto wb-scroll">
              {#each wb.tabs.filter((t) => !tabListFilter || t.request.name.toLowerCase().includes(tabListFilter.toLowerCase()) || t.request.url.toLowerCase().includes(tabListFilter.toLowerCase())) as t (t.id)}
                <div class="group flex items-center rounded-md {t.id === tab.id ? 'bg-brand-500/10' : 'hover:bg-neutral-100 dark:hover:bg-white/[0.06]'}">
                  <button
                    class="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 text-left"
                    onclick={() => {
                      wb.setActiveTab(t.id);
                      tabListOpen = false;
                    }}
                  >
                    {@render methodTag(t.request.method)}
                    <span class="truncate text-[12.5px] {t.preview ? 'italic' : ''}">{t.request.name}</span>
                    {#if t.dirty}<span class="w-1.5 h-1.5 shrink-0 rounded-full bg-brand-500"></span>{/if}
                  </button>
                  <button class="wb-mini mr-1 opacity-0 group-hover:opacity-100" aria-label="Close tab" onclick={() => wb.closeTab(t.id)}>
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              {/each}
            </div>
            <div class="flex justify-between border-t border-neutral-200 dark:border-neutral-800 mt-1 pt-1 px-1">
              <button class="wb-link" onclick={() => wb.closeOtherTabs(tab.id)}>Close others</button>
              <button
                class="wb-link hover:!text-rose-500"
                onclick={() => {
                  wb.closeAllTabs();
                  tabListOpen = false;
                }}>Close all</button
              >
            </div>
          </div>
        {/if}
      </div>
      <!-- Environment picker -->
      <div class="flex items-center gap-0.5 px-2 border-l border-neutral-200 dark:border-neutral-800">
        <span class="w-1.5 h-1.5 rounded-full {wb.activeEnvironment ? 'bg-emerald-500' : 'bg-neutral-400'}"></span>
        <select
          class="h-7 max-w-[160px] bg-transparent text-[12px] outline-none cursor-pointer"
          value={wb.activeEnvironmentId ?? ''}
          onchange={(e) => wb.setActiveEnvironment((e.target as HTMLSelectElement).value || null)}
          title="Active environment"
        >
          <option value="">No environment</option>
          {#each wb.environments as env (env.id)}
            <option value={env.id}>{env.name}</option>
          {/each}
        </select>
        <button class="wb-icon" title="Manage environments" aria-label="Manage environments" onclick={() => goto('/environments')}>
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h10M4 18h6" /><circle cx="18" cy="16" r="3" /></svg>
        </button>
        <button class="wb-icon" title="Global variables" aria-label="Global variables" onclick={() => (scopeTarget = { kind: 'globals' })}>
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" /></svg>
        </button>
        <div class="relative">
          <button class="wb-icon" title="Request settings" aria-label="Request settings" onclick={() => (settingsOpen = !settingsOpen)}>
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>
          </button>
          {#if settingsOpen}
            <button class="fixed inset-0 z-30 cursor-default" aria-label="Close menu" onclick={() => (settingsOpen = false)}></button>
            <div class="wb-pop absolute right-0 top-8 z-40 w-72 p-3 space-y-3 text-[12.5px]">
              <label class="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" class="mt-0.5 accent-brand-600" checked={wb.settings.sslVerify} onchange={(e) => wb.updateSettings({ sslVerify: (e.target as HTMLInputElement).checked })} />
                <span><span class="font-medium">SSL certificate verification</span><br /><span class="text-[11.5px] text-neutral-500">Turn off for local servers with self-signed certificates.</span></span>
              </label>
              <label class="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" class="mt-0.5 accent-brand-600" checked={wb.settings.followRedirects} onchange={(e) => wb.updateSettings({ followRedirects: (e.target as HTMLInputElement).checked })} />
                <span><span class="font-medium">Follow redirects</span><br /><span class="text-[11.5px] text-neutral-500">Up to 10 hops (3xx).</span></span>
              </label>
              <label class="flex items-center justify-between gap-2">
                <span class="font-medium">Timeout</span>
                <span class="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    max="600"
                    class="wb-input !h-7 w-20 text-right"
                    value={Math.round(wb.settings.timeoutMs / 1000)}
                    onchange={(e) => wb.updateSettings({ timeoutMs: Math.max(1, Number((e.target as HTMLInputElement).value) || 60) * 1000 })}
                  />
                  <span class="text-neutral-500">s</span>
                </span>
              </label>
              <p class="text-[11px] text-neutral-500 border-t border-neutral-200 dark:border-neutral-800 pt-2">Cookies set by servers are kept automatically for the session, like Postman's cookie jar.</p>
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Name + URL bar -->
    <div class="shrink-0 px-3 pt-2.5 pb-2 space-y-1.5">
      <div class="flex items-center gap-2">
        {#if colId}
          {@const col = wb.collections.find((c) => c.id === colId)}
          {#if col}
            <span class="shrink-0 text-[12px] text-neutral-400 truncate max-w-[40%]">{[col.name, ...(req.folder ?? [])].join(' / ')} /</span>
          {/if}
        {/if}
        <input
          class="flex-1 min-w-0 bg-transparent text-[13px] font-medium outline-none px-1 -mx-1 rounded hover:bg-neutral-100 dark:hover:bg-white/[0.04] focus:bg-neutral-100 dark:focus:bg-white/[0.04] transition-colors"
          bind:value={req.name}
          oninput={changed}
          spellcheck="false"
          aria-label="Request name"
        />
        <div class="relative">
          <button
            class="h-7 px-2.5 rounded-md text-[12px] flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/[0.06] transition-colors"
            onclick={save}
            title="Save (Ctrl+S)"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M5 3h11l3 3v13a2 2 0 01-2 2H7a2 2 0 01-2-2z" /><path d="M8 3v5h7M8 21v-7h8v7" /></svg>
            Save
          </button>
          {#if saveMenu}
            <button class="fixed inset-0 z-30 cursor-default" aria-label="Close menu" onclick={() => (saveMenu = false)}></button>
            <div class="wb-pop absolute right-0 top-8 z-40 w-60 p-1">
              <p class="px-2 py-1.5 text-[11px] uppercase tracking-wide text-neutral-400">Save to collection</p>
              {#each wb.collections as c (c.id)}
                <button class="wb-menu-item" onclick={() => saveInto(c.id)}>{c.name}</button>
              {/each}
              <button class="wb-menu-item text-brand-600 dark:text-brand-400" onclick={() => saveInto(null)}>+ New collection…</button>
            </div>
          {/if}
        </div>
        <button
          class="h-7 px-2.5 rounded-md text-[12px] flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/[0.06] transition-colors"
          onclick={() => (curlOpen = true)}
          title="Generate cURL"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M8 9l-4 3 4 3M16 9l4 3-4 3M14 5l-4 14" /></svg>
          Code
        </button>
      </div>

      <div class="flex items-stretch h-9 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-white/[0.03] focus-within:border-brand-500/60 focus-within:ring-2 focus-within:ring-brand-500/15 transition-shadow">
        <select
          class="pl-3 pr-1 bg-transparent text-[12px] font-bold font-mono outline-none cursor-pointer border-r border-neutral-200 dark:border-neutral-800 {METHOD_TEXT[req.method]}"
          value={req.method}
          onchange={(e) => {
            req.method = (e.target as HTMLSelectElement).value as HttpMethod;
            changed();
          }}
          aria-label="HTTP method"
        >
          {#each METHODS as m (m)}
            <option value={m}>{m}</option>
          {/each}
        </select>
        <div class="relative flex-1 min-w-0">
          <div class="absolute inset-0 px-3 flex items-center overflow-hidden pointer-events-none" aria-hidden="true">
            <div class="whitespace-pre text-[12.5px] font-mono" style="transform:translateX(-{urlScroll}px)">
              {#each urlSegments as s, i (i)}<span
                  class={s.kind === 'ok'
                    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded-sm'
                    : s.kind === 'bad'
                      ? 'text-rose-600 dark:text-rose-400 bg-rose-500/10 rounded-sm'
                      : s.kind === 'path'
                        ? 'text-sky-600 dark:text-sky-400'
                        : 'text-neutral-800 dark:text-neutral-100'}>{s.text}</span
                >{/each}
            </div>
          </div>
          <input
            bind:this={urlInput}
            bind:value={req.url}
            oninput={onUrlInput}
            onscroll={(e) => (urlScroll = (e.target as HTMLInputElement).scrollLeft)}
            onkeyup={(e) => (urlScroll = (e.target as HTMLInputElement).scrollLeft)}
            onpaste={onUrlPaste}
            onblur={onUrlCommit}
            onkeydown={(e) => {
              if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                onUrlCommit();
                send();
              }
            }}
            spellcheck="false"
            autocomplete="off"
            placeholder={'https://api.example.com/v1/users/:id  —  or paste a cURL command'}
            class="relative w-full h-full px-3 bg-transparent text-[12.5px] font-mono outline-none text-transparent caret-neutral-900 dark:caret-white placeholder:text-neutral-400 dark:placeholder:text-neutral-600 selection:bg-brand-500/30"
            aria-label="Request URL"
          />
        </div>
        {#if tab.sending}
          <button
            class="m-1 px-4 rounded-md text-[12px] font-semibold bg-neutral-200 dark:bg-white/10 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-300 dark:hover:bg-white/15 transition-colors flex items-center gap-2"
            onclick={() => wb.cancel(tab)}
          >
            <span class="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin"></span>
            Cancel
          </button>
        {:else}
          <button class="m-1 px-5 rounded-md text-[12px] font-semibold bg-brand-600 hover:bg-brand-500 active:scale-[0.97] text-white shadow-sm transition-all" onclick={send} title="Send (Ctrl+Enter)">
            Send
          </button>
        {/if}
      </div>
      {#if resolvedUrl}
        <p class="px-1 text-[11px] font-mono text-neutral-400 truncate select-text" title={resolvedUrl}>→ {resolvedUrl}</p>
      {/if}
    </div>

    <!-- Split: request / response -->
    <div bind:this={splitHost} class="flex-1 min-h-0 flex {vertical ? 'flex-col' : 'flex-row'} border-t border-neutral-200 dark:border-neutral-800">
      <!-- Request pane -->
      <div class="min-w-0 min-h-0 flex flex-col" style="flex:{split} 1 0%">
        <div class="wb-tabs">
          {#each [['params', 'Params', enabledCount(req.params) + (req.pathVars?.length ?? 0)], ['headers', 'Headers', enabledCount(req.headers)], ['auth', 'Auth', req.auth.type !== 'none' && req.auth.type !== 'inherit' ? 1 : 0], ['body', 'Body', req.body.type !== 'none' ? 1 : 0], ['scripts', 'Scripts', hasScript ? 1 : 0]] as [k, label, n] (k)}
            <button class="wb-tab {reqPane === k ? 'is-active' : ''}" onclick={() => (reqPane = k as any)}>
              {label}
              {#if n}
                {#if k === 'params' || k === 'headers'}
                  <span class="text-[10px] text-brand-600 dark:text-brand-400">{n}</span>
                {:else}
                  <span class="w-1.5 h-1.5 rounded-full bg-brand-500"></span>
                {/if}
              {/if}
            </button>
          {/each}
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto p-3 wb-scroll select-text">
          {#if reqPane === 'params'}
            <div class="space-y-4">
              <div>
                <p class="mb-1.5 text-[11px] uppercase tracking-wide text-neutral-400">Query parameters</p>
                <KeyValueEditor rows={req.params} onchange={changed} {vars} />
              </div>
              {#if req.pathVars?.length}
                <div>
                  <p class="mb-1.5 text-[11px] uppercase tracking-wide text-neutral-400">Path variables</p>
                  <KeyValueEditor rows={req.pathVars} onchange={changed} {vars} fixedKeys valuePlaceholder="Value (supports {{vars}})" />
                </div>
              {/if}
            </div>
          {:else if reqPane === 'headers'}
            <KeyValueEditor rows={req.headers} onchange={changed} {vars} keyPlaceholder="Header" />
          {:else if reqPane === 'auth'}
            <AuthEditor auth={req.auth} onchange={changed} allowInherit inheritedFrom={authFromLabel(authSource.from)} />
          {:else if reqPane === 'body'}
            <div class="flex flex-col h-full min-h-[220px] gap-2">
              <div class="flex items-center gap-2 flex-wrap">
                <div class="wb-seg flex-wrap">
                  {#each [['none', 'None'], ['json', 'JSON'], ['text', 'Text'], ['xml', 'XML'], ['urlencoded', 'Form URL'], ['form-data', 'Multipart'], ['binary', 'Binary']] as [k, label] (k)}
                    <button
                      class={req.body.type === k ? 'is-active' : ''}
                      onclick={() => {
                        req.body.type = k as BodyType;
                        changed();
                      }}>{label}</button
                    >
                  {/each}
                </div>
                {#if req.body.type === 'json'}
                  <button
                    class="wb-link ml-auto"
                    onclick={() => {
                      try {
                        req.body.rawJson = JSON.stringify(JSON.parse(req.body.rawJson), null, 2);
                        changed();
                      } catch (e: any) {
                        showToast(`Invalid JSON: ${e?.message ?? ''}`, 'error');
                      }
                    }}>Prettify</button
                  >
                {/if}
              </div>
              {#if req.body.type !== 'none' && req.method === 'HEAD'}
                <p class="text-[11.5px] text-amber-600 dark:text-amber-400">HEAD requests are sent without a body.</p>
              {:else if req.body.type !== 'none' && req.method === 'GET'}
                <label class="flex items-center gap-2 text-[11.5px] text-neutral-500 cursor-pointer">
                  <input
                    type="checkbox"
                    class="accent-brand-600"
                    checked={!!req.sendBodyOnGet}
                    onchange={(e) => {
                      req.sendBodyOnGet = (e.target as HTMLInputElement).checked;
                      changed();
                    }}
                  />
                  Send body with GET (most servers ignore it)
                </label>
              {/if}
              {#if req.body.type === 'json'}
                <div class="flex-1 min-h-[200px] rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                  <CodeEditor
                    value={req.body.rawJson}
                    language="json"
                    placeholder={'{\n  "key": "{{variable}}"\n}'}
                    onchange={(v) => {
                      req.body.rawJson = v;
                      changed();
                    }}
                  />
                </div>
              {:else if req.body.type === 'text' || req.body.type === 'xml'}
                <div class="flex-1 min-h-[200px] rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                  <CodeEditor
                    value={req.body.rawText ?? ''}
                    language={req.body.type === 'xml' ? 'xml' : 'text'}
                    onchange={(v) => {
                      req.body.rawText = v;
                      changed();
                    }}
                  />
                </div>
              {:else if req.body.type === 'urlencoded'}
                <KeyValueEditor rows={req.body.urlencoded} onchange={changed} {vars} />
              {:else if req.body.type === 'form-data'}
                <KeyValueEditor rows={req.body.formData} onchange={changed} {vars} allowFiles />
              {:else if req.body.type === 'binary'}
                <button
                  class="flex items-center gap-3 p-4 rounded-lg border-2 border-dashed border-neutral-300 dark:border-neutral-700 hover:border-brand-500/60 transition-colors text-left"
                  onclick={async () => {
                    const p = await pickFile('Choose body file');
                    if (p) {
                      req.body.binaryPath = p;
                      changed();
                    }
                  }}
                >
                  <svg class="w-6 h-6 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" /><path d="M14 3v6h6" /></svg>
                  <span class="min-w-0">
                    <span class="block text-[12.5px] font-medium truncate">{req.body.binaryPath ? baseName(req.body.binaryPath) : 'Choose a file to send as the body'}</span>
                    {#if req.body.binaryPath}<span class="block text-[11px] font-mono text-neutral-400 truncate">{req.body.binaryPath}</span>{/if}
                  </span>
                </button>
              {:else}
                <p class="text-[12px] text-neutral-400 pt-2">This request has no body.</p>
              {/if}
            </div>
          {:else if reqPane === 'scripts'}
            <ScriptEditor
              pre={req.preRequestScript ?? ''}
              post={req.testScript ?? ''}
              onPre={(v) => {
                req.preRequestScript = v;
                changed();
              }}
              onPost={(v) => {
                req.testScript = v;
                changed();
              }}
            />
          {/if}
        </div>
      </div>

      <!-- Divider -->
      <div
        class="relative shrink-0 {vertical ? 'h-px w-full cursor-row-resize' : 'w-px h-full cursor-col-resize'} bg-neutral-200 dark:bg-neutral-800 group"
        role="separator"
        aria-orientation={vertical ? 'horizontal' : 'vertical'}
        onpointerdown={dragSplit}
        ondblclick={() => {
          split = 0.5;
          savePref('split', split);
        }}
      >
        <div class="absolute {vertical ? 'inset-x-0 -inset-y-1' : 'inset-y-0 -inset-x-1'} group-hover:bg-brand-500/40 group-active:bg-brand-500/60 transition-colors z-10"></div>
      </div>

      <!-- Response pane -->
      <div class="min-w-0 min-h-0 flex flex-col" style="flex:{1 - split} 1 0%">
        <div class="wb-tabs">
          <button class="wb-tab {respPane === 'body' ? 'is-active' : ''}" onclick={() => (respPane = 'body')}>Body</button>
          <button class="wb-tab {respPane === 'headers' ? 'is-active' : ''}" onclick={() => (respPane = 'headers')}>
            Headers{#if resp}<span class="text-[10px] text-neutral-400">{Object.keys(resp.headers).length}</span>{/if}
          </button>
          <button class="wb-tab {respPane === 'tests' ? 'is-active' : ''}" onclick={() => (respPane = 'tests')}>
            Tests
            {#if testStats.total}
              <span class="text-[10px] font-mono {testStats.passed === testStats.total ? 'text-emerald-500' : 'text-rose-500'}">{testStats.passed}/{testStats.total}</span>
            {/if}
          </button>
          <button class="wb-tab {respPane === 'console' ? 'is-active' : ''}" onclick={() => (respPane = 'console')}>
            Console
            {#if report?.errors.length}
              <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            {:else if consoleCount}
              <span class="text-[10px] text-neutral-400">{consoleCount}</span>
            {/if}
          </button>
          {#if report?.visualizer}
            <button class="wb-tab {respPane === 'visualize' ? 'is-active' : ''}" onclick={() => (respPane = 'visualize')}>Visualize</button>
          {/if}
          <button class="wb-tab {respPane === 'request' ? 'is-active' : ''}" onclick={() => (respPane = 'request')}>Request</button>
          <div class="ml-auto flex items-center gap-2 pr-1 text-[11.5px] font-mono whitespace-nowrap">
            {#if tab.sending}
              <span class="text-neutral-400 animate-pulse">Sending…</span>
            {:else if resp}
              <span class="px-1.5 py-0.5 rounded font-semibold {statusTone(resp.status)}">{resp.status || 'ERR'} {resp.statusText}</span>
              <span class="text-neutral-500">{fmtTime(resp.elapsedMs)}</span>
              <span class="text-neutral-500 hidden xl:inline">{fmtSize(resp.sizeBytes)}</span>
            {/if}
            <button
              class="wb-icon"
              title={vertical ? 'Side-by-side layout' : 'Stacked layout'}
              aria-label="Toggle layout"
              onclick={() => {
                vertical = !vertical;
                savePref('vertical', vertical);
              }}
            >
              {#if vertical}
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16" /></svg>
              {:else}
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 12h18" /></svg>
              {/if}
            </button>
          </div>
        </div>

        <div class="relative flex-1 min-h-0 flex flex-col">
          {#if tab.sending}
            <div class="absolute inset-x-0 top-0 h-0.5 overflow-hidden z-10"><div class="wb-progress h-full w-1/3 bg-brand-500"></div></div>
          {/if}
          {#if respPane === 'tests'}
            <div class="flex-1 overflow-auto p-3 wb-scroll select-text space-y-1.5">
              {#if !report || (!report.tests.length && !report.errors.length)}
                <p class="py-8 text-center text-[12px] text-neutral-400">No tests ran. Add <code class="font-mono">pm.test(…)</code> in Scripts → Post-response.</p>
              {:else}
                {#each report.errors as err, i (i)}
                  <div class="flex items-start gap-2 p-2 rounded-md bg-rose-500/5 border border-rose-500/20 text-[12px]">
                    <span class="font-semibold text-rose-500 shrink-0">Script error</span>
                    <span class="text-neutral-500 shrink-0">{err.source}</span>
                    <span class="font-mono break-all">{err.message}</span>
                  </div>
                {/each}
                {#each report.tests as t, i (i)}
                  <div class="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-neutral-50 dark:hover:bg-white/[0.02] text-[12.5px]">
                    <span class="shrink-0 w-11 text-center text-[10.5px] font-bold rounded py-0.5 {t.skipped ? 'bg-neutral-500/10 text-neutral-500' : t.passed ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/12 text-rose-600 dark:text-rose-400'}">
                      {t.skipped ? 'SKIP' : t.passed ? 'PASS' : 'FAIL'}
                    </span>
                    <div class="min-w-0">
                      <p>{t.name}</p>
                      {#if t.error}<p class="text-[11.5px] font-mono text-rose-500 break-all">{t.error}</p>{/if}
                    </div>
                    {#if t.source && t.source !== 'Request'}<span class="ml-auto shrink-0 text-[10.5px] text-neutral-400">{t.source}</span>{/if}
                  </div>
                {/each}
              {/if}
            </div>
          {:else if respPane === 'console'}
            <div class="flex-1 overflow-auto p-2 wb-scroll select-text font-mono text-[12px]">
              {#if !consoleCount}
                <p class="py-8 text-center font-sans text-[12px] text-neutral-400">Nothing logged. <code>console.log()</code> output from scripts appears here.</p>
              {/if}
              {#each report?.errors ?? [] as err, i (i)}
                <div class="flex gap-2 px-2 py-1 border-b border-neutral-100 dark:border-neutral-800/60 text-rose-500">
                  <span class="shrink-0 w-14">error</span><span class="shrink-0 text-neutral-400">{err.source}</span><span class="break-all whitespace-pre-wrap">{err.message}</span>
                </div>
              {/each}
              {#each report?.logs ?? [] as l, i (i)}
                <div
                  class="flex gap-2 px-2 py-1 border-b border-neutral-100 dark:border-neutral-800/60 {l.level === 'error' ? 'text-rose-500' : l.level === 'warn' ? 'text-amber-600 dark:text-amber-400' : ''}"
                >
                  <span class="shrink-0 w-14 text-neutral-400">{l.level}</span><span class="shrink-0 text-neutral-400">{l.source}</span><span class="break-all whitespace-pre-wrap">{l.message}</span>
                </div>
              {/each}
            </div>
          {:else if respPane === 'visualize' && visualHtml}
            <iframe title="Visualizer" class="flex-1 w-full border-0 bg-white dark:bg-[#161616]" sandbox="" srcdoc={visualHtml}></iframe>
          {:else if respPane === 'request'}
            <div class="flex-1 overflow-auto p-3 wb-scroll select-text space-y-3 text-[12px] font-mono">
              {#if sentRequest}
                <p><span class="font-bold {METHOD_TEXT[sentRequest.method]}">{sentRequest.method}</span> <span class="break-all">{sentRequest.url}</span></p>
                <p class="font-sans text-[11.5px] text-neutral-500">Auth: {authSource.auth.type}{authSource.from !== 'request' ? ` (inherited from ${authFromLabel(authSource.from)})` : ''}</p>
                <table class="w-full">
                  <tbody>
                    {#each Object.entries(sentRequest.headers) as [k, v] (k)}
                      <tr class="border-b border-neutral-100 dark:border-neutral-800/60 align-top">
                        <td class="py-1 pr-4 text-neutral-500 whitespace-nowrap">{k}</td>
                        <td class="py-1 break-all">{v}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
                {#if sentRequest.multipart}
                  {#each sentRequest.multipart as f, i (i)}
                    <p><span class="text-neutral-500">{f.name}</span> = {f.file_path ? `@${f.file_path}` : f.value}</p>
                  {/each}
                {:else if sentRequest.bodyFile}
                  <p class="text-neutral-500">Body file: {sentRequest.bodyFile}</p>
                {:else if sentRequest.body}
                  <pre class="whitespace-pre-wrap break-all rounded-lg bg-neutral-50 dark:bg-white/[0.03] p-3">{sentRequest.body.length > 50000 ? sentRequest.body.slice(0, 50000) + '…' : sentRequest.body}</pre>
                {/if}
                <p class="font-sans text-[11px] text-neutral-400">Preview with current variables; pre-request scripts may change the request when it is sent.</p>
              {/if}
            </div>
          {:else if !resp}
            <div class="flex-1 flex flex-col items-center justify-center gap-3 text-neutral-400 p-6">
              <svg class="w-10 h-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              <div class="text-[12px] grid grid-cols-[auto_auto] gap-x-4 gap-y-1.5">
                <span>Send request</span><kbd class="wb-kbd">Ctrl Enter</kbd>
                <span>New tab</span><kbd class="wb-kbd">Ctrl T</kbd>
                <span>Reopen closed tab</span><kbd class="wb-kbd">Ctrl Shift T</kbd>
                <span>Switch tab</span><kbd class="wb-kbd">Ctrl Tab</kbd>
                <span>Save</span><kbd class="wb-kbd">Ctrl S</kbd>
                <span>Focus URL</span><kbd class="wb-kbd">Ctrl L</kbd>
                <span>Toggle sidebar</span><kbd class="wb-kbd">Ctrl B</kbd>
              </div>
            </div>
          {:else if resp.error}
            <div class="flex-1 p-4">
              <div class="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 space-y-1.5 select-text">
                <p class="text-[13px] font-semibold text-rose-600 dark:text-rose-400">
                  {resp.statusText === 'Cancelled' ? 'Request cancelled' : resp.statusText === 'Skipped' ? 'Request skipped' : 'Could not send request'}
                </p>
                <p class="text-[12px] font-mono text-neutral-600 dark:text-neutral-300 break-all">{resp.error}</p>
                {#if /certificate|tls|ssl/i.test(resp.error) && wb.settings.sslVerify}
                  <button class="wb-link !text-brand-600 dark:!text-brand-400" onclick={() => wb.updateSettings({ sslVerify: false })}>Disable SSL verification and retry →</button>
                {/if}
              </div>
            </div>
          {:else if respPane === 'body'}
            <div class="flex items-center gap-2 px-3 py-1.5 text-[11.5px] border-b border-neutral-100 dark:border-neutral-800/60">
              <div class="wb-seg !p-0.5">
                <button class={!respRaw ? 'is-active' : ''} onclick={() => (respRaw = false)}>Pretty</button>
                <button class={respRaw ? 'is-active' : ''} onclick={() => (respRaw = true)}>Raw</button>
              </div>
              <span class="text-neutral-400 font-mono truncate">{contentType.split(';')[0] || respLang}</span>
              {#if resp.truncated}<span class="text-amber-500">truncated (restored from history)</span>{/if}
              <div class="ml-auto flex items-center gap-2">
                <button
                  class="wb-link {respWrap ? '!text-brand-500' : ''}"
                  onclick={() => {
                    respWrap = !respWrap;
                    savePref('wrap', respWrap);
                  }}>Wrap</button
                >
                <button
                  class="wb-link"
                  onclick={async () => {
                    await copyText(respBody);
                    showToast('Response copied', 'success');
                  }}>Copy</button
                >
              </div>
            </div>
            <div class="flex-1 min-h-0">
              <CodeEditor value={respBody} language={respRaw ? 'text' : respLang} readonly wrap={respWrap} />
            </div>
          {:else if respPane === 'headers'}
            <div class="flex-1 overflow-auto p-3 wb-scroll select-text">
              <table class="w-full text-[12px] font-mono">
                <tbody>
                  {#each Object.entries(resp.headers).sort(([a], [b]) => a.localeCompare(b)) as [k, v] (k)}
                    <tr class="border-b border-neutral-100 dark:border-neutral-800/60 align-top">
                      <td class="py-1.5 pr-4 text-neutral-500 whitespace-nowrap">{k}</td>
                      <td class="py-1.5 break-all">{v}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </section>
</div>

<!-- ================= Overlays ================= -->
{#if tabMenu}
  {@const menu = tabMenu}
  <button class="fixed inset-0 z-40 cursor-default" aria-label="Close menu" onclick={() => (tabMenu = null)} oncontextmenu={(e) => { e.preventDefault(); tabMenu = null; }}></button>
  <div class="wb-pop fixed z-50 w-52 p-1" style="left:{Math.min(menu.x, innerWidth - 220)}px; top:{Math.min(menu.y, innerHeight - 260)}px">
    {#each [
      ['Close', () => wb.closeTab(menu.id)],
      ['Close others', () => wb.closeOtherTabs(menu.id)],
      ['Close to the right', () => wb.closeTabsToRight(menu.id)],
      ['Close all', () => wb.closeAllTabs()],
      ['—', null],
      ['Keep open (pin)', () => wb.pinTab(menu.id)],
      ['Duplicate', () => wb.duplicateTab(menu.id)],
      ['Reveal in sidebar', () => revealInSidebar(menu.id)]
    ] as [label, fn], i (i)}
      {#if fn}
        <button
          class="wb-menu-item"
          onclick={() => {
            (fn as () => void)();
            tabMenu = null;
          }}>{label}</button
        >
      {:else}
        <div class="my-1 h-px bg-neutral-200 dark:bg-neutral-800"></div>
      {/if}
    {/each}
  </div>
{/if}

{#if scopeTarget}
  <ScopeSettingsModal target={scopeTarget} onclose={() => (scopeTarget = null)} />
{/if}

{#if curlOpen}
  {@const code = toCurl(req, colId)}
  <div class="wb-overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && (curlOpen = false)} onkeydown={(e) => e.key === 'Escape' && (curlOpen = false)}>
    <div class="wb-modal w-[min(720px,92vw)]">
      <div class="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
        <h3 class="text-[13px] font-semibold">cURL</h3>
        <div class="flex gap-2">
          <button
            class="wb-btn"
            onclick={async () => {
              await copyText(code);
              showToast('cURL copied', 'success');
            }}>Copy</button
          >
          <button class="wb-btn" onclick={() => (curlOpen = false)}>Close</button>
        </div>
      </div>
      <div class="h-[50vh]"><CodeEditor value={code} readonly wrap /></div>
    </div>
  </div>
{/if}

{#if importOpen}
  <div class="wb-overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && (importOpen = false)} onkeydown={(e) => e.key === 'Escape' && (importOpen = false)}>
    <div class="wb-modal w-[min(640px,92vw)] p-5 space-y-4">
      <div>
        <h3 class="text-[14px] font-semibold">Import</h3>
        <p class="text-[12px] text-neutral-500 mt-0.5">
          Postman collection v2.0/v2.1 (folders, variables, auth, scripts), Postman environment or globals, Insomnia v4 export, Bruno <code>.bru</code> files, CAPost JSON, or a cURL command.
        </p>
      </div>
      {#if importWarnings.length}
        <div class="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
          <p class="text-[12px] font-semibold text-amber-600 dark:text-amber-400">Imported, with notes:</p>
          {#each importWarnings as w (w)}
            <p class="text-[12px] text-neutral-600 dark:text-neutral-300">• {w}</p>
          {/each}
        </div>
      {/if}
      <label
        class="flex flex-col items-center justify-center gap-1.5 h-28 rounded-xl border-2 border-dashed border-neutral-300 dark:border-neutral-700 hover:border-brand-500/60 hover:bg-brand-500/[0.03] cursor-pointer transition-colors text-[12.5px] text-neutral-500"
      >
        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" /></svg>
        Choose files (.json, .bru) — you can select several at once
        <input type="file" multiple accept=".json,.bru,application/json" class="hidden" onchange={(e) => importFiles((e.target as HTMLInputElement).files)} />
      </label>
      <textarea
        bind:value={importText}
        rows="6"
        spellcheck="false"
        placeholder="…or paste JSON / cURL here"
        class="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent p-3 font-mono text-[12px] outline-none focus:border-brand-500/50"
      ></textarea>
      <div class="flex justify-end gap-2">
        <button class="wb-btn" onclick={() => (importOpen = false)}>{importWarnings.length ? 'Done' : 'Cancel'}</button>
        <button class="wb-btn wb-btn-primary" disabled={!importText.trim()} onclick={importPasted}>Import</button>
      </div>
    </div>
  </div>
{/if}
