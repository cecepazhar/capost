// Postman-compatible script runner. Scripts execute inside a QuickJS (WebAssembly)
// sandbox: no DOM, no network, no Tauri IPC, CPU-time and memory capped.
// QuickJS is loaded lazily the first time a request actually has a script.
import cryptoSrc from './crypto-lite.js?raw';
import preludeSrc from './prelude.js?raw';

export type VarMap = Record<string, unknown>;

export interface ScriptVars {
  environment: VarMap;
  collection: VarMap;
  globals: VarMap;
  local: VarMap;
}

export interface ScriptHeader {
  key: string;
  value: string;
  disabled?: boolean;
}

export interface ScriptRequest {
  method: string;
  url: string;
  headers: ScriptHeader[];
  body: string | null;
  bodyMode?: string;
}

export interface ScriptResponse {
  code: number;
  status: string;
  headers: ScriptHeader[];
  body: string;
  responseTime: number;
  size: number;
}

export interface TestResult {
  name: string;
  passed: boolean;
  skipped?: boolean;
  error?: string;
  /** Which script produced it (collection / folder / request). */
  source?: string;
}

export interface ScriptLog {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source?: string;
}

export interface ScriptRunInput {
  kind: 'pre' | 'test';
  scripts: { source: string; code: string }[];
  vars: ScriptVars;
  request: ScriptRequest;
  response?: ScriptResponse;
  info: { requestName: string; requestId: string; iteration?: number };
  envName?: string;
}

export interface VisualizerOutput {
  template: string;
  data: unknown;
}

export interface ScriptRunOutput {
  vars: ScriptVars;
  request: ScriptRequest;
  tests: TestResult[];
  logs: ScriptLog[];
  errors: { source: string; message: string }[];
  skip: boolean;
  visualizer?: VisualizerOutput | null;
}

const TIME_LIMIT_MS = 5000;
const MEMORY_LIMIT = 64 * 1024 * 1024;

let modulePromise: Promise<any> | null = null;
function loadQuickJS() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const [{ newQuickJSWASMModuleFromVariant }, variant] = await Promise.all([
        import('quickjs-emscripten-core'),
        import('@jitl/quickjs-singlefile-browser-release-sync')
      ]);
      return newQuickJSWASMModuleFromVariant((variant as any).default ?? variant);
    })();
    modulePromise.catch(() => (modulePromise = null));
  }
  return modulePromise;
}

const PRELUDE = cryptoSrc.replace(/^export\s+/gm, '') + '\n' + preludeSrc;

export function hasCode(code: string | undefined | null): boolean {
  if (!code) return false;
  // ignore scripts that are only comments / whitespace
  return code.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').trim().length > 0;
}

export async function runScripts(input: ScriptRunInput): Promise<ScriptRunOutput> {
  const scripts = input.scripts.filter((s) => hasCode(s.code));
  const passthrough: ScriptRunOutput = {
    vars: input.vars,
    request: input.request,
    tests: [],
    logs: [],
    errors: [],
    skip: false
  };
  if (!scripts.length) return passthrough;

  let QuickJS: any;
  try {
    QuickJS = await loadQuickJS();
  } catch (e: any) {
    return { ...passthrough, errors: [{ source: 'sandbox', message: `Script engine failed to load: ${e?.message ?? e}` }] };
  }

  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(MEMORY_LIMIT);
  runtime.setMaxStackSize(1024 * 1024);
  const deadline = Date.now() + TIME_LIMIT_MS;
  runtime.setInterruptHandler(() => Date.now() > deadline);
  const vm = runtime.newContext();
  const errors: { source: string; message: string }[] = [];

  const evalOrThrow = (code: string, file: string) => {
    const r = vm.evalCode(code, file);
    if (r.error) {
      const err = vm.dump(r.error);
      r.error.dispose();
      throw new Error(typeof err === 'object' && err ? `${err.name ?? 'Error'}: ${err.message ?? JSON.stringify(err)}` : String(err));
    }
    r.value.dispose();
  };

  try {
    const payload = JSON.stringify({
      kind: input.kind,
      vars: input.vars,
      request: input.request,
      response: input.response ?? null,
      info: input.info,
      envName: input.envName ?? ''
    });
    const h = vm.newString(payload);
    vm.setProp(vm.global, '__input', h);
    h.dispose();
    evalOrThrow(PRELUDE, 'prelude.js');

    let testsBefore = 0;
    for (const s of scripts) {
      // tag logs/tests produced by this script with their source
      try {
        evalOrThrow(`(function(){\n${s.code}\n})();`, `${s.source}.js`);
      } catch (e: any) {
        const msg = /interrupted/i.test(e?.message ?? '') ? `Script exceeded ${TIME_LIMIT_MS / 1000}s time limit` : e?.message ?? String(e);
        errors.push({ source: s.source, message: msg });
      }
      // settle promises (async pm.test callbacks)
      for (let i = 0; i < 50; i++) {
        const n = runtime.executePendingJobs();
        if (n.error) {
          n.error.dispose();
          break;
        }
        if (!n.value) break;
      }
      evalOrThrow(
        `for (var __i=${testsBefore}; __i<__tests.length; __i++) if(!__tests[__i].source) __tests[__i].source=${JSON.stringify(s.source)};` +
          `for (var __j=0; __j<__logs.length; __j++) if(!__logs[__j].source) __logs[__j].source=${JSON.stringify(s.source)};` +
          `for (var __k in tests) { __tests.push({name:__k, passed:!!tests[__k], source:${JSON.stringify(s.source)}, error: tests[__k]?undefined:'tests["'+__k+'"] was falsy'}); } tests = {};`,
        'tag.js'
      );
      const cnt = vm.evalCode('__tests.length');
      if (!cnt.error) {
        testsBefore = vm.getNumber(cnt.value);
        cnt.value.dispose();
      } else cnt.error.dispose();
    }

    const out = vm.evalCode('__collect()');
    if (out.error) {
      const err = vm.dump(out.error);
      out.error.dispose();
      throw new Error(String(err?.message ?? err));
    }
    const parsed = JSON.parse(vm.getString(out.value));
    out.value.dispose();
    return {
      vars: parsed.vars,
      request: parsed.request,
      tests: parsed.tests,
      logs: parsed.logs,
      errors,
      skip: parsed.skip,
      visualizer: parsed.visualizer ?? null
    };
  } catch (e: any) {
    errors.push({ source: 'sandbox', message: e?.message ?? String(e) });
    return { ...passthrough, errors };
  } finally {
    vm.dispose();
    runtime.dispose();
  }
}
