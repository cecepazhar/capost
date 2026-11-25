<script lang="ts">
  // Lazy-loaded CodeMirror 6 editor. CodeMirror virtualises rendering, so
  // multi-megabyte responses stay smooth. Loaded on first use to keep startup fast.
  import { onMount, onDestroy } from 'svelte';

  type Lang = 'json' | 'xml' | 'html' | 'javascript' | 'text';

  let {
    value = '',
    language = 'text' as Lang,
    readonly = false,
    placeholder = '',
    wrap = false,
    onchange = (_v: string) => {}
  }: {
    value?: string;
    language?: Lang;
    readonly?: boolean;
    placeholder?: string;
    wrap?: boolean;
    onchange?: (v: string) => void;
  } = $props();

  let host: HTMLDivElement;
  let view: any = null;
  let cm: any = null;
  let langC: any, themeC: any, wrapC: any, roC: any;
  let observer: MutationObserver | null = null;
  let applying = false;
  let fallback = $state(true);

  const isDark = () => document.documentElement.classList.contains('dark');

  async function langExt(l: Lang) {
    switch (l) {
      case 'json':
        return (await import('@codemirror/lang-json')).json();
      case 'xml':
        return (await import('@codemirror/lang-xml')).xml();
      case 'html':
        return (await import('@codemirror/lang-html')).html();
      case 'javascript':
        return (await import('@codemirror/lang-javascript')).javascript();
      default:
        return [];
    }
  }

  function themeExt() {
    const { EditorView } = cm.view;
    const base = EditorView.theme(
      {
        '&': { height: '100%', fontSize: '12.5px', backgroundColor: 'transparent' },
        '.cm-scroller': {
          fontFamily: 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace',
          lineHeight: '1.6'
        },
        '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: isDark() ? '#525252' : '#a3a3a3' },
        '.cm-activeLineGutter, .cm-activeLine': { backgroundColor: isDark() ? '#ffffff08' : '#0000000a' },
        '&.cm-focused': { outline: 'none' },
        '.cm-placeholder': { color: '#a3a3a3' }
      },
      { dark: isDark() }
    );
    return isDark() ? [cm.oneDark, base] : [cm.syntaxHighlighting(cm.defaultHighlightStyle), base];
  }

  onMount(async () => {
    const [view_, state_, commands, language_, search, oneDarkMod] = await Promise.all([
      import('@codemirror/view'),
      import('@codemirror/state'),
      import('@codemirror/commands'),
      import('@codemirror/language'),
      import('@codemirror/search'),
      import('@codemirror/theme-one-dark')
    ]);
    if (!host) return;
    cm = {
      view: view_,
      state: state_,
      oneDark: oneDarkMod.oneDark,
      syntaxHighlighting: language_.syntaxHighlighting,
      defaultHighlightStyle: language_.defaultHighlightStyle
    };
    const { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, placeholder: ph } = view_;
    const { EditorState, Compartment } = state_;
    langC = new Compartment();
    themeC = new Compartment();
    wrapC = new Compartment();
    roC = new Compartment();

    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          commands.history(),
          language_.foldGutter(),
          language_.bracketMatching(),
          language_.indentOnInput(),
          search.highlightSelectionMatches(),
          keymap.of([
            ...commands.defaultKeymap,
            ...commands.historyKeymap,
            ...language_.foldKeymap,
            ...search.searchKeymap,
            commands.indentWithTab
          ]),
          ph(placeholder),
          langC.of(await langExt(language)),
          themeC.of(themeExt()),
          wrapC.of(wrap ? EditorView.lineWrapping : []),
          roC.of([EditorState.readOnly.of(readonly), EditorView.editable.of(!readonly)]),
          EditorView.updateListener.of((u: any) => {
            if (u.docChanged && !applying) onchange(u.state.doc.toString());
          })
        ]
      })
    });
    fallback = false;

    observer = new MutationObserver(() => {
      view?.dispatch({ effects: themeC.reconfigure(themeExt()) });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  });

  onDestroy(() => {
    observer?.disconnect();
    view?.destroy();
  });

  // external value -> editor
  $effect(() => {
    const v = value ?? '';
    if (!view) return;
    const cur = view.state.doc.toString();
    if (cur === v) return;
    applying = true;
    view.dispatch({ changes: { from: 0, to: cur.length, insert: v } });
    applying = false;
  });

  $effect(() => {
    const l = language;
    if (!view) return;
    langExt(l).then((ext) => view?.dispatch({ effects: langC.reconfigure(ext) }));
  });

  $effect(() => {
    const w = wrap;
    if (!view) return;
    view.dispatch({ effects: wrapC.reconfigure(w ? cm.view.EditorView.lineWrapping : []) });
  });
</script>

<div class="relative h-full min-h-0 w-full overflow-hidden">
  <div bind:this={host} class="h-full w-full"></div>
  {#if fallback}
    <pre class="absolute inset-0 m-0 p-3 overflow-auto text-[12.5px] font-mono text-neutral-500 whitespace-pre">{value.length > 20000 ? value.slice(0, 20000) + '…' : value}</pre>
  {/if}
</div>
