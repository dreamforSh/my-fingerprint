/**
 * 报错调用栈清理
 * 纯函数模块，便于单元测试
 *
 * 钩子以代理实现：原生方法在代理处理器中抛出的错误，调用栈里会多出注入脚本的帧，
 * 页面以非法参数调用被钩取的方法，比较报错的调用栈就能识别出钩子。
 * 这里在错误离开处理器时去掉注入脚本的帧与处理器内部调用的内置方法帧，
 * 并补回被这些帧挤出 Error.stackTraceLimit 的页面帧，使调用栈与原生一致。
 *
 * 只使用模块加载（注入）时缓存的原生方法
 */

const apply = Reflect.apply
const NativeError = Error
const isArray = Array.isArray
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const defineProperty = Object.defineProperty
const getPrototypeOf = Object.getPrototypeOf
const objectCreate = Object.create
const hasOwnProperty = Object.prototype.hasOwnProperty
const errorToString = NativeError.prototype.toString
const strIndexOf = String.prototype.indexOf
const strSlice = String.prototype.slice
/* 不触发代理陷阱地判断是否是错误对象（较新的浏览器才有） */
const isError: Function | undefined = (NativeError as any).isError

const hasOwn = (obj: object, key: PropertyKey): boolean => apply(hasOwnProperty, obj, [key])

const PREPARE = 'prepareStackTrace'
const LIMIT = 'stackTraceLimit'
/** 补回页面帧时额外多取的帧数（抵消注入脚本自身的帧） */
const EXTRA_FRAMES = 32
const MAX_LIMIT = 0x7fffffff

/** 处理器以普通函数调用的内置方法：Reflect 的各方法与 Object.setPrototypeOf */
const INTERNAL_NAMES: Record<string, true> = objectCreate(null)
{
  const names = ['apply', 'construct', 'defineProperty', 'deleteProperty', 'get', 'getOwnPropertyDescriptor',
    'getPrototypeOf', 'has', 'isExtensible', 'ownKeys', 'preventExtensions', 'set', 'setPrototypeOf']
  for (let i = 0; i < names.length; i++) INTERNAL_NAMES[names[i]] = true
}

type CallSite = object

/** 一个 realm 的 Error 构造函数，及该 realm 错误对象自有 stack 访问器的原生 get / set */
export type StackRealm = {
  ctor: Function
  get?: Function
  set?: Function
  /** 该 realm 的 Error.captureStackTrace */
  capture?: Function
}

let siteGetFileName: Function | undefined
let siteGetLineNumber: Function | undefined
let siteGetFunctionName: Function | undefined
let siteIsEval: Function | undefined
let siteIsToplevel: Function | undefined
let siteToString: Function | undefined
let ownFile: string | null | undefined
let ready = false

const collectSites = (_: unknown, sites: CallSite[]) => sites

type Saved = { ctor: Function, desc: PropertyDescriptor | undefined }

/**
 * 在各 realm 的 Error 上临时安装收集器（错误可能来自不同 realm）
 * 页面以不可配置的方式占用 prepareStackTrace 时放弃
 */
const install = (ctors: Function[]): Saved[] | undefined => {
  const saved: Saved[] = []
  for (let i = 0; i < ctors.length; i++) {
    const ctor = ctors[i]
    let dup = false
    for (let j = 0; j < saved.length; j++) if (saved[j].ctor === ctor) dup = true
    if (dup) continue;
    const desc = getOwnPropertyDescriptor(ctor, PREPARE)
    if (desc && !desc.configurable) {
      restore(saved)
      return
    }
    const d: PropertyDescriptor = objectCreate(null)
    d.value = collectSites
    d.writable = true
    d.configurable = true
    try {
      defineProperty(ctor, PREPARE, d)
    } catch (_) {
      restore(saved)
      return
    }
    const item: Saved = objectCreate(null)
    item.ctor = ctor
    item.desc = desc
    saved[saved.length] = item
  }
  return saved
}

const restoreDesc = (obj: object, key: PropertyKey, desc: PropertyDescriptor) => {
  const d: PropertyDescriptor = objectCreate(null)
  if (hasOwn(desc, 'value')) {
    d.value = desc.value
    d.writable = desc.writable
  } else {
    d.get = desc.get
    d.set = desc.set
  }
  d.enumerable = desc.enumerable
  d.configurable = desc.configurable
  defineProperty(obj, key, d)
}

const restore = (saved: Saved[]) => {
  for (let i = 0; i < saved.length; i++) {
    const { ctor, desc } = saved[i]
    if (desc) restoreDesc(ctor, PREPARE, desc)
    else delete (ctor as any)[PREPARE]
  }
}

/**
 * 模块加载（注入）时取得 CallSite 的原生方法与注入脚本自身的文件名
 */
const init = () => {
  try {
    const saved = install([NativeError])
    if (!saved) return
    let sites: unknown
    try {
      sites = new NativeError().stack
    } finally {
      restore(saved)
    }
    if (!isArray(sites) || !sites.length) return
    const proto = getPrototypeOf(sites[0])
    siteGetFileName = proto?.getFileName
    siteGetLineNumber = proto?.getLineNumber
    siteGetFunctionName = proto?.getFunctionName
    siteIsEval = proto?.isEval
    siteIsToplevel = proto?.isToplevel
    siteToString = proto?.toString
    if (!siteGetFileName || !siteGetLineNumber || !siteGetFunctionName ||
      !siteIsEval || !siteIsToplevel || !siteToString) return
    ownFile = apply(siteGetFileName, sites[0], [])

    /* 注入脚本与页面脚本同名时无法区分，不做清理 */
    const loc = typeof location === 'undefined' ? undefined : location
    if (ownFile && loc) {
      const strip = (s: string) => {
        const i: number = apply(strIndexOf, s, ['#'])
        return i === -1 ? s : apply(strSlice, s, [0, i])
      }
      if (strip(ownFile) === strip(loc.href)) return
    }
    ready = true
  } catch (_) { }
}
init()

const nativeRealm = (() => {
  const realm: StackRealm = objectCreate(null)
  realm.ctor = NativeError
  return realm
})()

const fillAccessors = (realm: StackRealm) => {
  if (!ready) return
  try {
    const desc = getOwnPropertyDescriptor(new (realm.ctor as any)(), 'stack')
    if (desc && hasOwn(desc, 'get') && hasOwn(desc, 'set')) {
      realm.get = desc.get
      realm.set = desc.set
    }
    const capture = getOwnPropertyDescriptor(realm.ctor, 'captureStackTrace')
    if (capture && hasOwn(capture, 'value') && typeof capture.value === 'function') realm.capture = capture.value
  } catch (_) { }
}
fillAccessors(nativeRealm)

/**
 * 被钩取窗口与注入脚本所在窗口的 realm 信息（在钩取该窗口、页面尚未接触它时调用）
 */
export const stackRealmsOf = (ctor: Function | undefined): StackRealm[] => {
  if (!ctor || ctor === NativeError) return [nativeRealm]
  const realm: StackRealm = objectCreate(null)
  realm.ctor = ctor
  fillAccessors(realm)
  return [realm, nativeRealm]
}

/**
 * 是否是注入脚本的调用帧：同一脚本、有行号（内置函数的帧没有行号）、不是 eval 代码
 */
const isOwnSite = (site: CallSite) => (
  apply(siteGetFileName!, site, []) === ownFile &&
  apply(siteGetLineNumber!, site, []) != null &&
  !apply(siteIsEval!, site, [])
)

/** 以普通函数调用的内置方法帧 */
const isToplevelBuiltin = (site: CallSite) => (
  apply(siteGetLineNumber!, site, []) == null &&
  apply(siteIsToplevel!, site, []) === true
)

/**
 * 去掉注入脚本的帧，以及处理器内部调用的内置方法帧（紧挨着一段注入脚本帧之前、以普通函数调用）
 * @param dropInternal 第一段注入脚本帧所属的陷阱是否不是 apply / construct：
 *   apply / construct 陷阱以原有接收者调用原函数，原函数的帧原生调用也有，需保留；
 *   其他陷阱调用的 Reflect.get、Object.setPrototypeOf 等在原生调用中不存在。
 *   之后各段（外层的钩子）按方法名判断
 */
export const filterSites = (sites: CallSite[], dropInternal: boolean): CallSite[] => {
  const res: CallSite[] = []
  let inRun = false
  let runs = 0
  for (let i = 0; i < sites.length; i++) {
    const site = sites[i]
    if (isOwnSite(site)) {
      if (!inRun && res.length) {
        const prev = res[res.length - 1]
        if (isToplevelBuiltin(prev) &&
          (runs === 0 ? dropInternal : INTERNAL_NAMES[apply(siteGetFunctionName!, prev, [])] === true)) {
          res.length = res.length - 1
        }
      }
      if (!inRun) runs++
      inRun = true
      continue;
    }
    inRun = false
    res[res.length] = site
  }
  return res
}

/** 与 V8 读取 Error.stackTraceLimit 一致：只认数据属性中的数字 */
const limitOf = (ctor: Function): number | undefined => {
  const desc = getOwnPropertyDescriptor(ctor, LIMIT)
  if (!desc || !hasOwn(desc, 'value') || typeof desc.value !== 'number') return
  const v: number = desc.value
  return !(v > 0) ? 0 : v >= MAX_LIMIT ? MAX_LIMIT : v | 0
}

/**
 * 以更大的上限取当前调用栈，用于补回原错误中被注入脚本的帧挤掉的页面帧
 * 只在 stackTraceLimit 为可写数据属性时临时修改，页面同步代码观察不到
 */
const captureSites = (limit: number): CallSite[] | undefined => {
  const desc = getOwnPropertyDescriptor(NativeError, LIMIT)
  if (!desc || !hasOwn(desc, 'value') || !desc.writable) return
  const d: PropertyDescriptor = objectCreate(null)
  d.value = limit
  d.writable = desc.writable
  d.enumerable = desc.enumerable
  d.configurable = desc.configurable
  let err: Error
  defineProperty(NativeError, LIMIT, d)
  try {
    err = new NativeError()
  } finally {
    restoreDesc(NativeError, LIMIT, desc)
  }
  const sites = (err as any).stack
  return isArray(sites) ? sites : undefined
}

/**
 * 引擎格式化调用栈时的首行：错误类型名在读取 stack 时取得，消息则是创建错误时的原始消息
 * （之后修改 message 不影响，如浏览器为 DOM 方法的报错补充 "Failed to execute ..." 前缀）。
 * 原始消息只有引擎能读到：以 0 帧的上限对错误重新收集调用栈，由引擎格式化出只有首行的结果
 */
const headerOf = (err: object, realm: StackRealm): string => {
  /* 以错误所属 realm 的方法收集：安装的 stack 访问器与该 realm 的一致 */
  const { ctor, capture } = realm
  const desc = capture && getOwnPropertyDescriptor(ctor, LIMIT)
  if (desc && hasOwn(desc, 'value') && desc.writable) {
    try {
      const d: PropertyDescriptor = objectCreate(null)
      d.value = 0
      d.writable = desc.writable
      d.enumerable = desc.enumerable
      d.configurable = desc.configurable
      defineProperty(ctor, LIMIT, d)
      try {
        apply(capture!, ctor, [err])
      } finally {
        restoreDesc(ctor, LIMIT, desc)
      }
      const res = apply(realm.get!, err, [])
      if (typeof res === 'string') return res
    } catch (_) { }
  }
  try {
    return apply(errorToString, err, [])
  } catch (_) {
    return '<error>'
  }
}

/** 错误所属的 realm：stack 访问器相同的 realm 中，原型链上有其 Error.prototype 的那个 */
const realmOf = (err: object, getter: Function, realms: StackRealm[]): StackRealm | undefined => {
  let found: StackRealm | undefined
  let count = 0
  for (let i = 0; i < realms.length; i++) {
    if (realms[i].get === getter) {
      found ??= realms[i]
      count++
    }
  }
  if (count < 2) return found
  for (let p = getPrototypeOf(err), depth = 0; p != null && depth < 32; p = getPrototypeOf(p), depth++) {
    for (let i = 0; i < realms.length; i++) {
      if (realms[i].get === getter && (realms[i].ctor as any).prototype === p) return realms[i]
    }
  }
  return found
}

/**
 * 清理错误的调用栈，在错误离开处理器时（处理器包装的 catch 中）调用
 * @param realms 错误可能来自的各 realm
 * @param dropInternal 见 filterSites
 */
export const cleanErrorStack = (err: unknown, realms: StackRealm[], dropInternal: boolean) => {
  if (!ready || err == null || typeof err !== 'object') return
  if (isError && !apply(isError, NativeError, [err])) return
  try {
    /* 只处理引擎生成的调用栈（原生的自有 stack 访问器），页面替换过的访问器不碰 */
    const own = getOwnPropertyDescriptor(err, 'stack')
    if (!own || !hasOwn(own, 'get') || !own.get) return
    const realm = realmOf(err, own.get, realms)
    if (!realm || !realm.set) return

    const ctors: Function[] = []
    for (let i = 0; i < realms.length; i++) ctors[i] = realms[i].ctor

    /* 页面安装的 prepareStackTrace：原生在读取 stack 时以错误所属 realm 的 Error.prepareStackTrace 格式化 */
    let pagePrepare: Function | undefined
    const prepareDesc = getOwnPropertyDescriptor(realm.ctor, PREPARE)
    if (prepareDesc) {
      /* 访问器无法在不调用页面代码的前提下模拟，保持原样 */
      if (!hasOwn(prepareDesc, 'value')) return
      if (typeof prepareDesc.value === 'function') pagePrepare = prepareDesc.value
    }

    const limit = limitOf(realm.ctor)
    const saved = install(ctors)
    if (!saved) return
    let sites: unknown
    let below: CallSite[] | undefined
    try {
      sites = apply(own.get, err, [])
      /* 原错误含注入脚本的帧时，以当前调用栈（处理器之下的页面帧）替换注入脚本帧及其后的部分 */
      if (isArray(sites) && limit != null) {
        for (let i = 0; i < sites.length; i++) {
          if (isOwnSite(sites[i])) {
            below = captureSites(limit + EXTRA_FRAMES)
            break
          }
        }
      }
    } finally {
      restore(saved)
    }
    /* 已格式化过：保持原样 */
    if (!isArray(sites)) return

    let full: CallSite[] = sites
    if (below) {
      full = []
      for (let i = 0; i < sites.length && !isOwnSite(sites[i]); i++) full[full.length] = sites[i]
      for (let i = 0; i < below.length; i++) full[full.length] = below[i]
    }
    const filtered = filterSites(full, dropInternal)
    if (limit != null && filtered.length > limit) filtered.length = limit

    let text: unknown
    if (pagePrepare) {
      try {
        text = apply(pagePrepare, realm.ctor, [err, filtered])
        apply(realm.set, err, [text])
        return
      } catch (_) { }
    }
    let header = headerOf(err, realm)
    for (let i = 0; i < filtered.length; i++) {
      header += '\n    at ' + apply(siteToString!, filtered[i], [])
    }
    apply(realm.set, err, [header])
  } catch (_) { }
}

/**
 * 包装代理处理器的陷阱：错误离开陷阱时清理调用栈
 * @param trap 陷阱名
 */
export const guardTrap = (fn: Function, trap: string, realms: StackRealm[]) => {
  const dropInternal = trap !== 'apply' && trap !== 'construct'
  return function (this: unknown, ...args: unknown[]) {
    try {
      return apply(fn, this, args)
    } catch (e) {
      cleanErrorStack(e, realms, dropInternal)
      throw e
    }
  }
}
