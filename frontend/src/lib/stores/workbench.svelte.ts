// Reactive Workbench Store for CAPost Studio (Svelte 5 runes)
import { executeHttpRequest, type HttpResponsePayload } from '$lib/api/http';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export interface ParamRow {
  id: string;
  enabled: boolean;
  key: string;
  value: string;
  description?: string;
}

export interface HeaderRow {
  id: string;
  enabled: boolean;
  key: string;
  value: string;
  description?: string;
}

export type AuthType = 'none' | 'bearer' | 'basic' | 'apikey';

export interface AuthConfig {
  type: AuthType;
  bearerToken: string;
  basicUser: string;
  basicPass: string;
  apiKeyName: string;
  apiKeyValue: string;
  apiKeyAddTo: 'header' | 'query';
}

export type BodyType = 'none' | 'json' | 'form-data' | 'urlencoded';

export interface BodyConfig {
  type: BodyType;
  rawJson: string;
  formData: ParamRow[];
  urlencoded: ParamRow[];
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
}

export interface CollectionItem {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  requests: WorkbenchRequest[];
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

function uid(): string {
  return Math.random().toString(36).substring(2, 9);
}

const STORAGE_KEY_REQ = 'capost_current_request_v1';
const STORAGE_KEY_RESP = 'capost_current_response_v1';
const STORAGE_KEY_COLS = 'capost_collections_v1';
const STORAGE_KEY_ENVS = 'capost_environments_v1';
const STORAGE_KEY_ACTIVE_ENV = 'capost_active_env_id_v1';
const STORAGE_KEY_HIST = 'capost_history_v1';

const DEFAULT_REQUEST: WorkbenchRequest = {
  id: 'req_default',
  name: 'CAPost Workbench',
  method: 'GET',
  url: 'https://httpbin.org/get',
  params: [
    { id: uid(), enabled: true, key: 'client', value: 'capost' },
    { id: uid(), enabled: true, key: 'version', value: '0.1.0' },
    { id: uid(), enabled: false, key: 'debug', value: '1' }
  ],
  headers: [
    { id: uid(), enabled: true, key: 'Accept', value: 'application/json' },
    { id: uid(), enabled: false, key: 'X-Custom-Client', value: 'CAPost-Desktop' }
  ],
  auth: {
    type: 'none',
    bearerToken: '',
    basicUser: '',
    basicPass: '',
    apiKeyName: 'X-API-Key',
    apiKeyValue: '',
    apiKeyAddTo: 'header'
  },
  body: {
    type: 'none',
    rawJson: '{\n  "service": "CAPost Studio",\n  "status": "ready",\n  "founder": "Prof. Cecep"\n}',
    formData: [{ id: uid(), enabled: true, key: 'file_id', value: '1092' }],
    urlencoded: [{ id: uid(), enabled: true, key: 'grant_type', value: 'client_credentials' }]
  }
};

const DEFAULT_ENVIRONMENTS: EnvironmentItem[] = [
  {
    id: 'env_local',
    name: 'Local Dev (HTTPBin)',
    description: 'Local development mock server and testing sandbox',
    variables: [
      { id: uid(), enabled: true, key: 'base_url', value: 'https://httpbin.org' },
      { id: uid(), enabled: true, key: 'token', value: 'jwt_capost_local_token_9x' },
      { id: uid(), enabled: true, key: 'user_id', value: 'usr_cecep_99' }
    ]
  },
  {
    id: 'env_prod',
    name: 'Production (GitHub API)',
    description: 'Production public GitHub REST endpoints',
    variables: [
      { id: uid(), enabled: true, key: 'base_url', value: 'https://api.github.com' },
      { id: uid(), enabled: true, key: 'owner', value: 'cecepazhar' },
      { id: uid(), enabled: true, key: 'repo', value: 'capost' }
    ]
  }
];

const DEFAULT_COLLECTIONS: CollectionItem[] = [
  {
    id: 'col_httpbin',
    name: 'HTTPBin Testing Suite',
    description: 'Standard HTTP echo and test endpoints for REST verification',
    createdAt: Date.now() - 86400000 * 2,
    requests: [
      {
        id: uid(),
        name: 'GET Echo Request',
        method: 'GET',
        url: '{{base_url}}/get',
        params: [{ id: uid(), enabled: true, key: 'format', value: 'json' }],
        headers: [{ id: uid(), enabled: true, key: 'Accept', value: 'application/json' }],
        auth: {
          type: 'none',
          bearerToken: '',
          basicUser: '',
          basicPass: '',
          apiKeyName: 'X-API-Key',
          apiKeyValue: '',
          apiKeyAddTo: 'header'
        },
        body: { type: 'none', rawJson: '', formData: [], urlencoded: [] }
      },
      {
        id: uid(),
        name: 'POST JSON Data',
        method: 'POST',
        url: '{{base_url}}/post',
        params: [],
        headers: [
          { id: uid(), enabled: true, key: 'Content-Type', value: 'application/json' },
          { id: uid(), enabled: true, key: 'Accept', value: 'application/json' }
        ],
        auth: {
          type: 'none',
          bearerToken: '',
          basicUser: '',
          basicPass: '',
          apiKeyName: 'X-API-Key',
          apiKeyValue: '',
          apiKeyAddTo: 'header'
        },
        body: {
          type: 'json',
          rawJson: '{\n  "title": "CAPost Desktop Workbench",\n  "status": "published",\n  "tags": ["svelte5", "tauri2", "rest"]\n}',
          formData: [],
          urlencoded: []
        }
      },
      {
        id: uid(),
        name: 'PUT Update Record',
        method: 'PUT',
        url: '{{base_url}}/put',
        params: [{ id: uid(), enabled: true, key: 'id', value: '42' }],
        headers: [{ id: uid(), enabled: true, key: 'Content-Type', value: 'application/json' }],
        auth: {
          type: 'none',
          bearerToken: '',
          basicUser: '',
          basicPass: '',
          apiKeyName: 'X-API-Key',
          apiKeyValue: '',
          apiKeyAddTo: 'header'
        },
        body: {
          type: 'json',
          rawJson: '{\n  "name": "Updated Record 42",\n  "active": true\n}',
          formData: [],
          urlencoded: []
        }
      },
      {
        id: uid(),
        name: 'DELETE Purge Resource',
        method: 'DELETE',
        url: '{{base_url}}/delete',
        params: [{ id: uid(), enabled: true, key: 'force', value: 'true' }],
        headers: [],
        auth: {
          type: 'none',
          bearerToken: '',
          basicUser: '',
          basicPass: '',
          apiKeyName: 'X-API-Key',
          apiKeyValue: '',
          apiKeyAddTo: 'header'
        },
        body: { type: 'none', rawJson: '', formData: [], urlencoded: [] }
      }
    ]
  },
  {
    id: 'col_github',
    name: 'GitHub Public API',
    description: 'Explore GitHub public endpoints without authentication',
    createdAt: Date.now() - 86400000 * 5,
    requests: [
      {
        id: uid(),
        name: 'Zen of GitHub',
        method: 'GET',
        url: 'https://api.github.com/zen',
        params: [],
        headers: [{ id: uid(), enabled: true, key: 'User-Agent', value: 'CAPost-Client' }],
        auth: {
          type: 'none',
          bearerToken: '',
          basicUser: '',
          basicPass: '',
          apiKeyName: 'X-API-Key',
          apiKeyValue: '',
          apiKeyAddTo: 'header'
        },
        body: { type: 'none', rawJson: '', formData: [], urlencoded: [] }
      },
      {
        id: uid(),
        name: 'CAPost Repository',
        method: 'GET',
        url: 'https://api.github.com/repos/cecepazhar/capost',
        params: [],
        headers: [{ id: uid(), enabled: true, key: 'User-Agent', value: 'CAPost-Client' }],
        auth: {
          type: 'none',
          bearerToken: '',
          basicUser: '',
          basicPass: '',
          apiKeyName: 'X-API-Key',
          apiKeyValue: '',
          apiKeyAddTo: 'header'
        },
        body: { type: 'none', rawJson: '', formData: [], urlencoded: [] }
      }
    ]
  }
];

const DEFAULT_HISTORY: HistoryEntry[] = [
  {
    id: uid(),
    timestamp: Date.now() - 1000 * 60 * 12,
    method: 'GET',
    url: 'https://httpbin.org/get?client=capost',
    status: 200,
    statusText: 'OK',
    elapsedMs: 142,
    sizeBytes: 1840,
    request: {
      ...DEFAULT_REQUEST,
      url: 'https://httpbin.org/get?client=capost'
    },
    response: {
      status: 200,
      statusText: 'OK',
      headers: {
        'content-type': 'application/json',
        'server': 'gunicorn/19.9.0',
        'date': new Date().toUTCString()
      },
      body: JSON.stringify(
        {
          args: { client: 'capost' },
          headers: { Host: 'httpbin.org', 'User-Agent': 'CAPost/0.1.0-dev' },
          origin: '127.0.0.1',
          url: 'https://httpbin.org/get?client=capost'
        },
        null,
        2
      ),
      elapsedMs: 142,
      sizeBytes: 1840,
      timestamp: Date.now() - 1000 * 60 * 12
    }
  },
  {
    id: uid(),
    timestamp: Date.now() - 1000 * 60 * 45,
    method: 'POST',
    url: 'https://httpbin.org/post',
    status: 201,
    statusText: 'Created',
    elapsedMs: 288,
    sizeBytes: 2450,
    request: {
      ...DEFAULT_REQUEST,
      method: 'POST',
      url: 'https://httpbin.org/post'
    },
    response: {
      status: 201,
      statusText: 'Created',
      headers: {
        'content-type': 'application/json',
        'server': 'gunicorn/19.9.0'
      },
      body: JSON.stringify(
        {
          data: '{"service":"CAPost Studio","status":"ready"}',
          json: { service: 'CAPost Studio', status: 'ready' },
          url: 'https://httpbin.org/post'
        },
        null,
        2
      ),
      elapsedMs: 288,
      sizeBytes: 2450,
      timestamp: Date.now() - 1000 * 60 * 45
    }
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

function saveJson<T>(key: string, data: T) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

// Reactive Stores
let currentRequest = $state<WorkbenchRequest>(loadJson<WorkbenchRequest>(STORAGE_KEY_REQ, DEFAULT_REQUEST));
let currentResponse = $state<WorkbenchResponse | null>(loadJson<WorkbenchResponse | null>(STORAGE_KEY_RESP, null));
let isSending = $state(false);

let collections = $state<CollectionItem[]>(loadJson<CollectionItem[]>(STORAGE_KEY_COLS, DEFAULT_COLLECTIONS));
let environments = $state<EnvironmentItem[]>(loadJson<EnvironmentItem[]>(STORAGE_KEY_ENVS, DEFAULT_ENVIRONMENTS));
let activeEnvironmentId = $state<string | null>(loadJson<string | null>(STORAGE_KEY_ACTIVE_ENV, 'env_local'));
let history = $state<HistoryEntry[]>(loadJson<HistoryEntry[]>(STORAGE_KEY_HIST, DEFAULT_HISTORY));

export function getWorkbench() {
  return {
    get currentRequest() {
      return currentRequest;
    },
    set currentRequest(val: WorkbenchRequest) {
      currentRequest = val;
      saveJson(STORAGE_KEY_REQ, currentRequest);
    },
    get currentResponse() {
      return currentResponse;
    },
    set currentResponse(val: WorkbenchResponse | null) {
      currentResponse = val;
      saveJson(STORAGE_KEY_RESP, currentResponse);
    },
    get isSending() {
      return isSending;
    },
    get collections() {
      return collections;
    },
    get environments() {
      return environments;
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
      saveJson(STORAGE_KEY_ACTIVE_ENV, id);
    },

    interpolate(text: string): string {
      if (!text) return '';
      const active = environments.find((e) => e.id === activeEnvironmentId);
      if (!active) return text;

      let result = text;
      for (const v of active.variables) {
        if (v.enabled && v.key.trim()) {
          const pattern = new RegExp(`\\{\\{\\s*${v.key.trim()}\\s*\\}\\}`, 'g');
          result = result.replace(pattern, v.value);
        }
      }
      return result;
    },

    saveCurrentRequest() {
      saveJson(STORAGE_KEY_REQ, currentRequest);
    },

    loadRequest(req: WorkbenchRequest) {
      currentRequest = JSON.parse(JSON.stringify(req));
      saveJson(STORAGE_KEY_REQ, currentRequest);
    },

    saveCollection(col: CollectionItem) {
      const idx = collections.findIndex((c) => c.id === col.id);
      if (idx >= 0) {
        collections[idx] = col;
      } else {
        collections.unshift(col);
      }
      saveJson(STORAGE_KEY_COLS, collections);
    },

    deleteCollection(id: string) {
      collections = collections.filter((c) => c.id !== id);
      saveJson(STORAGE_KEY_COLS, collections);
    },

    addRequestToCollection(colId: string, req: WorkbenchRequest) {
      const col = collections.find((c) => c.id === colId);
      if (col) {
        col.requests.push({ ...req, id: uid() });
        saveJson(STORAGE_KEY_COLS, collections);
      }
    },

    deleteRequestFromCollection(colId: string, reqId: string) {
      const col = collections.find((c) => c.id === colId);
      if (col) {
        col.requests = col.requests.filter((r) => r.id !== reqId);
        saveJson(STORAGE_KEY_COLS, collections);
      }
    },

    saveEnvironment(env: EnvironmentItem) {
      const idx = environments.findIndex((e) => e.id === env.id);
      if (idx >= 0) {
        environments[idx] = env;
      } else {
        environments.push(env);
      }
      saveJson(STORAGE_KEY_ENVS, environments);
    },

    deleteEnvironment(id: string) {
      environments = environments.filter((e) => e.id !== id);
      if (activeEnvironmentId === id) {
        activeEnvironmentId = environments[0]?.id ?? null;
        saveJson(STORAGE_KEY_ACTIVE_ENV, activeEnvironmentId);
      }
      saveJson(STORAGE_KEY_ENVS, environments);
    },

    clearHistory() {
      history = [];
      saveJson(STORAGE_KEY_HIST, history);
    },

    deleteHistoryEntry(id: string) {
      history = history.filter((h) => h.id !== id);
      saveJson(STORAGE_KEY_HIST, history);
    },

    async sendRequest(): Promise<WorkbenchResponse> {
      isSending = true;
      const startTime = performance.now();

      try {
        // 1. Build Final URL with query params and environment interpolation
        let rawUrl = currentRequest.url.trim();
        let interpolatedUrl = this.interpolate(rawUrl);

        // Append query params
        const activeParams = currentRequest.params.filter((p) => p.enabled && p.key.trim());
        if (activeParams.length > 0) {
          const parsed = new URL(
            interpolatedUrl.startsWith('http') ? interpolatedUrl : `https://${interpolatedUrl}`
          );
          for (const p of activeParams) {
            parsed.searchParams.append(this.interpolate(p.key.trim()), this.interpolate(p.value));
          }
          interpolatedUrl = parsed.toString();
        } else if (!interpolatedUrl.startsWith('http')) {
          interpolatedUrl = `https://${interpolatedUrl}`;
        }

        // 2. Build Headers
        const headersMap: Record<string, string> = {};
        for (const h of currentRequest.headers) {
          if (h.enabled && h.key.trim()) {
            headersMap[this.interpolate(h.key.trim())] = this.interpolate(h.value);
          }
        }

        // 3. Attach Auth
        if (currentRequest.auth.type === 'bearer' && currentRequest.auth.bearerToken.trim()) {
          headersMap['Authorization'] = `Bearer ${this.interpolate(currentRequest.auth.bearerToken.trim())}`;
        } else if (currentRequest.auth.type === 'basic') {
          const u = this.interpolate(currentRequest.auth.basicUser);
          const p = this.interpolate(currentRequest.auth.basicPass);
          const creds = btoa(`${u}:${p}`);
          headersMap['Authorization'] = `Basic ${creds}`;
        } else if (currentRequest.auth.type === 'apikey') {
          const keyName = this.interpolate(currentRequest.auth.apiKeyName.trim());
          const keyVal = this.interpolate(currentRequest.auth.apiKeyValue.trim());
          if (currentRequest.auth.apiKeyAddTo === 'query') {
            const u = new URL(interpolatedUrl);
            u.searchParams.append(keyName, keyVal);
            interpolatedUrl = u.toString();
          } else {
            headersMap[keyName] = keyVal;
          }
        }

        // 4. Attach Body
        let finalBody: string | null = null;
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(currentRequest.method)) {
          if (currentRequest.body.type === 'json' && currentRequest.body.rawJson.trim()) {
            finalBody = this.interpolate(currentRequest.body.rawJson);
            if (!headersMap['Content-Type']) {
              headersMap['Content-Type'] = 'application/json';
            }
          } else if (currentRequest.body.type === 'urlencoded') {
            const params = new URLSearchParams();
            for (const r of currentRequest.body.urlencoded) {
              if (r.enabled && r.key.trim()) {
                params.append(this.interpolate(r.key.trim()), this.interpolate(r.value));
              }
            }
            finalBody = params.toString();
            if (!headersMap['Content-Type']) {
              headersMap['Content-Type'] = 'application/x-www-form-urlencoded';
            }
          } else if (currentRequest.body.type === 'form-data') {
            // Simple key-value text payload for form-data
            const obj: Record<string, string> = {};
            for (const r of currentRequest.body.formData) {
              if (r.enabled && r.key.trim()) {
                obj[this.interpolate(r.key.trim())] = this.interpolate(r.value);
              }
            }
            finalBody = JSON.stringify(obj);
          }
        }

        // 5. Execute via native Tauri command or fallback
        let respPayload: HttpResponsePayload;
        try {
          respPayload = await executeHttpRequest({
            method: currentRequest.method,
            url: interpolatedUrl,
            headers: headersMap,
            body: finalBody,
            timeout_ms: 30000
          });
        } catch (ipcErr: any) {
          // If not running inside Tauri IPC, fallback to browser fetch
          const fetchResp = await fetch(interpolatedUrl, {
            method: currentRequest.method,
            headers: headersMap,
            body: finalBody && currentRequest.method !== 'GET' && currentRequest.method !== 'HEAD' ? finalBody : undefined
          });

          const respText = await fetchResp.text();
          const respHeaders: Record<string, string> = {};
          fetchResp.headers.forEach((v, k) => {
            respHeaders[k] = v;
          });

          respPayload = {
            status: fetchResp.status,
            status_text: fetchResp.statusText || (fetchResp.ok ? 'OK' : 'Error'),
            headers: respHeaders,
            body: respText,
            elapsed_ms: Math.round(performance.now() - startTime),
            size_bytes: respText.length + 200
          };
        }

        const formattedResp: WorkbenchResponse = {
          status: respPayload.status,
          status_text: respPayload.status_text,
          headers: respPayload.headers,
          body: respPayload.body,
          elapsedMs: respPayload.elapsed_ms,
          sizeBytes: respPayload.size_bytes,
          timestamp: Date.now()
        } as any;
        formattedResp.statusText = respPayload.status_text;

        currentResponse = formattedResp;
        saveJson(STORAGE_KEY_RESP, currentResponse);

        // Add to history
        const newHist: HistoryEntry = {
          id: uid(),
          timestamp: Date.now(),
          method: currentRequest.method,
          url: interpolatedUrl,
          status: formattedResp.status,
          statusText: formattedResp.statusText,
          elapsedMs: formattedResp.elapsedMs,
          sizeBytes: formattedResp.sizeBytes,
          request: JSON.parse(JSON.stringify(currentRequest)),
          response: JSON.parse(JSON.stringify(formattedResp))
        };
        history.unshift(newHist);
        if (history.length > 100) history.pop();
        saveJson(STORAGE_KEY_HIST, history);

        return formattedResp;
      } catch (err: any) {
        const errorResp: WorkbenchResponse = {
          status: 0,
          statusText: 'Network / Connection Error',
          headers: {},
          body: JSON.stringify(
            {
              error: err?.message || 'Failed to dispatch HTTP request',
              hint: 'Verify target URL, network connection, or environment variable interpolation.'
            },
            null,
            2
          ),
          elapsedMs: Math.round(performance.now() - startTime),
          sizeBytes: 0,
          timestamp: Date.now(),
          error: err?.message || 'Request failed'
        };
        currentResponse = errorResp;
        saveJson(STORAGE_KEY_RESP, currentResponse);
        return errorResp;
      } finally {
        isSending = false;
      }
    }
  };
}
