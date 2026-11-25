// Reactive Workbench Store for CAPost Studio (Svelte 5 runes)
// Multi-tab request editor, collections (with folders, variables, auth and scripts),
// environments, globals and history. Persistence is debounced + idle-scheduled so
// typing never blocks on JSON.stringify.
import { executeHttpRequest, type HttpResponsePayload } from '$lib/api/http';
import type { MultipartField } from '$lib/generated/commands';
import { dynamicVar } from '$lib/scripting/dynamicVars';
import { md5Hex } from '$lib/scripting/crypto-lite.js';
import {
  hasCode,
  runScripts,
  type ScriptLog,
  type ScriptVars,
  type TestResult,
  type VarMap,
  type VisualizerOutput
} from '$lib/scripting/runtime';

export type { TestResult, ScriptLog };

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export interface ParamRow {
  id: string;
  enabled: boolean;
  key: string;
  value: string;
  description?: string;
  /** form-data only */
  type?: 'text' | 'file';
  /** form-data file path */
  src?: string;
  contentType?: string;
}

export type HeaderRow = ParamRow;

export type AuthType = 'inherit' | 'none' | 'bearer' | 'basic' | 'apikey' | 'digest' | 'oauth2';

export interface AuthConfig {
  type: AuthType;
  bearerToken: string;
  basicUser: string;
  basicPass: string;
  apiKeyName: string;
  apiKeyValue: string;
  apiKeyAddTo: 'header' | 'query';
  oauth2Token?: string;
  oauth2Prefix?: string;
  oauth2AddTo?: 'header' | 'query';
}

export type BodyType = 'none' | 'json' | 'text' | 'xml' | 'form-data' | 'urlencoded' | 'binary';

export interface BodyConfig {
  type: BodyType;
  rawJson: string;
  rawText?: string;
  formData: ParamRow[];
  urlencoded: ParamRow[];
  binaryPath?: string;
}

export interface WorkbenchRequest {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  params: ParamRow[];
  headers: HeaderRow[];
  auth: AuthConfig;
  body: BodyConfig;
  /** Folder path inside its collection, e.g. ["Auth", "Tokens"]. */
  folder?: string[];
  pathVars?: ParamRow[];
  preRequestScript?: string;
  testScript?: string;
  description?: string;
  /** Postman's protocolProfileBehavior.disableBodyPruning */
  sendBodyOnGet?: boolean;
}

export interface WorkbenchResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  elapsedMs: number;
  sizeBytes: number;
  timestamp: number;
  error?: string;
  truncated?: boolean;
  url?: string;
}

export interface FolderMeta {
  auth?: AuthConfig;
  preRequestScript?: string;
  testScript?: string;
  description?: string;
}

export interface CollectionItem {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  requests: WorkbenchRequest[];
  variables?: EnvironmentVariable[];
  auth?: AuthConfig;
  preRequestScript?: string;
  testScript?: string;
  /** Folder metadata keyed by folder path joined with "/". */
  folders?: Record<string, FolderMeta>;
}

export interface EnvironmentVariable {
  id: string;
  enabled: boolean;
  key: string;
  value: string;
}

export interface EnvironmentItem {
  id: string;
  name: string;
  description?: string;
  variables: EnvironmentVariable[];
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  method: HttpMethod;
  url: string;
  status: number;
  statusText: string;
  elapsedMs: number;
  sizeBytes: number;
  request: WorkbenchRequest;
  response?: WorkbenchResponse;
}

export interface RunReport {
  tests: TestResult[];
  logs: ScriptLog[];
  errors: { source: string; message: string }[];
  /** pm.visualizer.set(template, data) from a post-response script */
  visualizer?: VisualizerOutput | null;
}

export interface RequestTab {
  id: string;
  /** Collection request (or `hist:<id>`) this tab was opened from. */
  sourceId: string | null;
  sourceCollectionId: string | null;
  request: WorkbenchRequest;
  response: WorkbenchResponse | null;
  sending: boolean;
  dirty: boolean;
  /** Preview tabs are replaced by the next single-click open (VS Code style). */
  preview?: boolean;
  report?: RunReport | null;
}

export interface WorkbenchSettings {
  sslVerify: boolean;
  followRedirects: boolean;
  timeoutMs: number;
}

export const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}

const STORAGE_KEY_TABS = 'capost_tabs_v2';
const STORAGE_KEY_ACTIVE_TAB = 'capost_active_tab_v2';
const STORAGE_KEY_COLS = 'capost_collections_v1';
const STORAGE_KEY_ENVS = 'capost_environments_v1';
const STORAGE_KEY_ACTIVE_ENV = 'capost_active_env_id_v1';
const STORAGE_KEY_HIST = 'capost_history_v1';
const STORAGE_KEY_GLOBALS = 'capost_globals_v1';
const STORAGE_KEY_SETTINGS = 'capost_wb_settings_v1';

/** Response bodies above this size are not persisted (kept in memory only). */
const PERSIST_BODY_LIMIT = 256 * 1024;
const HISTORY_LIMIT = 200;

export function emptyAuth(type: AuthType = 'none'): AuthConfig {
  return {
    type,
    bearerToken: '',
    basicUser: '',
    basicPass: '',
    apiKeyName: 'X-API-Key',
    apiKeyValue: '',
    apiKeyAddTo: 'header',
    oauth2Token: '',
    oauth2Prefix: 'Bearer',
    oauth2AddTo: 'header'
  };
}

export function newRequest(partial: Partial<WorkbenchRequest> = {}): WorkbenchRequest {
  return {
    id: uid(),
    name: 'Untitled Request',
    method: 'GET',
    url: '',
    params: [],
    headers: [],
    auth: emptyAuth(),
    body: { type: 'none', rawJson: '', rawText: '', formData: [], urlencoded: [], binaryPath: '' },
    pathVars: [],
    preRequestScript: '',
    testScript: '',
    ...partial
  };
}

function normalizeRequest(r: Partial<WorkbenchRequest> | undefined): WorkbenchRequest {
  const base = newRequest();
  if (!r) return base;
  return {
    ...base,
    ...r,
    id: r.id || base.id,
    params: Array.isArray(r.params) ? r.params : [],
    headers: Array.isArray(r.headers) ? r.headers : [],
    pathVars: Array.isArray(r.pathVars) ? r.pathVars : [],
    auth: { ...emptyAuth(), ...(r.auth ?? {}) },
    body: { ...base.body, ...(r.body ?? {}) }
  };
}

const DEFAULT_ENVIRONMENTS: EnvironmentItem[] = [
  {
    id: 'env_local',
    name: 'HTTPBin',
    description: 'Public echo service for quick testing',
    variables: [{ id: uid(), enabled: true, key: 'base_url', value: 'https://httpbin.org' }]
  }
];

const DEFAULT_COLLECTIONS: CollectionItem[] = [
  {
    id: 'col_httpbin',
    name: 'HTTPBin Examples',
    description: 'Echo endpoints for verifying requests',
    createdAt: Date.now(),
    requests: [
      newRequest({
        name: 'Get echo',
        url: '{{base_url}}/get',
        headers: [{ id: uid(), enabled: true, key: 'Accept', value: 'application/json' }],
        testScript:
          "pm.test('Status is 200', () => pm.response.to.have.status(200));\npm.test('Echoes the URL', () => {\n  pm.expect(pm.response.json().url).to.include('/get');\n});"
      }),
      newRequest({
        name: 'Post JSON',
        method: 'POST',
        url: '{{base_url}}/post',
        body: { type: 'json', rawJson: '{\n  "hello": "world"\n}', rawText: '', formData: [], urlencoded: [] }
      }),
      newRequest({ name: 'Delayed 2s', url: '{{base_url}}/delay/2' }),
      newRequest({ name: 'Status 404', url: '{{base_url}}/status/404' })
    ]
  }
];

function loadJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ---------- Debounced persistence ----------
const pending = new Map<string, () => unknown>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flushNow() {
  flushTimer = null;
  if (typeof localStorage === 'undefined') return;
  for (const [key, getter] of pending) {
    try {
      localStorage.setItem(key, JSON.stringify(getter()));
    } catch {
      /* quota / private mode — ignore */
    }
  }
  pending.clear();
}

function persist(key: string, getter: () => unknown) {
  pending.set(key, getter);
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    const ric = (globalThis as any).requestIdleCallback as
      | ((cb: () => void, o?: { timeout: number }) => void)
      | undefined;
    if (ric) ric(flushNow, { timeout: 1000 });
    else flushNow();
  }, 400);
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushNow);
}

function slimResponse(r: WorkbenchResponse | null | undefined): WorkbenchResponse | undefined {
  if (!r) return undefined;
  if (r.body.length <= PERSIST_BODY_LIMIT) return r;
  return { ...r, body: r.body.slice(0, PERSIST_BODY_LIMIT), truncated: true };
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

// ---------- State ----------
function initialTabs(): RequestTab[] {
  const saved = loadJson<RequestTab[] | null>(STORAGE_KEY_TABS, null);
  if (saved && saved.length) {
    const seen = new Set<string>();
    const restored = saved
      .map((t) => ({
        ...t,
        request: normalizeRequest(t.request),
        response: t.response ?? null,
        sending: false,
        report: null
      }))
      // drop duplicate tabs of the same source and untouched empty tabs
      .filter((t) => {
        if (t.sourceId) {
          if (seen.has(t.sourceId)) return false;
          seen.add(t.sourceId);
        }
        return t.dirty || t.sourceId || t.request.url.trim() !== '';
      });
    if (restored.length) return restored;
  }
  return [
    {
      id: uid(),
      sourceId: null,
      sourceCollectionId: null,
      request: newRequest(),
      response: null,
      sending: false,
      dirty: false
    }
  ];
}

const bootTabs = initialTabs();
const bootActive = loadJson<string>(STORAGE_KEY_ACTIVE_TAB, '');
let tabs = $state<RequestTab[]>(bootTabs);
let activeTabId = $state<string>(bootTabs.some((t) => t.id === bootActive) ? bootActive : bootTabs[0].id);

let collections = $state<CollectionItem[]>(
  loadJson<CollectionItem[]>(STORAGE_KEY_COLS, DEFAULT_COLLECTIONS).map((c) => ({
    ...c,
    requests: (c.requests ?? []).map(normalizeRequest)
  }))
);
let environments = $state<EnvironmentItem[]>(loadJson<EnvironmentItem[]>(STORAGE_KEY_ENVS, DEFAULT_ENVIRONMENTS));
let activeEnvironmentId = $state<string | null>(loadJson<string | null>(STORAGE_KEY_ACTIVE_ENV, 'env_local'));
let history = $state<HistoryEntry[]>(loadJson<HistoryEntry[]>(STORAGE_KEY_HIST, []));
let globals = $state<EnvironmentVariable[]>(loadJson<EnvironmentVariable[]>(STORAGE_KEY_GLOBALS, []));
let settings = $state<WorkbenchSettings>({
  sslVerify: true,
  followRedirects: true,
  timeoutMs: 60000,
  ...loadJson<Partial<WorkbenchSettings>>(STORAGE_KEY_SETTINGS, {})
});
let closedStack: WorkbenchRequest[] = [];

const abortTokens = new Map<string, number>();

function persistTabs() {
  persist(STORAGE_KEY_TABS, () =>
    tabs.map((t) => ({ ...t, sending: false, report: null, response: slimResponse(t.response) ?? null }))
  );
  persist(STORAGE_KEY_ACTIVE_TAB, () => activeTabId);
}
const persistCollections = () => persist(STORAGE_KEY_COLS, () => collections);
const persistEnvs = () => persist(STORAGE_KEY_ENVS, () => environments);
const persistHistory = () => persist(STORAGE_KEY_HIST, () => history);
const persistGlobals = () => persist(STORAGE_KEY_GLOBALS, () => globals);

// ---------- Variables ----------
const VAR_RE = /\{\{([^{}]+?)\}\}/g;

function rowsToMap(rows: EnvironmentVariable[] | undefined, into: Map<string, string>) {
  for (const v of rows ?? []) if (v.enabled && v.key.trim()) into.set(v.key.trim(), v.value);
}

/** Variables in Postman precedence: globals < collection < environment < local. */
export function resolveVars(collectionId: string | null | undefined, local?: VarMap): Map<string, string> {
  const m = new Map<string, string>();
  rowsToMap(globals, m);
  if (collectionId) rowsToMap(collections.find((c) => c.id === collectionId)?.variables, m);
  rowsToMap(environments.find((e) => e.id === activeEnvironmentId)?.variables, m);
  if (local) for (const [k, v] of Object.entries(local)) m.set(k, stringifyVar(v));
  return m;
}

export function interpolateWith(text: string, vars: Map<string, string>): string {
  if (!text || text.indexOf('{{') === -1) return text ?? '';
  let out = text;
  // resolve nested references ({{a}} whose value contains {{b}})
  for (let pass = 0; pass < 4 && out.indexOf('{{') >= 0; pass++) {
    const next = out.replace(VAR_RE, (whole, raw: string) => {
      const name = raw.trim();
      return vars.get(name) ?? dynamicVar(name) ?? whole;
    });
    if (next === out) break;
    out = next;
  }
  return out;
}

export function variableNames(text: string): string[] {
  const out: string[] = [];
  for (const m of (text ?? '').matchAll(VAR_RE)) out.push(m[1].trim());
  return out;
}

function stringifyVar(v: unknown): string {
  if (v === null || v === undefined) return '';
  return typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v);
}

function ensureScheme(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (/^(localhost|127\.0\.0\.1|\[::1\])/i.test(url)) return `http://${url}`;
  return `https://${url}`;
}

const PATH_VAR_RE = /\/:([A-Za-z_][\w-]*)/g;

/** Keep `req.pathVars` in sync with `:name` segments of the URL path, preserving values. */
export function syncPathVars(req: WorkbenchRequest) {
  const path = req.url.split(/[?#]/)[0].replace(/^[a-z]+:\/\/[^/]*/i, '');
  const names = [...path.matchAll(PATH_VAR_RE)].map((m) => m[1]);
  const prev = req.pathVars ?? [];
  if (names.length === prev.length && names.every((n, i) => prev[i].key === n)) return;
  req.pathVars = names.map((n) => prev.find((p) => p.key === n) ?? { id: uid(), enabled: true, key: n, value: '' });
}

function applyPathVars(url: string, pathVars: ParamRow[] | undefined): string {
  if (!pathVars?.length) return url;
  const qi = url.search(/[?#]/);
  const head = qi < 0 ? url : url.slice(0, qi);
  const tail = qi < 0 ? '' : url.slice(qi);
  const schemeHost = /^[a-z]+:\/\/[^/]*/i.exec(head)?.[0] ?? '';
  const path = head.slice(schemeHost.length).replace(PATH_VAR_RE, (whole, name: string) => {
    const pv = pathVars.find((p) => p.key === name);
    return pv && pv.value !== '' ? `/${pv.value}` : whole;
  });
  return schemeHost + path + tail;
}

// ---------- Auth inheritance ----------
export function folderKey(path: string[] | undefined): string {
  return (path ?? []).join('/');
}

export interface AuthSource {
  auth: AuthConfig;
  from: string; // 'request' | 'folder:<path>' | 'collection' | 'none'
}

export function effectiveAuth(req: WorkbenchRequest, collectionId: string | null | undefined): AuthSource {
  if (req.auth.type !== 'inherit') return { auth: req.auth, from: 'request' };
  const col = collections.find((c) => c.id === collectionId);
  if (col) {
    const path = req.folder ?? [];
    for (let i = path.length; i > 0; i--) {
      const key = path.slice(0, i).join('/');
      const a = col.folders?.[key]?.auth;
      if (a && a.type !== 'inherit') return { auth: a, from: `folder:${key}` };
    }
    if (col.auth && col.auth.type !== 'inherit') return { auth: col.auth, from: 'collection' };
  }
  return { auth: emptyAuth('none'), from: 'none' };
}

// ---------- Build ----------
export interface BuiltRequest {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  multipart?: MultipartField[];
  bodyFile?: string;
  digest?: { user: string; pass: string };
}

export function buildRequest(
  req: WorkbenchRequest,
  vars: Map<string, string> = resolveVars(null),
  auth: AuthConfig = req.auth
): BuiltRequest {
  const I = (s: string) => interpolateWith(s ?? '', vars);
  let url = ensureScheme(I(applyPathVars(req.url.trim(), req.pathVars)));

  const headers: Record<string, string> = {};
  for (const h of req.headers) if (h.enabled && h.key.trim()) headers[I(h.key.trim())] = I(h.value);
  const hasHeader = (n: string) => Object.keys(headers).some((k) => k.toLowerCase() === n.toLowerCase());

  const extraQuery: [string, string][] = [];
  for (const p of req.params) if (p.enabled && p.key.trim()) extraQuery.push([I(p.key.trim()), I(p.value)]);

  let digest: BuiltRequest['digest'];
  const a = auth;
  if (a.type === 'bearer' && a.bearerToken.trim()) {
    if (!hasHeader('authorization')) headers['Authorization'] = `Bearer ${I(a.bearerToken.trim())}`;
  } else if (a.type === 'basic') {
    const raw = `${I(a.basicUser)}:${I(a.basicPass)}`;
    if (!hasHeader('authorization')) headers['Authorization'] = `Basic ${btoa(unescape(encodeURIComponent(raw)))}`;
  } else if (a.type === 'apikey' && a.apiKeyName.trim()) {
    if (a.apiKeyAddTo === 'query') extraQuery.push([I(a.apiKeyName.trim()), I(a.apiKeyValue)]);
    else headers[I(a.apiKeyName.trim())] = I(a.apiKeyValue);
  } else if (a.type === 'oauth2' && (a.oauth2Token ?? '').trim()) {
    const token = I((a.oauth2Token ?? '').trim());
    if (a.oauth2AddTo === 'query') extraQuery.push(['access_token', token]);
    else if (!hasHeader('authorization')) headers['Authorization'] = `${a.oauth2Prefix ?? 'Bearer'} ${token}`.trim();
  } else if (a.type === 'digest') {
    digest = { user: I(a.basicUser), pass: I(a.basicPass) };
  }

  if (extraQuery.length) {
    const qs = extraQuery.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    const hashIdx = url.indexOf('#');
    const base = hashIdx < 0 ? url : url.slice(0, hashIdx);
    url = base + (base.includes('?') ? '&' : '?') + qs + (hashIdx < 0 ? '' : url.slice(hashIdx));
  }

  let body: string | null = null;
  let multipart: MultipartField[] | undefined;
  let bodyFile: string | undefined;
  const bodyAllowed = req.method !== 'HEAD' && (req.method !== 'GET' || req.sendBodyOnGet);
  if (bodyAllowed) {
    const b = req.body;
    if (b.type === 'json' && b.rawJson.trim()) {
      body = I(b.rawJson);
      if (!hasHeader('content-type')) headers['Content-Type'] = 'application/json';
    } else if ((b.type === 'text' || b.type === 'xml') && (b.rawText ?? '').length) {
      body = I(b.rawText ?? '');
      if (!hasHeader('content-type')) headers['Content-Type'] = b.type === 'xml' ? 'application/xml' : 'text/plain';
    } else if (b.type === 'urlencoded') {
      const p = new URLSearchParams();
      for (const r of b.urlencoded) if (r.enabled && r.key.trim()) p.append(I(r.key.trim()), I(r.value));
      body = p.toString();
      if (!hasHeader('content-type')) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } else if (b.type === 'form-data') {
      multipart = b.formData
        .filter((r) => r.enabled && r.key.trim())
        .map((r) =>
          r.type === 'file'
            ? { name: I(r.key.trim()), file_path: r.src ?? '', content_type: r.contentType || null }
            : { name: I(r.key.trim()), value: I(r.value), content_type: r.contentType || null }
        );
      for (const k of Object.keys(headers)) if (k.toLowerCase() === 'content-type' && /multipart/i.test(headers[k])) delete headers[k];
    } else if (b.type === 'binary' && b.binaryPath) {
      bodyFile = b.binaryPath;
    }
  }
  return { method: req.method, url, headers, body, multipart, bodyFile, digest };
}

// ---------- Digest auth (RFC 7616, MD5 / qop=auth) ----------
function digestHeader(challenge: string, method: string, url: string, user: string, pass: string): string | null {
  if (!/^\s*digest/i.test(challenge)) return null;
  const params: Record<string, string> = {};
  for (const m of challenge.matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]*))/g)) params[m[1].toLowerCase()] = m[2] ?? m[3];
  const { realm = '', nonce = '', opaque, qop, algorithm = 'MD5' } = params;
  let uri = '/';
  try {
    const u = new URL(url);
    uri = u.pathname + u.search;
  } catch {}
  const cnonce = Math.random().toString(16).slice(2, 18);
  const nc = '00000001';
  let ha1 = md5Hex(`${user}:${realm}:${pass}`);
  if (/sess/i.test(algorithm)) ha1 = md5Hex(`${ha1}:${nonce}:${cnonce}`);
  const ha2 = md5Hex(`${method}:${uri}`);
  const useQop = qop ? (qop.split(',').map((s) => s.trim()).includes('auth') ? 'auth' : qop.split(',')[0].trim()) : '';
  const response = useQop ? md5Hex(`${ha1}:${nonce}:${nc}:${cnonce}:${useQop}:${ha2}`) : md5Hex(`${ha1}:${nonce}:${ha2}`);
  const parts = [`username="${user}"`, `realm="${realm}"`, `nonce="${nonce}"`, `uri="${uri}"`, `algorithm=${algorithm}`, `response="${response}"`];
  if (useQop) parts.push(`qop=${useQop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  if (opaque) parts.push(`opaque="${opaque}"`);
  return `Digest ${parts.join(', ')}`;
}

// ---------- Transport ----------
async function transport(b: BuiltRequest, extraHeaders?: Record<string, string>): Promise<WorkbenchResponse> {
  const started = performance.now();
  const headers = { ...b.headers, ...(extraHeaders ?? {}) };
  let payload: HttpResponsePayload;
  try {
    payload = await executeHttpRequest({
      method: b.method,
      url: b.url,
      headers,
      body: b.body,
      multipart: b.multipart ?? null,
      body_file: b.bodyFile ?? null,
      insecure: !settings.sslVerify,
      follow_redirects: settings.followRedirects,
      timeout_ms: settings.timeoutMs
    });
  } catch (ipcErr: any) {
    const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    if (inTauri) throw ipcErr;
    // Browser preview fallback (dev only): files are not available here.
    // browsers refuse GET/HEAD bodies; the desktop transport sends them
    let body: BodyInit | undefined = b.method === 'GET' || b.method === 'HEAD' ? undefined : (b.body ?? undefined);
    if (b.multipart) {
      const fd = new FormData();
      for (const f of b.multipart) fd.append(f.name, f.value ?? '');
      body = fd;
    }
    const r = await fetch(b.url, { method: b.method, headers, body, redirect: settings.followRedirects ? 'follow' : 'manual' });
    const text = await r.text();
    const hs: Record<string, string> = {};
    r.headers.forEach((v, k) => (hs[k] = v));
    payload = {
      status: r.status,
      status_text: r.statusText || (r.ok ? 'OK' : 'Error'),
      headers: hs,
      body: text,
      elapsed_ms: Math.round(performance.now() - started),
      size_bytes: new Blob([text]).size,
      url: r.url
    };
  }
  return {
    status: payload.status,
    statusText: payload.status_text,
    headers: payload.headers,
    body: payload.body,
    elapsedMs: payload.elapsed_ms,
    sizeBytes: payload.size_bytes,
    timestamp: Date.now(),
    url: payload.url
  };
}

// ---------- Scripts plumbing ----------
function rowsToObj(rows: EnvironmentVariable[] | undefined): VarMap {
  const o: VarMap = {};
  for (const v of rows ?? []) if (v.enabled && v.key.trim()) o[v.key.trim()] = v.value;
  return o;
}

/** Write a script's variable changes back into a variable list (add / update / delete). */
function applyVarChanges(rows: EnvironmentVariable[], before: VarMap, after: VarMap): boolean {
  let changed = false;
  for (const [k, v] of Object.entries(after)) {
    const sv = stringifyVar(v);
    if (k in before && stringifyVar(before[k]) === sv) continue;
    const row = rows.find((r) => r.key.trim() === k);
    if (row) {
      row.value = sv;
      row.enabled = true;
    } else rows.push({ id: uid(), enabled: true, key: k, value: sv });
    changed = true;
  }
  for (const k of Object.keys(before)) {
    if (!(k in after)) {
      const i = rows.findIndex((r) => r.key.trim() === k && r.enabled);
      if (i >= 0) {
        rows.splice(i, 1);
        changed = true;
      }
    }
  }
  return changed;
}

function scriptChain(req: WorkbenchRequest, col: CollectionItem | undefined, kind: 'pre' | 'test') {
  const pick = (o: { preRequestScript?: string; testScript?: string } | undefined) =>
    kind === 'pre' ? o?.preRequestScript : o?.testScript;
  const out: { source: string; code: string }[] = [];
  if (col) {
    if (hasCode(pick(col))) out.push({ source: 'Collection', code: pick(col)! });
    const path = req.folder ?? [];
    for (let i = 1; i <= path.length; i++) {
      const meta = col.folders?.[path.slice(0, i).join('/')];
      if (hasCode(pick(meta))) out.push({ source: `Folder ${path.slice(0, i).join(' / ')}`, code: pick(meta)! });
    }
  }
  if (hasCode(pick(req))) out.push({ source: 'Request', code: pick(req)! });
  return out;
}

function headersToList(h: Record<string, string>) {
  return Object.entries(h).map(([key, value]) => ({ key, value }));
}

export interface ExecuteResult {
  response: WorkbenchResponse;
  report: RunReport;
  built: BuiltRequest | null;
}

/**
 * Full Postman-style pipeline: pre-request scripts (collection → folders → request),
 * variable resolution, auth inheritance, send (with Digest challenge), test scripts.
 */
async function executeRequest(
  input: WorkbenchRequest,
  collectionId: string | null,
  opts: { iteration?: number; isCancelled?: () => boolean } = {}
): Promise<ExecuteResult> {
  const req = normalizeRequest(clone(input));
  const col = collections.find((c) => c.id === collectionId);
  const env = environments.find((e) => e.id === activeEnvironmentId);
  const report: RunReport = { tests: [], logs: [], errors: [] };
  const local: VarMap = {};

  const snapshotVars = (): ScriptVars => ({
    environment: rowsToObj(env?.variables),
    collection: rowsToObj(col?.variables),
    globals: rowsToObj(globals),
    local: { ...local }
  });
  const commitVars = (before: ScriptVars, after: ScriptVars) => {
    if (env && applyVarChanges(env.variables, before.environment, after.environment)) persistEnvs();
    if (col) {
      col.variables ??= [];
      if (applyVarChanges(col.variables, before.collection, after.collection)) persistCollections();
    }
    if (applyVarChanges(globals, before.globals, after.globals)) persistGlobals();
    for (const k of Object.keys(local)) delete local[k];
    Object.assign(local, after.local);
  };
  const info = { requestName: req.name, requestId: req.id, iteration: opts.iteration ?? 0 };
  const authSrc = effectiveAuth(req, collectionId);

  // 1. pre-request scripts
  const pre = scriptChain(req, col, 'pre');
  if (pre.length) {
    const before = snapshotVars();
    const unresolved = buildRequest(req, new Map(), authSrc.auth);
    const rawUrl = req.url + (req.params.some((p) => p.enabled && p.key) ? '?' + req.params.filter((p) => p.enabled && p.key).map((p) => `${p.key}=${p.value}`).join('&') : '');
    const reqHeaders = req.headers.filter((h) => h.enabled && h.key).map((h) => ({ key: h.key, value: h.value }));
    const out = await runScripts({
      kind: 'pre',
      scripts: pre,
      vars: before,
      request: { method: req.method, url: rawUrl, headers: reqHeaders, body: unresolved.body, bodyMode: req.body.type },
      info,
      envName: env?.name
    });
    report.logs.push(...out.logs);
    report.errors.push(...out.errors);
    report.tests.push(...out.tests);
    commitVars(before, out.vars);
    // apply request mutations made by the script
    if (out.request) {
      if (out.request.url !== rawUrl) {
        req.url = out.request.url;
        req.params = [];
        splitUrlParams(req);
      }
      req.headers = out.request.headers.map((h) => ({ id: uid(), enabled: !h.disabled, key: h.key, value: h.value }));
      if (out.request.body !== unresolved.body && out.request.body != null && (req.body.type === 'json' || req.body.type === 'text' || req.body.type === 'xml')) {
        if (req.body.type === 'json') req.body.rawJson = out.request.body;
        else req.body.rawText = out.request.body;
      }
    }
    if (out.skip) {
      return {
        response: { status: 0, statusText: 'Skipped', headers: {}, body: '', elapsedMs: 0, sizeBytes: 0, timestamp: Date.now(), error: 'Request skipped by pm.execution.skipRequest()' },
        report,
        built: null
      };
    }
  }
  if (opts.isCancelled?.()) throw new CancelledError();

  // 2. build + send
  const vars = resolveVars(collectionId, local);
  const unresolvedNames = new Set<string>();
  for (const n of [...variableNames(req.url), ...req.headers.flatMap((h) => (h.enabled ? variableNames(h.value) : []))])
    if (!vars.has(n) && !n.startsWith('$')) unresolvedNames.add(n);
  if (unresolvedNames.size)
    report.logs.push({ level: 'warn', message: `Unresolved variable(s): ${[...unresolvedNames].map((n) => `{{${n}}}`).join(', ')}`, source: 'CAPost' });

  let built: BuiltRequest | null = null;
  let response: WorkbenchResponse;
  try {
    built = buildRequest(req, vars, authSrc.auth);
    response = await transport(built);
    if (built.digest && response.status === 401) {
      const challenge = Object.entries(response.headers).find(([k]) => k.toLowerCase() === 'www-authenticate')?.[1] ?? '';
      const h = digestHeader(challenge, built.method, built.url, built.digest.user, built.digest.pass);
      if (h) response = await transport(built, { Authorization: h });
    }
  } catch (err: any) {
    if (err instanceof CancelledError) throw err;
    const msg = typeof err === 'string' ? err : (err?.message ?? err?.detail ?? JSON.stringify(err));
    response = {
      status: 0,
      statusText: 'Error',
      headers: {},
      body: '',
      elapsedMs: 0,
      sizeBytes: 0,
      timestamp: Date.now(),
      error: msg || 'Request failed'
    };
  }
  if (opts.isCancelled?.()) throw new CancelledError();

  // 3. test scripts
  const post = scriptChain(req, col, 'test');
  if (post.length && !response.error) {
    const before = snapshotVars();
    const out = await runScripts({
      kind: 'test',
      scripts: post,
      vars: before,
      request: { method: req.method, url: built?.url ?? req.url, headers: headersToList(built?.headers ?? {}), body: built?.body ?? null },
      response: {
        code: response.status,
        status: response.statusText,
        headers: headersToList(response.headers),
        body: response.body,
        responseTime: response.elapsedMs,
        size: response.sizeBytes
      },
      info,
      envName: env?.name
    });
    report.logs.push(...out.logs);
    report.errors.push(...out.errors);
    report.tests.push(...out.tests);
    report.visualizer = out.visualizer ?? null;
    commitVars(before, out.vars);
  }
  return { response, report, built };
}

class CancelledError extends Error {
  constructor() {
    super('cancelled');
  }
}

// ---------- cURL ----------
function shQuote(s: string) {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function toCurl(req: WorkbenchRequest, collectionId: string | null = null): string {
  const b = buildRequest(req, resolveVars(collectionId), effectiveAuth(req, collectionId).auth);
  const parts = [`curl -X ${b.method} ${shQuote(b.url)}`];
  for (const [k, v] of Object.entries(b.headers)) parts.push(`  -H ${shQuote(`${k}: ${v}`)}`);
  if (b.multipart) for (const f of b.multipart) parts.push(`  -F ${shQuote(f.file_path ? `${f.name}=@${f.file_path}` : `${f.name}=${f.value ?? ''}`)}`);
  else if (b.bodyFile) parts.push(`  --data-binary ${shQuote('@' + b.bodyFile)}`);
  else if (b.body != null) parts.push(`  --data-raw ${shQuote(b.body)}`);
  if (b.digest) parts.push(`  --digest -u ${shQuote(`${b.digest.user}:${b.digest.pass}`)}`);
  if (!settings.sslVerify) parts.push('  --insecure');
  if (settings.followRedirects) parts.push('  -L');
  return parts.join(' \\\n');
}

function tokenizeShell(input: string): string[] {
  const out: string[] = [];
  let cur = '';
  let i = 0;
  let quote: '"' | "'" | null = null;
  let has = false;
  const s = input.replace(/\\\r?\n/g, ' ').replace(/\^\r?\n/g, ' ');
  while (i < s.length) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < s.length) cur += s[++i];
      else cur += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      has = true;
    } else if (c === '\\' && i + 1 < s.length) {
      cur += s[++i];
      has = true;
    } else if (/\s/.test(c)) {
      if (has || cur) out.push(cur);
      cur = '';
      has = false;
    } else {
      cur += c;
      has = true;
    }
    i++;
  }
  if (has || cur) out.push(cur);
  return out;
}

export function parseCurl(cmd: string): WorkbenchRequest | null {
  const tokens = tokenizeShell(cmd.trim());
  if (!tokens.length || tokens[0].toLowerCase() !== 'curl') return null;
  const req = newRequest({ name: 'Imported cURL' });
  let method: string | null = null;
  const data: string[] = [];
  const form: ParamRow[] = [];
  let digest = false;
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    const next = () => tokens[++i] ?? '';
    if (t === '-X' || t === '--request') method = next().toUpperCase();
    else if (t === '-H' || t === '--header') {
      const h = next();
      const idx = h.indexOf(':');
      if (idx > 0) req.headers.push({ id: uid(), enabled: true, key: h.slice(0, idx).trim(), value: h.slice(idx + 1).trim() });
    } else if (['-d', '--data', '--data-raw', '--data-binary', '--data-ascii', '--data-urlencode'].includes(t)) data.push(next());
    else if (t === '-F' || t === '--form') {
      const f = next();
      const idx = f.indexOf('=');
      if (idx > 0) {
        const v = f.slice(idx + 1);
        form.push(
          v.startsWith('@')
            ? { id: uid(), enabled: true, key: f.slice(0, idx), value: '', type: 'file', src: v.slice(1) }
            : { id: uid(), enabled: true, key: f.slice(0, idx), value: v, type: 'text' }
        );
      }
    } else if (t === '-u' || t === '--user') {
      const [u, ...p] = next().split(':');
      req.auth = { ...req.auth, type: 'basic', basicUser: u, basicPass: p.join(':') };
    } else if (t === '--digest') digest = true;
    else if (t === '-I' || t === '--head') method = 'HEAD';
    else if (t === '--url') req.url = next();
    else if (['-A', '--user-agent'].includes(t)) req.headers.push({ id: uid(), enabled: true, key: 'User-Agent', value: next() });
    else if (['-b', '--cookie'].includes(t)) req.headers.push({ id: uid(), enabled: true, key: 'Cookie', value: next() });
    else if (['-o', '--output', '-m', '--max-time', '--connect-timeout', '-e', '--referer', '-x', '--proxy'].includes(t)) next();
    else if (!t.startsWith('-') && !req.url) req.url = t;
  }
  if (digest && req.auth.type === 'basic') req.auth.type = 'digest';
  if (form.length) {
    req.body.type = 'form-data';
    req.body.formData = form;
  } else if (data.length) {
    const joined = data.join('&');
    const ct = req.headers.find((h) => h.key.toLowerCase() === 'content-type')?.value ?? '';
    const looksJson = /^\s*[[{]/.test(joined);
    if (ct.includes('json') || looksJson) {
      req.body.type = 'json';
      req.body.rawJson = joined;
    } else if (ct.includes('x-www-form-urlencoded') || (!ct && /^[^=\s]+=/.test(joined))) {
      req.body.type = 'urlencoded';
      req.body.urlencoded = [...new URLSearchParams(joined)].map(([k, v]) => ({ id: uid(), enabled: true, key: k, value: v }));
    } else {
      req.body.type = 'text';
      req.body.rawText = joined;
    }
  }
  req.method = ((method ?? (data.length || form.length ? 'POST' : 'GET')) as HttpMethod) || 'GET';
  if (!METHODS.includes(req.method)) req.method = 'GET';
  if (req.method === 'GET' && req.body.type !== 'none') req.sendBodyOnGet = true;
  splitUrlParams(req);
  syncPathVars(req);
  try {
    req.name = `${req.method} ${new URL(ensureScheme(req.url)).pathname}`;
  } catch {
    /* keep default */
  }
  return req;
}

/** Move query string from the URL into the params table. */
export function splitUrlParams(req: WorkbenchRequest) {
  const qi = req.url.indexOf('?');
  if (qi < 0) return;
  const qs = req.url.slice(qi + 1);
  req.url = req.url.slice(0, qi);
  for (const part of qs.split('&')) {
    if (!part) continue;
    const [k, ...v] = part.split('=');
    const dec = (s: string) => {
      if (s.includes('{{')) return s;
      try {
        return decodeURIComponent(s.replace(/\+/g, ' '));
      } catch {
        return s;
      }
    };
    req.params.push({ id: uid(), enabled: true, key: dec(k), value: dec(v.join('=')) });
  }
}

// ---------- Importers (Postman v2.x, Insomnia v4, Bruno .bru, CAPost) ----------
function kv(list: any[] | undefined): ParamRow[] {
  return (Array.isArray(list) ? list : [])
    .filter((x) => x && (x.key ?? x.name) !== undefined && (x.key ?? x.name) !== null)
    .map((x) => ({
      id: uid(),
      enabled: !x.disabled,
      key: String(x.key ?? x.name),
      value: x.value === undefined || x.value === null ? '' : String(x.value),
      description: typeof x.description === 'string' ? x.description : x.description?.content
    }));
}

function textOf(d: any): string {
  if (!d) return '';
  if (typeof d === 'string') return d;
  return d.content ?? '';
}

function scriptOf(events: any[] | undefined, listen: 'prerequest' | 'test'): string {
  const ev = (events ?? []).find((e) => e?.listen === listen && !e?.disabled);
  const exec = ev?.script?.exec;
  if (!exec) return '';
  return Array.isArray(exec) ? exec.join('\n') : String(exec);
}

function postmanAuth(a: any, warnings: Set<string>): AuthConfig {
  if (a === undefined || a === null) return emptyAuth('inherit');
  if (!a.type || a.type === 'noauth') return emptyAuth('none');
  const get = (arr: any, key: string): string => {
    const v = Array.isArray(arr) ? arr.find((x: any) => x.key === key)?.value : arr?.[key];
    return v === undefined || v === null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  };
  const auth = emptyAuth('none');
  switch (a.type) {
    case 'bearer':
      return { ...auth, type: 'bearer', bearerToken: get(a.bearer, 'token') };
    case 'basic':
      return { ...auth, type: 'basic', basicUser: get(a.basic, 'username'), basicPass: get(a.basic, 'password') };
    case 'digest':
      return { ...auth, type: 'digest', basicUser: get(a.digest, 'username'), basicPass: get(a.digest, 'password') };
    case 'apikey':
      return {
        ...auth,
        type: 'apikey',
        apiKeyName: get(a.apikey, 'key') || 'X-API-Key',
        apiKeyValue: get(a.apikey, 'value'),
        apiKeyAddTo: get(a.apikey, 'in') === 'query' ? 'query' : 'header'
      };
    case 'oauth2':
      return {
        ...auth,
        type: 'oauth2',
        oauth2Token: get(a.oauth2, 'accessToken') || get(a.oauth2, 'access_token'),
        oauth2Prefix: get(a.oauth2, 'headerPrefix') || 'Bearer',
        oauth2AddTo: get(a.oauth2, 'addTokenTo') === 'queryParams' ? 'query' : 'header'
      };
    default:
      warnings.add(`Auth type "${a.type}" is not supported yet; those requests were set to No Auth.`);
      return auth;
  }
}

function postmanUrl(u: any): { url: string; params: ParamRow[]; pathVars: ParamRow[] } {
  if (u === undefined || u === null) return { url: '', params: [], pathVars: [] };
  if (typeof u === 'string') {
    const r = newRequest({ url: u });
    splitUrlParams(r);
    syncPathVars(r);
    return { url: r.url, params: r.params, pathVars: r.pathVars ?? [] };
  }
  let base = typeof u.raw === 'string' ? u.raw.split('?')[0].split('#')[0] : '';
  if (!base) {
    const host = Array.isArray(u.host) ? u.host.join('.') : (u.host ?? '');
    const path = Array.isArray(u.path) ? u.path.join('/') : (u.path ?? '');
    base = `${u.protocol ? u.protocol + '://' : ''}${host}${u.port ? ':' + u.port : ''}${path ? '/' + path : ''}`;
  }
  let params: ParamRow[];
  if (Array.isArray(u.query)) params = kv(u.query.map((q: any) => ({ ...q, key: q.key ?? '' })));
  else {
    const r = newRequest({ url: typeof u.raw === 'string' ? u.raw : base });
    splitUrlParams(r);
    params = r.params;
  }
  const tmp = newRequest({ url: base });
  syncPathVars(tmp);
  const declared = kv(u.variable);
  const pathVars = (tmp.pathVars ?? []).map((p) => {
    const d = declared.find((x) => x.key === p.key);
    return d ? { ...p, value: d.value, description: d.description } : p;
  });
  return { url: base, params, pathVars };
}

function importPostman(json: any, warnings: Set<string>): { collections: CollectionItem[]; environments: EnvironmentItem[] } {
  const col: CollectionItem = {
    id: uid(),
    name: json.info?.name ?? 'Postman Collection',
    description: textOf(json.info?.description),
    createdAt: Date.now(),
    requests: [],
    variables: (json.variable ?? [])
      .filter((v: any) => v && (v.key ?? v.id))
      .map((v: any) => ({ id: uid(), enabled: !v.disabled, key: String(v.key ?? v.id), value: v.value === undefined || v.value === null ? '' : typeof v.value === 'string' ? v.value : JSON.stringify(v.value) })),
    auth: json.auth ? postmanAuth(json.auth, warnings) : emptyAuth('none'),
    preRequestScript: scriptOf(json.event, 'prerequest'),
    testScript: scriptOf(json.event, 'test'),
    folders: {}
  };
  const walk = (items: any[], path: string[]) => {
    for (const it of items ?? []) {
      if (Array.isArray(it.item)) {
        const p = [...path, String(it.name ?? 'Folder')];
        col.folders![p.join('/')] = {
          auth: it.auth !== undefined && it.auth !== null ? postmanAuth(it.auth, warnings) : undefined,
          preRequestScript: scriptOf(it.event, 'prerequest'),
          testScript: scriptOf(it.event, 'test'),
          description: textOf(it.description)
        };
        walk(it.item, p);
        continue;
      }
      const r = typeof it.request === 'string' ? { url: it.request, method: 'GET' } : it.request;
      if (!r) continue;
      const { url, params, pathVars } = postmanUrl(r.url);
      const method = String(r.method ?? 'GET').toUpperCase() as HttpMethod;
      const req = newRequest({
        name: String(it.name ?? 'Request'),
        method: METHODS.includes(method) ? method : 'GET',
        url,
        params,
        pathVars,
        headers: typeof r.header === 'string' ? [] : kv(r.header),
        // auth normally lives in request.auth; some exporters put it on the item
        auth: postmanAuth(r.auth ?? it.auth, warnings),
        folder: path.length ? [...path] : undefined,
        preRequestScript: scriptOf(it.event, 'prerequest'),
        testScript: scriptOf(it.event, 'test'),
        description: textOf(r.description) || textOf(it.description),
        sendBodyOnGet: !!it.protocolProfileBehavior?.disableBodyPruning
      });
      if (!METHODS.includes(method)) warnings.add(`HTTP method ${method} is not supported; imported as GET.`);
      const b = r.body;
      if (b && !b.disabled) {
        if (b.mode === 'raw') {
          const lang = b.options?.raw?.language;
          const raw = typeof b.raw === 'string' ? b.raw : '';
          if (lang === 'json' || (!lang && /^\s*[[{]/.test(raw))) {
            req.body.type = 'json';
            req.body.rawJson = raw;
          } else if (raw) {
            req.body.type = lang === 'xml' ? 'xml' : 'text';
            req.body.rawText = raw;
          }
        } else if (b.mode === 'urlencoded') {
          req.body.type = 'urlencoded';
          req.body.urlencoded = kv(b.urlencoded);
        } else if (b.mode === 'formdata') {
          req.body.type = 'form-data';
          req.body.formData = (b.formdata ?? [])
            .filter((x: any) => x && x.key !== undefined)
            .map((x: any) => {
              const src = Array.isArray(x.src) ? x.src[0] : x.src;
              if (x.type === 'file') {
                if (!src) warnings.add('Some form-data file fields have no file path; pick the files again before sending.');
                return { id: uid(), enabled: !x.disabled, key: String(x.key), value: '', type: 'file' as const, src: src ?? '', contentType: x.contentType };
              }
              return { id: uid(), enabled: !x.disabled, key: String(x.key), value: x.value === undefined || x.value === null ? '' : String(x.value), type: 'text' as const, contentType: x.contentType };
            });
        } else if (b.mode === 'file') {
          req.body.type = 'binary';
          req.body.binaryPath = b.file?.src ?? '';
          if (!req.body.binaryPath) warnings.add('Some binary bodies have no file path; pick the files again before sending.');
        } else if (b.mode === 'graphql') {
          req.body.type = 'json';
          req.body.rawJson = JSON.stringify({ query: b.graphql?.query ?? '', variables: safeJson(b.graphql?.variables) }, null, 2);
        }
      }
      if (Array.isArray(it.response) && it.response.length) warnings.add('Saved response examples are not imported.');
      col.requests.push(req);
    }
  };
  walk(json.item ?? [], []);
  if (hasCode(col.preRequestScript) || hasCode(col.testScript) || col.requests.some((r) => hasCode(r.preRequestScript) || hasCode(r.testScript)))
    warnings.add('Scripts were imported and run in the CAPost sandbox (pm.* API). pm.sendRequest is not supported yet.');
  return { collections: [col], environments: [] };
}

function safeJson(s: any) {
  if (typeof s !== 'string') return s ?? {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

function importInsomnia(json: any): { collections: CollectionItem[]; environments: EnvironmentItem[] } {
  const res: any[] = json.resources ?? [];
  const ws = res.find((r) => r._type === 'workspace');
  const groups = new Map(res.filter((r) => r._type === 'request_group').map((g) => [g._id, g]));
  const pathOf = (pid: string): string[] => {
    const g = groups.get(pid);
    return g ? [...pathOf(g.parentId), g.name] : [];
  };
  const conv = (s: string) => (s ?? '').replace(/\{\{\s*_\.([\w.\-]+)\s*\}\}/g, '{{$1}}');
  const col: CollectionItem = { id: uid(), name: ws?.name ?? 'Insomnia Import', description: '', createdAt: Date.now(), requests: [], folders: {} };
  for (const r of res.filter((x) => x._type === 'request')) {
    const folder = pathOf(r.parentId);
    const method = String(r.method ?? 'GET').toUpperCase() as HttpMethod;
    const req = newRequest({
      name: r.name,
      method: METHODS.includes(method) ? method : 'GET',
      url: conv(r.url),
      params: kv(r.parameters).map((p) => ({ ...p, value: conv(p.value) })),
      headers: kv(r.headers).map((p) => ({ ...p, value: conv(p.value) })),
      folder: folder.length ? folder : undefined
    });
    splitUrlParams(req);
    syncPathVars(req);
    const a = r.authentication ?? {};
    if (a.type === 'bearer') req.auth = { ...req.auth, type: 'bearer', bearerToken: conv(a.token ?? '') };
    else if (a.type === 'basic') req.auth = { ...req.auth, type: 'basic', basicUser: conv(a.username ?? ''), basicPass: conv(a.password ?? '') };
    else if (a.type === 'digest') req.auth = { ...req.auth, type: 'digest', basicUser: conv(a.username ?? ''), basicPass: conv(a.password ?? '') };
    const b = r.body ?? {};
    if (b.mimeType?.includes('json')) {
      req.body.type = 'json';
      req.body.rawJson = conv(b.text ?? '');
    } else if (b.mimeType === 'application/x-www-form-urlencoded') {
      req.body.type = 'urlencoded';
      req.body.urlencoded = kv(b.params);
    } else if (b.mimeType === 'multipart/form-data') {
      req.body.type = 'form-data';
      req.body.formData = (b.params ?? []).map((p: any) =>
        p.type === 'file'
          ? { id: uid(), enabled: !p.disabled, key: p.name, value: '', type: 'file' as const, src: p.fileName ?? '' }
          : { id: uid(), enabled: !p.disabled, key: p.name, value: conv(p.value ?? ''), type: 'text' as const }
      );
    } else if (typeof b.text === 'string' && b.text) {
      req.body.type = 'text';
      req.body.rawText = conv(b.text);
    }
    col.requests.push(req);
  }
  const envs: EnvironmentItem[] = res
    .filter((x) => x._type === 'environment' && x.data && Object.keys(x.data).length)
    .map((e) => ({
      id: uid(),
      name: e.name ?? 'Environment',
      variables: Object.entries(e.data).map(([k, v]) => ({ id: uid(), enabled: true, key: k, value: typeof v === 'string' ? v : JSON.stringify(v) }))
    }));
  return { collections: [col], environments: envs };
}

/** Parse a single Bruno `.bru` file. */
export function parseBru(text: string, fallbackName = 'Bruno Request'): WorkbenchRequest | null {
  const blocks = new Map<string, string>();
  const re = /^([\w:\-]+)\s*\{\s*$([\s\S]*?)^\}\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) blocks.set(m[1], m[2]);
  const dict = (s: string | undefined): ParamRow[] =>
    (s ?? '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const disabled = l.startsWith('~');
        const line = disabled ? l.slice(1) : l;
        const idx = line.indexOf(':');
        return { id: uid(), enabled: !disabled, key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
      })
      .filter((r) => r.key);
  const methodKey = METHODS.map((x) => x.toLowerCase()).find((x) => blocks.has(x));
  if (!methodKey) return null;
  const http = Object.fromEntries(dict(blocks.get(methodKey)).map((r) => [r.key, r.value]));
  const meta = Object.fromEntries(dict(blocks.get('meta')).map((r) => [r.key, r.value]));
  const req = newRequest({
    name: meta.name || fallbackName,
    method: methodKey.toUpperCase() as HttpMethod,
    url: http.url ?? '',
    headers: dict(blocks.get('headers'))
  });
  const q = blocks.get('params:query') ?? blocks.get('query');
  if (q) {
    req.params = dict(q);
    req.url = req.url.split('?')[0];
  } else splitUrlParams(req);
  syncPathVars(req);
  const pp = dict(blocks.get('params:path'));
  for (const p of req.pathVars ?? []) p.value = pp.find((x) => x.key === p.key)?.value ?? p.value;
  const dedent = (s: string) => s.replace(/^\s{2}/gm, '').trim();
  if (blocks.has('body:json')) {
    req.body.type = 'json';
    req.body.rawJson = dedent(blocks.get('body:json')!);
  } else if (blocks.has('body:text') || blocks.has('body:xml')) {
    req.body.type = blocks.has('body:xml') ? 'xml' : 'text';
    req.body.rawText = dedent(blocks.get('body:xml') ?? blocks.get('body:text')!);
  } else if (blocks.has('body:form-urlencoded')) {
    req.body.type = 'urlencoded';
    req.body.urlencoded = dict(blocks.get('body:form-urlencoded'));
  } else if (blocks.has('body:multipart-form')) {
    req.body.type = 'form-data';
    req.body.formData = dict(blocks.get('body:multipart-form')).map((r) =>
      r.value.startsWith('@file(') ? { ...r, type: 'file' as const, src: r.value.slice(6, -1), value: '' } : { ...r, type: 'text' as const }
    );
  }
  const bearer = Object.fromEntries(dict(blocks.get('auth:bearer')).map((r) => [r.key, r.value]));
  const basic = Object.fromEntries(dict(blocks.get('auth:basic')).map((r) => [r.key, r.value]));
  const dg = Object.fromEntries(dict(blocks.get('auth:digest')).map((r) => [r.key, r.value]));
  if (bearer.token) req.auth = { ...req.auth, type: 'bearer', bearerToken: bearer.token };
  else if (basic.username) req.auth = { ...req.auth, type: 'basic', basicUser: basic.username, basicPass: basic.password ?? '' };
  else if (dg.username) req.auth = { ...req.auth, type: 'digest', basicUser: dg.username, basicPass: dg.password ?? '' };
  if (blocks.has('script:pre-request')) req.preRequestScript = dedent(blocks.get('script:pre-request')!).replace(/\bbru\./g, 'pm.');
  if (blocks.has('tests')) req.testScript = dedent(blocks.get('tests')!);
  return req;
}

export function parseBruEnv(text: string, name: string): EnvironmentItem | null {
  const m = /vars\s*\{([\s\S]*?)^\}/m.exec(text);
  if (!m) return null;
  const variables = m[1]
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const disabled = l.startsWith('~');
      const line = disabled ? l.slice(1) : l;
      const idx = line.indexOf(':');
      return { id: uid(), enabled: !disabled, key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
    });
  return { id: uid(), name, variables };
}

export interface ImportResult {
  collections: number;
  requests: number;
  environments: number;
  globals: number;
  warnings: string[];
}

// ---------- Public API ----------
function currentTab(): RequestTab {
  return tabs.find((t) => t.id === activeTabId) ?? tabs[0];
}

interface OpenOpts {
  preview?: boolean;
  response?: WorkbenchResponse | null;
}

function openTab(req?: WorkbenchRequest, source?: { id: string; collectionId: string | null }, opts: OpenOpts = {}): RequestTab {
  if (source) {
    const existing = tabs.find((t) => t.sourceId === source.id);
    if (existing) {
      if (!opts.preview) existing.preview = false;
      activeTabId = existing.id;
      persistTabs();
      return existing;
    }
  }
  const fresh: RequestTab = {
    id: uid(),
    sourceId: source?.id ?? null,
    sourceCollectionId: source?.collectionId ?? null,
    request: req ? normalizeRequest(clone(req)) : newRequest(),
    response: opts.response ?? null,
    sending: false,
    dirty: false,
    preview: !!opts.preview,
    report: null
  };
  // a preview open replaces the current (untouched) preview tab in place
  let previewIdx = opts.preview ? tabs.findIndex((t) => t.preview && !t.dirty && !t.sending) : -1;
  // an untouched blank tab is also recycled instead of being left behind
  const activeIdx0 = tabs.findIndex((t) => t.id === activeTabId);
  const cur = tabs[activeIdx0];
  if (previewIdx < 0 && req && cur && !cur.sourceId && !cur.dirty && !cur.sending && !cur.response && !cur.request.url.trim()) previewIdx = activeIdx0;
  if (previewIdx >= 0) {
    abortTokens.delete(tabs[previewIdx].id);
    tabs[previewIdx] = fresh;
  } else {
    const activeIdx = tabs.findIndex((t) => t.id === activeTabId);
    tabs.splice(activeIdx >= 0 ? activeIdx + 1 : tabs.length, 0, fresh);
  }
  const tab = tabs.find((t) => t.id === fresh.id)!;
  activeTabId = tab.id;
  persistTabs();
  return tab;
}

function removeTabs(ids: Set<string>) {
  const activeIdx = tabs.findIndex((t) => t.id === activeTabId);
  for (const t of tabs) {
    if (!ids.has(t.id)) continue;
    abortTokens.delete(t.id);
    if (t.request.url.trim() || t.dirty) closedStack.push(clone(t.request));
  }
  if (closedStack.length > 20) closedStack = closedStack.slice(-20);
  tabs = tabs.filter((t) => !ids.has(t.id));
  if (!tabs.length) {
    tabs.push({ id: uid(), sourceId: null, sourceCollectionId: null, request: newRequest(), response: null, sending: false, dirty: false });
  }
  if (!tabs.some((t) => t.id === activeTabId)) activeTabId = tabs[Math.min(Math.max(activeIdx, 0), tabs.length - 1)].id;
  persistTabs();
}

function findSourceCollection(tab: RequestTab): CollectionItem | undefined {
  return collections.find((c) => c.id === tab.sourceCollectionId);
}

export function getWorkbench() {
  const api = {
    // ----- tabs -----
    get tabs() {
      return tabs;
    },
    get activeTabId() {
      return activeTabId;
    },
    get activeTab(): RequestTab {
      return currentTab();
    },
    setActiveTab(id: string) {
      activeTabId = id;
      persistTabs();
    },
    newTab(req?: WorkbenchRequest, source?: { id: string; collectionId: string | null }, opts?: OpenOpts): RequestTab {
      return openTab(req, source, opts);
    },
    pinTab(id: string) {
      const t = tabs.find((x) => x.id === id);
      if (t?.preview) {
        t.preview = false;
        persistTabs();
      }
    },
    closeTab(id: string) {
      removeTabs(new Set([id]));
    },
    closeOtherTabs(id: string) {
      removeTabs(new Set(tabs.filter((t) => t.id !== id).map((t) => t.id)));
    },
    closeTabsToRight(id: string) {
      const i = tabs.findIndex((t) => t.id === id);
      removeTabs(new Set(tabs.slice(i + 1).map((t) => t.id)));
    },
    closeAllTabs() {
      removeTabs(new Set(tabs.map((t) => t.id)));
    },
    reopenClosedTab(): boolean {
      const r = closedStack.pop();
      if (!r) return false;
      openTab(r);
      return true;
    },
    cycleTab(step: 1 | -1) {
      const i = tabs.findIndex((t) => t.id === activeTabId);
      activeTabId = tabs[(i + step + tabs.length) % tabs.length].id;
      persistTabs();
    },
    duplicateTab(id: string) {
      const t = tabs.find((x) => x.id === id);
      if (!t) return;
      const copy = clone(t.request);
      copy.id = uid();
      copy.name = `${copy.name} copy`;
      openTab(copy);
    },
    markDirty(tab: RequestTab = currentTab()) {
      tab.dirty = true;
      tab.preview = false;
      persistTabs();
    },
    touch() {
      persistTabs();
    },

    // ----- legacy single-request API (used by other pages) -----
    get currentRequest() {
      return currentTab().request;
    },
    set currentRequest(val: WorkbenchRequest) {
      currentTab().request = normalizeRequest(val);
      persistTabs();
    },
    get currentResponse() {
      return currentTab().response;
    },
    set currentResponse(val: WorkbenchResponse | null) {
      currentTab().response = val;
      persistTabs();
    },
    get isSending() {
      return currentTab().sending;
    },
    loadRequest(req: WorkbenchRequest, collectionId?: string) {
      openTab(req, collectionId ? { id: req.id, collectionId } : undefined);
    },
    saveCurrentRequest() {
      persistTabs();
    },

    // ----- settings -----
    get settings() {
      return settings;
    },
    updateSettings(patch: Partial<WorkbenchSettings>) {
      Object.assign(settings, patch);
      persist(STORAGE_KEY_SETTINGS, () => settings);
    },

    // ----- variables -----
    get collections() {
      return collections;
    },
    get environments() {
      return environments;
    },
    get globals() {
      return globals;
    },
    saveGlobals() {
      persistGlobals();
    },
    get activeEnvironmentId() {
      return activeEnvironmentId;
    },
    get activeEnvironment(): EnvironmentItem | null {
      return environments.find((e) => e.id === activeEnvironmentId) || null;
    },
    get history() {
      return history;
    },
    setActiveEnvironment(id: string | null) {
      activeEnvironmentId = id;
      persist(STORAGE_KEY_ACTIVE_ENV, () => activeEnvironmentId);
    },
    variables(collectionId: string | null = currentTab().sourceCollectionId): Map<string, string> {
      return resolveVars(collectionId);
    },
    interpolate(text: string): string {
      return interpolateWith(text, resolveVars(currentTab().sourceCollectionId));
    },
    effectiveAuth(tab: RequestTab = currentTab()): AuthSource {
      return effectiveAuth(tab.request, tab.sourceCollectionId);
    },

    // ----- collections -----
    saveCollection(col: CollectionItem) {
      const idx = collections.findIndex((c) => c.id === col.id);
      if (idx >= 0) collections[idx] = col;
      else collections.unshift(col);
      persistCollections();
    },
    touchCollections() {
      persistCollections();
    },
    renameCollection(id: string, name: string) {
      const c = collections.find((x) => x.id === id);
      if (c) {
        c.name = name;
        persistCollections();
      }
    },
    deleteCollection(id: string) {
      collections = collections.filter((c) => c.id !== id);
      for (const t of tabs) if (t.sourceCollectionId === id) t.sourceCollectionId = null;
      persistCollections();
    },
    addRequestToCollection(colId: string, req: WorkbenchRequest): WorkbenchRequest | null {
      const col = collections.find((c) => c.id === colId);
      if (!col) return null;
      const r = { ...clone(req), id: uid() };
      col.requests.push(r);
      persistCollections();
      return col.requests[col.requests.length - 1];
    },
    deleteRequestFromCollection(colId: string, reqId: string) {
      const col = collections.find((c) => c.id === colId);
      if (col) {
        col.requests = col.requests.filter((r) => r.id !== reqId);
        persistCollections();
      }
    },
    renameFolder(colId: string, path: string[], name: string) {
      const col = collections.find((c) => c.id === colId);
      if (!col || !name.trim()) return;
      const oldKey = path.join('/');
      const depth = path.length;
      const renamed = [...path.slice(0, -1), name.trim()];
      for (const r of col.requests) {
        if (r.folder && r.folder.length >= depth && r.folder.slice(0, depth).join('/') === oldKey) r.folder = [...renamed, ...r.folder.slice(depth)];
      }
      if (col.folders) {
        const next: Record<string, FolderMeta> = {};
        for (const [k, v] of Object.entries(col.folders)) {
          if (k === oldKey || k.startsWith(oldKey + '/')) next[renamed.join('/') + k.slice(oldKey.length)] = v;
          else next[k] = v;
        }
        col.folders = next;
      }
      persistCollections();
    },
    deleteFolder(colId: string, path: string[]) {
      const col = collections.find((c) => c.id === colId);
      if (!col) return;
      const key = path.join('/');
      col.requests = col.requests.filter((r) => !(r.folder && (r.folder.join('/') === key || r.folder.join('/').startsWith(key + '/'))));
      if (col.folders) for (const k of Object.keys(col.folders)) if (k === key || k.startsWith(key + '/')) delete col.folders[k];
      persistCollections();
    },
    addFolder(colId: string, parent: string[], name: string): string[] | null {
      const col = collections.find((c) => c.id === colId);
      if (!col) return null;
      const p = [...parent, name];
      col.folders ??= {};
      col.folders[p.join('/')] ??= {};
      persistCollections();
      return p;
    },
    /** Save the tab into its source collection, or into `colId` as new. */
    saveTab(tab: RequestTab, colId?: string, folder?: string[]): boolean {
      if (tab.sourceId && tab.sourceCollectionId && !colId) {
        const col = findSourceCollection(tab);
        const idx = col?.requests.findIndex((r) => r.id === tab.sourceId) ?? -1;
        if (col && idx >= 0) {
          col.requests[idx] = { ...clone(tab.request), id: tab.sourceId, folder: col.requests[idx].folder };
          tab.dirty = false;
          persistCollections();
          persistTabs();
          return true;
        }
      }
      const target = colId ? collections.find((c) => c.id === colId) : undefined;
      if (!target) return false;
      const id = uid();
      target.requests.push({ ...clone(tab.request), id, folder });
      tab.sourceId = id;
      tab.sourceCollectionId = target.id;
      tab.dirty = false;
      tab.preview = false;
      persistCollections();
      persistTabs();
      return true;
    },

    saveEnvironment(env: EnvironmentItem) {
      const idx = environments.findIndex((e) => e.id === env.id);
      if (idx >= 0) environments[idx] = env;
      else environments.push(env);
      persistEnvs();
    },
    deleteEnvironment(id: string) {
      environments = environments.filter((e) => e.id !== id);
      if (activeEnvironmentId === id) {
        activeEnvironmentId = environments[0]?.id ?? null;
        persist(STORAGE_KEY_ACTIVE_ENV, () => activeEnvironmentId);
      }
      persistEnvs();
    },

    clearHistory() {
      history = [];
      persistHistory();
    },
    deleteHistoryEntry(id: string) {
      history = history.filter((h) => h.id !== id);
      persistHistory();
    },

    // ----- import -----
    importText(text: string, fileName = ''): ImportResult {
      const trimmed = text.replace(/^\uFEFF/, '').trim();
      const warnings = new Set<string>();
      const result: ImportResult = { collections: 0, requests: 0, environments: 0, globals: 0, warnings: [] };
      const done = () => ({ ...result, warnings: [...warnings] });
      const add = (cols: CollectionItem[], envs: EnvironmentItem[]) => {
        for (const c of cols) {
          collections.unshift(c);
          result.collections++;
          result.requests += c.requests.length;
        }
        for (const e of envs) {
          environments.push(e);
          result.environments++;
        }
        persistCollections();
        persistEnvs();
      };
      if (/^curl\s/i.test(trimmed)) {
        const r = parseCurl(trimmed);
        if (!r) throw new Error('Invalid cURL command');
        openTab(r);
        result.requests = 1;
        return done();
      }
      if (fileName.endsWith('.bru') || /^(meta|get|post|put|patch|delete)\s*\{/m.test(trimmed)) {
        const env = /^vars\s*\{/m.test(trimmed) && !/^(get|post|put|patch|delete)\s*\{/m.test(trimmed);
        if (env) {
          const e = parseBruEnv(trimmed, fileName.replace(/\.bru$/, '') || 'Bruno Env');
          if (e) add([], [e]);
          return done();
        }
        const r = parseBru(trimmed, fileName.replace(/\.bru$/, ''));
        if (!r) throw new Error('Unrecognised .bru file');
        add([{ id: uid(), name: 'Bruno Import', description: '', createdAt: Date.now(), requests: [r] }], []);
        return done();
      }
      let json: any;
      try {
        json = JSON.parse(trimmed);
      } catch {
        throw new Error('Unsupported file. Expected Postman/Insomnia/CAPost JSON, a .bru file, or a cURL command.');
      }
      const scope = json?._postman_variable_scope;
      if (json?.info && Array.isArray(json.item)) {
        const r = importPostman(json, warnings);
        add(r.collections, r.environments);
      } else if (scope === 'globals' || (Array.isArray(json?.values) && /global/i.test(json?.name ?? '') && scope !== 'environment')) {
        for (const v of json.values ?? []) {
          if (!v?.key) continue;
          const row = globals.find((g) => g.key === v.key);
          const value = v.value === undefined || v.value === null ? '' : String(v.value);
          if (row) row.value = value;
          else globals.push({ id: uid(), enabled: v.enabled !== false, key: v.key, value });
          result.globals++;
        }
        persistGlobals();
      } else if (Array.isArray(json?.values) && json?.name) {
        add([], [{ id: uid(), name: json.name, variables: json.values.filter((v: any) => v?.key).map((v: any) => ({ id: uid(), enabled: v.enabled !== false, key: v.key, value: v.value === undefined || v.value === null ? '' : String(v.value) })) }]);
      } else if (Array.isArray(json?.resources)) {
        const r = importInsomnia(json);
        add(r.collections, r.environments);
      } else if (json?.capost && Array.isArray(json.collections)) {
        add(
          json.collections.map((c: CollectionItem) => ({ ...c, id: uid(), requests: c.requests.map((r) => normalizeRequest({ ...r, id: uid() })) })),
          (json.environments ?? []).map((e: EnvironmentItem) => ({ ...e, id: uid() }))
        );
      } else if (json?.info && !json.item) {
        throw new Error('This looks like a Postman collection without requests (or a v1 export). Re-export it as Collection v2.1.');
      } else {
        throw new Error('Unrecognised JSON format.');
      }
      return done();
    },

    /** Export a collection as Postman v2.1 JSON (folders, variables, auth and scripts included). */
    exportPostman(colId: string): string {
      const col = collections.find((c) => c.id === colId);
      if (!col) return '';
      const rows = (r: ParamRow[]) => r.map((x) => ({ key: x.key, value: x.value, disabled: !x.enabled }));
      const authOut = (a: AuthConfig | undefined) => {
        if (!a || a.type === 'inherit') return undefined;
        switch (a.type) {
          case 'none':
            return { type: 'noauth' };
          case 'bearer':
            return { type: 'bearer', bearer: [{ key: 'token', value: a.bearerToken }] };
          case 'basic':
            return { type: 'basic', basic: [{ key: 'username', value: a.basicUser }, { key: 'password', value: a.basicPass }] };
          case 'digest':
            return { type: 'digest', digest: [{ key: 'username', value: a.basicUser }, { key: 'password', value: a.basicPass }] };
          case 'apikey':
            return { type: 'apikey', apikey: [{ key: 'key', value: a.apiKeyName }, { key: 'value', value: a.apiKeyValue }, { key: 'in', value: a.apiKeyAddTo }] };
          case 'oauth2':
            return { type: 'oauth2', oauth2: [{ key: 'accessToken', value: a.oauth2Token }, { key: 'headerPrefix', value: a.oauth2Prefix }, { key: 'addTokenTo', value: a.oauth2AddTo === 'query' ? 'queryParams' : 'header' }] };
        }
      };
      const events = (o: { preRequestScript?: string; testScript?: string } | undefined) => {
        const ev: any[] = [];
        if (hasCode(o?.preRequestScript)) ev.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: o!.preRequestScript!.split('\n') } });
        if (hasCode(o?.testScript)) ev.push({ listen: 'test', script: { type: 'text/javascript', exec: o!.testScript!.split('\n') } });
        return ev.length ? ev : undefined;
      };
      // Postman's own exports carry the URL split into protocol/host/port/path; its importer
      // and Newman both read those parts, so emit them alongside `raw`.
      const urlParts = (base: string) => {
        const out: { protocol?: string; host?: string[]; port?: string; path?: string[] } = {};
        let rest = base.split('#')[0];
        const proto = /^([a-z][a-z0-9+.-]*):\/\//i.exec(rest);
        if (proto) {
          out.protocol = proto[1];
          rest = rest.slice(proto[0].length);
        }
        if (!rest) return out;
        const slash = rest.indexOf('/');
        let host = slash >= 0 ? rest.slice(0, slash) : rest;
        const path = slash >= 0 ? rest.slice(slash + 1) : '';
        const port = /:(\d+|\{\{[^}]+\}\})$/.exec(host);
        if (port) {
          out.port = port[1];
          host = host.slice(0, port.index);
        }
        if (host) out.host = /\{\{/.test(host) ? [host] : host.split('.');
        if (slash >= 0) out.path = path.split('/');
        return out;
      };
      const reqItem = (r: WorkbenchRequest) => {
        const query = r.params.map((p) => (p.value !== '' ? `${p.key}=${p.value}` : p.key)).join('&');
        const b = r.body;
        const body =
          b.type === 'json'
            ? { mode: 'raw', raw: b.rawJson, options: { raw: { language: 'json' } } }
            : b.type === 'text' || b.type === 'xml'
              ? { mode: 'raw', raw: b.rawText ?? '', options: { raw: { language: b.type } } }
              : b.type === 'urlencoded'
                ? { mode: 'urlencoded', urlencoded: rows(b.urlencoded) }
                : b.type === 'form-data'
                  ? { mode: 'formdata', formdata: b.formData.map((x) => (x.type === 'file'
                        ? { key: x.key, type: 'file', src: x.src, contentType: x.contentType || undefined, disabled: !x.enabled }
                        : { key: x.key, value: x.value, type: 'text', contentType: x.contentType || undefined, disabled: !x.enabled })) }
                  : b.type === 'binary'
                    ? { mode: 'file', file: { src: b.binaryPath } }
                    : undefined;
        return {
          name: r.name,
          event: events(r),
          protocolProfileBehavior: r.sendBodyOnGet ? { disableBodyPruning: true } : undefined,
          request: {
            method: r.method,
            header: r.headers.map((x) => ({ key: x.key, value: x.value, type: 'text', disabled: x.enabled ? undefined : true })),
            url: {
              raw: query ? `${r.url}?${query}` : r.url,
              ...urlParts(r.url),
              query: r.params.length ? r.params.map((p) => ({ key: p.key, value: p.value, disabled: p.enabled ? undefined : true })) : undefined,
              variable: r.pathVars?.length ? r.pathVars.map((p) => ({ key: p.key, value: p.value })) : undefined
            },
            body,
            auth: authOut(r.auth),
            description: r.description || undefined
          },
          response: []
        };
      };
      // rebuild the folder tree, keeping the original order of folders and requests
      type Node = { name: string; children: Map<string, Node>; order: ({ node: Node } | { item: any })[]; path: string[] };
      const root: Node = { name: '', children: new Map(), order: [], path: [] };
      const nodeFor = (path: string[]) => {
        let n = root;
        for (let i = 0; i < path.length; i++) {
          if (!n.children.has(path[i])) {
            const child: Node = { name: path[i], children: new Map(), order: [], path: path.slice(0, i + 1) };
            n.children.set(path[i], child);
            n.order.push({ node: child });
          }
          n = n.children.get(path[i])!;
        }
        return n;
      };
      for (const r of col.requests) nodeFor(r.folder ?? []).order.push({ item: reqItem(r) });
      for (const k of Object.keys(col.folders ?? {})) nodeFor(k.split('/')); // empty folders last
      const emit = (n: Node): any[] =>
        n.order.map((e) => {
          if ('item' in e) return e.item;
          const c = e.node;
          const meta = col.folders?.[c.path.join('/')];
          return { name: c.name, item: emit(c), auth: authOut(meta?.auth), event: events(meta), description: meta?.description || undefined };
        });
      return JSON.stringify(
        {
          info: {
            _postman_id: crypto.randomUUID(),
            name: col.name,
            description: col.description || undefined,
            schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
          },
          item: emit(root),
          auth: authOut(col.auth),
          event: events(col),
          variable: (col.variables ?? []).map((v) => ({ key: v.key, value: v.value, disabled: !v.enabled }))
        },
        null,
        2
      );
    },

    /** Export an environment (or the globals when `envId` is 'globals') in Postman's format. */
    exportPostmanEnvironment(envId: string): string {
      const isGlobals = envId === 'globals';
      const env = isGlobals ? null : environments.find((e) => e.id === envId);
      if (!isGlobals && !env) return '';
      const vars = isGlobals ? globals : env!.variables;
      return JSON.stringify(
        {
          id: crypto.randomUUID(),
          name: isGlobals ? 'Globals' : env!.name,
          values: vars.filter((v) => v.key).map((v) => ({ key: v.key, value: v.value, type: 'default', enabled: v.enabled })),
          _postman_variable_scope: isGlobals ? 'globals' : 'environment',
          _postman_exported_at: new Date().toISOString(),
          _postman_exported_using: 'CAPost'
        },
        null,
        2
      );
    },

    // ----- send / cancel -----
    cancel(tab: RequestTab = currentTab()) {
      abortTokens.set(tab.id, (abortTokens.get(tab.id) ?? 0) + 1);
      tab.sending = false;
      tab.response = {
        status: 0,
        statusText: 'Cancelled',
        headers: {},
        body: '',
        elapsedMs: 0,
        sizeBytes: 0,
        timestamp: Date.now(),
        error: 'Request cancelled by user'
      };
    },

    async send(tab: RequestTab = currentTab()): Promise<WorkbenchResponse | null> {
      if (tab.sending) return null;
      const token = (abortTokens.get(tab.id) ?? 0) + 1;
      abortTokens.set(tab.id, token);
      const cancelled = () => abortTokens.get(tab.id) !== token;
      tab.sending = true;
      tab.report = null;
      const snapshot = clone(tab.request);
      let result: ExecuteResult;
      try {
        result = await executeRequest(snapshot, tab.sourceCollectionId, { isCancelled: cancelled });
      } catch (e) {
        if (e instanceof CancelledError) return null;
        throw e;
      } finally {
        if (!cancelled()) tab.sending = false;
      }
      if (cancelled()) return null;
      tab.response = result.response;
      tab.report = result.report;
      persistTabs();

      history.unshift({
        id: uid(),
        timestamp: result.response.timestamp,
        method: snapshot.method,
        url: result.built?.url ?? snapshot.url,
        status: result.response.status,
        statusText: result.response.statusText,
        elapsedMs: result.response.elapsedMs,
        sizeBytes: result.response.sizeBytes,
        request: snapshot,
        response: slimResponse(result.response)
      });
      if (history.length > HISTORY_LIMIT) history.length = HISTORY_LIMIT;
      persistHistory();
      return result.response;
    },

    /** Run a collection request headlessly (Runner): scripts, variables and auth included. */
    async runRequest(req: WorkbenchRequest, collectionId: string | null, iteration = 0): Promise<ExecuteResult> {
      return executeRequest(req, collectionId, { iteration });
    },

    /** Legacy alias. */
    async sendRequest(): Promise<WorkbenchResponse | null> {
      return api.send(currentTab());
    }
  };
  return api;
}
