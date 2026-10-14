/**
 * Cloudflare 验证兼容
 *
 * 目的：Cloudflare 的 Turnstile / 人机验证会在组件内部检测浏览器环境是否被篡改。
 * 若在这些验证上下文中改写指纹，会让真实用户被误判为机器人、反复无法通过验证。
 * 因此在验证上下文中跳过注入（等同于内置白名单），把验证交还给浏览器与真人本身。
 *
 * 纯函数模块，便于单元测试。
 */

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
 * 是否是 Cloudflare 验证组件的主机
 */
export const isCloudflareChallengeHost = (hostname?: string | null): boolean => {
  if (!hostname) return false
  const host = hostname.toLowerCase()
  return CF_CHALLENGE_HOSTS.some((v) => host === v || host.endsWith('.' + v))
}

/**
 * 是否是 Cloudflare 验证组件的源（origin）
 */
const isCloudflareChallengeOrigin = (origin?: string | null): boolean => {
  if (!origin || origin === 'null') return false
  try {
    return isCloudflareChallengeHost(new URL(origin).hostname)
  } catch (_) {
    return false
  }
}

/**
 * 导航响应的 Server-Timing 是否来自 Cloudflare 人机验证页
 */
export const hasCloudflareChallengeTiming = (serverTiming?: ArrayLike<{ name?: string }> | null): boolean => {
  if (!serverTiming) return false
  return Array.from(serverTiming).some((v) => v?.name === CF_CHALLENGE_TIMING)
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

/**
 * 是否是 Cloudflare 相关的 DOM 节点（如 Turnstile 的 iframe）
 */
export const isCloudflareElement = (node?: any): boolean => {
  if (!node) return false
  try {
    if (node.nodeName === 'IFRAME') {
      const src = node.getAttribute?.('src') || node.src || ''
      if (typeof src === 'string') {
        if (src.includes('challenges.cloudflare.com') || src.includes('/cdn-cgi/challenge-platform/')) {
          return true
        }
      }
      const id = node.getAttribute?.('id') || node.id || ''
      if (typeof id === 'string' && (id.startsWith('cf-') || id.includes('turnstile'))) {
        return true
      }
    }
  } catch (_) { }
  return false
}

/**
 * 检查当前调用栈是否来源于 Cloudflare 验证或挑战脚本
 * 涵盖嵌入式 Turnstile (api.js)、5秒盾脚本 (/cdn-cgi/challenge-platform/) 等
 */
export const isCloudflareCaller = (): boolean => {
  try {
    const stack = new Error().stack
    if (!stack) return false
    return (
      stack.includes('challenges.cloudflare.com') ||
      stack.includes('/cdn-cgi/challenge-platform/') ||
      stack.includes('turnstile') ||
      stack.includes('cf-chl') ||
      stack.includes('chl_api')
    )
  } catch (_) {
    return false
  }
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
    if (ancestors && Array.from(ancestors).some((v) => isCloudflareChallengeOrigin(v))) return true

    const pathname = win.location?.pathname
    if (pathname && (pathname.includes('/cdn-cgi/challenge-platform/') || pathname.includes('/turnstile/'))) {
      return true
    }

    const nav = win.performance?.getEntriesByType?.('navigation')?.[0]
    if (hasCloudflareChallengeTiming(nav?.serverTiming)) return true

    const doc = win.document
    if (doc) {
      if (doc.getElementById?.('challenge-running') || doc.getElementById?.('challenge-form')) {
        return true
      }
      if (typeof doc.title === 'string' && doc.title.includes('Just a moment...')) {
        return true
      }
    }

    return false
  } catch (_) {
    return false
  }
}
