/**
 * 内容安全策略（CSP）判断：URL 加载的 Worker 能否换成 blob Worker
 * 纯函数模块，便于单元测试；后台与核心脚本共用
 *
 * blob Worker 继承页面的 CSP：除 worker-src（blob:）外，Worker 内 importScripts、fetch 等
 * 也按页面策略检查，原本的 URL Worker 并不受这些限制。因此只要策略中含有可能影响它们的指令，
 * 就不做替换（仅报告的策略同样如此：替换会产生违规报告，网站可据此识别扩展）。
 *
 * 核心脚本在页面运行时调用：只使用模块加载（注入）时缓存的原生方法
 */

const apply = Reflect.apply
const strToLowerCase = String.prototype.toLowerCase
const strIndexOf = String.prototype.indexOf
const strSlice = String.prototype.slice

/** 会影响 Worker 加载、Worker 内脚本与请求的指令 */
const WORKER_DIRECTIVES: Record<string, true> = Object.create(null)
for (const name of [
  'default-src', 'script-src', 'script-src-elem', 'worker-src', 'child-src', 'connect-src',
  'require-trusted-types-for', 'trusted-types',
]) WORKER_DIRECTIVES[name] = true

const isSpace = (c: string | undefined) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f'

/**
 * 策略（可含多条以逗号分隔的策略）中是否有限制 Worker 的指令
 */
export const isRestrictiveForWorkers = (policy: string | null | undefined): boolean => {
  if (!policy || typeof policy !== 'string') return false
  const text: string = apply(strToLowerCase, policy, [])
  let start = 0
  for (let i = 0; i <= text.length; i++) {
    const c = text[i]
    if (i < text.length && c !== ';' && c !== ',') continue;
    /* 指令名：去掉前导空白后的第一个词 */
    let a = start
    while (a < i && isSpace(text[a])) a++
    let b = a
    while (b < i && !isSpace(text[b])) b++
    if (b > a && WORKER_DIRECTIVES[apply(strSlice, text, [a, b])] === true) return true
    start = i + 1
  }
  return false
}

/**
 * 去掉地址中的片段（#...），用于比较文档地址
 */
export const stripFragment = (url: string) => {
  const i: number = apply(strIndexOf, url, ['#'])
  return i === -1 ? url : apply(strSlice, url, [0, i])
}
