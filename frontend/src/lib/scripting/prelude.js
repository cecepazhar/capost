// @ts-nocheck
// Runs inside the QuickJS sandbox before user scripts. No host bindings: all state comes
// in through the `__input` JSON string and goes out through `__collect()`.
// crypto-lite.js is concatenated in front of this file (exports stripped).

var __in = JSON.parse(__input);
var __logs = [];
var __tests = [];
var __state = __in.vars; // { environment, collection, globals, local }
var __req = __in.request; // { method, url, headers:[{key,value,disabled}], body }
var __res = __in.response || null;

function __fmt(a) {
  if (typeof a === 'string') return a;
  if (a instanceof Error) return a.name + ': ' + a.message;
  try {
    return JSON.stringify(a, null, 2);
  } catch (e) {
    return String(a);
  }
}
function __log(level) {
  return function () {
    __logs.push({ level: level, message: Array.prototype.map.call(arguments, __fmt).join(' ') });
  };
}
globalThis.console = { log: __log('log'), info: __log('info'), warn: __log('warn'), error: __log('error'), debug: __log('debug') };

// ---------- variables ----------
function __replaceIn(str) {
  if (typeof str !== 'string') return str;
  for (var pass = 0; pass < 4 && str.indexOf('{{') >= 0; pass++) {
    str = str.replace(/\{\{([^{}]+?)\}\}/g, function (whole, name) {
      var v = __resolve(name.trim());
      return v === undefined ? whole : String(v);
    });
  }
  return str;
}
function __resolve(k) {
  var order = ['local', 'environment', 'collection', 'globals'];
  for (var i = 0; i < order.length; i++) {
    var s = __state[order[i]];
    if (Object.prototype.hasOwnProperty.call(s, k)) return s[k];
  }
  return undefined;
}
function __scope(name, label) {
  var obj = __state[name];
  return {
    name: label,
    get: function (k) { return obj[k]; },
    set: function (k, v) { obj[k] = v; },
    unset: function (k) { delete obj[k]; },
    has: function (k) { return Object.prototype.hasOwnProperty.call(obj, k); },
    clear: function () { for (var k in obj) delete obj[k]; },
    toObject: function () { return Object.assign({}, obj); },
    replaceIn: __replaceIn
  };
}

// ---------- property lists ----------
function __headerList(arr) {
  function find(k) {
    var lk = String(k).toLowerCase();
    for (var i = 0; i < arr.length; i++) if (String(arr[i].key).toLowerCase() === lk && !arr[i].disabled) return arr[i];
    return null;
  }
  var api = {
    get: function (k) { var h = find(k); return h ? h.value : undefined; },
    has: function (k, v) { var h = find(k); return !!h && (v === undefined || h.value === v); },
    one: function (k) { return find(k); },
    all: function () { return arr.filter(function (h) { return !h.disabled; }); },
    count: function () { return api.all().length; },
    add: function (h) { if (typeof h === 'string') { var i = h.indexOf(':'); h = { key: h.slice(0, i).trim(), value: h.slice(i + 1).trim() }; } arr.push({ key: h.key, value: String(h.value) }); },
    upsert: function (h) { var e = find(h.key); if (e) e.value = String(h.value); else api.add(h); },
    remove: function (k) { var lk = String(k).toLowerCase(); for (var i = arr.length - 1; i >= 0; i--) if (String(arr[i].key).toLowerCase() === lk) arr.splice(i, 1); },
    each: function (fn) { api.all().forEach(fn); },
    map: function (fn) { return api.all().map(fn); },
    filter: function (fn) { return api.all().filter(fn); },
    toObject: function () { var o = {}; api.all().forEach(function (h) { o[h.key] = h.value; }); return o; }
  };
  return api;
}

function __splitUrl(u) {
  var qi = u.indexOf('?');
  var base = qi < 0 ? u : u.slice(0, qi);
  var query = [];
  if (qi >= 0) u.slice(qi + 1).split('&').forEach(function (p) {
    if (!p) return;
    var e = p.indexOf('=');
    query.push({ key: e < 0 ? p : p.slice(0, e), value: e < 0 ? '' : p.slice(e + 1) });
  });
  return { base: base, query: query };
}
var __url = __splitUrl(__req.url || '');
var __urlObj = {
  toString: function () {
    var q = __url.query.filter(function (p) { return !p.disabled; }).map(function (p) { return p.key + (p.value !== undefined && p.value !== null ? '=' + p.value : ''); }).join('&');
    return __url.base + (q ? '?' + q : '');
  },
  update: function (s) { __url = __splitUrl(String(s)); __urlObj.query = __headerList(__url.query); },
  getHost: function () { var m = /^[a-z]+:\/\/([^/:?#]+)/i.exec(__replaceIn(__url.base)); return m ? m[1] : ''; },
  getPath: function () { var m = /^[a-z]+:\/\/[^/?#]*([^?#]*)/i.exec(__replaceIn(__url.base)); return m ? m[1] || '/' : __url.base; },
  getQueryString: function () { return __urlObj.toString().split('?')[1] || ''; },
  addQueryParams: function (ps) { (Array.isArray(ps) ? ps : [ps]).forEach(function (p) { __url.query.push({ key: p.key, value: p.value }); }); },
  removeQueryParams: function (ks) { (Array.isArray(ks) ? ks : [ks]).forEach(function (k) { __urlObj.query.remove(typeof k === 'string' ? k : k.key); }); }
};
__urlObj.query = __headerList(__url.query);

var __body = { mode: __req.bodyMode || 'raw', raw: __req.body == null ? '' : __req.body };
__body.toString = function () { return __body.raw; };
__body.update = function (v) { __body.raw = typeof v === 'string' ? v : (v && v.raw !== undefined ? v.raw : JSON.stringify(v)); };

var __request = {
  get url() { return __urlObj; },
  set url(v) { __urlObj.update(v); },
  method: __req.method,
  headers: __headerList(__req.headers),
  body: __body,
  name: __in.info.requestName,
  addHeader: function (h) { __request.headers.add(h); },
  removeHeader: function (k) { __request.headers.remove(k); },
  upsertHeader: function (h) { __request.headers.upsert(h); }
};

// ---------- mini chai ----------
function __type(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (v instanceof RegExp) return 'regexp';
  if (v instanceof Date) return 'date';
  return typeof v;
}
function __deepEq(a, b) {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b)) return true;
  if (__type(a) !== __type(b) || typeof a !== 'object' || a === null) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (!__deepEq(a[i], b[i])) return false;
    return true;
  }
  var ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (var j = 0; j < ka.length; j++) if (!__deepEq(a[ka[j]], b[ka[j]])) return false;
  return true;
}
function __show(v) {
  if (typeof v === 'string') return "'" + v + "'";
  try { var s = JSON.stringify(v); return s === undefined ? String(v) : s.length > 120 ? s.slice(0, 117) + '...' : s; } catch (e) { return String(v); }
}
function AssertionError(msg) { this.name = 'AssertionError'; this.message = msg; }
AssertionError.prototype = Object.create(Error.prototype);

function Assertion(obj, msg) {
  this._obj = obj;
  this._neg = false;
  this._deep = false;
  this._any = false;
  this._nested = false;
  this._msg = msg;
}
Assertion.prototype._assert = function (ok, posMsg, negMsg) {
  var pass = this._neg ? !ok : !!ok;
  if (!pass) throw new AssertionError((this._msg ? this._msg + ': ' : '') + (this._neg ? negMsg : posMsg));
  return this;
};
['to', 'be', 'been', 'is', 'that', 'which', 'and', 'has', 'have', 'with', 'at', 'of', 'same', 'does', 'still', 'also', 'but'].forEach(function (w) {
  Object.defineProperty(Assertion.prototype, w, { get: function () { return this; } });
});
Object.defineProperty(Assertion.prototype, 'not', { get: function () { this._neg = !this._neg; return this; } });
Object.defineProperty(Assertion.prototype, 'deep', { get: function () { this._deep = true; return this; } });
Object.defineProperty(Assertion.prototype, 'nested', { get: function () { this._nested = true; return this; } });
Object.defineProperty(Assertion.prototype, 'any', { get: function () { this._any = true; return this; } });
Object.defineProperty(Assertion.prototype, 'all', { get: function () { this._any = false; return this; } });
Object.defineProperty(Assertion.prototype, 'own', { get: function () { return this; } });
function __flag(name, test, label) {
  Object.defineProperty(Assertion.prototype, name, {
    get: function () {
      var o = this._obj;
      return this._assert(test(o), 'expected ' + __show(o) + ' to be ' + label, 'expected ' + __show(o) + ' not to be ' + label);
    }
  });
}
__flag('ok', function (o) { return !!o; }, 'truthy');
__flag('true', function (o) { return o === true; }, 'true');
__flag('false', function (o) { return o === false; }, 'false');
__flag('null', function (o) { return o === null; }, 'null');
__flag('undefined', function (o) { return o === undefined; }, 'undefined');
__flag('NaN', function (o) { return typeof o === 'number' && isNaN(o); }, 'NaN');
__flag('exist', function (o) { return o !== null && o !== undefined; }, 'existing');
__flag('finite', function (o) { return typeof o === 'number' && isFinite(o); }, 'finite');
__flag('empty', function (o) {
  if (typeof o === 'string' || Array.isArray(o)) return o.length === 0;
  if (o && typeof o === 'object') return Object.keys(o).length === 0;
  return false;
}, 'empty');
function __method(names, fn) {
  names.forEach(function (n) { Assertion.prototype[n] = fn; });
}
__method(['equal', 'equals', 'eq'], function (v) {
  var o = this._obj;
  var ok = this._deep ? __deepEq(o, v) : o === v;
  return this._assert(ok, 'expected ' + __show(o) + ' to ' + (this._deep ? 'deeply ' : '') + 'equal ' + __show(v), 'expected ' + __show(o) + ' to not equal ' + __show(v));
});
__method(['eql', 'eqls'], function (v) {
  var o = this._obj;
  return this._assert(__deepEq(o, v), 'expected ' + __show(o) + ' to deeply equal ' + __show(v), 'expected ' + __show(o) + ' to not deeply equal ' + __show(v));
});
__method(['a', 'an'], function (t) {
  var o = this._obj;
  var actual = __type(o);
  return this._assert(actual === String(t).toLowerCase(), 'expected ' + __show(o) + ' to be a ' + t, 'expected ' + __show(o) + ' not to be a ' + t);
});
__method(['include', 'includes', 'contain', 'contains'], function (v) {
  var o = this._obj, ok = false, self = this;
  if (typeof o === 'string') ok = o.indexOf(v) >= 0;
  else if (Array.isArray(o)) ok = o.some(function (x) { return self._deep ? __deepEq(x, v) : x === v; });
  else if (o && typeof o === 'object' && v && typeof v === 'object') ok = Object.keys(v).every(function (k) { return __deepEq(o[k], v[k]); });
  else if (o && typeof o === 'object') ok = Object.prototype.hasOwnProperty.call(o, v);
  return this._assert(ok, 'expected ' + __show(o) + ' to include ' + __show(v), 'expected ' + __show(o) + ' to not include ' + __show(v));
});
function __getPath(o, path) {
  var parts = String(path).replace(/\[(\w+)\]/g, '.$1').split('.');
  for (var i = 0; i < parts.length; i++) {
    if (o === null || o === undefined || !(parts[i] in Object(o))) return { has: false };
    o = o[parts[i]];
  }
  return { has: true, value: o };
}
Assertion.prototype.property = function (name, val) {
  var o = this._obj;
  var r = this._nested ? __getPath(o, name) : { has: o !== null && o !== undefined && name in Object(o), value: o == null ? undefined : o[name] };
  if (arguments.length > 1) {
    var ok = r.has && (this._deep ? __deepEq(r.value, val) : r.value === val);
    this._assert(ok, 'expected ' + __show(o) + ' to have property ' + __show(name) + ' of ' + __show(val) + (r.has ? ', but got ' + __show(r.value) : ''), 'expected ' + __show(o) + ' to not have property ' + __show(name) + ' of ' + __show(val));
  } else {
    this._assert(r.has, 'expected ' + __show(o) + ' to have property ' + __show(name), 'expected ' + __show(o) + ' to not have property ' + __show(name));
  }
  if (r.has) this._obj = r.value;
  return this;
};
Assertion.prototype.nestedProperty = function (n, v) { this._nested = true; return arguments.length > 1 ? this.property(n, v) : this.property(n); };
Assertion.prototype.ownProperty = Assertion.prototype.property;
__method(['lengthOf', 'length'], function (n) {
  var o = this._obj;
  var len = o == null ? undefined : o.length !== undefined ? o.length : o.size;
  return this._assert(len === n, 'expected ' + __show(o) + ' to have a length of ' + n + ' but got ' + len, 'expected ' + __show(o) + ' to not have a length of ' + n);
});
__method(['above', 'gt', 'greaterThan'], function (n) { var o = this._obj; return this._assert(o > n, 'expected ' + __show(o) + ' to be above ' + n, 'expected ' + __show(o) + ' to be at most ' + n); });
__method(['below', 'lt', 'lessThan'], function (n) { var o = this._obj; return this._assert(o < n, 'expected ' + __show(o) + ' to be below ' + n, 'expected ' + __show(o) + ' to be at least ' + n); });
__method(['least', 'gte', 'greaterThanOrEqual'], function (n) { var o = this._obj; return this._assert(o >= n, 'expected ' + __show(o) + ' to be at least ' + n, 'expected ' + __show(o) + ' to be below ' + n); });
__method(['most', 'lte', 'lessThanOrEqual'], function (n) { var o = this._obj; return this._assert(o <= n, 'expected ' + __show(o) + ' to be at most ' + n, 'expected ' + __show(o) + ' to be above ' + n); });
Assertion.prototype.within = function (a, b) { var o = this._obj; return this._assert(o >= a && o <= b, 'expected ' + __show(o) + ' to be within ' + a + '..' + b, 'expected ' + __show(o) + ' to not be within ' + a + '..' + b); };
__method(['match', 'matches'], function (re) { var o = this._obj; return this._assert(re.test(o), 'expected ' + __show(o) + ' to match ' + re, 'expected ' + __show(o) + ' not to match ' + re); });
Assertion.prototype.string = function (s) { var o = this._obj; return this._assert(typeof o === 'string' && o.indexOf(s) >= 0, 'expected ' + __show(o) + ' to contain ' + __show(s), 'expected ' + __show(o) + ' to not contain ' + __show(s)); };
Assertion.prototype.oneOf = function (list) { var o = this._obj, self = this; return this._assert(list.some(function (x) { return self._deep ? __deepEq(x, o) : x === o; }), 'expected ' + __show(o) + ' to be one of ' + __show(list), 'expected ' + __show(o) + ' to not be one of ' + __show(list)); };
__method(['keys', 'key'], function () {
  var want = Array.prototype.slice.call(arguments);
  if (want.length === 1 && Array.isArray(want[0])) want = want[0];
  var o = this._obj || {};
  var have = Object.keys(o);
  var ok = this._any ? want.some(function (k) { return have.indexOf(k) >= 0; }) : want.every(function (k) { return have.indexOf(k) >= 0; });
  return this._assert(ok, 'expected ' + __show(o) + ' to have keys ' + __show(want), 'expected ' + __show(o) + ' to not have keys ' + __show(want));
});
Assertion.prototype.members = function (list) {
  var o = this._obj || [], self = this;
  var ok = list.every(function (x) { return o.some(function (y) { return self._deep ? __deepEq(x, y) : x === y; }); });
  return this._assert(ok, 'expected ' + __show(o) + ' to have members ' + __show(list), 'expected ' + __show(o) + ' to not have members ' + __show(list));
};
__method(['instanceOf', 'instanceof'], function (C) { var o = this._obj; return this._assert(o instanceof C, 'expected ' + __show(o) + ' to be an instance of ' + (C && C.name), 'expected ' + __show(o) + ' to not be an instance of ' + (C && C.name)); });
Assertion.prototype.throw = function () {
  var threw = false;
  try { this._obj(); } catch (e) { threw = true; }
  return this._assert(threw, 'expected function to throw', 'expected function not to throw');
};
Assertion.prototype.satisfy = function (fn) { var o = this._obj; return this._assert(fn(o), 'expected ' + __show(o) + ' to satisfy the given function', 'expected ' + __show(o) + ' to not satisfy the given function'); };
Assertion.prototype.closeTo = function (v, d) { var o = this._obj; return this._assert(Math.abs(o - v) <= d, 'expected ' + o + ' to be close to ' + v + ' +/- ' + d, 'expected ' + o + ' not to be close to ' + v); };

// response-specific assertions (pm.response.to...)
Assertion.prototype.status = function (s) {
  var r = this._obj;
  var ok = typeof s === 'number' ? r.code === s : r.status === s;
  return this._assert(ok, 'expected response to have status ' + (typeof s === 'number' ? 'code ' : 'reason ') + s + ' but got ' + r.code + ' ' + r.status, 'expected response to not have status ' + s);
};
Assertion.prototype.header = function (k, v) {
  var r = this._obj;
  var ok = r.headers.has(k) && (v === undefined || r.headers.get(k) === v);
  return this._assert(ok, 'expected response to have header ' + k + (v !== undefined ? ' with value ' + __show(v) : ''), 'expected response to not have header ' + k);
};
Assertion.prototype.body = function (v) {
  var r = this._obj, t = r.text();
  var ok = v === undefined ? t.length > 0 : v instanceof RegExp ? v.test(t) : typeof v === 'string' ? t === v : __deepEq(r.json(), v);
  return this._assert(ok, 'expected response body to match ' + __show(v), 'expected response body not to match ' + __show(v));
};
Assertion.prototype.jsonBody = function (path, val) {
  var r = this._obj, j;
  try { j = r.json(); } catch (e) { return this._assert(false, 'expected response body to be valid JSON', ''); }
  if (path === undefined) return this._assert(true, '', 'expected response not to have a JSON body');
  if (typeof path === 'object') return this._assert(__deepEq(j, path), 'expected JSON body to equal ' + __show(path), 'expected JSON body not to equal ' + __show(path));
  var g = __getPath(j, path);
  var ok = g.has && (arguments.length < 2 || __deepEq(g.value, val));
  return this._assert(ok, 'expected JSON body to have ' + path + (arguments.length > 1 ? ' = ' + __show(val) : ''), 'expected JSON body not to have ' + path);
};
Assertion.prototype.responseTime = function () { return this; };
function __resFlag(name, test, label) {
  Object.defineProperty(Assertion.prototype, name, {
    get: function () {
      var r = this._obj;
      if (!r || r.code === undefined) return this;
      return this._assert(test(r.code), 'expected response to be ' + label + ' but got ' + r.code, 'expected response to not be ' + label);
    }
  });
}
__resFlag('success', function (c) { return c >= 200 && c < 300; }, '2xx');
__resFlag('info', function (c) { return c >= 100 && c < 200; }, '1xx');
__resFlag('redirection', function (c) { return c >= 300 && c < 400; }, '3xx');
__resFlag('clientError', function (c) { return c >= 400 && c < 500; }, '4xx');
__resFlag('serverError', function (c) { return c >= 500; }, '5xx');
__resFlag('error', function (c) { return c >= 400; }, '4xx or 5xx');
__resFlag('accepted', function (c) { return c === 202; }, '202');
__resFlag('badRequest', function (c) { return c === 400; }, '400');
__resFlag('unauthorized', function (c) { return c === 401; }, '401');
__resFlag('forbidden', function (c) { return c === 403; }, '403');
__resFlag('notFound', function (c) { return c === 404; }, '404');
__resFlag('rateLimited', function (c) { return c === 429; }, '429');
Object.defineProperty(Assertion.prototype, 'json', {
  get: function () {
    var r = this._obj;
    var ok = true;
    try { r.json(); } catch (e) { ok = false; }
    return this._assert(ok, 'expected response body to be valid JSON', 'expected response body not to be JSON');
  }
});
Object.defineProperty(Assertion.prototype, 'withBody', { get: function () { var r = this._obj; return this._assert(r.text().length > 0, 'expected response to have a body', 'expected response to have no body'); } });

function expect(v, msg) { return new Assertion(v, msg); }
expect.fail = function (m) { throw new AssertionError(m || 'expect.fail()'); };

// ---------- response ----------
var __response = null;
if (__res) {
  var __resHeaders = __headerList(__res.headers);
  var __jsonCache;
  __response = {
    code: __res.code,
    status: __res.status,
    responseTime: __res.responseTime,
    responseSize: __res.size,
    headers: __resHeaders,
    text: function () { return __res.body; },
    json: function () { if (__jsonCache === undefined) __jsonCache = JSON.parse(__res.body); return __jsonCache; },
    reason: function () { return __res.status; },
    cookies: {
      get: function (name) {
        var all = __res.headers.filter(function (h) { return String(h.key).toLowerCase() === 'set-cookie'; }).map(function (h) { return h.value; }).join(', ');
        var m = new RegExp('(?:^|,\\s*)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;,]*)').exec(all);
        return m ? m[1] : undefined;
      },
      has: function (name) { return __response.cookies.get(name) !== undefined; }
    }
  };
  Object.defineProperty(__response, 'to', { get: function () { return new Assertion(__response); } });
  Object.defineProperty(__response, 'not', { get: function () { return new Assertion(__response).not; } });
}

// ---------- pm ----------
var __pending = 0;
var __visual = null;
var pm = {
  info: { requestName: __in.info.requestName, requestId: __in.info.requestId, iteration: __in.info.iteration || 0, iterationCount: 1, eventName: __in.kind === 'pre' ? 'prerequest' : 'test' },
  environment: __scope('environment', __in.envName || ''),
  collectionVariables: __scope('collection', ''),
  globals: __scope('globals', 'globals'),
  variables: {
    get: function (k) { return __resolve(k); },
    set: function (k, v) { __state.local[k] = v; },
    unset: function (k) { delete __state.local[k]; },
    has: function (k) { return __resolve(k) !== undefined; },
    toObject: function () { return Object.assign({}, __state.globals, __state.collection, __state.environment, __state.local); },
    replaceIn: __replaceIn
  },
  iterationData: { get: function () { return undefined; }, has: function () { return false; }, toObject: function () { return {}; } },
  request: __request,
  response: __response,
  expect: expect,
  test: function (name, fn) {
    var entry = { name: String(name), passed: true };
    __tests.push(entry);
    try {
      var r = fn && fn();
      if (r && typeof r.then === 'function') {
        __pending++;
        r.then(function () { __pending--; }, function (e) { __pending--; entry.passed = false; entry.error = e && e.message ? e.message : String(e); });
      }
    } catch (e) {
      entry.passed = false;
      entry.error = e && e.message ? e.message : String(e);
    }
  },
  sendRequest: function (_opts, cb) {
    var err = new Error('pm.sendRequest is not supported in CAPost yet');
    console.warn(err.message);
    if (typeof cb === 'function') cb(err, null);
  },
  cookies: __response ? __response.cookies : { get: function () {}, has: function () { return false; } },
  execution: { skipRequest: function () { __in.skip = true; }, setNextRequest: function () {} },
  setNextRequest: function () {},
  visualizer: {
    set: function (template, data, options) { __visual = { template: String(template), data: data === undefined ? {} : data }; },
    clear: function () { __visual = null; }
  }
};
pm.test.skip = function (name) { __tests.push({ name: String(name), passed: true, skipped: true }); };

// ---------- legacy postman API ----------
var tests = {};
var postman = {
  setEnvironmentVariable: function (k, v) { __state.environment[k] = v; },
  getEnvironmentVariable: function (k) { return __state.environment[k]; },
  clearEnvironmentVariable: function (k) { delete __state.environment[k]; },
  clearEnvironmentVariables: function () { for (var k in __state.environment) delete __state.environment[k]; },
  setGlobalVariable: function (k, v) { __state.globals[k] = v; },
  getGlobalVariable: function (k) { return __state.globals[k]; },
  clearGlobalVariable: function (k) { delete __state.globals[k]; },
  getResponseHeader: function (k) { return __response ? __response.headers.get(k) : undefined; },
  setNextRequest: function () {}
};
var environment = __state.environment;
var globals = __state.globals;
var request = { url: __req.url, method: __req.method, headers: __request.headers.toObject(), data: __body.raw, name: __in.info.requestName };
var responseBody = __res ? __res.body : '';
var responseCode = __res ? { code: __res.code, name: __res.status, detail: __res.status } : { code: 0 };
var responseTime = __res ? __res.responseTime : 0;
var responseHeaders = __res ? __response.headers.toObject() : {};
var iteration = 0;
function xml2Json() { throw new Error('xml2Json is not supported in CAPost'); }

// ---------- encoding helpers & CryptoJS subset ----------
function btoa(s) { var b = []; for (var i = 0; i < s.length; i++) b.push(s.charCodeAt(i) & 255); return bytesToBase64(b); }
function atob(s) { return base64ToBytes(s).map(function (c) { return String.fromCharCode(c); }).join(''); }

// CryptoJS-compatible WordArray: big-endian 32-bit `words` + `sigBytes`.
function WordArray(words, sigBytes) {
  this.words = words || [];
  this.sigBytes = sigBytes !== undefined && sigBytes !== null ? sigBytes : this.words.length * 4;
}
WordArray.create = function (words, sigBytes) {
  if (words instanceof ArrayBuffer || ArrayBuffer.isView(words)) {
    var u8 = new Uint8Array(words.buffer || words, words.byteOffset || 0, words.byteLength);
    return __wa(Array.prototype.slice.call(u8));
  }
  return new WordArray(words ? words.slice() : [], sigBytes);
};
WordArray.random = function (n) { var b = []; for (var i = 0; i < n; i++) b.push(Math.floor(Math.random() * 256)); return __wa(b); };
WordArray.prototype.toString = function (enc) { return (enc || CryptoJS.enc.Hex).stringify(this); };
WordArray.prototype.concat = function (o) { var n = __wa(__waBytes(this).concat(__toBytes(o))); this.words = n.words; this.sigBytes = n.sigBytes; return this; };
WordArray.prototype.clone = function () { return new WordArray(this.words.slice(), this.sigBytes); };
WordArray.prototype.clamp = function () { var n = __wa(__waBytes(this)); this.words = n.words; return this; };

function __wa(bytes) {
  var w = [];
  for (var i = 0; i < bytes.length; i++) w[i >>> 2] = (w[i >>> 2] | 0) | (bytes[i] << (24 - (i % 4) * 8));
  return new WordArray(w.map(function (x) { return x | 0; }), bytes.length);
}
function __waBytes(wa) {
  var b = [];
  for (var i = 0; i < wa.sigBytes; i++) b.push(((wa.words[i >>> 2] | 0) >>> (24 - (i % 4) * 8)) & 255);
  return b;
}
function __toBytes(m) {
  if (m instanceof WordArray) return __waBytes(m);
  if (m && m.words && typeof m.sigBytes === 'number') return __waBytes(m);
  return utf8Bytes(m === undefined || m === null ? '' : String(m));
}

function CipherParams(o) { for (var k in o) this[k] = o[k]; }
CipherParams.prototype.toString = function (fmt) {
  if (fmt && fmt.stringify) return fmt.stringify(this);
  var ct = __waBytes(this.ciphertext);
  if (this.salt) ct = [83, 97, 108, 116, 101, 100, 95, 95].concat(__waBytes(this.salt), ct); // "Salted__"
  return bytesToBase64(ct);
};

function __aesArgs(key, cfg, salt) {
  cfg = cfg || {};
  var mode = (cfg.mode && cfg.mode.__name) || 'CBC';
  var pkcs7 = !(cfg.padding && cfg.padding.__name === 'NoPadding');
  if (typeof key === 'string') {
    var d = evpBytesToKey(utf8Bytes(key), salt, 32, 16);
    return { key: d.key, iv: d.iv, mode: mode, pkcs7: pkcs7 };
  }
  var iv = cfg.iv ? __toBytes(cfg.iv) : null;
  if (mode === 'CBC' && !iv) throw new Error('CryptoJS.AES: an iv is required for CBC when the key is a WordArray');
  return { key: __toBytes(key), iv: iv, mode: mode, pkcs7: pkcs7 };
}

var CryptoJS = {
  lib: { WordArray: WordArray, CipherParams: CipherParams },
  enc: {
    Hex: { stringify: function (w) { return bytesToHex(__toBytes(w)); }, parse: function (s) { return __wa(hexToBytes(String(s))); } },
    Base64: { stringify: function (w) { return bytesToBase64(__toBytes(w)); }, parse: function (s) { return __wa(base64ToBytes(String(s))); } },
    Utf8: { stringify: function (w) { return bytesToUtf8(__toBytes(w)); }, parse: function (s) { return __wa(utf8Bytes(String(s))); } },
    Latin1: { stringify: function (w) { return __toBytes(w).map(function (c) { return String.fromCharCode(c); }).join(''); }, parse: function (s) { var b = []; for (var i = 0; i < s.length; i++) b.push(s.charCodeAt(i) & 255); return __wa(b); } }
  },
  mode: { CBC: { __name: 'CBC' }, ECB: { __name: 'ECB' } },
  pad: { Pkcs7: { __name: 'Pkcs7' }, NoPadding: { __name: 'NoPadding' }, ZeroPadding: { __name: 'NoPadding' } },
  format: {
    OpenSSL: {
      stringify: function (cp) { return CipherParams.prototype.toString.call(cp); },
      parse: function (s) { return __parseCipher(s); }
    }
  },
  MD5: function (m) { return __wa(md5(__toBytes(m))); },
  SHA1: function (m) { return __wa(sha1(__toBytes(m))); },
  SHA256: function (m) { return __wa(sha256(__toBytes(m))); },
  HmacMD5: function (m, k) { return __wa(hmac(md5, __toBytes(k), __toBytes(m))); },
  HmacSHA1: function (m, k) { return __wa(hmac(sha1, __toBytes(k), __toBytes(m))); },
  HmacSHA256: function (m, k) { return __wa(hmac(sha256, __toBytes(k), __toBytes(m))); },
  AES: {
    encrypt: function (msg, key, cfg) {
      var salt = typeof key === 'string' ? __toBytes(WordArray.random(8)) : null;
      var a = __aesArgs(key, cfg, salt);
      var ct = aesEncrypt(__toBytes(msg), a.key, a.mode === 'ECB' ? null : a.iv, a.mode, a.pkcs7);
      return new CipherParams({ ciphertext: __wa(ct), key: __wa(a.key), iv: a.iv ? __wa(a.iv) : undefined, salt: salt ? __wa(salt) : undefined });
    },
    decrypt: function (cp, key, cfg) {
      var p = typeof cp === 'string' ? __parseCipher(cp) : cp;
      var ct = __toBytes(p.ciphertext);
      var salt = p.salt ? __toBytes(p.salt) : null;
      if (typeof key === 'string' && !salt) throw new Error('CryptoJS.AES.decrypt: passphrase mode needs OpenSSL "Salted__" ciphertext');
      var a = __aesArgs(key, cfg, salt);
      return __wa(aesDecrypt(ct, a.key, a.mode === 'ECB' ? null : a.iv, a.mode, a.pkcs7));
    }
  }
};
function __parseCipher(s) {
  var b = base64ToBytes(String(s));
  if (b.length >= 16 && bytesToUtf8(b.slice(0, 8)) === 'Salted__') return new CipherParams({ ciphertext: __wa(b.slice(16)), salt: __wa(b.slice(8, 16)) });
  return new CipherParams({ ciphertext: __wa(b) });
}
CryptoJS.enc.Utf16 = CryptoJS.enc.Utf8;

function require(name) {
  switch (name) {
    case 'crypto-js': return CryptoJS;
    case 'chai': return { expect: expect, assert: { equal: function (a, b, m) { expect(a, m).to.equal(b); }, ok: function (a, m) { expect(a, m).to.be.ok; } } };
    case 'atob': return atob;
    case 'btoa': return btoa;
    default: throw new Error("require('" + name + "') is not available in the CAPost sandbox");
  }
}

// ---------- output ----------
function __collect() {
  for (var k in tests) __tests.push({ name: k, passed: !!tests[k], error: tests[k] ? undefined : 'tests["' + k + '"] was falsy' });
  tests = {};
  return JSON.stringify({
    vars: __state,
    request: { method: __request.method, url: __urlObj.toString(), headers: __req.headers, body: __body.raw },
    tests: __tests,
    logs: __logs,
    skip: !!__in.skip,
    visualizer: __visual
  }, function (key, val) { return val === undefined ? null : val; });
}