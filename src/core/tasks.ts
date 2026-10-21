import { HookType } from '@/types/enum';
import { type DisownEntry, type HookTask, type FingerprintContext } from "./core";
import { makeSeededRandom, seededRandom } from '@/utils/base';
import {
  notify,
  addedNodesOf,
  drawNoiseTo2d,
  findIframes,
  getCanvas2d,
  markCanvasContext,
  nodeNameOf,
  charDataGet,
  charDataSubstring,
  nodeGet,
  nodeListAt,
  rangeGet,
  attrOf,
  queryAll,
  rectGet,
  rectListLength,
  rectSet,
  toDOMString,
  toUint32,
  typedArrayLength,
  hookTextMetrics,
  layoutUnitOf,
  makeRectScope,
  shiftLayout,
  randomCanvasNoise,
  randomFontNoise, randomScreenSize
} from './utils';
import { base64ToUint8Array } from '@/utils/array';
import { hasCjk, hasCjkFontFamily, isCjkLocalVoice, maskCjk, stripCjkFontFamilies } from './cjk';
import { EMOJI_TEXT_MAX_LENGTH, isEmojiProbe } from './emoji';
import { isCloudflareCaller } from './cloudflare';
import { addFragColorOffset, fragmentOutputs } from './glsl';
import { adapterInfoOf } from './gpu';
import { isRestrictiveForWorkers } from './csp';
import { isLocalDateString } from './date';
import { rewriteMediaQuery } from './media';
import {
  ITERATOR, NativeMap, NativeSet, NativeWeakMap, NativeWeakSet, SET_METHODS, apply, bind, construct, defineProperty,
  floor, getOwnPropertyDescriptor, getOwnPropertyNames, getPrototypeOf, hasOwn, isArray, isBinaryData, mapDelete, mapGet, mapSet, nullObject,
  objectCreate, objectFreeze, promiseThen, reflectDeleteProperty, reflectGet, regExec, setAdd, setHas, strIndexOf, strSlice, stringify,
  strToLowerCase, typedArrayName, uncurryThis, weakMapGet, weakMapSet, weakSetAdd, weakSetDelete, weakSetHas,
} from './intrinsics';

const numToFixed = uncurryThis(Number.prototype.toFixed) as (n: number, digits: number) => string
const TO_STRING_TAG: typeof Symbol.toStringTag = Symbol.toStringTag
const blobSize = typeof Blob === 'undefined' ? undefined : getOwnPropertyDescriptor(Blob.prototype, 'size')?.get

/**
 * 以原生 getter 判断是否是 Blob（含其他 realm 创建的 Blob）
 */
const isBlob = (v: any) => {
  if (!blobSize || v == null || typeof v !== 'object') return false;
  try {
    apply(blobSize, v, [])
    return true
  } catch (_) {
    return false
  }
}

/**
 * 只含自有迭代器的序列：传给 Blob 等构造函数时不经过页面可改写的 Array.prototype[Symbol.iterator]
 */
const ownIterable = <T>(items: T[]): Iterable<T> => {
  const res: any = nullObject()
  res[ITERATOR] = () => {
    let i = 0
    const it: any = nullObject()
    it.next = () => {
      const step: any = nullObject()
      step.done = i >= items.length
      step.value = step.done ? undefined : items[i++]
      return step
    }
    return it
  }
  return res
}

/**
 * getter 返回固定值的代理处理器
 * 先调用原 getter：this 非法时与原生一致抛出异常（如 Navigator.prototype.userAgent）
 */
const valueGetterHandler = (getter: () => any, value: any, notifyKey: string): ProxyHandler<() => any> => ({
  apply(target, thisArg: any, args: any) {
    const raw = apply(getter, thisArg, [])
    if (isCloudflareCaller()) return raw;
    notify(notifyKey)
    return value;
  }
})

/** 字体名单：空 WOFF2 字体（注入时解码） */
const EMPTY_WOFF2 = base64ToUint8Array("d09GMgABAAAAAAHIAAoAAAAABMgAAAF+AAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAABmAAgjoKKD4LBAABNgIkAwQEIAWDLQckGyYEyJ4D7uwQQ3N4OR5Z/PGykGuzrywentba+zO7i5hUmqYrAa80ukkJJqFeDogm8lq16e084xHyQPVmeRwWBa6ldRerIkxchEkypz4kSxb69DdfG+djAr3zQFMcCzsPpA0453kCCS2u8+wv/kIfEP/ubBxLY3mlJZaWl5LjdUERJ7hWkl4SXPF6fFmKNpIqYy568aztyYm+dUioGeLH/RGQRxFmARkZkwCWCYFJilEkSVDX/g8IiIq7LUBCQivaAQVIRdFRdhU79Mj2+WZv80ezAALB323v1vhv7SjA6+XL4ZqOYjE10SqB4JBmnChQcwIAANHFgWpIz9/a6VGA0I4ASaVdgGyCCqDQbgFAaVoKoNJukxBFmzBorCDptA+yVW9QGPQBpYafXRmM/ALk+5P/XxmtROUSh17AFQ8jRblUkaY1T5vGCysmHNLi7ORhNtl6COam856OWg2TfoiFPAFWYXN6u92b3dxtnZ3SnBqvtwwvvd0EdYPCizhEBAAA")

const TRIM_RE = /^\s*([\s\S]*?)\s*$/
const trim = (s: string) => regExec(TRIM_RE, s)![1]

/** 去掉首尾的引号 */
const stripQuotes = (s: string) => {
  let a = 0, b = s.length
  while (a < b && (s[a] === '"' || s[a] === "'")) a++
  while (b > a && (s[b - 1] === '"' || s[b - 1] === "'")) b--
  return strSlice(s, a, b)
}

const WORKER_FONT_RE = /^(.*?\d+px(?:\/\d+)?\s+)(.+)$/

/**
 * 替换字体来源中不被允许的 local()（不区分大小写，可出现在任意位置）
 * 含反斜杠时可能以 CSS 转义拼出 local，整体替换为空的本地字体
 */
const maskLocalFonts = (src: string, isAllowed: (name: string) => boolean) => {
  if (strIndexOf(src, '\\') !== -1) {
    notify('strong.fonts')
    return 'local("")'
  }
  const lower = strToLowerCase(src)
  let res = ''
  let last = 0
  let from = 0
  let found = false
  while (true) {
    const at = strIndexOf(lower, 'local(', from)
    if (at === -1) break;
    from = at + 6
    /* 前一个字符须是分隔符，排除 xlocal( 之类的标识符 */
    const prev = at > 0 ? src[at - 1] : ','
    if (!isSpace(prev) && prev !== ',') continue;

    let i = from
    while (isSpace(src[i])) i++
    const q = src[i]
    const close = q === '"' || q === "'" ? strIndexOf(src, q, i + 1) : i
    if (close === -1) continue;
    const end = strIndexOf(src, ')', close)
    if (end === -1) continue;

    found = true
    const name = trim(strSlice(src, from, end))
    if (name && !isAllowed(name)) {
      res += strSlice(src, last, at) + 'local("")'
      last = end + 1
    }
    from = end + 1
  }
  if (found) notify('strong.fonts')
  return last === 0 ? src : res + strSlice(src, last)
}

const isSpace = (c: string | undefined) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v'

/**
 * 以页面传入的对象为原型创建对象，并设置一个自有属性
 * 改写字典参数的某一项：其余项仍由原生方法从页面对象读取（每项只读取一次）
 */
const derive = (proto: object, key: string, value: any) => {
  const res = objectCreate(proto)
  const desc: PropertyDescriptor = nullObject()
  desc.value = value
  desc.writable = true
  desc.enumerable = true
  desc.configurable = true
  defineProperty(res, key, desc)
  return res
}

/**
 * 为原生 Promise 挂接回调
 * then 会读取 promise.constructor，先设置自有属性，避免页面在 Promise.prototype 上定义 getter 拿到原始结果
 */
const thenSafely = <T>(RealmPromise: any, p: Promise<T>, onFulfilled: (v: T) => any) => {
  const desc: PropertyDescriptor = nullObject()
  desc.value = RealmPromise
  desc.writable = true
  desc.configurable = true
  defineProperty(p, 'constructor', desc)
  try {
    return promiseThen(p, onFulfilled)
  } finally {
    delete (p as any).constructor
  }
}

/**
 * User-Agent Client Hints
 * 改写 NavigatorUAData 原型上的 getter 与方法，页面拿到的仍是原生对象（引用不变），
 * 不再以代理包装实例：页面在原型上添加的方法、getter 接触不到被包装的原始对象
 */
const hookUserAgentData = (ctx: FingerprintContext, info: ClientHintsInfo) => {
  const { gthis, useProxy, useGetterProxy } = ctx
  const proto = (gthis as any).NavigatorUAData?.prototype
  if (!proto) return;

  const uaData = info.uaData
  const RealmArray = gthis.Array
  const RealmObject = gthis.Object

  /**
   * 与原生一致：每次返回新的数组（brands getter 返回冻结的数组），元素只含 brand / version
   * @param major 版本号只保留主版本
   */
  const brandList = (major: boolean, frozen = false) => {
    const list = uaData.versions
    const res = new RealmArray()
    for (let i = 0; list && i < list.length; i++) {
      const o: any = new RealmObject()
      const v = list[i].version
      const dot = strIndexOf(v, '.')
      o.brand = list[i].brand
      o.version = major && dot !== -1 ? strSlice(v, 0, dot) : v
      res[i] = o
    }
    return frozen ? objectFreeze(res) : res
  }

  const values: Record<string, any> = nullObject()
  values.mobile = uaData.mobile
  values.platform = uaData.platform
  useGetterProxy(proto, ['mobile', 'platform'], (key: string, getter) => (
    valueGetterHandler(getter, values[key], 'weak.userAgentData')
  ))
  useGetterProxy(proto, 'brands', (_, getter) => ({
    apply(target: any, thisArg: any, args: any) {
      const raw = apply(getter, thisArg, [])
      if (isCloudflareCaller()) return raw;
      notify('weak.userAgentData')
      return brandList(true, true)
    }
  }))

  useProxy(proto, 'toJSON', {
    apply(target: any, thisArg: any, args: any) {
      const res: any = apply(target, thisArg, args)
      if (isCloudflareCaller()) return res;
      notify('weak.userAgentData')
      res.brands = brandList(true)
      res.mobile = uaData.mobile
      res.platform = uaData.platform
      return res
    }
  })

  const RealmPromise = gthis.Promise
  useProxy(proto, 'getHighEntropyValues', {
    apply(target: any, thisArg: any, args: any) {
      const p: Promise<any> = apply(target, thisArg, args)
      if (isCloudflareCaller()) return p;
      notify('weak.userAgentData')
      return thenSafely(RealmPromise, p, (v: any) => {
        if (!v) return v;
        if (v.architecture != null) v.architecture = uaData.arch;
        if (v.bitness != null) v.bitness = uaData.bitness;
        if (v.model != null) v.model = uaData.model;
        if (v.mobile != null) v.mobile = uaData.mobile;
        if (v.platform != null) v.platform = uaData.platform;
        if (v.platformVersion != null) v.platformVersion = uaData.platformVersion;
        if (v.formFactors != null) v.formFactors = uaData.formFactors;
        if (v.uaFullVersion != null) v.uaFullVersion = uaData.uaFullVersion;
        if (v.brands != null) v.brands = brandList(true);
        if (v.fullVersionList != null) v.fullVersionList = brandList(false);
        return v;
      })
    }
  })
}

export const hookTasks: HookTask[] = [
  /**
   * iframe html hook
   * 静态iframe注入
   */
  {
    onEnable: ({ win, hookTarget }) => {
      if (!win) return;

      // 监听DOM初始化（使用该窗口自己的 MutationObserver：钩取新窗口时它尚未被页面改写）
      const observer: MutationObserver = new win.MutationObserver((mutations) => {
        /* 按下标遍历并使用原生 getter，页面改写迭代器或 nodeName 也无法让 iframe 漏掉 */
        for (let i = 0; i < mutations.length; i++) {
          const nodes = addedNodesOf(mutations[i])
          for (let j = 0; j < nodes.length; j++) {
            if (nodeNameOf(nodes[j]) === 'IFRAME') {
              hookTarget(nodes[j])
            }
          }
        }
      });
      const init: MutationObserverInit = nullObject()
      init.childList = true
      init.subtree = true
      observer.observe(win.document.documentElement, init);

      const closeObserver = () => {
        observer.disconnect()
        win.removeEventListener('DOMContentLoaded', closeObserver, true)
        win.removeEventListener('load', closeObserver, true)
      }
      win.addEventListener('DOMContentLoaded', closeObserver, true)
      win.addEventListener('load', closeObserver, true)
    },
  },

  /**
   * iframe script hook
   * 动态iframe注入
   */
  {
    onEnable: ({ win, hookTarget, useProxy, useSetterProxy }) => {
      if (!win) return;

      const mem: WeakSet<object> = new NativeWeakSet()

      const handler = {
        apply(target: any, thisArg: any, args: any) {
          const res: any = apply(target, thisArg, args);
          /* 原生方法查找与遍历，页面改写 getElementsByTagName、WeakSet 等也无法让 iframe 漏掉 */
          const fs = findIframes(thisArg)
          for (let i = 0; i < fs.length; i++) {
            const f = fs[i]
            !weakSetHas(mem, f) && hookTarget(f) && weakSetAdd(mem, f);
          }
          return res;
        }
      }

      useProxy(win.Node.prototype, [
        'appendChild', 'insertBefore', 'replaceChild'
      ], handler);
      useProxy(win.Element.prototype, [
        'append', 'prepend', 'replaceChildren', 'insertAdjacentElement', 'insertAdjacentHTML',
        'before', 'after', 'replaceWith', 'setHTMLUnsafe',
      ], handler);
      /* document.write 写入的 iframe：写入后立即注入，页面紧接着读取也是伪装值 */
      useProxy(win.Document.prototype, [
        'append', 'prepend', 'replaceChildren', 'write', 'writeln',
      ], handler);
      useProxy(win.ShadowRoot.prototype, [
        'append', 'prepend', 'replaceChildren', 'setHTMLUnsafe',
      ], handler);

      useSetterProxy(win.Element.prototype, ['innerHTML', 'outerHTML'], handler);
      useSetterProxy(win.ShadowRoot.prototype, ['innerHTML'], handler);
    }
  },

  /**
   * Worker
   */
  {
    onEnable: ({ win, conf, info, useProxy, makeScript }) => {
      if (!win) return;

      /*
       * 注入脚本包含配置与种子：拼接 Blob 时使用此刻取得的原生构造函数与方法，
       * 页面之后替换 Blob、URL.createObjectURL、String.prototype 等也拿不到脚本内容
       */
      const NativeBlob = win.Blob
      const NativeTrustedScriptURL = win.TrustedScriptURL
      const rawCreateObjectURL = win.URL.createObjectURL
      const urlObject = win.URL
      const blobMap: Map<string, Blob> = new NativeMap();

      useProxy(win.URL, 'createObjectURL', {
        apply(target, thisArg: URL, args: any) {
          const blob = args[0]
          if (isBlob(blob)) {
            const url = apply(target, thisArg, args);
            mapSet(blobMap, url, blob);
            return url;
          }
          return apply(target, thisArg, args)
        }
      })

      useProxy(win.URL, 'revokeObjectURL', {
        apply(target, thisArg: URL, args: any) {
          const url = args[0]
          mapDelete(blobMap, url)
          return apply(target, thisArg, args)
        }
      })

      let tsURLLookup: WeakMap<TrustedScriptURL, TrustedTypePolicy>
      if (win.TrustedTypePolicy) {
        tsURLLookup = new NativeWeakMap()
        useProxy(win.TrustedTypePolicy.prototype, 'createScriptURL', {
          apply(target, thisArg: TrustedTypePolicy, args: any) {
            const res = apply(target, thisArg, args);
            weakMapSet(tsURLLookup, res, thisArg);
            return res;
          }
        })
      }

      function createScriptUrl(url: string) {
        if (strSlice(url, 0, 5) === 'blob:') {
          const blobScript = mapGet(blobMap, url);
          if (!blobScript) return url;

          const injected = makeScript();
          if (injected == null) return url;

          const options: BlobPropertyBag = nullObject()
          options.type = 'application/javascript'
          const blob = construct(NativeBlob, [
            ownIterable<BlobPart>(['(function(){' + injected + '})();', blobScript]), options,
          ]);
          return apply(rawCreateObjectURL, urlObject, [blob]) as string;
        }
        return url;
      }

      /*
       * URL 加载的专用 Worker 换成 blob Worker：先运行注入脚本，再加载原脚本（Worker 内修正地址，见下一个任务）
       * blob Worker 继承页面的 CSP：只有确认页面没有限制 Worker 的策略时才替换（响应头由后台读取，<meta> 在此检查），
       * 未知时保持原样；SharedWorker 换成 blob 会失去共享语义，不替换
       */
      const NativeURL = win.URL
      const getUrlHref = getOwnPropertyDescriptor(NativeURL.prototype, 'href')!.get!
      const getUrlOrigin = getOwnPropertyDescriptor(NativeURL.prototype, 'origin')!.get!
      const getUrlProtocol = getOwnPropertyDescriptor(NativeURL.prototype, 'protocol')!.get!
      const getBaseURI = getOwnPropertyDescriptor(win.Node.prototype, 'baseURI')!.get!

      const metaRestricts = (doc: Document) => {
        const metas = queryAll(doc, 'meta[http-equiv]')
        for (let i = 0; i < metas.length; i++) {
          const equiv = attrOf(metas[i], 'http-equiv')
          if (equiv && strToLowerCase(equiv) === 'content-security-policy' && isRestrictiveForWorkers(attrOf(metas[i], 'content'))) {
            return true
          }
        }
        return false
      }

      const wrapUrlWorker = (url: string, options: any): { url: string, options: any } | undefined => {
        if (info.workerBlob !== 'allow' || metaRestricts(win.document)) return;

        /* 只处理同源的 http(s) 脚本，其余交给原生构造函数（跨源时原生会抛错） */
        let parsed: URL
        try {
          parsed = construct(NativeURL, [url, apply(getBaseURI, win.document, [])])
        } catch (_) {
          return
        }
        const protocol = apply(getUrlProtocol, parsed, [])
        if (protocol !== 'http:' && protocol !== 'https:') return;
        if (apply(getUrlOrigin, parsed, []) !== win.location.origin) return;
        const abs: string = apply(getUrlHref, parsed, [])

        /* 读取一次 type 并写成自有属性，原生方法不会再读取页面的 getter */
        let type = 'classic'
        let opts = options
        if (options != null && (typeof options === 'object' || typeof options === 'function')) {
          const raw = options.type
          if (raw !== undefined) type = `${raw}`
          opts = derive(options, 'type', type)
        } else if (options !== undefined) {
          return
        }
        if (type !== 'classic' && type !== 'module') return;

        const injected = makeScript(abs)
        if (injected == null) return;

        const blobOptions: BlobPropertyBag = nullObject()
        blobOptions.type = 'application/javascript'
        const toBlobUrl = (code: string): string => apply(rawCreateObjectURL, urlObject, [
          construct(NativeBlob, [ownIterable<BlobPart>([code]), blobOptions]),
        ])

        const prelude = '(function(){' + injected + '})();'
        /*
         * 模块 Worker：注入脚本单独成为模块，按顺序静态导入后再导入原脚本，整个模块图同步求值完成，
         * 页面在创建后立即发送的消息不会在原脚本设置 onmessage 之前到达（动态 import 会出现这种情况）
         */
        const code = type === 'module' ?
          'import ' + stringify(toBlobUrl(prelude)) + ';\nimport ' + stringify(abs) + ';' :
          prelude + '\nimportScripts(' + stringify(abs) + ');'
        return { url: toBlobUrl(code), options: opts }
      }

      {
        const makeHandler = (name: string) => ({
          construct(target: any, args: any, newTarget: any) {
            notify('other.worker.' + name)
            const url = args[0];

            if (NativeTrustedScriptURL && url instanceof NativeTrustedScriptURL && tsURLLookup) {
              const ttp = weakMapGet(tsURLLookup, url);
              if (ttp) {
                args[0] = ttp.createScriptURL(
                  createScriptUrl('' + url)
                );
              }
            } else if (args.length > 0 && typeof url !== 'symbol') {
              /* 与原生一致地转为字符串（只转换一次），URL 对象等也能识别 */
              const str = '' + url
              args[0] = createScriptUrl(str);
              if (args[0] === str && name === 'web') {
                const wrapped = wrapUrlWorker(str, args[1])
                if (wrapped) {
                  args[0] = wrapped.url
                  if (args.length > 1) args[1] = wrapped.options
                }
              }
            }

            return construct(target, args, newTarget) as Worker;
          }
        })
        useProxy(win, 'Worker', makeHandler('web'));
        useProxy(win, 'SharedWorker', makeHandler('shared'));
      }

      {
        const isDisabled = conf.fp.other.serviceWorker.type === HookType.disabled;
        const RealmPromise = win.Promise
        const promiseReject = RealmPromise.reject
        const RealmDOMException = win.DOMException
        useProxy(win.ServiceWorkerContainer.prototype, 'register', {
          apply(target, thisArg, args) {
            notify('other.worker.service')
            if (isDisabled) {
              return apply(promiseReject, RealmPromise, [
                construct(RealmDOMException, ["Service workers are disabled", "SecurityError"])
              ]);
            }
            return apply(target, thisArg, args);
          }
        });
      }
    }
  },

  /**
   * URL Worker 被换成 blob Worker 后，修正 Worker 内的地址：
   * location 返回原脚本地址；importScripts、fetch、XMLHttpRequest 等的相对地址以原脚本地址为基准
   */
  {
    condition: ({ worker, baseUrl }) => !!worker && !!baseUrl,
    onEnable: ({ gthis, baseUrl, useProxy, useGetterProxy }) => {
      const base = baseUrl!
      const NativeURL = gthis.URL
      const urlProto = NativeURL.prototype
      const getHref = getOwnPropertyDescriptor(urlProto, 'href')!.get!

      /* WorkerLocation */
      const keys = ['href', 'origin', 'protocol', 'host', 'hostname', 'port', 'pathname', 'search', 'hash']
      const parsed = construct(NativeURL, [base])
      const parts: Record<string, string> = nullObject()
      for (let i = 0; i < keys.length; i++) {
        parts[keys[i]] = apply(getOwnPropertyDescriptor(urlProto, keys[i])!.get!, parsed, [])
      }
      const locationProto = (gthis as any).WorkerLocation?.prototype
      if (locationProto) {
        useGetterProxy(locationProto, keys, (key: string, getter) => ({
          apply(target: any, thisArg: any) {
            apply(getter, thisArg, [])
            return parts[key]
          }
        }))
        useProxy(locationProto, 'toString', {
          apply(target: any, thisArg: any, args: any[]) {
            apply(target, thisArg, args)
            return parts.href
          }
        })
      }

      /* 相对地址以原脚本地址为基准；无法解析时保持原样，交给原生方法报错 */
      const resolve = (input: unknown) => {
        const str = `${input as any}`
        try {
          return apply(getHref, construct(NativeURL, [str, base]), []) as string
        } catch (_) {
          return str
        }
      }

      const getRequestUrl = gthis.Request && getOwnPropertyDescriptor(gthis.Request.prototype, 'url')?.get
      const isRequest = (v: unknown) => {
        if (!getRequestUrl || v == null || typeof v !== 'object') return false;
        try {
          apply(getRequestUrl, v, [])
          return true
        } catch (_) {
          return false
        }
      }

      useProxy(gthis, 'importScripts', {
        apply(target: any, thisArg: any, args: any[]) {
          for (let i = 0; i < args.length; i++) args[i] = resolve(args[i])
          return apply(target, thisArg, args)
        }
      })
      useProxy(gthis, 'fetch', {
        apply(target: any, thisArg: any, args: any[]) {
          if (args.length > 0 && !isRequest(args[0])) args[0] = resolve(args[0])
          return apply(target, thisArg, args)
        }
      })
      gthis.XMLHttpRequest && useProxy(gthis.XMLHttpRequest.prototype, 'open', {
        apply(target: any, thisArg: any, args: any[]) {
          if (args.length > 1) args[1] = resolve(args[1])
          return apply(target, thisArg, args)
        }
      })
      const ctors = ['Request', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker']
      for (let i = 0; i < ctors.length; i++) {
        if (!(gthis as any)[ctors[i]]) continue;
        useProxy(gthis as any, ctors[i], {
          construct(target: any, args: any[], newTarget: any): object {
            if (args.length > 0 && !isRequest(args[0])) args[0] = resolve(args[0])
            return construct(target, args, newTarget)
          }
        })
      }
    },
  },

  /**
   * Navigator
   */
  {
    condition: ({ conf: { fp: { navigator: n } }, isDefault }) => (
      !isDefault([n.clientHints, n.languages, n.hardwareConcurrency, n.deviceMemory])
    ),
    onEnable: (ctx) => {
      const { gthis, conf, useHookMode, useGetterProxy } = ctx;
      const fps = conf.fp.navigator;

      /* 改写原型上的 getter：实例上不产生自有属性，原型 getter 也无法绕过 */
      const prototype = (gthis.Navigator ?? gthis.WorkerNavigator).prototype;

      /* userAgent & userAgentData */
      const uaInfo = useHookMode(fps.clientHints).value;
      if (uaInfo != null) {
        if (uaInfo.ua != null) {
          useGetterProxy(prototype, [
            'userAgent', 'appVersion', 'platform',
          ], (key, getter) => {
            const value = uaInfo.ua[key]
            if (value == null) return;
            return valueGetterHandler(getter, value, 'weak.' + key)
          })
        }
        if (uaInfo.uaData != null) {
          hookUserAgentData(ctx, uaInfo)
        }
      }

      /* other */
      useGetterProxy(prototype, [
        'languages', 'hardwareConcurrency', 'deviceMemory' as keyof Navigator,
      ], (key, getter) => {
        let value: any = useHookMode(fps[key as keyof typeof fps] as any).value
        if (value == null) return;
        /* 与原生一致：本窗口的冻结数组，每次读取返回同一对象 */
        if (key === 'languages' && isArray(value)) {
          const list = new gthis.Array()
          for (let i = 0; i < value.length; i++) list[i] = value[i]
          value = objectFreeze(list)
        }
        return valueGetterHandler(getter, value, 'weak.' + key)
      })

      {
        const value = useHookMode(fps.languages).value?.[0]
        value != null && useGetterProxy(prototype, 'language', (_, getter) => (
          valueGetterHandler(getter, value, 'weak.languages')
        ))
      }
    },
  },

  /**
   * Screen
   */
  {
    condition: ({ conf: { fp: { screen: s } }, isDefault }) => !isDefault([s.size, s.depth]),
    onEnable: ({ win, conf, useHookMode, useGetterProxy, useProxy }) => {
      if (!win) return;

      const fps = conf.fp.screen;
      const ws = win.screen;
      /* 钩取前读取真实尺寸 */
      const realSize = { width: ws.width, height: ws.height }

      /* Screen Depth */
      const depth = useHookMode(fps.depth).value
      if (depth) {
        const tasks: { [key in keyof Screen]?: number } = {
          'colorDepth': depth.colorDepth ?? depth.color,
          'pixelDepth': depth.pixelDepth ?? depth.pixel,
        }
        useGetterProxy(win.Screen.prototype,
          ['colorDepth', 'pixelDepth'],
          (key, getter) => {
            const num = tasks[key]
            if (num == null) return;
            return valueGetterHandler(getter, num, 'weak.' + key)
          });
      }

      /* Screen Size */
      {
        const { value, seed } = useHookMode(fps.size)
        const size: any =
          seed != null ? randomScreenSize(ws, seed) :
            value != null ? value :
              null;

        if (size) {
          if (size.width != null) size.availWidth = size.width - (ws.width - ws.availWidth);
          if (size.height != null) size.availHeight = size.height - (ws.height - ws.availHeight);

          useGetterProxy(win.Screen.prototype, [
            'width', 'height', 'availWidth', 'availHeight'
          ], (key, getter) => {
            const num = size[key]
            if (num == null) return;
            return valueGetterHandler(getter, num, 'weak.' + key)
          })

          /*
           * matchMedia：device-width / device-height / device-aspect-ratio 按伪装尺寸求值
           * 先由原生方法转换参数（报错与原生一致），按其规范化的查询改写后重新求值；
           * media 读取到的仍是页面查询的规范化结果。样式表中的 @media 不经过这里，无法处理
           */
          const spoofSize = { width: size.width ?? realSize.width, height: size.height ?? realSize.height }
          const mediaGetter = win.MediaQueryList && getOwnPropertyDescriptor(win.MediaQueryList.prototype, 'media')?.get
          if (mediaGetter && typeof win.matchMedia === 'function') {
            const originals = new NativeWeakMap<object, string>()
            const originalOf = new NativeMap<string, string>()
            useProxy(win, 'matchMedia', {
              apply(target: any, thisArg: any, args: any[]) {
                const mql = apply(target, thisArg, args)
                if (isCloudflareCaller()) return mql;
                const media: string = apply(mediaGetter, mql, [])
                const rewritten = rewriteMediaQuery(media, realSize, spoofSize)
                if (rewritten === media) return mql;
                notify('weak.width')
                const res: MediaQueryList = apply(target, thisArg, [rewritten])
                weakMapSet(originals, res, media)
                mapSet(originalOf, apply(mediaGetter, res, []), media)
                return res
              }
            })
            useGetterProxy(win.MediaQueryList.prototype, 'media', {
              apply(target: any, thisArg: any, args: any[]) {
                const raw = apply(target, thisArg, args)
                return weakMapGet(originals, thisArg) ?? raw
              }
            })
            /* 改写后的查询变化时，事件中的 media 也还原为页面的查询 */
            if (win.MediaQueryListEvent) {
              useGetterProxy(win.MediaQueryListEvent.prototype, 'media', {
                apply(target: any, thisArg: any, args: any[]) {
                  const raw = apply(target, thisArg, args)
                  return (typeof raw === 'string' && mapGet(originalOf, raw)) || raw
                }
              })
            }
          }
        }
      }

    },
  },

  /**
   * Canvas 2d
   */
  {
    condition: ({ conf }) => conf.fp.other.canvas.type !== HookType.default,
    onEnable: (ctx) => {
      const { win, conf, useSeed, useProxy } = ctx;
      if (!win) return;

      /* getImageData */
      {
        const seed = useSeed(conf.fp.other.canvas)
        if (seed != null) {
          const noise = randomCanvasNoise(seed)
          useProxy(win.CanvasRenderingContext2D.prototype, 'getImageData', {
            apply: (target, thisArg: CanvasRenderingContext2D, args: Parameters<typeof CanvasRenderingContext2D.prototype.getImageData>) => {
              notify('strong.canvas')
              return drawNoiseTo2d(ctx, noise, thisArg, args);
            }
          })
        }
      }
    },
  },

  /**
   * Canvas WebGL
   */
  {
    condition: ({ conf }) => conf.fp.other.webgl.type !== HookType.default,
    onEnable: ({ gthis, conf, useSeed, useProxy }) => {
      const seed = useSeed(conf.fp.other.webgl)
      if (seed != null) {
        const randGen = makeSeededRandom(seed, 1e-2, 1e-5);
        const randFn = () => numToFixed(randGen(), 5);

        const vecOffset = `vec4(${randFn()},${randFn()},${randFn()},0)`;

        /* 以原生 getShaderParameter 确认是片元着色器：ES 3.00 顶点着色器的 out vec4 是传给片元的变量，不能改 */
        const FRAGMENT_SHADER = 0x8B30
        const SHADER_TYPE = 0x8B4F
        const getShaderParameters = [
          gthis.WebGLRenderingContext?.prototype.getShaderParameter,
          gthis.WebGL2RenderingContext?.prototype.getShaderParameter,
        ]
        const isFragmentShader = (gl: any, shader: any) => {
          for (let i = 0; i < getShaderParameters.length; i++) {
            const fn = getShaderParameters[i]
            if (!fn) continue;
            try {
              return apply(fn, gl, [shader, SHADER_TYPE]) === FRAGMENT_SHADER
            } catch (_) { }
          }
          return false
        }

        const handler = {
          apply: (target: any, thisArg: WebGLRenderingContext | WebGL2RenderingContext, args: any) => {
            if (isCloudflareCaller()) {
              return apply(target, thisArg, args);
            }
            notify('strong.webgl')

            /* 与原生一致地转为字符串：页面传入带 toString 的对象也会被处理 */
            if (args.length >= 2) {
              const source = toDOMString(args[1])
              args[1] = source
              if (fragmentOutputs(source).length && isFragmentShader(thisArg, args[0])) {
                args[1] = addFragColorOffset(source, vecOffset);
              }
            }

            return apply(target, thisArg, args);
          }
        }
        useProxy(gthis.WebGLRenderingContext.prototype, 'shaderSource', handler)
        useProxy(gthis.WebGL2RenderingContext.prototype, 'shaderSource', handler)
      }
    },
  },

  /**
   * WebGL GPU 参数信息
   */
  {
    condition: ({ conf, isDefault }) => !isDefault(conf.fp.normal.gpuInfo),
    onEnable: ({ gthis, conf, useHookMode, useProxy, useGetterProxy }) => {
      const fps = conf.fp.normal

      /* WEBGL_debug_renderer_info 的常量：不经由页面可改写的 getExtension 获取 */
      const UNMASKED_VENDOR_WEBGL = 0x9245
      const UNMASKED_RENDERER_WEBGL = 0x9246

      /* Report: Parameter */
      const info = useHookMode(fps.gpuInfo).value
      if (info) {
        const handler = {
          apply: (target: any, thisArg: WebGLRenderingContext, args: any) => {
            if (isCloudflareCaller()) {
              return apply(target, thisArg, args);
            }
            if (args.length > 0) args[0] = toUint32(args[0])
            const pname = args[0]
            if (pname === UNMASKED_VENDOR_WEBGL || pname === UNMASKED_RENDERER_WEBGL) {
              notify('weak.gpuInfo')
              // 模拟调用：原生返回有效值（扩展已启用）时才替换
              const real = apply(target, thisArg, args)
              const value = pname === UNMASKED_VENDOR_WEBGL ? info.vendor : info.renderer
              return value && real ? value : real
            }
            return apply(target, thisArg, args);
          }
        }
        useProxy(gthis.WebGLRenderingContext.prototype, 'getParameter', handler);
        useProxy(gthis.WebGL2RenderingContext.prototype, 'getParameter', handler);

        /* WebGPU 的适配器信息与伪装的 WebGL 显卡一致（GPUAdapter.info、GPUDevice.adapterInfo 都是它的实例） */
        const infoProto = (gthis as any).GPUAdapterInfo?.prototype
        if (infoProto) {
          const adapterInfo: Record<string, string> = nullObject()
          const derived = adapterInfoOf(info.vendor, info.renderer)
          adapterInfo.vendor = derived.vendor
          adapterInfo.architecture = derived.architecture
          adapterInfo.device = derived.device
          adapterInfo.description = derived.description
          useGetterProxy(infoProto, ['vendor', 'architecture', 'device', 'description'], (key: string, getter) => (
            valueGetterHandler(getter, adapterInfo[key], 'weak.gpuInfo')
          ))
        }
      }
    }
  },

  /**
   * Canvas Base
   */
  {
    condition: ({ conf }) => conf.fp.other.canvas.type !== HookType.default,
    onEnable: (ctx) => {
      const { gthis, win, conf, useSeed, useProxy } = ctx;

      const seedCanvas = useSeed(conf.fp.other.canvas);

      const noiseCanvas = seedCanvas == null ? null : randomCanvasNoise(seedCanvas);

      const handler = {
        apply: (target: Function, thisArg: OffscreenCanvas | HTMLCanvasElement, args: any) => {
          if (isCloudflareCaller()) {
            return apply(target, thisArg, args);
          }
          /*
           * 2d：空画布（宽或高为 0）无像素可处理，跳过以保持与原生一致（否则 getImageData 会抛 IndexSizeError）
           * 尺寸与上下文使用原生方法读取，页面改写 width、getContext 也无法跳过加噪
           */
          const c2d = noiseCanvas ? getCanvas2d(thisArg) : undefined
          if (noiseCanvas && c2d) {
            notify('strong.canvas');
            drawNoiseTo2d(ctx, noiseCanvas, c2d.ctx, [0, 0, c2d.width, c2d.height]);
          }
          return apply(target, thisArg, args);
        }
      }

      useProxy(gthis.OffscreenCanvas.prototype, 'convertToBlob', handler);

      if (win) {
        useProxy(win.HTMLCanvasElement.prototype, ['toDataURL', 'toBlob'], handler);
      }

      /*
       * getContext：只记录取得过上下文的画布，参数与结果原样传递（不改动上下文属性，
       * getContextAttributes 与原生一致）。加噪只处理这些画布，不替页面创建上下文
       */
      const contextHandler = {
        apply: (target: Function, thisArg: OffscreenCanvas | HTMLCanvasElement, args: any) => {
          const res = apply(target, thisArg, args)
          if (res != null) markCanvasContext(thisArg)
          return res
        }
      }
      if (gthis.OffscreenCanvas) useProxy(gthis.OffscreenCanvas.prototype, 'getContext', contextHandler);
      if (win) useProxy(win.HTMLCanvasElement.prototype, 'getContext', contextHandler);
    },
  },

  /**
   * Canvas CJK
   * 阻止通过 Canvas 文本渲染与字体测量探测中文环境
   */
  {
    condition: ({ conf }) => conf.fp.other.canvasCjk?.type === HookType.enabled,
    onEnable: ({ gthis, win, useRaw, useProxy, useGetterProxy, useSetterProxy }) => {
      /*
       * 中文字符按缺字渲染
       * 参数个数足够时先与原生一致地转为字符串：页面传入带 toString 的对象也会被处理
       */
      const textHandler = (minArgs: number) => ({
        apply(target: any, thisArg: any, args: any[]) {
          if (isCloudflareCaller()) {
            return apply(target, thisArg, args)
          }
          if (args.length >= minArgs) {
            const text = toDOMString(args[0])
            args[0] = text
            if (hasCjk(text)) {
              notify('strong.canvasCjk')
              args[0] = maskCjk(text)
            }
          }
          return apply(target, thisArg, args)
        }
      })

      /* 实际生效的 font -> 页面设置的 font */
      const shownFonts: Map<string, string> = new NativeMap()
      /* 页面设置的 font -> 占位族名 */
      const placeholders: Map<string, string> = new NativeMap()
      let placeholderCount = 0

      const intfs = [win?.CanvasRenderingContext2D, gthis.OffscreenCanvasRenderingContext2D]
      for (let i = 0; i < intfs.length; i++) {
        const intf = intfs[i]
        if (!intf) continue;
        const proto = intf.prototype

        useProxy(proto, ['fillText', 'strokeText'], textHandler(3))
        useProxy(proto, 'measureText', textHandler(1))

        /* 移除中文字体族，读取时仍返回页面设置的值 */
        const desc = getOwnPropertyDescriptor(proto, 'font')
        const rawGet = useRaw(desc?.get)
        const rawSet = useRaw(desc?.set)
        if (!rawGet || !rawSet) continue;

        let chainGet: (() => string) | undefined

        useGetterProxy(proto, 'font', (_, getter) => {
          chainGet = getter
          return {
            apply(target, thisArg: any, args: any) {
              if (isCloudflareCaller()) {
                return apply(getter, thisArg, []);
              }
              const value = apply(getter, thisArg, [])
              return mapGet(shownFonts, value) ?? value
            }
          }
        })

        useSetterProxy(proto, 'font', (_, setter) => ({
          apply(target, thisArg: any, args: any) {
            if (isCloudflareCaller()) {
              return apply(setter, thisArg, [args[0]]);
            }
            const value = toDOMString(args[0])
            if (!chainGet || !hasCjkFontFamily(value)) {
              return apply(setter, thisArg, [value])
            }
            notify('strong.canvasCjk')

            /* 由浏览器规范化原始值，非法值会被忽略 */
            const before = apply(rawGet, thisArg, [])
            apply(rawSet, thisArg, [value])
            const shown = apply(rawGet, thisArg, [])
            if (shown === before) return;

            let placeholder = mapGet(placeholders, shown)
            if (!placeholder) {
              placeholder = `"x-cjk-${++placeholderCount}"`
              mapSet(placeholders, shown, placeholder)
            }
            const stripped = stripCjkFontFamilies(shown, placeholder)
            if (!stripped) return apply(setter, thisArg, [value]);

            apply(setter, thisArg, [stripped])
            mapSet(shownFonts, apply(chainGet, thisArg, []), shown)
          }
        }))
      }
    },
  },

  /**
   * Audio
   * 音频指纹
   */
  {
    condition: ({ conf }) => conf.fp.other.audio.type !== HookType.default,
    onEnable: ({ win, conf, useSeed, useProxy, useGetterProxy }) => {
      if (!win) return;

      const seed = useSeed(conf.fp.other.audio)
      if (seed == null) return;

      const mem: WeakSet<object> = new NativeWeakSet()

      useProxy(win.AudioBuffer.prototype, 'getChannelData', {
        apply: (target, thisArg: AudioBuffer, args: Parameters<typeof AudioBuffer.prototype.getChannelData>) => {
          if (isCloudflareCaller()) {
            return apply(target, thisArg, args);
          }
          notify('strong.audio')
          const data = apply(target, thisArg, args)
          if (weakSetHas(mem, data)) return data;

          /* 原生 length、手写绝对值：页面改写 TypedArray 原型或 Math.abs 无法跳过加噪、读到原始采样 */
          const len = typedArrayLength(data)
          const step = len > 2000 ? 100 : 20;
          for (let i = 0; i < len; i += step) {
            const v = data[i]
            if (v !== 0 && (v < 0 ? -v : v) > 1e-7) {
              data[i] += seededRandom(seed + i) * 1e-7;
            }
          }

          weakSetAdd(mem, data)
          return data;
        }
      })

      /* 已钩取的 getChannelData：页面之后改写原型上的方法也无法跳过 */
      const getChannelData = win.AudioBuffer.prototype.getChannelData

      useProxy(win.AudioBuffer.prototype, [
        'copyFromChannel', 'copyToChannel',
      ], {
        apply: (target, thisArg: AudioBuffer, args: any) => {
          if (isCloudflareCaller()) {
            return apply(target, thisArg, args);
          }
          if (args.length > 1) {
            args[1] = toUint32(args[1])
            /* 先为该声道加噪；参数非法时交给原生方法抛出它自己的错误 */
            try {
              apply(getChannelData, thisArg, [args[1]])
            } catch (_) { }
          }
          return apply(target, thisArg, args)
        }
      })

      const dcNoise = seededRandom(seed) * 1e-7;
      useGetterProxy(win.DynamicsCompressorNode.prototype, 'reduction', (_, getter) => ({
        apply(target, thisArg, args: any) {
          if (isCloudflareCaller()) {
            return apply(getter, thisArg, []);
          }
          notify('strong.audio')
          const res = apply(getter, thisArg, []);
          return (typeof res === 'number' && res !== 0) ? res + dcNoise : res;
        }
      }))

    },
  },

  /**
   * Timezone
   * 时区
   */
  {
    condition: ({ conf }) => conf.fp.other.timezone.type !== HookType.default,
    onEnable: ({ gthis, conf, logger, useHookMode, useProxy }) => {
      const tzValue = useHookMode(conf.fp.other.timezone).value
      if (!tzValue) return;

      if (tzValue.zone == null) {
        logger.warn('timezone zone is null')
        return;
      }

      if (tzValue.locales == null) {
        logger.warn('timezone locales is null')
        tzValue.locales = []
      }

      /*
       * 换算用到的 Date / Intl 方法在此刻（页面脚本运行前或新窗口刚创建时）取得：
       * 页面之后改写 formatToParts、getTime、Object.assign 等，既无法关闭时区伪装，
       * 也拿不到以系统时区换算的中间结果（否则可反推出真实时区）
       */
      const _Date = gthis.Date;
      const _DateTimeFormat = gthis.Intl.DateTimeFormat;
      const RealmArray = gthis.Array;
      const RealmObject = gthis.Object;
      const formatToParts = _DateTimeFormat.prototype.formatToParts;
      const dateGetTime = _Date.prototype.getTime;
      const dateSetTime = _Date.prototype.setTime;

      /* 无原型的选项对象：页面在 Object.prototype 上添加的属性不会被构造函数读到 */
      const options = (entries: Record<string, any>) => {
        const res = nullObject()
        for (const k in entries) {
          if (hasOwn(entries, k)) res[k] = entries[k]
        }
        return res
      }

      const formatParts = (formatter: Intl.DateTimeFormat, time: number): Intl.DateTimeFormatPart[] | undefined => {
        try {
          return apply(formatToParts, formatter, [time])
        } catch (_) { }
      }

      /**
       * 时区偏移格式化器，返回 "GMT+08:00"、"GMT-04:00"、"GMT"
       */
      const makeOffsetFormatter = (timeZone?: string) => {
        let formatter: Intl.DateTimeFormat
        try {
          formatter = construct(_DateTimeFormat, ['en-US', options(timeZone ? { timeZone, timeZoneName: 'longOffset' } : { timeZoneName: 'longOffset' })])
        } catch (_) {
          return;
        }
        return (time: number) => {
          const parts = formatParts(formatter, time)
          for (let i = 0; parts && i < parts.length; i++) {
            if (parts[i].type === 'timeZoneName') return parts[i].value
          }
        }
      }

      /**
       * "GMT±HH:MM[:SS]" 转为毫秒
       */
      const offsetToMs = (s: string) => {
        if (s.length <= 3) return 0;
        const sign = s[3] === '-' || s[3] === '−' ? -1 : 1
        const units = [3600, 60, 1]
        let total = 0, part = 0, idx = 0
        for (let i = 4; i <= s.length && idx < units.length; i++) {
          const c = s[i]
          if (i === s.length || c === ':') {
            total += part * units[idx++]
            part = 0
          } else if (c >= '0' && c <= '9') {
            part = part * 10 + (+c)
          }
        }
        return sign * total * 1000
      }

      const systemFmt = makeOffsetFormatter()
      const customFmt = makeOffsetFormatter(tzValue.zone)

      const now = apply(dateGetTime, construct(_Date, []), [])
      const systemOffsetStr = systemFmt?.(now)
      const customOffsetStr = customFmt?.(now)

      if (systemFmt == null || customFmt == null || systemOffsetStr == null || customOffsetStr == null) {
        logger.warn('timezone customOffsetStr is null')
        return;
      }

      const systemOffsetMs = offsetToMs(systemOffsetStr);
      const customOffsetMs = offsetToMs(customOffsetStr);

      const customOffsetAt = (time: number) => {
        const c = customFmt(time);
        return c ? offsetToMs(c) : customOffsetMs;
      }
      const systemOffsetAt = (time: number) => {
        const s = systemFmt(time);
        return s ? offsetToMs(s) : systemOffsetMs;
      }
      /**
       * 墙上时间（以 UTC 表示的本地日期时间）在某时区对应的时刻，与引擎处理夏令时切换的方式一致：
       * 重叠（回拨）时取较早的时刻；跳过的时间（拨快）按切换前的偏移换算，即顺延到切换之后
       */
      const DAY = 86400000
      const wallToTime = (wall: number, offsetAt: (time: number) => number) => {
        const before = wall - offsetAt(wall - DAY)
        const after = wall - offsetAt(wall + DAY)
        if (before === after) return before;
        const beforeValid = before + offsetAt(before) === wall
        const afterValid = after + offsetAt(after) === wall
        if (beforeValid && afterValid) return before < after ? before : after;
        if (afterValid) return after;
        return before;
      }

      /** 伪装时区下的时刻换算为系统时区下墙上时间相同的时刻（toCustomTime 的逆运算） */
      const toSystemTime = (customTime: number) => {
        if (customTime !== customTime) return customTime;
        return wallToTime(customTime + customOffsetAt(customTime), systemOffsetAt)
      }

      /** 按系统时区解析的本地时间换算为按伪装时区解析的结果 */
      const toCustomTime = (systemTime: number) => {
        if (systemTime !== systemTime) return systemTime;
        return wallToTime(systemTime + systemOffsetAt(systemTime), customOffsetAt)
      }

      const dtFormatter: Intl.DateTimeFormat = construct(_DateTimeFormat, ['en-US', options({
        timeZone: tzValue.zone ?? 'Asia/Shanghai',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        fractionalSecondDigits: 3,
        hour12: false,
        timeZoneName: 'longOffset',
      })])

      const weekdayShortToNumeric: Record<string, number> = options({
        Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
      });

      const monthShortToNumeric: Record<string, number> = options({
        Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
      });

      type TimeParts = Partial<Record<keyof Intl.DateTimeFormatPartTypesRegistry, string>>

      const getParts = (time: number): TimeParts | undefined => {
        const plist = formatParts(dtFormatter, time)
        if (!plist) return;
        const acc: TimeParts = nullObject()
        for (let i = 0; i < plist.length; i++) {
          acc[plist[i].type] = plist[i].value
        }
        return acc
      }

      const toInt = (s?: string) => {
        let n = 0
        for (let i = 0; s && i < s.length; i++) {
          if (s[i] >= '0' && s[i] <= '9') n = n * 10 + (+s[i])
        }
        return n
      }
      const pad2 = (s?: string) => s == null ? s : s.length < 2 ? '0' + s : s
      const stripColon = (s?: string) => {
        if (s == null) return s;
        const i = strIndexOf(s, ':')
        return i === -1 ? s : strSlice(s, 0, i) + strSlice(s, i + 1)
      }

      /* 在页面指定的语言后追加自定义语言 */
      const useCustomLocales = (locales?: Intl.LocalesArgument) => {
        const res = new RealmArray()
        if (locales) {
          if (isArray(locales)) {
            for (let i = 0; i < locales.length; i++) res[res.length] = locales[i]
          } else {
            res[0] = locales
          }
        }
        for (let i = 0; i < tzValue.locales.length; i++) res[res.length] = tzValue.locales[i]
        return res
      }

      /* 页面未指定时区时使用自定义时区；以页面选项为原型，其余选项照常读取 */
      const useCustomTimeZone = (opts: any) => {
        const res = opts !== null && (typeof opts === 'object' || typeof opts === 'function') ?
          objectCreate(opts) : new RealmObject()
        if (res.timeZone === undefined) {
          const desc: PropertyDescriptor = nullObject()
          desc.value = tzValue.zone
          desc.writable = true
          desc.enumerable = true
          desc.configurable = true
          defineProperty(res, 'timeZone', desc)
        }
        return res
      }

      /* DateTimeFormat */
      useProxy(gthis.Intl, 'DateTimeFormat', {
        construct: (target, args: Parameters<typeof Intl.DateTimeFormat>, newTarget) => {
          notify('weak.timezone')
          args[0] = useCustomLocales(args[0]);
          args[1] = useCustomTimeZone(args[1]);
          return construct(target, args, newTarget)
        },
        apply: (target, thisArg: Intl.DateTimeFormat, args: Parameters<typeof Intl.DateTimeFormat>) => {
          notify('weak.timezone')
          args[0] = useCustomLocales(args[0]);
          args[1] = useCustomTimeZone(args[1]);
          return apply(target, thisArg, args)
        },
      })

      /* Date.prototype.toString 被钩取后的代理，Date() 作为函数调用时使用 */
      let dateToString: Function | undefined

      /*
       * 按本地时间解析的输入：年月日等分量（两个及以上参数），或按本地时间解析的日期字符串（见 isLocalDateString）。
       * 参数只由原生构造函数转换一次，页面传入带 valueOf 的对象也只被调用一次
       */
      const isLocalInput = (args: any[]) =>
        args.length >= 2 || (args.length === 1 && typeof args[0] === 'string' && isLocalDateString(args[0]))

      /* Date.parse */
      useProxy(_Date, 'parse', {
        apply: (target: any, thisArg: any, args: any[]) => {
          notify('weak.timezone')
          const time: number = apply(target, thisArg, args)
          return typeof args[0] === 'string' && isLocalDateString(args[0]) ? toCustomTime(time) : time
        }
      })

      /* Date */
      useProxy(gthis, 'Date', {
        construct: (target, args, newTarget) => {
          notify('weak.timezone')
          const raw = construct(target, args, newTarget);
          if (!isLocalInput(args)) return raw;
          const time = apply(dateGetTime, raw, [])
          if (time !== time) return raw;
          return construct(target, [toCustomTime(time)], newTarget);
        },
        /* 与原生一致：作为函数调用时忽略参数，返回当前时间的字符串 */
        apply: (target, thisArg: Date, args: Parameters<typeof Date>) => {
          const date = construct(target, [])
          return dateToString ? apply(dateToString, date, []) : apply(target, undefined, [])
        }
      })

      /* Date getter */
      {
        type DateHandler = (parts: TimeParts, time: number) => any

        const tasks: { [key in keyof Date]?: DateHandler } = {
          'getTimezoneOffset': (_, time) => {
            const c = customFmt(time);
            const v = (c ? offsetToMs(c) : customOffsetMs) / 60000;
            return -(v - v % 1)
          },
          'toString': (p) => `${p.weekday} ${p.month} ${pad2(p.day)} ${p.year} ${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)} ${stripColon(p.timeZoneName)}`,
          'toDateString': (p) => `${p.weekday} ${p.month} ${pad2(p.day)} ${p.year}`,
          'toTimeString': (p) => `${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)} ${stripColon(p.timeZoneName)}`,
          'getHours': (p) => toInt(p.hour),
          'getMinutes': (p) => toInt(p.minute),
          'getSeconds': (p) => toInt(p.second),
          'getFullYear': (p) => toInt(p.year),
          'getDate': (p) => toInt(p.day),
          'getMonth': (p) => monthShortToNumeric[p.month ?? ''] ?? 0,
          'getDay': (p) => weekdayShortToNumeric[p.weekday ?? ''] ?? 0,
        }

        useProxy(gthis.Date.prototype, [
          'getTimezoneOffset', 'toString', 'toDateString', 'toTimeString', 'getHours', 'getMinutes', 'getSeconds',
          'getFullYear', 'getDate', 'getMonth', 'getDay',
        ],
          (key) => {
            const task = tasks[key]
            return task && {
              apply: (target: any, thisArg: Date, args: Parameters<typeof Date.prototype.toString>) => {
                notify('weak.timezone')
                /* 以原生 getTime 取时间值，页面无法经由 Symbol.toPrimitive 干扰换算 */
                let time: number
                try {
                  time = apply(dateGetTime, thisArg, [])
                } catch (_) {
                  /* 非 Date：由原方法抛错，错误信息与调用栈与原生一致 */
                  return apply(target, thisArg, args)
                }
                const parts = getParts(time)
                if (parts) {
                  const res = task(parts, time)
                  if (res != null) return res;
                }
                /* 无效日期：原生结果（NaN、"Invalid Date"）与时区无关 */
                return apply(target, thisArg, args)
              }
            }
          })

        dateToString = gthis.Date.prototype.toString
      }

      /* Date setter */
      useProxy(gthis.Date.prototype,
        ['setFullYear', 'setMonth', 'setDate', 'setHours', 'setMinutes', 'setSeconds'],
        {
          apply(target: any, thisArg: Date, args: any[]) {
            notify('weak.timezone');

            let time: number
            try {
              time = apply(dateGetTime, thisArg, [])
            } catch (_) {
              /* 非 Date：由原方法抛错（先于参数转换），与原生一致 */
              return apply(target, thisArg, args)
            }
            /* 系统时区下墙上时间与伪装时区相同的日期上修改分量（参数由原生方法转换一次），再换算回来 */
            const localDate = construct(_Date, [toSystemTime(time)]);
            apply(target, localDate, args);
            return apply(dateSetTime, thisArg, [toCustomTime(apply(dateGetTime, localDate, []))]);
          }
        })

      /* toLocaleString */
      useProxy(gthis.Date.prototype, [
        'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'
      ], {
        apply: (target: any, thisArg: Date, args: Parameters<typeof Date.prototype.toLocaleString>) => {
          notify('weak.timezone')
          args[0] = useCustomLocales(args[0]);
          args[1] = useCustomTimeZone(args[1]);
          return apply(target, thisArg, args);
        }
      })

      /* Temporal：未指定时区时使用自定义时区 */
      const Temporal = (gthis as any).Temporal
      if (Temporal?.Now) {
        /* 与 Intl 一致的规范化名称 */
        let zoneId: string = tzValue.zone
        try {
          const fmt = construct(_DateTimeFormat, ['en-US', options({ timeZone: tzValue.zone })])
          zoneId = apply(_DateTimeFormat.prototype.resolvedOptions, fmt, []).timeZone
        } catch (_) { }

        useProxy(Temporal.Now, 'timeZoneId', {
          apply() {
            notify('weak.timezone')
            return zoneId
          }
        })
        useProxy(Temporal.Now, ['zonedDateTimeISO', 'plainDateTimeISO', 'plainDateISO', 'plainTimeISO'], {
          apply(target: any, thisArg: any, args: any[]) {
            notify('weak.timezone')
            if (args[0] === undefined) args[0] = zoneId
            return apply(target, thisArg, args)
          }
        })
        /* Instant 没有时区，格式化时使用 DateTimeFormat 的默认时区 */
        Temporal.Instant && useProxy(Temporal.Instant.prototype, 'toLocaleString', {
          apply(target: any, thisArg: any, args: any[]) {
            notify('weak.timezone')
            args[0] = useCustomLocales(args[0]);
            args[1] = useCustomTimeZone(args[1]);
            return apply(target, thisArg, args)
          }
        })
      }
    },
  },

  /**
   * Intl 默认语言
   * 伪装了 navigator.languages 时，各 Intl 服务与 toLocaleString、localeCompare 等方法的默认语言随之一致
   */
  {
    condition: ({ conf: { fp: { navigator: n } } }) => n.languages.type === HookType.value && !!n.languages.value?.length,
    onEnable: ({ gthis, conf, useProxy, useHookMode }) => {
      const languages = useHookMode(conf.fp.navigator.languages).value as string[]
      const Intl = gthis.Intl
      if (!Intl || !languages?.length) return;

      const RealmArray = gthis.Array
      const LOCALES = new RealmArray()
      for (let i = 0; i < languages.length; i++) LOCALES[i] = languages[i]

      const getLocaleBaseName = Intl.Locale && getOwnPropertyDescriptor(Intl.Locale.prototype, 'baseName')?.get
      const isLocale = (v: any) => {
        if (!getLocaleBaseName || v == null || typeof v !== 'object') return false;
        try {
          apply(getLocaleBaseName, v, [])
          return true
        } catch (_) {
          return false
        }
      }

      /**
       * 未指定语言时使用伪装语言；指定时追加为备选，页面请求的语言不受支持时不会回退到真实的默认语言
       * 与 Intl 一致地读取语言列表（字符串、Intl.Locale 或类数组），null 交给原生方法抛错
       */
      const withLocales = (locales: any) => {
        if (locales === undefined) return LOCALES;
        if (locales === null) return locales;
        const res = new RealmArray()
        if (typeof locales === 'string' || isLocale(locales)) {
          res[0] = locales
        } else if (typeof locales === 'object') {
          const len = locales.length
          for (let i = 0; i < len; i++) res[res.length] = locales[i]
        }
        for (let i = 0; i < languages.length; i++) res[res.length] = languages[i]
        return res
      }

      /* Intl 服务的构造函数 */
      {
        const handler = {
          construct(target: any, args: any[], newTarget: any): object {
            notify('weak.languages')
            args[0] = withLocales(args[0])
            return construct(target, args, newTarget)
          },
          apply(target: any, thisArg: any, args: any[]) {
            notify('weak.languages')
            args[0] = withLocales(args[0])
            return apply(target, thisArg, args)
          },
        }
        const names = [
          'Collator', 'DateTimeFormat', 'NumberFormat', 'PluralRules', 'RelativeTimeFormat', 'ListFormat',
          'DisplayNames', 'Segmenter', 'DurationFormat',
        ]
        for (let i = 0; i < names.length; i++) {
          if ((Intl as any)[names[i]]) useProxy(Intl as any, names[i], handler)
        }
      }

      /* 以 (locales, options) 为参数的方法：index 为 locales 参数的位置 */
      const localesAt = (index: number) => ({
        apply(target: any, thisArg: any, args: any[]) {
          args[index] = withLocales(args[index])
          return apply(target, thisArg, args)
        }
      })

      /* 常用路径复用格式化器：每次传入语言列表会让引擎重新创建 ICU 对象，排序、格式化大量数据时很慢 */
      const RawCollator = Intl.Collator
      const RawNumberFormat = Intl.NumberFormat
      const compare: (a: string, b: string) => number = apply(
        getOwnPropertyDescriptor(RawCollator.prototype, 'compare')!.get!, construct(RawCollator, [LOCALES]), [],
      )
      const formatNumber: (n: number) => string = apply(
        getOwnPropertyDescriptor(RawNumberFormat.prototype, 'format')!.get!, construct(RawNumberFormat, [LOCALES]), [],
      )
      const numberValueOf = gthis.Number.prototype.valueOf

      useProxy(gthis.String.prototype, 'localeCompare', {
        apply(target: any, thisArg: any, args: any[]) {
          if (thisArg != null && args[1] === undefined && args[2] === undefined) {
            return compare(`${thisArg}`, `${args[0]}`)
          }
          args[1] = withLocales(args[1])
          return apply(target, thisArg, args)
        }
      })
      useProxy(gthis.Number.prototype, 'toLocaleString', {
        apply(target: any, thisArg: any, args: any[]) {
          if (args[0] === undefined && args[1] === undefined) {
            let n: number | undefined
            try {
              n = apply(numberValueOf, thisArg, [])
            } catch (_) { }
            if (n !== undefined) return formatNumber(n)
          }
          args[0] = withLocales(args[0])
          return apply(target, thisArg, args)
        }
      })
      useProxy(gthis.String.prototype, ['toLocaleUpperCase', 'toLocaleLowerCase'], localesAt(0))
      useProxy(gthis.Date.prototype, ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'], localesAt(0))
      useProxy(gthis.Array.prototype, 'toLocaleString', localesAt(0))
      useProxy(getPrototypeOf(gthis.Uint8Array.prototype), 'toLocaleString', localesAt(0))
      gthis.BigInt && useProxy(gthis.BigInt.prototype, 'toLocaleString', localesAt(0))

      const Temporal = (gthis as any).Temporal
      if (Temporal) {
        const types = [
          'Instant', 'ZonedDateTime', 'PlainDate', 'PlainTime', 'PlainDateTime', 'PlainYearMonth', 'PlainMonthDay', 'Duration',
        ]
        for (let i = 0; i < types.length; i++) {
          const proto = Temporal[types[i]]?.prototype
          proto?.toLocaleString && useProxy(proto, 'toLocaleString', localesAt(0))
        }
      }
    },
  },

  /**
   * Webrtc
   */
  {
    condition: ({ conf }) => conf.fp.other.webrtc.type === HookType.disabled,
    onEnable: ({ win }) => {
      if (!win) return;

      /*
       * 与没有 WebRTC 的浏览器一致：删除接口与方法，而不是设为 undefined（属性仍在，描述符也与原生不同）。
       * RTC 开头的接口整体删除，避免只剩部分接口；媒体设备相关与非安全上下文中的表现一致。
       * MediaStream / MediaStreamTrack 保留：所有浏览器都有，Canvas、WebAudio 的捕获流也用到
       */
      const RTC = /^(?:webkit|moz)?RTC[A-Z]/
      const names = getOwnPropertyNames(win)
      for (let i = 0; i < names.length; i++) {
        if (regExec(RTC, names[i])) reflectDeleteProperty(win, names[i])
      }
      const windowKeys = ['MediaDevices', 'MediaDeviceInfo', 'InputDeviceInfo']
      for (let i = 0; i < windowKeys.length; i++) reflectDeleteProperty(win, windowKeys[i])

      const proto = win.Navigator?.prototype
      const navigatorKeys = ['mediaDevices', 'getUserMedia', 'webkitGetUserMedia', 'mozGetUserMedia']
      for (let i = 0; proto && i < navigatorKeys.length; i++) reflectDeleteProperty(proto, navigatorKeys[i])
    },
  },

  /**
   * Font
   * 字体指纹
   */
  {
    condition: ({ conf }) => conf.fp.other.font.type !== HookType.default,
    onEnable: (ctx) => {
      const { win, conf, useSeed, useGetterProxy } = ctx;

      const seed = useSeed(conf.fp.other.font)
      if (seed == null) return;

      /* Canvas 文本测量 */
      hookTextMetrics(ctx, 'strong.fonts',
        (text, target) => `${target.font}\n${text}`,
        (mark, key) => seededRandom(`${seed}:${key}:${mark}`, 1e-2, -1e-2),
      )

      if (!win) return;

      useGetterProxy(win.HTMLElement.prototype, [
        'offsetHeight', 'offsetWidth'
      ], (key, getter) => ({
        apply(target: () => any, thisArg: HTMLElement, args: any) {
          if (isCloudflareCaller()) {
            return apply(getter, thisArg, []);
          }
          notify('strong.fonts')
          const result = apply(getter, thisArg, []);
          const mark = (thisArg.style?.fontFamily ?? key) + result;
          return result + randomFontNoise(seed, mark);
        }
      }))
    },
  },

  /**
   * Font List
   * 字体策略
   */
  {
    condition: ({ conf }) => conf.action.fonts.enable,
    onEnable: ({ win, worker, conf, useProxy, useSetterProxy, useGetterProxy }) => {
      const action = conf.action.fonts;
      if (action.allowlist.length === 0) return;

      /* 名单在此刻整理；运行时只用缓存的原生方法查询，页面改写 String / Set 原型无法绕过 */
      const allowlist: Set<string> = new NativeSet()
      for (let i = 0; i < action.allowlist.length; i++) {
        setAdd(allowlist, strToLowerCase(action.allowlist[i]))
      }
      const isAllowed = (name: string) => setHas(allowlist, strToLowerCase(stripQuotes(trim(name))))

      /* FontFaceSet */
      if (win) {
        /* 屏蔽名单：添加只覆盖 U+0 的空字体，同名的本地字体被遮蔽 */
        const fonts = win.document.fonts
        const RealmFontFace = win.FontFace
        const rawAdd = win.FontFaceSet.prototype.add
        const rawDelete = win.FontFaceSet.prototype.delete
        for (let i = 0; i < action.blocklist.length; i++) {
          const desc: FontFaceDescriptors = nullObject()
          desc.unicodeRange = 'U+0'
          apply(rawAdd, fonts, [construct(RealmFontFace, [action.blocklist[i], EMPTY_WOFF2, desc])])
        }

        /* 页面只能看到自己添加的字体 */
        const ffs: Set<FontFace> = new NativeSet()
        useProxy(win.FontFaceSet.prototype, 'clear', {
          apply() {
            const list: FontFace[] = []
            apply(SET_METHODS.forEach, ffs, [(f: FontFace) => { list[list.length] = f }])
            for (let i = 0; i < list.length; i++) {
              apply(rawDelete, fonts, [list[i]])
            }
            return apply(SET_METHODS.clear, ffs, [])
          }
        })
        useProxy(win.FontFaceSet.prototype, [
          'add', 'delete', 'has',
        ], (key) => ({
          apply(target, thisArg, args) {
            const res = apply(target, thisArg, args)
            apply(SET_METHODS[key], ffs, args)
            return res
          },
        }))
        useProxy(win.FontFaceSet.prototype, [
          ITERATOR, 'forEach', 'entries', 'keys', 'values',
        ], (key) => ({
          apply(target, thisArg, args) {
            return apply(SET_METHODS[key], ffs, args)
          },
        }))
        useGetterProxy(win.FontFaceSet.prototype, 'size', () => ({
          apply() { return apply(SET_METHODS.size, ffs, []) }
        }))
      }

      /* FontFace */
      if (win) {
        useProxy(win, 'FontFace', {
          construct: (target, args: ConstructorParameters<typeof FontFace>, newTarget) => {
            /* 字符串来源（非二进制数据时与原生一致地转为字符串）：替换不在白名单中的 local() */
            if (args.length > 1 && !isBinaryData(args[1])) {
              args[1] = maskLocalFonts(toDOMString(args[1]), isAllowed)
            }
            return construct(target, args, newTarget)
          },
        })
      }

      /* Canvas 2d */
      if (worker) {
        const fontOf: WeakMap<object, string> = new NativeWeakMap()

        const parseFontString = (fontStr: string) => {
          const match = regExec(WORKER_FONT_RE, fontStr)
          const families: string[] = []
          if (!match) {
            return { prefix: "", families };
          }

          const prefix = trim(match[1]);
          const familyPart = match[2];
          let start = 0
          for (let i = 0; i <= familyPart.length; i++) {
            if (i < familyPart.length && familyPart[i] !== ',') continue;
            families[families.length] = stripQuotes(trim(strSlice(familyPart, start, i)))
            start = i + 1
          }
          return { prefix, families };
        }

        const intf = worker.OffscreenCanvasRenderingContext2D
        if (intf) {
          useSetterProxy(intf.prototype, 'font', (key, setter) => ({
            apply(target, thisArg: CanvasRenderingContext2D, args) {
              notify('strong.fonts')
              const font = toDOMString(args[0])
              if (font) {
                const { prefix, families } = parseFontString(font);
                let kept = ''
                for (let i = 0; i < families.length; i++) {
                  if (!setHas(allowlist, strToLowerCase(families[i]))) continue;
                  kept += (kept ? ',' : '') + '"' + families[i] + '"'
                }
                args[0] = prefix + ' ' + (kept || '"sans-serif"');
                weakMapSet(fontOf, thisArg, font)
              }
              return apply(setter, thisArg, [args[0]])
            }
          }))

          useGetterProxy(intf.prototype, 'font', (key, getter) => ({
            apply(target, thisArg: CanvasRenderingContext2D, args) {
              notify('strong.fonts')
              const font = weakMapGet(fontOf, thisArg)
              if (font) {
                return font
              }
              return apply(getter, thisArg, [])
            }
          }))
        }
      }
    }
  },

  /**
   * Webgpu
   */
  {
    condition: ({ conf }) => conf.fp.other.webgpu.type !== HookType.default,
    onEnable: ({ win, conf, useSeed, useProxy, useGetterProxy }) => {
      if (!win) return;

      const seed = useSeed(conf.fp.other.webgpu)
      if (seed == null) return;

      const RealmArray = win.Array
      const RealmObject = win.Object
      const RealmFloat32Array = win.Float32Array

      /* 读取序列：数组按下标，其他可迭代对象经其迭代器读取一次 */
      const toList = (v: any): any[] | undefined => {
        if (isArray(v)) {
          const res: any[] = []
          for (let i = 0; i < v.length; i++) res[i] = v[i]
          return res
        }
        const iter = v?.[ITERATOR]
        if (typeof iter !== 'function') return;
        const it: any = apply(iter, v, [])
        const res: any[] = []
        while (true) {
          const step = it.next()
          if (step.done) break;
          res[res.length] = step.value
        }
        return res
      }

      /* GPUSupportedLimits：改写原型上的 getter（GPUAdapter / GPUDevice 的 limits 都是它的实例） */
      {
        const makeNoise = (raw: any, offset: number) => {
          if (isCloudflareCaller()) return raw;
          notify('strong.webgpu')
          const rn = seededRandom(seed + (offset * 7), 64, 1)
          return raw ? raw - floor(rn) : raw;
        }

        // @ts-ignore
        const proto = win.GPUSupportedLimits?.prototype
        proto && useGetterProxy(proto, ['maxBufferSize', 'maxStorageBufferBindingSize'], (key: string, getter) => ({
          apply(target: any, thisArg: any, args: any) {
            return makeNoise(apply(getter, thisArg, []), key === 'maxBufferSize' ? 0 : 1)
          }
        }))
      }

      /*** GPUCommandEncoder：为首个颜色附件的清除色加噪，不修改页面传入的对象 ***/
      {
        const COLOR_KEYS = ['r', 'g', 'b', 'a']
        const noiseOf = (v: number, offset: number) => v - v * seededRandom(seed + (offset * 7), 0.01, 0.001)

        const noisyColor = (cv: any) => {
          if (cv == null || (typeof cv !== 'object' && typeof cv !== 'function')) return;
          const list = toList(cv)
          if (list) {
            const res = new RealmArray()
            for (let i = 0; i < list.length; i++) res[i] = noiseOf(+list[i], i)
            return res
          }
          /* GPUColorDict：按字典成员顺序（a、b、g、r）读取一次 */
          const values: Record<string, any> = nullObject()
          values.a = cv.a
          values.b = cv.b
          values.g = cv.g
          values.r = cv.r
          const res: any = new RealmObject()
          for (let i = 0; i < COLOR_KEYS.length; i++) {
            const k = COLOR_KEYS[i]
            res[k] = values[k] === undefined ? undefined : noiseOf(+values[k], i)
          }
          return res
        }

        const noisyRenderPass = (desc: any) => {
          if (desc == null || typeof desc !== 'object') return desc;
          const attachments = toList(desc.colorAttachments)
          const first = attachments?.[0]
          if (!attachments || first == null || typeof first !== 'object') return desc;
          const color = noisyColor(first.clearValue)
          if (!color) return desc;
          const list = new RealmArray()
          for (let i = 0; i < attachments.length; i++) {
            list[i] = i === 0 ? derive(first, 'clearValue', color) : attachments[i]
          }
          return derive(desc, 'colorAttachments', list)
        }

        // @ts-ignore
        const proto = win.GPUCommandEncoder?.prototype
        proto?.beginRenderPass && useProxy(proto, 'beginRenderPass', {
          apply(target: any, self: any, args: any) {
            if (isCloudflareCaller()) {
              return apply(target, self, args);
            }
            notify('strong.webgpu')
            if (args.length > 0) args[0] = noisyRenderPass(args[0])
            return apply(target, self, args);
          }
        })
      }

      /*** GPUQueue：约 5% 的数据加噪，写入副本，不修改页面传入的数组 ***/
      {
        // @ts-ignore
        const proto = win.GPUQueue?.prototype
        proto?.writeBuffer && useProxy(proto, 'writeBuffer', {
          apply(target: any, self: any, args: any) {
            if (isCloudflareCaller()) {
              return apply(target, self, args);
            }
            notify('strong.webgpu')
            const data = args[2]
            if (typedArrayName(data) === 'Float32Array') {
              const copy = construct(RealmFloat32Array, [data])
              const len = typedArrayLength(copy)
              for (let i = 0; i < len; i += 20) {
                const index = i + floor(seededRandom(seed + i, 20, 0))
                if (index >= len) break;
                const value = copy[index]
                copy[index] = value + value * seededRandom(seed + (index * 7), 1e-4, -1e-4)
              }
              args[2] = copy
            }
            return apply(target, self, args);
          }
        })
      }
    },
  },

  /**
   * DomRect
   */
  {
    condition: ({ conf }) => conf.fp.other.domRect.type !== HookType.default,
    onEnable: ({ win, conf, info, useSeed, useProxy }) => {
      if (!win) return;

      const seed = useSeed(conf.fp.other.domRect)
      if (seed == null) return;

      const unit = layoutUnitOf(info.browser)
      const scope = makeRectScope(win)

      /*
       * 宽度移动一个布局单位，方向由种子与原宽度决定：同一文本经元素或 Range 测得的宽度噪音相同。
       * 只改宽度（right 随之改变，x / left 不变），以原生 getter / setter 读写
       */
      const noiseWidth = (rect: DOMRect | undefined) => {
        if (!rect) return;
        const width = rectGet(rect, 'width')
        if (!(width > 0)) return;
        const k = width <= unit || seededRandom(`${seed}:${width}`) < 0.5 ? 1 : -1
        rectSet(rect, 'width', shiftLayout(width, k, unit))
      }

      const rectHandler = (inScope: (target: any) => boolean) => ({
        apply(target: () => DOMRect, thisArg: any, args: any) {
          const rect = apply(target, thisArg, args);
          if (isCloudflareCaller()) return rect;
          notify('strong.domRect')
          if (rect && inScope(thisArg)) noiseWidth(rect);
          return rect;
        }
      })

      const rectListHandler = (inScope: (target: any, count: number) => boolean) => ({
        apply(target: () => DOMRectList, thisArg: any, args: any) {
          const list = apply(target, thisArg, args);
          if (isCloudflareCaller()) return list;
          notify('strong.domRect')
          const len = list ? rectListLength(list) : 0
          if (len && inScope(thisArg, len)) noiseWidth(list[0]);
          return list;
        }
      })

      useProxy(win.Element.prototype, 'getBoundingClientRect', rectHandler((el) => scope.element(el)))
      useProxy(win.Element.prototype, 'getClientRects', rectListHandler((el, n) => scope.element(el, n)))
      if (win.Range) {
        useProxy(win.Range.prototype, 'getBoundingClientRect', rectHandler((r) => scope.range(r)))
        useProxy(win.Range.prototype, 'getClientRects', rectListHandler((r, n) => scope.range(r, n)))
      }
    }
  },

  /**
   * Emoji
   * 表情符号渲染指纹：测量或绘制 Emoji 以识别系统及其版本
   */
  {
    condition: ({ conf, isDefault }) => !isDefault(conf.fp.other.emoji),
    onEnable: (ctx) => {
      const { gthis, win, conf, useSeed, useProxy } = ctx;

      const seed = useSeed(conf.fp.other.emoji)
      if (seed == null) return;

      /* 同一文本的噪音保持一致 */
      const noiseOf = (mark: string, key: string) => seededRandom(`${seed}:${key}:${mark}`, 1e-2, -1e-2)

      /* Canvas 文本测量 */
      hookTextMetrics(ctx, 'strong.emoji',
        (text, target) => isEmojiProbe(text) ? `${target.font}\n${text}` : undefined,
        noiseOf,
      )

      /* Canvas 绘制：亚像素偏移，改变 Emoji 字形的抗锯齿结果 */
      const jitter = (axis: string) => {
        const v = seededRandom(`${seed}:${axis}`, 0.4, 0.15)
        return seededRandom(`${seed}:${axis}:sign`) < 0.5 ? -v : v
      }
      const offsetX = jitter('x')
      const offsetY = jitter('y')

      const intfs = [win?.CanvasRenderingContext2D, gthis.OffscreenCanvasRenderingContext2D]
      for (let i = 0; i < intfs.length; i++) {
        const intf = intfs[i]
        if (!intf) continue;
        useProxy(intf.prototype, ['fillText', 'strokeText'], {
          apply(target: any, thisArg: any, args: any[]) {
            if (isCloudflareCaller()) {
              return apply(target, thisArg, args);
            }
            /* 与原生一致地转换参数（只转换一次）：页面传入带 toString / valueOf 的对象也会被处理 */
            if (args.length >= 3) {
              const text = toDOMString(args[0])
              args[0] = text
              if (isEmojiProbe(text)) {
                notify('strong.emoji')
                args[1] = +args[1] + offsetX
                args[2] = +args[2] + offsetY
              }
            }
            return apply(target, thisArg, args)
          }
        })
      }

      if (!win) return;

      /*
       * DOM 尺寸：仅处理只含一个短文本节点的元素，避免读取大段文本
       * 节点类型、子节点、文本与 Range 位置都用原生 getter 读取：页面改写它们无法跳过加噪
       */
      const ELEMENT_NODE = 1
      const TEXT_NODE = 3

      const textOfNode = (node?: Node | null): string | undefined => {
        if (!node) return;
        const type = nodeGet(node, 'nodeType')
        if (type === TEXT_NODE) {
          if (charDataGet(node, 'length') > EMOJI_TEXT_MAX_LENGTH) return;
          const data: string = charDataGet(node, 'data')
          return isEmojiProbe(data) ? data : undefined
        }
        if (type === ELEMENT_NODE) {
          const child = nodeGet(node, 'firstChild')
          if (!child || child !== nodeGet(node, 'lastChild') || nodeGet(child, 'nodeType') !== TEXT_NODE) return;
          return textOfNode(child)
        }
      }

      const textOfRange = (range: Range): string | undefined => {
        const node = rangeGet(range, 'startContainer')
        if (node !== rangeGet(range, 'endContainer')) return;
        const start: number = rangeGet(range, 'startOffset')
        const count = rangeGet(range, 'endOffset') - start
        if (nodeGet(node, 'nodeType') === TEXT_NODE) {
          if (count > EMOJI_TEXT_MAX_LENGTH) return;
          const text = charDataSubstring(node, start, count)
          return isEmojiProbe(text) ? text : undefined
        }
        if (count === 1) return textOfNode(nodeListAt(nodeGet(node, 'childNodes'), start))
      }

      /*
       * 宽高各移动一个布局单位，测量值仍在布局网格上；同一文本经元素或 Range 测得的噪音相同。
       * 只处理单行的行内元素与 Range（见 makeRectScope）：块级元素的宽高可由 getComputedStyle 读出对比
       */
      const unit = layoutUnitOf(ctx.info.browser)
      const scope = makeRectScope(win)
      const shift = (rect: DOMRect, key: 'width' | 'height', mark: string) => {
        const v = rectGet(rect, key)
        if (!(v > 0)) return;
        const k = v <= unit || noiseOf(mark, key) >= 0 ? 1 : -1
        rectSet(rect, key, shiftLayout(v, k, unit))
      }
      const noiseRect = (rect: DOMRect | undefined, mark: string) => {
        if (!rect) return;
        shift(rect, 'width', mark)
        shift(rect, 'height', mark)
      }

      const rectHandler = <T>(textOf: (target: T) => string | undefined, inScope: (target: T) => boolean) => ({
        apply(target: any, thisArg: T, args: any) {
          const rect: DOMRect = apply(target, thisArg, args)
          const text = rect && textOf(thisArg)
          if (text && inScope(thisArg)) {
            notify('strong.emoji')
            noiseRect(rect, text)
          }
          return rect
        }
      })

      const rectListHandler = <T>(textOf: (target: T) => string | undefined, inScope: (target: T, count: number) => boolean) => ({
        apply(target: any, thisArg: T, args: any) {
          const list: DOMRectList = apply(target, thisArg, args)
          const len = list ? rectListLength(list) : 0
          const text = len ? textOf(thisArg) : undefined
          if (text && inScope(thisArg, len)) {
            notify('strong.emoji')
            noiseRect(list[0], text)
          }
          return list
        }
      })

      useProxy(win.Element.prototype, 'getBoundingClientRect', rectHandler<Element>(textOfNode, (el) => scope.element(el)))
      useProxy(win.Element.prototype, 'getClientRects', rectListHandler<Element>(textOfNode, (el, n) => scope.element(el, n)))
      useProxy(win.Range.prototype, 'getBoundingClientRect', rectHandler<Range>(textOfRange, (r) => scope.range(r)))
      useProxy(win.Range.prototype, 'getClientRects', rectListHandler<Range>(textOfRange, (r, n) => scope.range(r, n)))
    }
  },

  /**
   * Speech Voices
   * 语音合成列表
   */
  {
    condition: ({ conf, isDefault }) => !isDefault(conf.fp.other.speech),
    onEnable: ({ win, conf, useProxy }) => {
      const proto = win?.SpeechSynthesis?.prototype
      if (!proto) return;

      const isDisabled = conf.fp.other.speech.type === HookType.disabled

      /* 结果数组由本 realm 的 Array 构造，语音属性用原生 getter 读取：页面改写 filter、lang 等无法绕过 */
      const RealmArray = win.Array
      const voiceProto = (win as any).SpeechSynthesisVoice?.prototype
      const getLang = voiceProto && getOwnPropertyDescriptor(voiceProto, 'lang')?.get
      const getLocalService = voiceProto && getOwnPropertyDescriptor(voiceProto, 'localService')?.get

      useProxy(proto, 'getVoices', {
        apply(target, thisArg: SpeechSynthesis, args: any) {
          notify('strong.speech')
          const voices: SpeechSynthesisVoice[] = apply(target, thisArg, args)
          const res = new RealmArray()
          if (isDisabled) return res;
          for (let i = 0; i < voices.length; i++) {
            const v = voices[i]
            const info: { lang?: string, localService?: boolean } = nullObject()
            info.lang = getLang ? apply(getLang, v, []) : undefined
            info.localService = getLocalService ? apply(getLocalService, v, []) : undefined
            if (!isCjkLocalVoice(info)) res[res.length] = v
          }
          return res
        }
      })
    }
  },

  /**
   * Battery
   * 电池状态
   */
  {
    condition: ({ conf, isDefault }) => !isDefault(conf.fp.other.battery),
    onEnable: ({ win, conf, useProxy, useGetterProxy }) => {
      const navProto: any = win?.Navigator.prototype
      if (!win || typeof navProto?.getBattery !== 'function') return;

      /* 拒绝访问 */
      if (conf.fp.other.battery.type === HookType.disabled) {
        const RealmPromise = win.Promise
        const promiseReject = RealmPromise.reject
        const RealmDOMException = win.DOMException
        useProxy(navProto, 'getBattery', {
          apply() {
            notify('weak.battery')
            return apply(promiseReject, RealmPromise, [construct(RealmDOMException, [
              "Failed to execute 'getBattery' on 'Navigator': Access to the feature \"battery\" is disallowed by permissions policy.",
              'NotAllowedError',
            ])])
          }
        })
        return;
      }

      /* 伪装为接通电源的台式机 */
      const proto = (win as any).BatteryManager?.prototype
      if (!proto) return;
      const values: Record<string, boolean | number> = nullObject()
      values.charging = true
      values.chargingTime = 0
      values.dischargingTime = Infinity
      values.level = 1
      useGetterProxy(proto, ['charging', 'chargingTime', 'dischargingTime', 'level'], (key: string) => ({
        apply() {
          notify('weak.battery')
          return values[key]
        }
      }))
    }
  },

  /**
   * .ownProperties
   */
  {
    onEnable: ({ gthis, symbol, disown, useProxy }) => {
      /*
       * 内部 symbol 与被隐藏的属性：按下标遍历、经 WeakMap 查找，结果数组由本 realm 的 Array 构造，
       * 页面改写 Array.prototype.filter、Set.prototype.has 等也读不到被隐藏的键
       */
      const hiddenSymbols: symbol[] = symbol.winKey ? [symbol.raw, symbol.winKey] : [symbol.raw]
      const RealmArray = gthis.Array

      const isHiddenSymbol = (v: unknown) => {
        for (let i = 0; i < hiddenSymbols.length; i++) {
          if (hiddenSymbols[i] === v) return true
        }
        return false
      }

      const entryOf = (obj: any): DisownEntry | undefined => (
        obj != null && (typeof obj === 'object' || typeof obj === 'function') ? weakMapGet(disown, obj) : undefined
      )

      const isHiddenKey = (entry: DisownEntry | undefined, key: unknown) => {
        if (typeof key === 'symbol') return isHiddenSymbol(key)
        return !!entry && (typeof key === 'string' || typeof key === 'number') && entry.has[key] === true
      }

      /* 没有需要隐藏的键时直接返回原生结果 */
      const filterKeys = (res: any, obj: any) => {
        if (!res) return res
        const entry = entryOf(obj)
        let found = false
        for (let i = 0; i < res.length; i++) {
          if (isHiddenKey(entry, res[i])) {
            found = true
            break
          }
        }
        if (!found) return res
        const out = new RealmArray()
        for (let i = 0; i < res.length; i++) {
          if (!isHiddenKey(entry, res[i])) out[out.length] = res[i]
        }
        return out
      }

      {
        const keysHandler = {
          apply(target: any, thisArg: any, args: any[]) {
            return filterKeys(apply(target, thisArg, args), args[0])
          }
        }
        useProxy(gthis.Object, 'getOwnPropertyNames', keysHandler);
        useProxy(gthis.Object, 'getOwnPropertySymbols', keysHandler);
        useProxy(gthis.Reflect, 'ownKeys', keysHandler);

        useProxy(gthis.Object, 'getOwnPropertyDescriptors', {
          apply(target, thisArg, args) {
            const res = apply(target, thisArg, args);
            if (res) {
              for (let i = 0; i < hiddenSymbols.length; i++) {
                delete res[hiddenSymbols[i]];
              }
              const entry = entryOf(args[0])
              for (let i = 0; entry && i < entry.keys.length; i++) {
                delete res[entry.keys[i]];
              }
            }
            return res;
          }
        });
      }

      {
        const handler = {
          apply(target: any, thisArg: any, args: any[]) {
            const obj = args[0];
            const key = args[1];
            if (key != null && isHiddenKey(entryOf(obj), key)) return undefined;
            return apply(target, thisArg, args);
          }
        }
        useProxy(gthis.Object, 'getOwnPropertyDescriptor', handler)
        useProxy(gthis.Reflect, 'getOwnPropertyDescriptor', handler)
      }
    }
  },

  /**
   * .setPrototypeOf
   */
  {
    onEnable: ({ gthis, isReg, reflectMark, useProxy }) => {
      useProxy(gthis.Reflect, 'setPrototypeOf', {
        apply(target: any, self: any, args: any[]) {
          const src = args[0]
          const dst = args[1]
          /* 标记经由 Reflect 调用：代理的 setPrototypeOf 陷阱据此返回 false 而不是抛错（与原生一致） */
          if (isReg(src) && dst != null && (typeof dst === 'object' || typeof dst === 'function')) {
            weakSetAdd(reflectMark, dst)
            try {
              return apply(target, self, args);
            } finally {
              weakSetDelete(reflectMark, dst)
            }
          }
          return apply(target, self, args);
        }
      })
    }
  },

  /**
   * .toString
   */
  {
    onEnable: ({ gthis, isReg, useRaw, useProxy }) => {
      /* toString 自身也是已注册的代理，经 useRaw 取到原生函数，无需特殊处理 */
      useProxy(gthis.Function.prototype, 'toString', {
        apply(target: any, self: any, args: any[]) {
          if (self != null && isReg(self)) {
            const raw = useRaw(self);
            if (raw) return apply(target, raw, args);
          }
          /*
           * 非函数的接收者会抛错（注入脚本的帧由陷阱包装去掉）。报错帧的类型名由接收者原型链上的
           * constructor 得出，引擎查找时不进入代理：原型是被钩取的函数（如 Object.create(fn)）时
           * 得到 Object 而非原生的 Function，改以原型为原始函数的对象调用，报错与原生一致。
           * 页面的 Function.prototype.toString 是代理，引擎按方法查找帧的方法名时找不到正在执行的原函数，
           * 替身上以自有属性放置原函数，方法名（CallSite.getMethodName）也与原生一致
           */
          if (typeof self === 'object' && self !== null) {
            const proto = getPrototypeOf(self)
            const viaProxy = isReg(proto)
            /* 原生调用时接收者上的 toString 是否解析到正在执行的原函数（页面看到的是其代理） */
            let found: any
            for (let p: any = self, depth = 0; p != null && depth < 64; p = getPrototypeOf(p), depth++) {
              const d = getOwnPropertyDescriptor(useRaw(p), 'toString')
              if (d) {
                found = hasOwn(d, 'value') ? d.value : undefined
                break
              }
            }
            const inherited = isReg(found) && useRaw(found) === target
            if (viaProxy || inherited) {
              const standIn = objectCreate(viaProxy ? useRaw(proto) : proto)
              const define = (key: PropertyKey, value: any) => {
                const desc: PropertyDescriptor = nullObject()
                desc.value = value
                desc.writable = true
                desc.configurable = true
                defineProperty(standIn, key, desc)
              }
              if (inherited) define('toString', target)
              const tag = getOwnPropertyDescriptor(self, TO_STRING_TAG)
              if (tag && hasOwn(tag, 'value') && typeof tag.value === 'string') define(TO_STRING_TAG, tag.value)
              return apply(target, standIn, args)
            }
          }
          return apply(target, self, args);
        }
      })

    }
  },

];
