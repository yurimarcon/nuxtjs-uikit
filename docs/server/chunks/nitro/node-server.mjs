globalThis._importMeta_=globalThis._importMeta_||{url:"file:///_entry.js",env:process.env};import 'node-fetch-native/polyfill';
import { Server as Server$1 } from 'http';
import { Server } from 'https';
import destr from 'destr';
import { eventHandler, setHeaders, sendRedirect, defineEventHandler, handleCacheHeaders, createEvent, getRequestHeader, getRequestHeaders, setResponseHeader, createError, createApp, createRouter as createRouter$1, lazyEventHandler, toNodeListener } from 'h3';
import { createFetch as createFetch$1, Headers } from 'ofetch';
import { createCall, createFetch } from 'unenv/runtime/fetch/index';
import { createHooks } from 'hookable';
import { snakeCase } from 'scule';
import { hash } from 'ohash';
import { parseURL, withQuery, joinURL, withLeadingSlash, withoutTrailingSlash } from 'ufo';
import { createStorage } from 'unstorage';
import defu from 'defu';
import { toRouteMatcher, createRouter } from 'radix3';
import { promises } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'pathe';

const _runtimeConfig = {"app":{"baseURL":"/","buildAssetsDir":"/_nuxt/","cdnURL":""},"nitro":{"routeRules":{"/__nuxt_error":{"cache":false}},"envPrefix":"NUXT_"},"public":{}};
const ENV_PREFIX = "NITRO_";
const ENV_PREFIX_ALT = _runtimeConfig.nitro.envPrefix ?? process.env.NITRO_ENV_PREFIX ?? "_";
const getEnv = (key) => {
  const envKey = snakeCase(key).toUpperCase();
  return destr(process.env[ENV_PREFIX + envKey] ?? process.env[ENV_PREFIX_ALT + envKey]);
};
function isObject(input) {
  return typeof input === "object" && !Array.isArray(input);
}
function overrideConfig(obj, parentKey = "") {
  for (const key in obj) {
    const subKey = parentKey ? `${parentKey}_${key}` : key;
    const envValue = getEnv(subKey);
    if (isObject(obj[key])) {
      if (isObject(envValue)) {
        obj[key] = { ...obj[key], ...envValue };
      }
      overrideConfig(obj[key], subKey);
    } else {
      obj[key] = envValue ?? obj[key];
    }
  }
}
overrideConfig(_runtimeConfig);
const config$1 = deepFreeze(_runtimeConfig);
const useRuntimeConfig = () => config$1;
function deepFreeze(object) {
  const propNames = Object.getOwnPropertyNames(object);
  for (const name of propNames) {
    const value = object[name];
    if (value && typeof value === "object") {
      deepFreeze(value);
    }
  }
  return Object.freeze(object);
}

const globalTiming = globalThis.__timing__ || {
  start: () => 0,
  end: () => 0,
  metrics: []
};
const timingMiddleware = eventHandler((event) => {
  const start = globalTiming.start();
  const _end = event.res.end;
  event.res.end = function(chunk, encoding, cb) {
    const metrics = [["Generate", globalTiming.end(start)], ...globalTiming.metrics];
    const serverTiming = metrics.map((m) => `-;dur=${m[1]};desc="${encodeURIComponent(m[0])}"`).join(", ");
    if (!event.res.headersSent) {
      event.res.setHeader("Server-Timing", serverTiming);
    }
    _end.call(event.res, chunk, encoding, cb);
    return this;
  }.bind(event.res);
});

const _assets = {

};

function normalizeKey(key) {
  if (!key) {
    return "";
  }
  return key.split("?")[0].replace(/[/\\]/g, ":").replace(/:+/g, ":").replace(/^:|:$/g, "");
}

const assets$1 = {
  getKeys() {
    return Promise.resolve(Object.keys(_assets))
  },
  hasItem (id) {
    id = normalizeKey(id);
    return Promise.resolve(id in _assets)
  },
  getItem (id) {
    id = normalizeKey(id);
    return Promise.resolve(_assets[id] ? _assets[id].import() : null)
  },
  getMeta (id) {
    id = normalizeKey(id);
    return Promise.resolve(_assets[id] ? _assets[id].meta : {})
  }
};

const storage = createStorage({});

const useStorage = () => storage;

storage.mount('/assets', assets$1);

const config = useRuntimeConfig();
const _routeRulesMatcher = toRouteMatcher(createRouter({ routes: config.nitro.routeRules }));
function createRouteRulesHandler() {
  return eventHandler((event) => {
    const routeRules = getRouteRules(event);
    if (routeRules.headers) {
      setHeaders(event, routeRules.headers);
    }
    if (routeRules.redirect) {
      return sendRedirect(event, routeRules.redirect.to, routeRules.redirect.statusCode);
    }
  });
}
function getRouteRules(event) {
  event.context._nitro = event.context._nitro || {};
  if (!event.context._nitro.routeRules) {
    const path = new URL(event.req.url, "http://localhost").pathname;
    event.context._nitro.routeRules = getRouteRulesForPath(path);
  }
  return event.context._nitro.routeRules;
}
function getRouteRulesForPath(path) {
  return defu({}, ..._routeRulesMatcher.matchAll(path).reverse());
}

const defaultCacheOptions = {
  name: "_",
  base: "/cache",
  swr: true,
  maxAge: 1
};
function defineCachedFunction(fn, opts) {
  opts = { ...defaultCacheOptions, ...opts };
  const pending = {};
  const group = opts.group || "nitro";
  const name = opts.name || fn.name || "_";
  const integrity = hash([opts.integrity, fn, opts]);
  const validate = opts.validate || (() => true);
  async function get(key, resolver) {
    const cacheKey = [opts.base, group, name, key + ".json"].filter(Boolean).join(":").replace(/:\/$/, ":index");
    const entry = await useStorage().getItem(cacheKey) || {};
    const ttl = (opts.maxAge ?? opts.maxAge ?? 0) * 1e3;
    if (ttl) {
      entry.expires = Date.now() + ttl;
    }
    const expired = entry.integrity !== integrity || ttl && Date.now() - (entry.mtime || 0) > ttl || !validate(entry);
    const _resolve = async () => {
      if (!pending[key]) {
        entry.value = void 0;
        entry.integrity = void 0;
        entry.mtime = void 0;
        entry.expires = void 0;
        pending[key] = Promise.resolve(resolver());
      }
      entry.value = await pending[key];
      entry.mtime = Date.now();
      entry.integrity = integrity;
      delete pending[key];
      if (validate(entry)) {
        useStorage().setItem(cacheKey, entry).catch((error) => console.error("[nitro] [cache]", error));
      }
    };
    const _resolvePromise = expired ? _resolve() : Promise.resolve();
    if (opts.swr && entry.value) {
      _resolvePromise.catch(console.error);
      return Promise.resolve(entry);
    }
    return _resolvePromise.then(() => entry);
  }
  return async (...args) => {
    const key = (opts.getKey || getKey)(...args);
    const entry = await get(key, () => fn(...args));
    let value = entry.value;
    if (opts.transform) {
      value = await opts.transform(entry, ...args) || value;
    }
    return value;
  };
}
const cachedFunction = defineCachedFunction;
function getKey(...args) {
  return args.length ? hash(args, {}) : "";
}
function defineCachedEventHandler(handler, opts = defaultCacheOptions) {
  const _opts = {
    ...opts,
    getKey: (event) => {
      const url = event.req.originalUrl || event.req.url;
      const friendlyName = decodeURI(parseURL(url).pathname).replace(/[^a-zA-Z0-9]/g, "").substring(0, 16);
      const urlHash = hash(url);
      return `${friendlyName}.${urlHash}`;
    },
    validate: (entry) => {
      if (entry.value.code >= 400) {
        return false;
      }
      if (entry.value.body === void 0) {
        return false;
      }
      return true;
    },
    group: opts.group || "nitro/handlers",
    integrity: [
      opts.integrity,
      handler
    ]
  };
  const _cachedHandler = cachedFunction(async (incomingEvent) => {
    const reqProxy = cloneWithProxy(incomingEvent.req, { headers: {} });
    const resHeaders = {};
    let _resSendBody;
    const resProxy = cloneWithProxy(incomingEvent.res, {
      statusCode: 200,
      getHeader(name) {
        return resHeaders[name];
      },
      setHeader(name, value) {
        resHeaders[name] = value;
        return this;
      },
      getHeaderNames() {
        return Object.keys(resHeaders);
      },
      hasHeader(name) {
        return name in resHeaders;
      },
      removeHeader(name) {
        delete resHeaders[name];
      },
      getHeaders() {
        return resHeaders;
      },
      end(chunk, arg2, arg3) {
        if (typeof chunk === "string") {
          _resSendBody = chunk;
        }
        if (typeof arg2 === "function") {
          arg2();
        }
        if (typeof arg3 === "function") {
          arg3();
        }
        return this;
      },
      write(chunk, arg2, arg3) {
        if (typeof chunk === "string") {
          _resSendBody = chunk;
        }
        if (typeof arg2 === "function") {
          arg2();
        }
        if (typeof arg3 === "function") {
          arg3();
        }
        return this;
      },
      writeHead(statusCode, headers2) {
        this.statusCode = statusCode;
        if (headers2) {
          for (const header in headers2) {
            this.setHeader(header, headers2[header]);
          }
        }
        return this;
      }
    });
    const event = createEvent(reqProxy, resProxy);
    event.context = incomingEvent.context;
    const body = await handler(event) || _resSendBody;
    const headers = event.res.getHeaders();
    headers.etag = headers.Etag || headers.etag || `W/"${hash(body)}"`;
    headers["last-modified"] = headers["Last-Modified"] || headers["last-modified"] || new Date().toUTCString();
    const cacheControl = [];
    if (opts.swr) {
      if (opts.maxAge) {
        cacheControl.push(`s-maxage=${opts.maxAge}`);
      }
      if (opts.staleMaxAge) {
        cacheControl.push(`stale-while-revalidate=${opts.staleMaxAge}`);
      } else {
        cacheControl.push("stale-while-revalidate");
      }
    } else if (opts.maxAge) {
      cacheControl.push(`max-age=${opts.maxAge}`);
    }
    if (cacheControl.length) {
      headers["cache-control"] = cacheControl.join(", ");
    }
    const cacheEntry = {
      code: event.res.statusCode,
      headers,
      body
    };
    return cacheEntry;
  }, _opts);
  return defineEventHandler(async (event) => {
    if (opts.headersOnly) {
      if (handleCacheHeaders(event, { maxAge: opts.maxAge })) {
        return;
      }
      return handler(event);
    }
    const response = await _cachedHandler(event);
    if (event.res.headersSent || event.res.writableEnded) {
      return response.body;
    }
    if (handleCacheHeaders(event, {
      modifiedTime: new Date(response.headers["last-modified"]),
      etag: response.headers.etag,
      maxAge: opts.maxAge
    })) {
      return;
    }
    event.res.statusCode = response.code;
    for (const name in response.headers) {
      event.res.setHeader(name, response.headers[name]);
    }
    return response.body;
  });
}
function cloneWithProxy(obj, overrides) {
  return new Proxy(obj, {
    get(target, property, receiver) {
      if (property in overrides) {
        return overrides[property];
      }
      return Reflect.get(target, property, receiver);
    },
    set(target, property, value, receiver) {
      if (property in overrides) {
        overrides[property] = value;
        return true;
      }
      return Reflect.set(target, property, value, receiver);
    }
  });
}
const cachedEventHandler = defineCachedEventHandler;

const plugins = [
  
];

function hasReqHeader(event, name, includes) {
  const value = getRequestHeader(event, name);
  return value && typeof value === "string" && value.toLowerCase().includes(includes);
}
function isJsonRequest(event) {
  return hasReqHeader(event, "accept", "application/json") || hasReqHeader(event, "user-agent", "curl/") || hasReqHeader(event, "user-agent", "httpie/") || event.req.url?.endsWith(".json") || event.req.url?.includes("/api/");
}
function normalizeError(error) {
  const cwd = process.cwd();
  const stack = (error.stack || "").split("\n").splice(1).filter((line) => line.includes("at ")).map((line) => {
    const text = line.replace(cwd + "/", "./").replace("webpack:/", "").replace("file://", "").trim();
    return {
      text,
      internal: line.includes("node_modules") && !line.includes(".cache") || line.includes("internal") || line.includes("new Promise")
    };
  });
  const statusCode = error.statusCode || 500;
  const statusMessage = error.statusMessage ?? (statusCode === 404 ? "Not Found" : "");
  const message = error.message || error.toString();
  return {
    stack,
    statusCode,
    statusMessage,
    message
  };
}

const errorHandler = (async function errorhandler(error, event) {
  const { stack, statusCode, statusMessage, message } = normalizeError(error);
  const errorObject = {
    url: event.node.req.url,
    statusCode,
    statusMessage,
    message,
    stack: "",
    data: error.data
  };
  event.node.res.statusCode = errorObject.statusCode !== 200 && errorObject.statusCode || 500;
  if (errorObject.statusMessage) {
    event.node.res.statusMessage = errorObject.statusMessage;
  }
  if (error.unhandled || error.fatal) {
    const tags = [
      "[nuxt]",
      "[request error]",
      error.unhandled && "[unhandled]",
      error.fatal && "[fatal]",
      Number(errorObject.statusCode) !== 200 && `[${errorObject.statusCode}]`
    ].filter(Boolean).join(" ");
    console.error(tags, errorObject.message + "\n" + stack.map((l) => "  " + l.text).join("  \n"));
  }
  if (isJsonRequest(event)) {
    event.node.res.setHeader("Content-Type", "application/json");
    event.node.res.end(JSON.stringify(errorObject));
    return;
  }
  const isErrorPage = event.node.req.url?.startsWith("/__nuxt_error");
  const res = !isErrorPage ? await useNitroApp().localFetch(withQuery(joinURL(useRuntimeConfig().app.baseURL, "/__nuxt_error"), errorObject), {
    headers: getRequestHeaders(event),
    redirect: "manual"
  }).catch(() => null) : null;
  if (!res) {
    const { template } = await import('../error-500.mjs');
    event.node.res.setHeader("Content-Type", "text/html;charset=UTF-8");
    event.node.res.end(template(errorObject));
    return;
  }
  for (const [header, value] of res.headers.entries()) {
    setResponseHeader(event, header, value);
  }
  if (res.status && res.status !== 200) {
    event.node.res.statusCode = res.status;
  }
  if (res.statusText) {
    event.node.res.statusMessage = res.statusText;
  }
  event.node.res.end(await res.text());
});

const assets = {
  "/favicon.ico": {
    "type": "image/vnd.microsoft.icon",
    "etag": "\"47e-aNnpLAb6T+FtQyVLvOxUjMHAq8E\"",
    "mtime": "2024-06-20T18:25:09.537Z",
    "size": 1150,
    "path": "../public/favicon.ico"
  },
  "/favicon.png": {
    "type": "image/png",
    "etag": "\"547-quR1O4wfCsrroHjZuQ3z6MDSC+0\"",
    "mtime": "2024-06-20T18:25:09.536Z",
    "size": 1351,
    "path": "../public/favicon.png"
  },
  "/_nuxt/404.8cb0b7c9.js": {
    "type": "application/javascript",
    "etag": "\"100-lsOHJQhAhONaY0+t1AclvCVsR88\"",
    "mtime": "2024-06-20T18:25:09.522Z",
    "size": 256,
    "path": "../public/_nuxt/404.8cb0b7c9.js"
  },
  "/_nuxt/AllCustomComponents.vue.34cadcb9.js": {
    "type": "application/javascript",
    "etag": "\"85a2-ZriO01Dn8UlOWwnTO8XD1m1eGyc\"",
    "mtime": "2024-06-20T18:25:09.521Z",
    "size": 34210,
    "path": "../public/_nuxt/AllCustomComponents.vue.34cadcb9.js"
  },
  "/_nuxt/Banner404.72598536.js": {
    "type": "application/javascript",
    "etag": "\"378-xSSKz1qyJs8IMmVBwPkHwNAKTUQ\"",
    "mtime": "2024-06-20T18:25:09.521Z",
    "size": 888,
    "path": "../public/_nuxt/Banner404.72598536.js"
  },
  "/_nuxt/ComingSoon.84b7ef1a.js": {
    "type": "application/javascript",
    "etag": "\"356-SMBD27pmfsFAs2vrlmpD2R6cPfQ\"",
    "mtime": "2024-06-20T18:25:09.521Z",
    "size": 854,
    "path": "../public/_nuxt/ComingSoon.84b7ef1a.js"
  },
  "/_nuxt/YuriData.4da682a9.js": {
    "type": "application/javascript",
    "etag": "\"936-ieY//L89s45+i/EFW6SuZCNkZYc\"",
    "mtime": "2024-06-20T18:25:09.520Z",
    "size": 2358,
    "path": "../public/_nuxt/YuriData.4da682a9.js"
  },
  "/_nuxt/about.6404860c.js": {
    "type": "application/javascript",
    "etag": "\"13a-WC78+lVmXW3MlUcqmie0AMLavlU\"",
    "mtime": "2024-06-20T18:25:09.520Z",
    "size": 314,
    "path": "../public/_nuxt/about.6404860c.js"
  },
  "/_nuxt/banner-img.c5914ee7.js": {
    "type": "application/javascript",
    "etag": "\"5d-H0CYEViGMD7KZdMsZmiLLPJrgFU\"",
    "mtime": "2024-06-20T18:25:09.520Z",
    "size": 93,
    "path": "../public/_nuxt/banner-img.c5914ee7.js"
  },
  "/_nuxt/basic-components.3a8f20d7.js": {
    "type": "application/javascript",
    "etag": "\"4aec-KaJwpW9BORUSToOz4GWE8jOczHU\"",
    "mtime": "2024-06-20T18:25:09.519Z",
    "size": 19180,
    "path": "../public/_nuxt/basic-components.3a8f20d7.js"
  },
  "/_nuxt/coming-soon.1d1f1c44.js": {
    "type": "application/javascript",
    "etag": "\"337-sZTQtHyTn6K+kffduIF/zSQLKmY\"",
    "mtime": "2024-06-20T18:25:09.518Z",
    "size": 823,
    "path": "../public/_nuxt/coming-soon.1d1f1c44.js"
  },
  "/_nuxt/composables.e455cf86.js": {
    "type": "application/javascript",
    "etag": "\"61-Vkdph/zOz986gXK0jECA8Tiuq+4\"",
    "mtime": "2024-06-20T18:25:09.518Z",
    "size": 97,
    "path": "../public/_nuxt/composables.e455cf86.js"
  },
  "/_nuxt/contact.8d86fb6d.js": {
    "type": "application/javascript",
    "etag": "\"799-hhwd2kD2U2dIS99GwF7leIY5Y1A\"",
    "mtime": "2024-06-20T18:25:09.518Z",
    "size": 1945,
    "path": "../public/_nuxt/contact.8d86fb6d.js"
  },
  "/_nuxt/courses.c5b706da.js": {
    "type": "application/javascript",
    "etag": "\"e10-eOYylHtLQVE9GuwXE1HCXpfSNws\"",
    "mtime": "2024-06-20T18:25:09.518Z",
    "size": 3600,
    "path": "../public/_nuxt/courses.c5b706da.js"
  },
  "/_nuxt/default.ec9e210e.js": {
    "type": "application/javascript",
    "etag": "\"bfa-GgcaZtl7sE5k0DhiXePU64y1B3s\"",
    "mtime": "2024-06-20T18:25:09.518Z",
    "size": 3066,
    "path": "../public/_nuxt/default.ec9e210e.js"
  },
  "/_nuxt/demo.343ba90f.js": {
    "type": "application/javascript",
    "etag": "\"139-cnT/yWcxgfQYVHR74vU/tZDVjZM\"",
    "mtime": "2024-06-20T18:25:09.517Z",
    "size": 313,
    "path": "../public/_nuxt/demo.343ba90f.js"
  },
  "/_nuxt/entry.6aa08d5e.js": {
    "type": "application/javascript",
    "etag": "\"2276ad-P2MIEHIg1Kx/ONfadUAkoaaUbvY\"",
    "mtime": "2024-06-20T18:25:09.517Z",
    "size": 2258605,
    "path": "../public/_nuxt/entry.6aa08d5e.js"
  },
  "/_nuxt/entry.a75a175e.css": {
    "type": "text/css; charset=utf-8",
    "etag": "\"aeb2c-J9+IV2G8/XlfiRMmlP4O8Qcc3Kk\"",
    "mtime": "2024-06-20T18:25:09.514Z",
    "size": 715564,
    "path": "../public/_nuxt/entry.a75a175e.css"
  },
  "/_nuxt/error-404.23f2309d.css": {
    "type": "text/css; charset=utf-8",
    "etag": "\"e2e-ivsbEmi48+s9HDOqtrSdWFvddYQ\"",
    "mtime": "2024-06-20T18:25:09.512Z",
    "size": 3630,
    "path": "../public/_nuxt/error-404.23f2309d.css"
  },
  "/_nuxt/error-404.c35bd5d6.js": {
    "type": "application/javascript",
    "etag": "\"8d4-aG/wH1PvYzzNvPHWPmgriKbKMvA\"",
    "mtime": "2024-06-20T18:25:09.512Z",
    "size": 2260,
    "path": "../public/_nuxt/error-404.c35bd5d6.js"
  },
  "/_nuxt/error-500.aa16ed4d.css": {
    "type": "text/css; charset=utf-8",
    "etag": "\"79e-7j4Tsx89siDo85YoIs0XqsPWmPI\"",
    "mtime": "2024-06-20T18:25:09.512Z",
    "size": 1950,
    "path": "../public/_nuxt/error-500.aa16ed4d.css"
  },
  "/_nuxt/error-500.d06edb8f.js": {
    "type": "application/javascript",
    "etag": "\"77d-nQEo48HUQIYXxOL2mbw0Ue8VmfQ\"",
    "mtime": "2024-06-20T18:25:09.511Z",
    "size": 1917,
    "path": "../public/_nuxt/error-500.d06edb8f.js"
  },
  "/_nuxt/error-component.fb0d77e0.js": {
    "type": "application/javascript",
    "etag": "\"4ad-vrx6gh/iUHqqkM2sMBvFrlJfobI\"",
    "mtime": "2024-06-20T18:25:09.511Z",
    "size": 1197,
    "path": "../public/_nuxt/error-component.fb0d77e0.js"
  },
  "/_nuxt/error.55f18a93.js": {
    "type": "application/javascript",
    "etag": "\"107-RK6s+yk07ffiXZjdiluoXIIh+1s\"",
    "mtime": "2024-06-20T18:25:09.511Z",
    "size": 263,
    "path": "../public/_nuxt/error.55f18a93.js"
  },
  "/_nuxt/index.c0eaa216.js": {
    "type": "application/javascript",
    "etag": "\"594-Tm0jK7XmoYlZqUdFPMDA5vVrIUQ\"",
    "mtime": "2024-06-20T18:25:09.510Z",
    "size": 1428,
    "path": "../public/_nuxt/index.c0eaa216.js"
  },
  "/_nuxt/materialdesignicons-webfont.5be9e9d7.eot": {
    "type": "application/vnd.ms-fontobject",
    "etag": "\"12aae0-GLTvA08q7BwIed5xQcHFnoNNCXU\"",
    "mtime": "2024-06-20T18:25:09.510Z",
    "size": 1223392,
    "path": "../public/_nuxt/materialdesignicons-webfont.5be9e9d7.eot"
  },
  "/_nuxt/materialdesignicons-webfont.633d596f.woff2": {
    "type": "font/woff2",
    "etag": "\"5d2f8-wtunkFhOlGmtjUyXdeCH4ix7aaA\"",
    "mtime": "2024-06-20T18:25:09.507Z",
    "size": 381688,
    "path": "../public/_nuxt/materialdesignicons-webfont.633d596f.woff2"
  },
  "/_nuxt/materialdesignicons-webfont.7f3afe9b.woff": {
    "type": "font/woff",
    "etag": "\"872e8-V9C6Y3wg5NY7jDb4bLSGK4uK3ak\"",
    "mtime": "2024-06-20T18:25:09.505Z",
    "size": 553704,
    "path": "../public/_nuxt/materialdesignicons-webfont.7f3afe9b.woff"
  },
  "/_nuxt/materialdesignicons-webfont.948fce52.ttf": {
    "type": "font/ttf",
    "etag": "\"12aa04-aOk3PGfYI4P3UxgCz4Ny3Zs6JXo\"",
    "mtime": "2024-06-20T18:25:09.501Z",
    "size": 1223172,
    "path": "../public/_nuxt/materialdesignicons-webfont.948fce52.ttf"
  },
  "/images/banner/banner1.jpg": {
    "type": "image/jpeg",
    "etag": "\"56af-8ITU4nqf0HuAPSMYpFXhPR4pBUY\"",
    "mtime": "2024-06-20T18:25:09.536Z",
    "size": 22191,
    "path": "../public/images/banner/banner1.jpg"
  },
  "/images/banner/img.jpg": {
    "type": "image/jpeg",
    "etag": "\"31b46-O+6xw3yLo2B/ibOOHT1+Zcnq/QU\"",
    "mtime": "2024-06-20T18:25:09.536Z",
    "size": 203590,
    "path": "../public/images/banner/img.jpg"
  },
  "/images/blog/img1.jpg": {
    "type": "image/jpeg",
    "etag": "\"57fc-SzpyjgqJPDXaOCwGfHtVv+OeGHw\"",
    "mtime": "2024-06-20T18:25:09.535Z",
    "size": 22524,
    "path": "../public/images/blog/img1.jpg"
  },
  "/images/blog/img2.jpg": {
    "type": "image/jpeg",
    "etag": "\"36fa-wZxu738MFGUUq43Avmx76LsX3ro\"",
    "mtime": "2024-06-20T18:25:09.535Z",
    "size": 14074,
    "path": "../public/images/blog/img2.jpg"
  },
  "/images/blog/img3.jpg": {
    "type": "image/jpeg",
    "etag": "\"4dd7-d1sxcCCNNp5toE9XgPMwc7M0E+A\"",
    "mtime": "2024-06-20T18:25:09.535Z",
    "size": 19927,
    "path": "../public/images/blog/img3.jpg"
  },
  "/images/card/docks.jpg": {
    "type": "image/jpeg",
    "etag": "\"188ca-U09Z3HyuWhIXDP6Sn5q4oW2PJmU\"",
    "mtime": "2024-06-20T18:25:09.534Z",
    "size": 100554,
    "path": "../public/images/card/docks.jpg"
  },
  "/images/card/house.jpg": {
    "type": "image/jpeg",
    "etag": "\"127b0-k1qAk4Zuuqw6Zy3d0X4FxqYbp38\"",
    "mtime": "2024-06-20T18:25:09.533Z",
    "size": 75696,
    "path": "../public/images/card/house.jpg"
  },
  "/images/card/road.jpg": {
    "type": "image/jpeg",
    "etag": "\"129f9-1ezP73KXf79mK2RoE4UEXAPsWQ4\"",
    "mtime": "2024-06-20T18:25:09.533Z",
    "size": 76281,
    "path": "../public/images/card/road.jpg"
  },
  "/images/c2a/app-store.png": {
    "type": "image/png",
    "etag": "\"11ad-O5PhQnlGmUgNVChgYMCUhPssoEk\"",
    "mtime": "2024-06-20T18:25:09.535Z",
    "size": 4525,
    "path": "../public/images/c2a/app-store.png"
  },
  "/images/c2a/play-store.png": {
    "type": "image/png",
    "etag": "\"1557-74nCYtBqlvNwCBsnTWCKYFgNwwg\"",
    "mtime": "2024-06-20T18:25:09.534Z",
    "size": 5463,
    "path": "../public/images/c2a/play-store.png"
  },
  "/images/form-banner/form-banner1.png": {
    "type": "image/png",
    "etag": "\"df5c-9tzl32KXtKjWvTrHJpaiGTpWGl8\"",
    "mtime": "2024-06-20T18:25:09.529Z",
    "size": 57180,
    "path": "../public/images/form-banner/form-banner1.png"
  },
  "/images/landingpage/banner-img.png": {
    "type": "image/png",
    "etag": "\"27ba0-0Cc/8Vu0T2+hlvfHmIAXN/Np9k0\"",
    "mtime": "2024-06-20T18:25:09.529Z",
    "size": 162720,
    "path": "../public/images/landingpage/banner-img.png"
  },
  "/images/landingpage/comingsoon.jpg": {
    "type": "image/jpeg",
    "etag": "\"28ac3-gpuBIT5LCFxIgdvOBnFXk4AsUao\"",
    "mtime": "2024-06-20T18:25:09.528Z",
    "size": 166595,
    "path": "../public/images/landingpage/comingsoon.jpg"
  },
  "/images/courses/git-github.png": {
    "type": "image/png",
    "etag": "\"60b44-IDzufgXZTsfUngWdVZMsiR6e53M\"",
    "mtime": "2024-06-20T18:25:09.533Z",
    "size": 396100,
    "path": "../public/images/courses/git-github.png"
  },
  "/images/courses/user.png": {
    "type": "image/png",
    "etag": "\"7a4b-PdCe1SotJR3tBV8kwi7Oiz4HLoE\"",
    "mtime": "2024-06-20T18:25:09.532Z",
    "size": 31307,
    "path": "../public/images/courses/user.png"
  },
  "/images/courses/vue-vuetify.png": {
    "type": "image/png",
    "etag": "\"8cb19-WqrPAN7rvKwBXq1wutvG5M27Mxw\"",
    "mtime": "2024-06-20T18:25:09.532Z",
    "size": 576281,
    "path": "../public/images/courses/vue-vuetify.png"
  },
  "/images/logos/purple-logo.png": {
    "type": "image/png",
    "etag": "\"615-uVVdkgRUNwkGEcS4chyRftC8PkU\"",
    "mtime": "2024-06-20T18:25:09.528Z",
    "size": 1557,
    "path": "../public/images/logos/purple-logo.png"
  },
  "/images/logos/white-logo.png": {
    "type": "image/png",
    "etag": "\"5fe-BfdwgyPb0XDsQMzktBfDW3gpoSQ\"",
    "mtime": "2024-06-20T18:25:09.527Z",
    "size": 1534,
    "path": "../public/images/logos/white-logo.png"
  },
  "/images/logos/white-text.png": {
    "type": "image/png",
    "etag": "\"c87-7xaYnsYEN6wjIQIRtceglkYvPU0\"",
    "mtime": "2024-06-20T18:25:09.527Z",
    "size": 3207,
    "path": "../public/images/logos/white-text.png"
  },
  "/images/team/t1.jpg": {
    "type": "image/jpeg",
    "etag": "\"3890-5w6xQpFPfaTyC4cbTGaRhgNgjSE\"",
    "mtime": "2024-06-20T18:25:09.524Z",
    "size": 14480,
    "path": "../public/images/team/t1.jpg"
  },
  "/images/team/t2.jpg": {
    "type": "image/jpeg",
    "etag": "\"2f32-9Lxso2ni4ZcD0XrExsl9VKL/TO4\"",
    "mtime": "2024-06-20T18:25:09.524Z",
    "size": 12082,
    "path": "../public/images/team/t2.jpg"
  },
  "/images/team/t3.jpg": {
    "type": "image/jpeg",
    "etag": "\"28ec-tZm6RaVYc5nOXRIXBR1pAeXwXls\"",
    "mtime": "2024-06-20T18:25:09.524Z",
    "size": 10476,
    "path": "../public/images/team/t3.jpg"
  },
  "/images/team/t4.jpg": {
    "type": "image/jpeg",
    "etag": "\"3bf3-8AkUEdpBIA8eZuyRVUTrRuLieqo\"",
    "mtime": "2024-06-20T18:25:09.523Z",
    "size": 15347,
    "path": "../public/images/team/t4.jpg"
  },
  "/images/portfolio/img1.jpg": {
    "type": "image/jpeg",
    "etag": "\"7446-47L/Zb6o0+Dc8xxaUVe5hcw7bKI\"",
    "mtime": "2024-06-20T18:25:09.527Z",
    "size": 29766,
    "path": "../public/images/portfolio/img1.jpg"
  },
  "/images/portfolio/img2.jpg": {
    "type": "image/jpeg",
    "etag": "\"5d44-LF6xYYTHG4qtR/J23ygh/cZkXW8\"",
    "mtime": "2024-06-20T18:25:09.526Z",
    "size": 23876,
    "path": "../public/images/portfolio/img2.jpg"
  },
  "/images/portfolio/img3.jpg": {
    "type": "image/jpeg",
    "etag": "\"6bac-JFeqDb0866Spnjfz5VHJBgQDG8w\"",
    "mtime": "2024-06-20T18:25:09.526Z",
    "size": 27564,
    "path": "../public/images/portfolio/img3.jpg"
  },
  "/images/portfolio/img4.jpg": {
    "type": "image/jpeg",
    "etag": "\"5eb4-s8rfIXaWA1f8W92tgye85pdatc0\"",
    "mtime": "2024-06-20T18:25:09.526Z",
    "size": 24244,
    "path": "../public/images/portfolio/img4.jpg"
  },
  "/images/portfolio/img5.jpg": {
    "type": "image/jpeg",
    "etag": "\"9eed-yibYXfQMhxIXNuwchVusgwMvhOE\"",
    "mtime": "2024-06-20T18:25:09.525Z",
    "size": 40685,
    "path": "../public/images/portfolio/img5.jpg"
  },
  "/images/portfolio/img6.jpg": {
    "type": "image/jpeg",
    "etag": "\"4c72-ZmVNtDtkaY+bGIqMOTZPLJFjB7k\"",
    "mtime": "2024-06-20T18:25:09.525Z",
    "size": 19570,
    "path": "../public/images/portfolio/img6.jpg"
  },
  "/images/testimonial/1.jpg": {
    "type": "image/jpeg",
    "etag": "\"7aba-Z2kghsmd6jT6lUbdS4PEU//gqjs\"",
    "mtime": "2024-06-20T18:25:09.523Z",
    "size": 31418,
    "path": "../public/images/testimonial/1.jpg"
  },
  "/images/testimonial/2.jpg": {
    "type": "image/jpeg",
    "etag": "\"11ce9-jQ7gNLkDWl7ip+V79loVinily1U\"",
    "mtime": "2024-06-20T18:25:09.523Z",
    "size": 72937,
    "path": "../public/images/testimonial/2.jpg"
  },
  "/images/testimonial/3.jpg": {
    "type": "image/jpeg",
    "etag": "\"138fe-w9zqsUQPG4yoxgoDNojvLFEwbwI\"",
    "mtime": "2024-06-20T18:25:09.522Z",
    "size": 80126,
    "path": "../public/images/testimonial/3.jpg"
  },
  "/images/features/2/img1.jpg": {
    "type": "image/jpeg",
    "etag": "\"47fe-x9B0bPDQBIlGWAbFbn3Edi5pjZg\"",
    "mtime": "2024-06-20T18:25:09.531Z",
    "size": 18430,
    "path": "../public/images/features/2/img1.jpg"
  },
  "/images/features/2/img2.jpg": {
    "type": "image/jpeg",
    "etag": "\"49d9-VFqTO17/fgR5HMsWMRme/VBTvrU\"",
    "mtime": "2024-06-20T18:25:09.531Z",
    "size": 18905,
    "path": "../public/images/features/2/img2.jpg"
  },
  "/images/features/2/img3.jpg": {
    "type": "image/jpeg",
    "etag": "\"9643-qV25vjPyiM6NMVghdPCTalhBLHw\"",
    "mtime": "2024-06-20T18:25:09.531Z",
    "size": 38467,
    "path": "../public/images/features/2/img3.jpg"
  },
  "/images/features/2/img4.jpg": {
    "type": "image/jpeg",
    "etag": "\"4727-IhmXVnF7OBOusLIKKLUwtnh0B8c\"",
    "mtime": "2024-06-20T18:25:09.530Z",
    "size": 18215,
    "path": "../public/images/features/2/img4.jpg"
  },
  "/images/features/3/feature-img.jpg": {
    "type": "image/jpeg",
    "etag": "\"61ee-RDlMufoJsXSgQmPvVi1sOUk/eoc\"",
    "mtime": "2024-06-20T18:25:09.530Z",
    "size": 25070,
    "path": "../public/images/features/3/feature-img.jpg"
  },
  "/images/features/3/img1.jpg": {
    "type": "image/jpeg",
    "etag": "\"1e317-F8Y+Wy1sW+h3CylQbiRjFXDjkHU\"",
    "mtime": "2024-06-20T18:25:09.530Z",
    "size": 123671,
    "path": "../public/images/features/3/img1.jpg"
  }
};

function readAsset (id) {
  const serverDir = dirname(fileURLToPath(globalThis._importMeta_.url));
  return promises.readFile(resolve(serverDir, assets[id].path))
}

const publicAssetBases = [];

function isPublicAssetURL(id = '') {
  if (assets[id]) {
    return true
  }
  for (const base of publicAssetBases) {
    if (id.startsWith(base)) { return true }
  }
  return false
}

function getAsset (id) {
  return assets[id]
}

const METHODS = ["HEAD", "GET"];
const EncodingMap = { gzip: ".gz", br: ".br" };
const _f4b49z = eventHandler((event) => {
  if (event.req.method && !METHODS.includes(event.req.method)) {
    return;
  }
  let id = decodeURIComponent(withLeadingSlash(withoutTrailingSlash(parseURL(event.req.url).pathname)));
  let asset;
  const encodingHeader = String(event.req.headers["accept-encoding"] || "");
  const encodings = encodingHeader.split(",").map((e) => EncodingMap[e.trim()]).filter(Boolean).sort().concat([""]);
  if (encodings.length > 1) {
    event.res.setHeader("Vary", "Accept-Encoding");
  }
  for (const encoding of encodings) {
    for (const _id of [id + encoding, joinURL(id, "index.html" + encoding)]) {
      const _asset = getAsset(_id);
      if (_asset) {
        asset = _asset;
        id = _id;
        break;
      }
    }
  }
  if (!asset) {
    if (isPublicAssetURL(id)) {
      throw createError({
        statusMessage: "Cannot find static asset " + id,
        statusCode: 404
      });
    }
    return;
  }
  const ifNotMatch = event.req.headers["if-none-match"] === asset.etag;
  if (ifNotMatch) {
    event.res.statusCode = 304;
    event.res.end();
    return;
  }
  const ifModifiedSinceH = event.req.headers["if-modified-since"];
  if (ifModifiedSinceH && asset.mtime) {
    if (new Date(ifModifiedSinceH) >= new Date(asset.mtime)) {
      event.res.statusCode = 304;
      event.res.end();
      return;
    }
  }
  if (asset.type && !event.res.getHeader("Content-Type")) {
    event.res.setHeader("Content-Type", asset.type);
  }
  if (asset.etag && !event.res.getHeader("ETag")) {
    event.res.setHeader("ETag", asset.etag);
  }
  if (asset.mtime && !event.res.getHeader("Last-Modified")) {
    event.res.setHeader("Last-Modified", asset.mtime);
  }
  if (asset.encoding && !event.res.getHeader("Content-Encoding")) {
    event.res.setHeader("Content-Encoding", asset.encoding);
  }
  if (asset.size && !event.res.getHeader("Content-Length")) {
    event.res.setHeader("Content-Length", asset.size);
  }
  return readAsset(id);
});

const _lazy_T37qbY = () => import('../handlers/renderer.mjs');

const handlers = [
  { route: '', handler: _f4b49z, lazy: false, middleware: true, method: undefined },
  { route: '/__nuxt_error', handler: _lazy_T37qbY, lazy: true, middleware: false, method: undefined },
  { route: '/**', handler: _lazy_T37qbY, lazy: true, middleware: false, method: undefined }
];

function createNitroApp() {
  const config = useRuntimeConfig();
  const hooks = createHooks();
  const h3App = createApp({
    debug: destr(false),
    onError: errorHandler
  });
  h3App.use(config.app.baseURL, timingMiddleware);
  const router = createRouter$1();
  h3App.use(createRouteRulesHandler());
  for (const h of handlers) {
    let handler = h.lazy ? lazyEventHandler(h.handler) : h.handler;
    if (h.middleware || !h.route) {
      const middlewareBase = (config.app.baseURL + (h.route || "/")).replace(/\/+/g, "/");
      h3App.use(middlewareBase, handler);
    } else {
      const routeRules = getRouteRulesForPath(h.route.replace(/:\w+|\*\*/g, "_"));
      if (routeRules.cache) {
        handler = cachedEventHandler(handler, {
          group: "nitro/routes",
          ...routeRules.cache
        });
      }
      router.use(h.route, handler, h.method);
    }
  }
  h3App.use(config.app.baseURL, router);
  const localCall = createCall(toNodeListener(h3App));
  const localFetch = createFetch(localCall, globalThis.fetch);
  const $fetch = createFetch$1({ fetch: localFetch, Headers, defaults: { baseURL: config.app.baseURL } });
  globalThis.$fetch = $fetch;
  const app = {
    hooks,
    h3App,
    router,
    localCall,
    localFetch
  };
  for (const plugin of plugins) {
    plugin(app);
  }
  return app;
}
const nitroApp = createNitroApp();
const useNitroApp = () => nitroApp;

const cert = process.env.NITRO_SSL_CERT;
const key = process.env.NITRO_SSL_KEY;
const server = cert && key ? new Server({ key, cert }, toNodeListener(nitroApp.h3App)) : new Server$1(toNodeListener(nitroApp.h3App));
const port = destr(process.env.NITRO_PORT || process.env.PORT) || 3e3;
const host = process.env.NITRO_HOST || process.env.HOST;
const s = server.listen(port, host, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  const protocol = cert && key ? "https" : "http";
  const i = s.address();
  const baseURL = (useRuntimeConfig().app.baseURL || "").replace(/\/$/, "");
  const url = `${protocol}://${i.family === "IPv6" ? `[${i.address}]` : i.address}:${i.port}${baseURL}`;
  console.log(`Listening ${url}`);
});
{
  process.on("unhandledRejection", (err) => console.error("[nitro] [dev] [unhandledRejection] " + err));
  process.on("uncaughtException", (err) => console.error("[nitro] [dev] [uncaughtException] " + err));
}
const nodeServer = {};

export { useRuntimeConfig as a, getRouteRules as g, nodeServer as n, useNitroApp as u };
//# sourceMappingURL=node-server.mjs.map
