import { HookType } from '@/types/enum'
import { seededRandom } from "@/utils/base";
import { genRandomSeed } from "../utils/base";
import { hookTasks } from "./tasks";
import { contentWindowOf, notify, notifyIframeOrigin } from './utils';
import { logManager } from '@/utils/log';

import { isCloudflareChallengeContext } from './cloudflare';
import { channelWinKey } from './channel';
import { guardTrap, stackRealmsOf, type StackRealm } from './stack';
import {
  NATIVE_TRAPS, NativeProxy, NativeWeakMap, NativeWeakSet, PROXY_TRAPS, apply, defineProperty, floor,
  getOwnPropertyDescriptor, getPrototypeOf, hasOwn, isArray, nullObject, reflectGet, reflectSetPrototypeOf, stringify,
  weakMapGet, weakMapSet, weakSetAdd, weakSetHas,
} from './intrinsics';

/*
 * 注意：钩取新建的 iframe 时（hookWindow → 构造 → runHook → 各任务的 onEnable），页面脚本早已运行，
 * 这条路径上不能使用页面可改写的方法与语法：for...of、数组展开、Array.prototype 方法、Object.keys 等，
 * 否则页面改写它们就能让新 iframe 不被注入。只使用下标循环与 intrinsics 中缓存的原生方法。
 */

/** 在注入时创建：创建日志器会调用 Math.max、Array.prototype.push */
const ctxLogger = logManager.createLogger("FingerprintContext");

export type HookTask = {
  // 条件，为空则默认为true
  condition?: (ctx: FingerprintContext) => boolean | undefined
  // 钩子函数
  onEnable?: (ctx: FingerprintContext) => void
}

type SeedInfo = {
  page: number
  domain: number
  browser: number
  global: number
}

/**
 * 对象上被隐藏的自有属性
 * keys 便于按下标遍历，has 无原型，查找时不经过页面可改写的方法
 */
export type DisownEntry = {
  keys: PropertyKey[]
  has: Record<PropertyKey, true>
}

type ContextOptions = Pick<FingerprintContext, 'info' | 'conf'> & Partial<FingerprintContext>

const objectSetPrototypeOf = Object.setPrototypeOf

const DESCRIPTOR_KEYS = ['value', 'writable', 'get', 'set', 'enumerable', 'configurable'] as const

/**
 * 只取自有字段的无原型描述符：页面在 Object.prototype 上定义 get / value 等时，
 * 字面量描述符会继承它们，defineProperty 会抛错，钩子就装不上
 */
const toDescriptor = (attr: PropertyDescriptor): PropertyDescriptor => {
  const res: Record<string, any> = nullObject()
  for (let i = 0; i < DESCRIPTOR_KEYS.length; i++) {
    const k = DESCRIPTOR_KEYS[i]
    if (hasOwn(attr, k)) res[k] = attr[k]
  }
  return res
}

/**
 * 以已有代理作为目标执行处理器，处理器未定义的操作转发给已有代理
 */
const composeHandler = <T extends object>(handler: ProxyHandler<T>, inner: T): ProxyHandler<T> => {
  const composed: Record<string, Function> = nullObject()
  for (let i = 0; i < PROXY_TRAPS.length; i++) {
    const trap = PROXY_TRAPS[i]
    const fn = hasOwn(handler, trap) ? handler[trap] as Function : undefined
    const native = NATIVE_TRAPS[trap] as Function
    composed[trap] = fn ?
      (_: T, a?: any, b?: any, c?: any) => apply(fn, handler, [inner, a, b, c]) :
      (_: T, a?: any, b?: any, c?: any) => apply(native, undefined, [inner, a, b, c])
  }
  return composed as ProxyHandler<T>
}

export class FingerprintContext {
  public logger = ctxLogger;
  public gthis: Window & WorkerGlobalScope & typeof globalThis
  public win?: Window & typeof globalThis
  public worker?: WorkerGlobalScope & typeof globalThis

  public info: WindowStorage
  public seed: SeedInfo
  public conf: LocalStorageConfig

  /// hook存储
  public myProxy: WeakSet<object>;
  /** 被隐藏的自有属性，不在对象上留下标记 */
  public disown: WeakMap<object, DisownEntry>;
  /** 经由 Reflect.setPrototypeOf 调用的原型对象 */
  public reflectMark: WeakSet<object>;

  public args: Record<string, any>;

  /** URL Worker 被换成 blob Worker 时的原脚本地址 */
  public baseUrl?: string;

  /// hook索引
  public symbol: {
    raw: symbol;
    winKey?: symbol;
  };

  /** 本窗口与注入脚本所在窗口的 Error 及其 stack 访问器（清理报错调用栈时使用） */
  private stackRealms!: StackRealm[]
  /** 本窗口的 Object.setPrototypeOf（模拟原型链成环报错时使用） */
  private realmSetPrototypeOf!: typeof Object.setPrototypeOf

  /** 钩子安装前的 Function.prototype 及其 caller / arguments 原生描述符 */
  private fnProto?: object
  private fnAccessors: Record<string, PropertyDescriptor | undefined>

  private toProxyHandler = <T extends object>(handler: ProxyHandler<T>): ProxyHandler<T> => {
    /* 无原型：处理器未定义的陷阱不会落到页面可改写的 Object.prototype 上 */
    const res: Record<string, any> = nullObject()
    for (let i = 0; i < PROXY_TRAPS.length; i++) {
      const trap = PROXY_TRAPS[i]
      if (hasOwn(handler, trap)) res[trap] = handler[trap]
    }

    const getter = hasOwn(handler, 'get') ? handler.get : undefined
    res.get = (target: any, prop: any, receiver: any) => {
      if (prop === this.symbol.raw) return target;
      if ((prop === 'caller' || prop === 'arguments') && typeof target === 'function') {
        /* 以原始函数读取才与原生一致；页面改写了访问器时改为以代理读取，避免把原始函数交给页面 */
        const native = this.fnAccessors[prop]
        const curr = this.fnProto && getOwnPropertyDescriptor(this.fnProto, prop)
        if (native?.get && curr?.get === native.get && !hasOwn(target, prop)) {
          return apply(native.get, target, [])
        }
        return reflectGet(target, prop, receiver)
      }
      return getter ? apply(getter, handler, [target, prop, receiver]) : reflectGet(target, prop, receiver)
    }

    res.setPrototypeOf = (target: any, proto: any) => {
      /* 原生对象的原型链成环时会抛错，代理需以原始对象模拟，如 Object.setPrototypeOf(fn, Object.create(fn)) */
      let cyclic = this.useRaw(proto) === target
      if (!cyclic && !this.isReg(proto) && proto != null && (typeof proto === 'object' || typeof proto === 'function')) {
        const parent = getPrototypeOf(proto)
        cyclic = this.isReg(parent) && this.useRaw(parent) === target
      }
      if (cyclic) {
        if (weakSetHas(this.reflectMark, proto)) {
          return reflectSetPrototypeOf(target, target);
        }
        /*
         * 以本窗口的方法抛错：错误属于目标所在 realm（与原生一致，instanceof 判断不露馅）；
         * 注入脚本的帧由陷阱包装去掉，调用栈也与原生一致
         */
        return apply(this.realmSetPrototypeOf, undefined, [target, target]);
      }
      return reflectSetPrototypeOf(target, proto)
    }

    /* 错误离开陷阱时清理调用栈：去掉注入脚本的帧，页面比较报错的调用栈也识别不出钩子 */
    for (let i = 0; i < PROXY_TRAPS.length; i++) {
      const trap = PROXY_TRAPS[i]
      if (res[trap]) res[trap] = guardTrap(res[trap], trap, this.stackRealms)
    }

    return res as ProxyHandler<T>
  }

  /**
   * 判断对象是否注册代理
   */
  public isReg = (target: any) => {
    return weakSetHas(this.myProxy, target)
  }

  /**
   * 获取原始值
   * 只从已注册的代理读取，页面对象（可能是 Proxy）接触不到内部 symbol
   * @param target 目标
   */
  public useRaw = <T>(target: T): T => {
    let raw: any = target
    /* 多层代理时取最内层 */
    while (this.isReg(raw)) {
      raw = raw[this.symbol.raw]
    }
    return raw;
  }

  /**
   * 创建代理
   * 目标已被代理时，以原始对象为目标创建新代理并依次执行处理器，页面只能看到一层代理
   */
  public newProxy = <T extends object>(target: T, handler: ProxyHandler<T>): T => {
    if (this.isReg(target)) {
      handler = composeHandler(handler, target)
      target = this.useRaw(target)
    }
    const proxy = new NativeProxy(target, this.toProxyHandler(handler));
    weakSetAdd(this.myProxy, proxy);
    return proxy;
  }

  /**
   * 创建代理
   * @param target 目标对象
   * @param key 属性名
   * @param handler 处理对象 | (key) => 处理对象
   */
  public useProxy = <
    T extends object,
    K extends keyof T,
    H extends ProxyHandler<Extract<T[K], object>>,
  >(
    target: T,
    key: K | K[],
    handler: H | ((key: K) => H | void),
  ) => {
    if (isArray(key)) {
      /* multi */
      for (let i = 0; i < key.length; i++) {
        const _k = key[i]
        const _handler = typeof handler === 'function' ? handler(_k) : handler;
        if (_handler) {
          target[_k] = this.newProxy(target[_k] as any, _handler);
        }
      }
    } else {
      /* one */
      const raw = target[key];
      if (raw && (typeof raw === 'object' || typeof raw === 'function')) {
        const _handler = typeof handler === 'function' ? handler(key) : handler;
        if (_handler) {
          target[key] = this.newProxy(raw, _handler);
        }
      }
    }
  }

  /**
   * 定义属性描述符
   * @param target 目标对象 | [获取描述符对象, 写入对象]
   * @param key 属性名
   * @param attributes 属性描述符
   * @returns void
   */
  public useDefine = <
    T extends object,
    K extends keyof T,
    A extends (PropertyDescriptor & ThisType<any>),
    W = any,
  >(
    target: T | [T, W],
    key: K | K[],
    attributes: A | ((key: K, desc: PropertyDescriptor) => A | void)
  ) => {
    /* 处理target */
    let _read: T
    let _write: W | T
    if (isArray(target)) {
      if (!target.length) return;
      _read = target[0]
      _write = target[1] ?? _read
    } else {
      _read = target
      _write = target
    }

    /* 定义属性 */
    if (isArray(key)) {
      /* multi */
      for (let i = 0; i < key.length; i++) {
        const _k = key[i]
        const desc = getOwnPropertyDescriptor(_read, _k);
        if (!desc) continue;
        const attr = typeof attributes === 'function' ? attributes(_k, desc) : attributes;
        if (attr) {
          defineProperty(_write, _k, toDescriptor(attr));
        }
      }
    } else {
      /* one */
      const desc = getOwnPropertyDescriptor(_read, key);
      if (!desc) return;
      const attr = typeof attributes === 'function' ? attributes(key, desc) : attributes;
      if (attr) {
        defineProperty(_write, key, toDescriptor(attr));
      }
    }
  }

  /**
   * 代理getter属性描述符
   * @param target 目标对象 | [获取描述符对象, 写入对象]
   * @param key 属性名
   * @param attributes 属性描述符代理 | ((key, getter) => 属性描述符代理 | 不进行代理)
   * @returns void
   */
  public useGetterProxy = <
    T extends object,
    K extends keyof T,
    H extends ProxyHandler<() => any>,
    W = any,
  >(
    target: T | [T, W],
    key: K | K[],
    handler: H | ((key: K, getter: () => any) => H | void)
  ) => {
    this.useDefine(target, key, (_k, desc) => {
      const getter = hasOwn(desc, 'get') ? desc.get : undefined
      if (!getter) return;
      const _handler = typeof handler === 'function' ? handler(_k, getter) : handler
      if (!_handler) return;
      return {
        get: this.newProxy(getter, _handler)
      }
    })
  }

  public useSetterProxy = <
    T extends object,
    K extends keyof T,
    H extends ProxyHandler<() => any>,
    W = any,
  >(
    target: T | [T, W],
    key: K | K[],
    handler: H | ((key: K, setter: (v: any) => any) => H | void)
  ) => {
    this.useDefine(target, key, (_k, desc) => {
      const setter = hasOwn(desc, 'set') ? desc.set : undefined
      if (!setter) return;
      const _handler = typeof handler === 'function' ? handler(_k, setter) : handler
      if (!_handler) return;
      return {
        set: this.newProxy(setter, _handler)
      }
    })
  }

  /**
   * 隐藏拥有属性
   */
  public useDisownKeys = <T>(src: T, keys: (keyof T)[]) => {
    if (src == null || typeof src !== 'object') return;
    let entry = weakMapGet(this.disown, src)
    if (!entry) {
      entry = { keys: [], has: nullObject() }
      weakMapSet(this.disown, src, entry)
    }
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i] as PropertyKey
      if (entry.has[k]) continue;
      entry.has[k] = true
      entry.keys[entry.keys.length] = k
    }
  }

  /**
   * 获取指定项的种子
   */
  public useSeed = (mode?: HookMode) => {
    switch (mode?.type) {
      case HookType.page:
        return this.seed.page
      case HookType.domain:
        return this.seed.domain
      case HookType.browser:
        return this.seed.browser
      case HookType.global:
        return this.seed.global
      default:
        return null
    }
  }

  /**
   * 获取指定项的种子或自定义值
   */
  public useHookMode = <V>(mode?: HookMode<V>): {
    isDefault?: boolean
    seed?: number
    value?: V
  } => {
    switch (mode?.type) {
      case HookType.default:
        return { isDefault: true };
      case HookType.value:
        return { value: mode.value };
      default:
        const seed = this.useSeed(mode)
        return seed == null ? {} : { seed };
    }
  }

  /**
   * 所有参数是否是默认模式
   * @example !isDefault([...]) // 至少一个元素是非默认值
   */
  public isDefault = (mode?: HookMode | HookMode[]) => {
    if (!mode) return true
    if (isArray(mode)) {
      for (let i = 0; i < mode.length; i++) {
        if (mode[i].type !== HookType.default) return false
      }
      return true
    } else {
      return mode.type === HookType.default
    }
  }

  private constructor(gthis: any, opt: ContextOptions) {
    if (!gthis) throw new Error('gthis is required');

    const { info, conf } = opt;

    this.gthis = gthis
    this.info = info
    this.conf = conf

    this.myProxy = opt.myProxy ?? new NativeWeakSet()
    this.disown = opt.disown ?? new NativeWeakMap()
    this.reflectMark = opt.reflectMark ?? new NativeWeakSet()
    this.seed = opt.seed ?? {
      page: info.seed,
      domain: floor(seededRandom(info.host, Number.MAX_SAFE_INTEGER, 1)),
      browser: conf.seed.browser ?? genRandomSeed(),
      global: conf.seed.global ?? genRandomSeed(),
    }
    this.symbol = opt.symbol ?? {
      raw: Symbol('RawValue'),
      winKey: channelWinKey(),
    }

    this.args = opt.args ?? {}
    this.baseUrl = opt.baseUrl

    /* 在钩子安装前取得（新窗口此时尚未运行页面脚本） */
    this.stackRealms = stackRealmsOf(gthis.Error)
    this.realmSetPrototypeOf = gthis.Object?.setPrototypeOf ?? objectSetPrototypeOf

    this.fnAccessors = nullObject()
    this.fnProto = gthis.Function?.prototype
    if (this.fnProto) {
      this.fnAccessors.caller = getOwnPropertyDescriptor(this.fnProto, 'caller')
      this.fnAccessors.arguments = getOwnPropertyDescriptor(this.fnProto, 'arguments')
    }

    if (typeof window !== "undefined") {
      this.win = gthis
    } else if (typeof self !== "undefined") {
      this.worker = gthis
    }

    this.logger.debug("init with options", opt);

    this.runHook()

    this.logger.info("init done");
  }

  public static hookWindow = (win: Window, opt: ContextOptions) => {
    if (!win) throw new Error('win is required');
    if (opt.conf?.action?.cloudflare?.enable !== false && isCloudflareChallengeContext(win)) {
      return;
    }

    const { info } = opt;
    const winKey = opt.symbol?.winKey ?? channelWinKey()
    if (!winKey) throw new Error('channel is not initialized');

    if (win === window.top) {
      if (info.hooked) throw new Error('win is already hooked');
      info.hooked = true;
    } else {
      let hooked: boolean = false
      try {
        // @ts-ignore
        hooked = win[winKey]
      } catch (_) {
        throw new Error('unable to access cross source');
      }
      if (hooked) throw new Error('win is already hooked');
      try {
        defineProperty(win, winKey, toDescriptor({
          value: true,
          writable: true,
          configurable: true,
          enumerable: false,
        }));
      } catch (_) {
        // @ts-ignore
        win[winKey] = true;
      }
    }

    const ctx = new FingerprintContext(win, opt);

    if (win !== window.top) {
      notify('other.iframe')
      notifyIframeOrigin(win.location.origin);
    }
    return ctx;
  }

  public static hookWorker = (worker: any, opt: ContextOptions) => {
    if (!worker) return;
    const ctx = new FingerprintContext(worker, opt);
    return ctx;
  }

  /**
   * 脚本是否启动
   */
  public isEnable() {
    return !!this.conf.enable
  }

  /**
   * hook内容
   */
  private runHook() {
    if (!this.isEnable()) return;
    for (let i = 0; i < hookTasks.length; i++) {
      const task = hookTasks[i]
      if (!task.condition || task.condition(this) === true) {
        try {
          task.onEnable?.(this)
        } catch (e) {
          this.logger.error(`Hook task error: `, e)
        }
      }
    }
  }

  /**
   * hook target
   * 只按窗口实际的源判断是否跳过：iframe 的 id、src 等属性由页面控制，不作依据
   */
  public hookTarget = (target?: Window | HTMLIFrameElement | Node | null) => {
    if (!target) return;
    try {
      const _t: any = target;
      /* window 是窗口对象自有的不可伪造属性；元素上读取会落到页面可改写的 Object.prototype */
      if (hasOwn(_t, 'window') && _t === _t.window) {
        if (isCloudflareChallengeContext(_t)) return;
        return FingerprintContext.hookWindow(_t, this);
      }
      const cw = contentWindowOf(_t)
      if (cw && cw === cw.window) {
        if (isCloudflareChallengeContext(cw)) return;
        return FingerprintContext.hookWindow(cw, this)
      }
    } catch (_) { }
  }

  /**
   * 生成注入 Worker 的脚本
   * @param baseUrl Worker 原本的脚本地址（URL Worker 被换成 blob Worker 时），Worker 内据此修正相对地址
   * 脚本源码与配置在注入时序列化（见 index.ts），这里只拼接基本类型，不调用页面可改写的方法
   */
  public makeScript = (baseUrl?: string) => {
    const src: string | undefined = this.args?.funSrc
    const name: string | undefined = this.args?.funName
    const conf: string | undefined = this.args?.confJson
    if (!src || !name || !conf) return;

    const info = this.info
    const seed = this.seed
    const str = (v?: string) => v == null ? 'null' : stringify(v)
    const num = (v?: number) => v == null ? 'null' : '' + v

    const options = '{"info":{'
      + '"host":' + str(info.host)
      + ',"seed":' + num(info.seed)
      + ',"hooked":' + (info.hooked ? 'true' : 'false')
      + ',"browser":' + str(info.browser)
      + '},"conf":' + conf
      + ',"seed":{'
      + '"page":' + num(seed.page)
      + ',"domain":' + num(seed.domain)
      + ',"browser":' + num(seed.browser)
      + ',"global":' + num(seed.global)
      + '}'
      + (baseUrl ? ',"baseUrl":' + str(baseUrl) : '')
      + '}'
    return src + ';' + name + '({options:' + options + '});';
  }

}
