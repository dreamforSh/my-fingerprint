/**
 * 日期字符串是否按本地时间解析（Date.parse / new Date(string)）
 * 纯函数模块，便于单元测试
 *
 * 按本地时间解析的结果依赖系统时区，需换算为伪装时区；按 UTC 或自带偏移解析的结果与时区无关。
 * 与 V8 / SpiderMonkey 的规则一致：
 * - ISO 格式：只有日期（2024-01-15、2024-01、2024）按 UTC；带时间且无 Z / ±hh:mm 按本地时间
 * - 其他格式（引擎兼容解析）：含时区标记（Z、UTC、GMT、UT、EST 等，或时间后的 ±hhmm）时按其解析，否则按本地时间
 *
 * 钩取新建的 iframe 时会调用：只使用模块加载（注入）时缓存的原生方法
 */

const apply = Reflect.apply
const regExec = RegExp.prototype.exec

const test = (re: RegExp, s: string) => apply(regExec, re, [s]) !== null

const ISO = /^(?:[+-]\d{6}|\d{4})(?:-\d{2}(?:-\d{2})?)?(?:(T\d{2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?)(Z|[+-]\d{2}:\d{2})?)?$/i

/** 时区名：作为独立的单词出现 */
const ZONE_NAME = /(?:^|[^a-z])(?:z|gmt|utc|ut|[ecmp][sd]t)(?![a-z])/i
/** 时间之后的数字偏移，如 "10:00 +0800"、"10:00:00-05:00" */
const ZONE_OFFSET = /\d{1,2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?\s*(?:[ap]\.?m\.?\s*)?[+-]\d/i

/** 去掉括号内的注释（引擎忽略，如 "GMT+0800 (China Standard Time)" 中的时区全名） */
const stripComments = (s: string) => {
  let res = ''
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '(') depth++
    else if (c === ')' && depth > 0) depth--
    else if (depth === 0) res += c
  }
  return res
}

export const isLocalDateString = (input: string): boolean => {
  /* 引擎不去除首尾空白：带空白的 ISO 字符串由兼容解析处理（只有日期时按本地时间） */
  const s = input
  const iso = apply(regExec, ISO, [s]) as RegExpExecArray | null
  if (iso) return iso[1] !== undefined && iso[2] === undefined
  const text = stripComments(s)
  return !test(ZONE_NAME, text) && !test(ZONE_OFFSET, text)
}
