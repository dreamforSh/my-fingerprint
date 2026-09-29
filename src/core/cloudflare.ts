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
const CF_CHALLENGE_HOSTS = [
  'challenges.cloudflare.com',
]

/**
 * 是否是 Cloudflare 验证组件的主机
 */
export const isCloudflareChallengeHost = (hostname?: string | null): boolean => {
  if (!hostname) return false
  const host = hostname.toLowerCase()
  return CF_CHALLENGE_HOSTS.some((v) => host === v || host.endsWith('.' + v))
}
