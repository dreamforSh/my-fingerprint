/**
 * 改写媒体查询中的设备尺寸特性，使 matchMedia 按伪装的屏幕尺寸求值
 * 纯函数模块，便于单元测试
 *
 * 输入是引擎规范化后的查询（MediaQueryList.media：小写、"name: value"、比较符两侧有空格、比例为 "a / b"）。
 * - device-width / device-height（含 min- / max- 与范围语法）：比较值加上真实与伪装尺寸之差，
 *   以 calc() 保留原单位（em、cm 等仍由引擎换算），求值结果等同于与伪装尺寸比较
 * - device-aspect-ratio：直接按伪装尺寸求值，替换为恒真 / 恒假的条件
 *
 * 钩取新建的 iframe 时会调用：只使用模块加载（注入）时缓存的原生方法
 */

const apply = Reflect.apply
const regExec = RegExp.prototype.exec
const strTrim = String.prototype.trim
const strSlice = String.prototype.slice
const numParseFloat = parseFloat

const test = (re: RegExp, s: string) => apply(regExec, re, [s]) !== null
const trim = (s: string): string => apply(strTrim, s, [])
const slice = (s: string, start: number, end?: number): string => apply(strSlice, s, [start, end])

export type ScreenSize = { width: number, height: number }

const TRUE = '(width >= 0px)'
const FALSE = '(width < 0px)'

const FEATURE = /^(min-|max-)?device-(width|height|aspect-ratio)$/
const BARE_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i
const ZERO = /^[+-]?(?:0+\.?0*|\.0+)(?:e[+-]?\d+)?$/i
const RATIO = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(?:\s*\/\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?))?$/i

type Op = '<' | '<=' | '>' | '>=' | '='

/** 按深度 0 的比较符切分范围语法：["100px", "<", "device-width", "<=", "200px"] */
const splitRange = (s: string): string[] => {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (depth === 0 && (c === '<' || c === '>' || c === '=')) {
      const op = (c !== '=' && s[i + 1] === '=') ? c + '=' : c
      parts[parts.length] = trim(slice(s, start, i))
      parts[parts.length] = op
      i += op.length - 1
      start = i + 1
    }
  }
  parts[parts.length] = trim(slice(s, start))
  return parts
}

/** 深度 0 的冒号位置 */
const topColon = (s: string): number => {
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === ':' && depth === 0) return i
  }
  return -1
}

/** 长度值平移 delta 像素；无单位的 0 视为 0px，其他无单位数值无效，保持原样 */
const shiftLength = (value: string, delta: number): string => {
  if (delta === 0) return value
  let v = value
  if (test(BARE_NUMBER, v)) {
    if (!test(ZERO, v)) return value
    v = '0px'
  }
  return delta > 0 ? `calc(${v} + ${delta}px)` : `calc(${v} - ${-delta}px)`
}

const parseRatio = (value: string): [number, number] | undefined => {
  const m = apply(regExec, RATIO, [value]) as RegExpExecArray | null
  if (!m) return
  const a = numParseFloat(m[1])
  const b = m[2] === undefined ? 1 : numParseFloat(m[2])
  if (!(a >= 0 && b >= 0)) return
  return [a, b]
}

/** 比较 w / h 与 a / b（交叉相乘，避免除法误差） */
const compareRatio = (size: ScreenSize, ratio: [number, number], op: Op, reversed: boolean): boolean => {
  const left = size.width * ratio[1]
  const right = size.height * ratio[0]
  const l = reversed ? right : left
  const r = reversed ? left : right
  switch (op) {
    case '<': return l < r
    case '<=': return l <= r
    case '>': return l > r
    case '>=': return l >= r
    default: return l === r
  }
}

/**
 * 改写一个媒体特性（括号内的内容），返回替换整个括号的文本；不涉及设备尺寸时返回 undefined
 */
const rewriteFeature = (inner: string, real: ScreenSize, spoof: ScreenSize): string | undefined => {
  const delta = (axis: string) => axis === 'width' ? real.width - spoof.width : real.height - spoof.height

  const colon = topColon(inner)
  if (colon !== -1) {
    const name = trim(slice(inner, 0, colon))
    const m = apply(regExec, FEATURE, [name]) as RegExpExecArray | null
    if (!m) return
    const value = trim(slice(inner, colon + 1))
    if (m[2] === 'aspect-ratio') {
      const ratio = parseRatio(value)
      if (!ratio) return
      const op: Op = m[1] === 'min-' ? '>=' : m[1] === 'max-' ? '<=' : '='
      return compareRatio(spoof, ratio, op, false) ? TRUE : FALSE
    }
    return `(${name}: ${shiftLength(value, delta(m[2]))})`
  }

  const parts = splitRange(inner)
  if (parts.length !== 3 && parts.length !== 5) return
  let index = -1
  let axis = ''
  for (let i = 0; i < parts.length; i += 2) {
    const m = apply(regExec, FEATURE, [parts[i]]) as RegExpExecArray | null
    if (m && m[1] === undefined) {
      index = i
      axis = m[2]
    }
  }
  if (index === -1) return

  if (axis === 'aspect-ratio') {
    let result = true
    for (let i = 0; i < parts.length; i += 2) {
      if (i === index) continue
      const ratio = parseRatio(parts[i])
      if (!ratio) return
      /* 值在特性左侧时比较方向相反："16 / 9 < device-aspect-ratio" 即 ratio > 16 / 9 */
      const op = (i < index ? parts[i + 1] : parts[i - 1]) as Op
      result = result && compareRatio(spoof, ratio, op, i < index)
    }
    return result ? TRUE : FALSE
  }

  let res = ''
  for (let i = 0; i < parts.length; i++) {
    const part = i % 2 === 0 && i !== index ? shiftLength(parts[i], delta(axis)) : parts[i]
    res += (i === 0 ? '' : ' ') + part
  }
  return `(${res})`
}

/**
 * 改写媒体查询；不涉及设备尺寸时原样返回
 * @param real 真实屏幕尺寸（CSS 像素）
 * @param spoof 伪装的屏幕尺寸
 */
export const rewriteMediaQuery = (media: string, real: ScreenSize, spoof: ScreenSize): string => {
  if (!test(/device-/, media)) return media
  return rewriteGroups(media, real, spoof)
}

/** 逐个处理括号：是设备尺寸特性则改写，否则递归处理其中的括号（not、and、or 组合的条件） */
const rewriteGroups = (s: string, real: ScreenSize, spoof: ScreenSize): string => {
  let res = ''
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (c !== '(') {
      res += c
      i++
      continue
    }
    let depth = 0
    let end = i
    for (; end < s.length; end++) {
      if (s[end] === '(') depth++
      else if (s[end] === ')' && --depth === 0) break
    }
    if (end >= s.length) {
      res += slice(s, i)
      break
    }
    const inner = slice(s, i + 1, end)
    const feature = rewriteFeature(inner, real, spoof)
    res += feature ?? '(' + rewriteGroups(inner, real, spoof) + ')'
    i = end + 1
  }
  return res
}
