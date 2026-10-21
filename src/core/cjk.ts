/**
 * 中文环境探测防护
 * 纯函数模块，不依赖运行环境，便于单元测试
 *
 * 运行时处理页面传入的文本：只使用模块加载（注入）时缓存的原生方法，
 * 页面改写 String / RegExp / Array / Set 的原型方法也无法让判断失效
 */

const apply = Reflect.apply
const uncurryThis = (fn: Function) => (self: any, ...args: any[]): any => apply(fn, self, args)
const regExec = uncurryThis(RegExp.prototype.exec) as (re: RegExp, s: string) => RegExpExecArray | null
const strSlice = uncurryThis(String.prototype.slice) as (s: string, start?: number, end?: number) => string
const strToLowerCase = uncurryThis(String.prototype.toLowerCase) as (s: string) => string
const setHas = uncurryThis(Set.prototype.has) as (set: Set<string>, v: string) => boolean

/**
 * 按正则替换全部匹配（正则需带 g 标志）
 */
const replaceAll = (text: string, re: RegExp, to: string) => {
  let res = ''
  let last = 0
  re.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = regExec(re, text)) !== null) {
    res += strSlice(text, last, m.index) + to
    last = m.index + m[0].length
    if (m[0].length === 0) re.lastIndex++
  }
  return res + strSlice(text, last)
}

const TRIM_RE = /^\s*([\s\S]*?)\s*$/
const trim = (text: string) => regExec(TRIM_RE, text)![1]

const startsWith = (s: string, prefix: string) => strSlice(s, 0, prefix.length) === prefix

/**
 * 汉字、注音、假名、CJK 符号与标点、全角字符
 */
const CJK_RANGES = '\\u2E80-\\u2FFF\\u3000-\\u30FF\\u3100-\\u312F\\u3190-\\u31FF\\u3200-\\u9FFF'
  + '\\uF900-\\uFAFF\\uFE10-\\uFE1F\\uFE30-\\uFE4F\\uFF00-\\uFFEF\\u{20000}-\\u{323AF}'

const CJK_TEST = new RegExp(`[${CJK_RANGES}]`, 'u')
const CJK_ALL = new RegExp(`[${CJK_RANGES}]`, 'gu')

/**
 * 未分配码位，任何字体都没有对应字形，渲染为缺字方框（与未安装中文字体时一致）
 */
export const CJK_MASK_CHAR = '͸'

export const hasCjk = (text: string) => regExec(CJK_TEST, text) !== null

/**
 * 将文本中的中日文字符替换为缺字字符
 */
export const maskCjk = (text: string) => replaceAll(text, CJK_ALL, CJK_MASK_CHAR)

/**
 * 中文字体（小写，空白已归一）
 */
const CJK_FONT_NAMES = new Set([
  // Windows
  'microsoft yahei', 'microsoft yahei ui', 'microsoft yahei light', 'microsoft yahei ui light',
  'microsoft jhenghei', 'microsoft jhenghei ui', 'microsoft jhenghei light', 'microsoft jhenghei ui light',
  'simsun', 'simsun-extb', 'simsun-extg', 'nsimsun', 'simhei', 'kaiti', 'kaiti_gb2312', 'fangsong', 'fangsong_gb2312',
  'dengxian', 'dengxian light', 'youyuan', 'lisu', 'mingliu', 'pmingliu', 'mingliu-extb', 'pmingliu-extb',
  'mingliu_hkscs', 'mingliu_hkscs-extb', 'dfkai-sb',
  'stcaiyun', 'stfangsong', 'sthupo', 'stkaiti', 'stliti', 'stsong', 'stxihei', 'stxingkai', 'stxinwei',
  'stzhongsong', 'stheiti', 'stbaoli', 'fzshuti', 'fzyaoti',
  // macOS
  'pingfang sc', 'pingfang tc', 'pingfang hk', 'hiragino sans gb', 'heiti sc', 'heiti tc', 'songti sc', 'songti tc',
  'kaiti sc', 'kaiti tc', 'lantinghei sc', 'lantinghei tc', 'libian sc', 'libian tc', 'wawati sc', 'wawati tc',
  'weibei sc', 'weibei tc', 'xingkai sc', 'xingkai tc', 'yuanti sc', 'yuanti tc', 'yuppy sc', 'yuppy tc',
  'baoli sc', 'baoli tc', 'hannotate sc', 'hannotate tc', 'hanzipen sc', 'hanzipen tc', 'lisong pro', 'lihei pro',
  'biaukai', 'apple lisung', 'apple ligothic', 'gb18030 bitmap',
  // Linux / Android
  'droid sans fallback', 'noto sans sc', 'noto sans tc', 'noto sans hk', 'noto serif sc', 'noto serif tc', 'noto serif hk',
  // 其他常见中文字体
  'misans', 'opposans', 'oppo sans', 'smiley sans', 'adobe song std', 'adobe heiti std', 'adobe kaiti std',
  'adobe fangsong std', 'adobe ming std', 'microsoft yahei mono',
])

const CJK_FONT_PREFIXES = [
  'noto sans cjk', 'noto serif cjk', 'source han sans', 'source han serif', 'wenquanyi', 'ar pl ',
  'harmonyos sans sc', 'harmonyos sans tc', 'alibaba puhuiti', 'lxgw wenkai', 'fzlantinghei', 'fzhei', 'fzkai',
  'fzsong', 'fzfangsong', 'hanyi', 'sarasa ',
]

/**
 * 是否是中文字体族名
 */
const QUOTED_RE = /^(["'])(.*)\1$/
const SPACES_RE = /\s+/g

export const isCjkFontFamily = (family: string) => {
  let name = trim(family)
  const quoted = regExec(QUOTED_RE, name)
  if (quoted) name = quoted[2]
  name = strToLowerCase(replaceAll(name, SPACES_RE, ' '))
  if (!name) return false
  if (hasCjk(name)) return true
  if (setHas(CJK_FONT_NAMES, name)) return true
  for (let i = 0; i < CJK_FONT_PREFIXES.length; i++) {
    if (startsWith(name, CJK_FONT_PREFIXES[i])) return true
  }
  return false
}

/**
 * 按顶层逗号切分（忽略引号内的逗号）
 */
const splitFamilies = (value: string) => {
  const parts: string[] = []
  let buf = ''
  let quote = ''
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (quote) {
      if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === ',') {
      parts[parts.length] = buf
      buf = ''
      continue
    }
    buf += ch
  }
  parts[parts.length] = buf
  return parts
}

/**
 * font 简写：[style variant weight stretch] size[/line-height] family[, family...]
 */
const FONT_PREFIX_RE = /^(.*?(?:^|\s)(?:[+-]?(?:\d+\.?\d*|\.\d+)(?:px|pt|pc|em|rem|ex|ch|vw|vh|vmin|vmax|cm|mm|in|q|%)|xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|larger|smaller)(?:\s*\/\s*\S+)?\s+)(\S.*)$/i

const parseFont = (font: string) => {
  const m = regExec(FONT_PREFIX_RE, font)
  if (!m) return;
  const parts = splitFamilies(m[2])
  const families: string[] = []
  for (let i = 0; i < parts.length; i++) {
    const v = trim(parts[i])
    if (v) families[families.length] = v
  }
  return {
    prefix: m[1],
    families,
  }
}

/**
 * font 简写中是否包含中文字体族
 */
export const hasCjkFontFamily = (font: string) => {
  const families = parseFont(font)?.families
  for (let i = 0; families && i < families.length; i++) {
    if (isCjkFontFamily(families[i])) return true
  }
  return false
}

/**
 * 移除 font 简写中的中文字体族，并在末尾追加占位族名
 * 占位族名不存在于系统中：全部族名被移除时，浏览器会像未安装该字体一样回退到默认字体
 * @returns 无需处理时返回 undefined
 */
export const stripCjkFontFamilies = (font: string, placeholder: string) => {
  const parsed = parseFont(font)
  if (!parsed) return;

  let res = ''
  let kept = 0
  for (let i = 0; i < parsed.families.length; i++) {
    const v = parsed.families[i]
    if (isCjkFontFamily(v)) continue
    res += v + ', '
    kept++
  }
  if (kept === parsed.families.length) return;

  return parsed.prefix + res + placeholder
}

const CJK_LANG_RE = /^(zh|yue|cmn|wuu|hak|nan|lzh|gan|hsn)([-_]|$)/i

/**
 * 是否是中文本地语音（如 Windows 中文语言包提供的语音）
 */
export const isCjkLocalVoice = (voice: { lang?: string, localService?: boolean }) => {
  return !!voice.localService && regExec(CJK_LANG_RE, voice.lang ?? '') !== null
}
