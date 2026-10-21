/**
 * Cloudflare 验证兼容
 *
 * 目的：Cloudflare 的 Turnstile / 人机验证会在组件内部检测浏览器环境是否被篡改。
 * 若在这些验证上下文中改写指纹，会让真实用户被误判为机器人、反复无法通过验证。
 * 因此在验证上下文中跳过注入（等同于内置白名单），把验证交还给浏览器与真人本身。
 *
 * 纯函数模块，便于单元测试。
 * 运行时会被页面调用到的判断只使用模块加载（注入）时缓存的原生方法：
 * 页面若能改写 String.prototype、URL、Error 等让判断返回 true，就能关闭全部防护。
 */

const apply = Reflect.apply
const uncurryThis = (fn: Function) => (self: any, ...args: any[]): any => apply(fn, self, args)

const NativeError = Error
const isArray = Array.isArray
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const defineProperty = Object.defineProperty
const getPrototypeOf = Object.getPrototypeOf
const objectCreate = Object.create
const hasOwn = uncurryThis(Object.prototype.hasOwnProperty) as (obj: any, key: PropertyKey) => boolean
const strIndexOf = uncurryThis(String.prototype.indexOf) as (s: string, search: string) => number
const strLastIndexOf = uncurryThis(String.prototype.lastIndexOf) as (s: string, search: string) => number
const strSlice = uncurryThis(String.prototype.slice) as (s: string, start?: number, end?: number) => string
const strToLowerCase = uncurryThis(String.prototype.toLowerCase) as (s: string) => string

const includes = (s: string, search: string) => strIndexOf(s, search) !== -1
const startsWith = (s: string, prefix: string) => strSlice(s, 0, prefix.length) === prefix
const endsWith = (s: string, suffix: string) => s.length >= suffix.length && strSlice(s, s.length - suffix.length) === suffix

/**
 * Cloudflare 验证组件（Turnstile / Challenge）所在的主机
 */
export const CF_CHALLENGE_HOSTS = [
  'challenges.cloudflare.com',
]

/**
 * 人机验证页（"Just a moment..."）响应头 `Server-Timing` 中的条目名
 * 验证页运行在站点自身域名下，只能通过该响应头识别
 */
const CF_CHALLENGE_TIMING = 'chlray'

/**
 * Cloudflare 在接入站点的域名下提供验证脚本的路径
 */
const CF_SCRIPT_PATH = '/cdn-cgi/challenge-platform/'

/**
 * 是否是 Cloudflare 验证组件的主机
 */
export const isCloudflareChallengeHost = (hostname?: string | null): boolean => {
  if (!hostname || typeof hostname !== 'string') return false
  const host = strToLowerCase(hostname)
  for (let i = 0; i < CF_CHALLENGE_HOSTS.length; i++) {
    const v = CF_CHALLENGE_HOSTS[i]
    if (host === v || endsWith(host, '.' + v)) return true
  }
  return false
}

type UrlParts = {
  origin: string
  host: string
  path: string
}

/**
 * 拆分 http(s) 地址（不使用页面可替换的 URL 构造函数）
 */
const splitUrl = (url?: string | null): UrlParts | undefined => {
  if (!url || typeof url !== 'string') return
  const i = strIndexOf(url, '://')
  if (i <= 0) return
  const scheme = strToLowerCase(strSlice(url, 0, i))
  if (scheme !== 'http' && scheme !== 'https') return

  let end = url.length
  for (let j = i + 3; j < url.length; j++) {
    const ch = url[j]
    if (ch === '/' || ch === '?' || ch === '#') {
      end = j
      break
    }
  }

  let authority = strToLowerCase(strSlice(url, i + 3, end))
  const at = strLastIndexOf(authority, '@')
  if (at !== -1) authority = strSlice(authority, at + 1)

  /* 去掉端口，IPv6 地址的冒号在方括号内 */
  let host = authority
  const colon = strLastIndexOf(host, ':')
  if (colon > strIndexOf(host, ']')) host = strSlice(host, 0, colon)

  return {
    origin: scheme + '://' + authority,
    host,
    path: url[end] === '/' ? strSlice(url, end) : '/',
  }
}

/**
 * 是否是 Cloudflare 验证组件的源（origin）
 */
const isCloudflareChallengeOrigin = (origin?: string | null): boolean => {
  if (!origin || origin === 'null') return false
  return isCloudflareChallengeHost(splitUrl(origin)?.host)
}

/**
 * 是否是 Cloudflare 验证脚本的地址
 * - 验证组件主机上的脚本（如 Turnstile 的 api.js）
 * - 与页面同源的 /cdn-cgi/challenge-platform/ 脚本：由 Cloudflare 在接入站点的域名下提供，
 *   限定同源，避免第三方域名借用该路径
 * @param pageOrigin 页面的源，为空时只认验证组件主机
 */
export const isCloudflareScriptUrl = (url?: string | null, pageOrigin?: string): boolean => {
  const parts = splitUrl(url)
  if (!parts) return false
  if (isCloudflareChallengeHost(parts.host)) return true
  return !!pageOrigin && parts.origin === pageOrigin && startsWith(parts.path, CF_SCRIPT_PATH)
}

/**
 * 导航响应的 Server-Timing 是否来自 Cloudflare 人机验证页
 */
export const hasCloudflareChallengeTiming = (serverTiming?: ArrayLike<{ name?: string }> | null): boolean => {
  if (!serverTiming) return false
  for (let i = 0; i < serverTiming.length; i++) {
    if (serverTiming[i]?.name === CF_CHALLENGE_TIMING) return true
  }
  return false
}

type ChallengeWindow = {
  origin?: string
  location?: {
    hostname?: string
    pathname?: string
    ancestorOrigins?: ArrayLike<string>
  }
  performance?: {
    getEntriesByType?: (type: string) => any[]
  }
  document?: {
    title?: string
    getElementById?: (id: string) => any
  }
}

/* ---------- 调用方识别 ---------- */

type CallSite = object

const PREPARE = 'prepareStackTrace'

let siteGetFileName: Function | undefined
let siteIsEval: Function | undefined
let ownFile: string | null | undefined
let pageOrigin: string | undefined
let callerCheckReady = false

const collectSites = (_: unknown, sites: CallSite[]) => sites

const restorePrepare = (prev?: PropertyDescriptor) => {
  if (!prev) {
    delete (NativeError as any)[PREPARE]
    return
  }
  const desc: PropertyDescriptor = objectCreate(null)
  if (hasOwn(prev, 'value')) {
    desc.value = prev.value
    desc.writable = prev.writable
  } else {
    desc.get = prev.get
    desc.set = prev.set
  }
  desc.enumerable = prev.enumerable
  desc.configurable = prev.configurable
  defineProperty(NativeError, PREPARE, desc)
}

/**
 * 捕获结构化调用栈（V8 的 CallSite）
 * 临时替换 Error.prepareStackTrace，页面以不可配置的方式占用时放弃
 */
const captureSites = (): CallSite[] | undefined => {
  const prev = getOwnPropertyDescriptor(NativeError, PREPARE)
  if (prev && !prev.configurable) return;

  const desc: PropertyDescriptor = objectCreate(null)
  desc.value = collectSites
  desc.writable = true
  desc.configurable = true
  try {
    defineProperty(NativeError, PREPARE, desc)
  } catch (_) {
    return
  }

  let sites: unknown
  try {
    sites = new NativeError().stack
  } catch (_) {
  } finally {
    restorePrepare(prev)
  }
  return isArray(sites) ? sites : undefined
}

const stripHash = (url: string) => {
  const i = strIndexOf(url, '#')
  return i === -1 ? url : strSlice(url, 0, i)
}

/**
 * 模块加载（注入）时取得 CallSite 的原生方法与注入脚本自身的文件名
 * 非 V8 引擎没有结构化调用栈，此时不启用调用方例外
 */
const initCallerCheck = () => {
  try {
    const sites = captureSites()
    if (!sites || !sites.length) return
    const proto = getPrototypeOf(sites[0])
    siteGetFileName = proto?.getFileName
    siteIsEval = proto?.isEval
    if (typeof siteGetFileName !== 'function' || typeof siteIsEval !== 'function') return

    ownFile = apply(siteGetFileName, sites[0], [])
    const loc = typeof location === 'undefined' ? undefined : location
    pageOrigin = loc?.origin
    /* 注入脚本与页面脚本同名时无法区分自身调用帧，不启用例外 */
    if (ownFile && loc && stripHash(ownFile) === stripHash(loc.href)) return

    callerCheckReady = true
  } catch (_) { }
}
initCallerCheck()

/**
 * 直接调用被钩取接口的脚本是否是 Cloudflare 验证脚本
 * 涵盖嵌入式 Turnstile (api.js)、5秒盾脚本 (/cdn-cgi/challenge-platform/) 等
 *
 * - 只看最近的调用方：跳过注入脚本自身与内置函数的调用帧，Cloudflare 脚本回调页面代码时不算
 * - 按脚本的真实地址判断（getFileName 不受 `//# sourceURL` 影响），不搜索函数名等关键词
 * - eval / new Function 生成的代码一律视为页面代码
 */
export const isCloudflareCaller = (): boolean => {
  if (!callerCheckReady) return false
  try {
    const sites = captureSites()
    if (!sites) return false
    for (let i = 0; i < sites.length; i++) {
      const site = sites[i]
      if (apply(siteIsEval!, site, [])) return false
      const file = apply(siteGetFileName!, site, [])
      if (!file || file === ownFile) continue
      return isCloudflareScriptUrl(file, pageOrigin)
    }
  } catch (_) { }
  return false
}

/**
 * 当前窗口是否处于 Cloudflare 验证上下文
 * - 验证组件自身，以及其中的 about:blank / blob 子框架（hostname 为空，需要看 origin）
 * - 验证组件的后代框架
 * - 站点域名下的人机验证页（Server-Timing、URL 路径或特征 DOM）
 */
export const isCloudflareChallengeContext = (win: ChallengeWindow): boolean => {
  try {
    if (isCloudflareChallengeHost(win.location?.hostname)) return true
    if (isCloudflareChallengeOrigin(win.origin)) return true
    const ancestors = win.location?.ancestorOrigins
    if (ancestors) {
      for (let i = 0; i < ancestors.length; i++) {
        if (isCloudflareChallengeOrigin(ancestors[i])) return true
      }
    }

    const pathname = win.location?.pathname
    if (typeof pathname === 'string' && (includes(pathname, CF_SCRIPT_PATH) || includes(pathname, '/turnstile/'))) {
      return true
    }

    const nav = win.performance?.getEntriesByType?.('navigation')?.[0]
    if (hasCloudflareChallengeTiming(nav?.serverTiming)) return true

    const doc = win.document
    if (doc) {
      if (doc.getElementById?.('challenge-running') || doc.getElementById?.('challenge-form')) {
        return true
      }
      if (typeof doc.title === 'string' && includes(doc.title, 'Just a moment...')) {
        return true
      }
    }

    return false
  } catch (_) {
    return false
  }
}
