// Minimal Handlebars subset for pm.visualizer templates:
// {{path}} (escaped), {{{path}}} (raw), {{#each list}}…{{/each}} with {{this}} / {{@index}} / {{@key}},
// {{#if path}}…{{else}}…{{/if}}, {{#unless path}}…{{/unless}}, {{#with path}}…{{/with}}.
// The result is shown in a sandboxed iframe without scripts.

type Ctx = { data: unknown; parent?: Ctx; index?: number; key?: string };

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function lookup(ctx: Ctx, path: string): unknown {
  path = path.trim();
  if (path === 'this' || path === '.') return ctx.data;
  if (path === '@index') return ctx.index;
  if (path === '@key') return ctx.key;
  let c: Ctx | undefined = ctx;
  while (path.startsWith('../')) {
    c = c?.parent;
    path = path.slice(3);
  }
  if (path.startsWith('this.')) path = path.slice(5);
  let v: any = c?.data;
  for (const part of path.split('.')) {
    if (v === null || v === undefined) return undefined;
    v = v[part];
  }
  return v;
}

const truthy = (v: unknown) => (Array.isArray(v) ? v.length > 0 : !!v);

type Node =
  | { t: 'text'; v: string }
  | { t: 'var'; path: string; raw: boolean }
  | { t: 'block'; kind: string; path: string; body: Node[]; inverse: Node[] };

function parse(tpl: string): Node[] {
  const re = /\{\{\{\s*([^}]+?)\s*\}\}\}|\{\{\s*([#/^]?)\s*(else\b)?\s*([^}]*?)\s*\}\}/g;
  const root: Node[] = [];
  const stack: { node: Extract<Node, { t: 'block' }>; target: Node[] }[] = [];
  let target = root;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tpl))) {
    if (m.index > last) target.push({ t: 'text', v: tpl.slice(last, m.index) });
    last = m.index + m[0].length;
    if (m[1] !== undefined) {
      target.push({ t: 'var', path: m[1], raw: true });
    } else if (m[2] === '#') {
      const [kind, ...rest] = m[4].split(/\s+/);
      const node = { t: 'block' as const, kind, path: rest.join(' '), body: [] as Node[], inverse: [] as Node[] };
      target.push(node);
      stack.push({ node, target });
      target = node.body;
    } else if (m[2] === '/') {
      const top = stack.pop();
      target = top ? top.target : root;
    } else if (m[3]) {
      const top = stack[stack.length - 1];
      if (top) target = top.node.inverse;
    } else if (m[4].startsWith('!')) {
      // comment
    } else {
      target.push({ t: 'var', path: m[4], raw: false });
    }
  }
  if (last < tpl.length) target.push({ t: 'text', v: tpl.slice(last) });
  return root;
}

function render(nodes: Node[], ctx: Ctx): string {
  let out = '';
  for (const n of nodes) {
    if (n.t === 'text') out += n.v;
    else if (n.t === 'var') {
      const v = lookup(ctx, n.path);
      const s = v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
      out += n.raw ? String(s ?? '') : esc(s);
    } else {
      const v = lookup(ctx, n.path);
      if (n.kind === 'each') {
        if (Array.isArray(v) && v.length) v.forEach((item, i) => (out += render(n.body, { data: item, parent: ctx, index: i })));
        else if (v && typeof v === 'object' && Object.keys(v).length)
          Object.entries(v).forEach(([k, item], i) => (out += render(n.body, { data: item, parent: ctx, index: i, key: k })));
        else out += render(n.inverse, ctx);
      } else if (n.kind === 'if') out += render(truthy(v) ? n.body : n.inverse, ctx);
      else if (n.kind === 'unless') out += render(!truthy(v) ? n.body : n.inverse, ctx);
      else if (n.kind === 'with') out += v ? render(n.body, { data: v, parent: ctx }) : render(n.inverse, ctx);
      else out += render(n.body, ctx);
    }
  }
  return out;
}

export function renderVisualizer(template: string, data: unknown, dark: boolean): string {
  let body: string;
  try {
    body = render(parse(template), { data });
  } catch (e: any) {
    body = `<pre style="color:#e11d48">Visualizer template error: ${esc(e?.message ?? e)}</pre>`;
  }
  const fg = dark ? '#e5e5e5' : '#171717';
  const bg = dark ? '#161616' : '#ffffff';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:12px;background:${bg};color:${fg};font:13px/1.5 ui-sans-serif,system-ui,sans-serif}
    table{border-collapse:collapse}td,th{border:1px solid ${dark ? '#333' : '#ddd'};padding:4px 8px;text-align:left}
    pre{white-space:pre-wrap;word-break:break-word}
  </style></head><body>${body}</body></html>`;
}
