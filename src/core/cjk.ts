/**
 * 中文环境探测防护
 * 纯函数模块，不依赖运行环境，便于单元测试
 */

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

export const hasCjk = (text: string) => CJK_TEST.test(text)

/**
 * 将文本中的中日文字符替换为缺字字符
 */
export const maskCjk = (text: string) => text.replace(CJK_ALL, CJK_MASK_CHAR)

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
export const isCjkFontFamily = (family: string) => {
  const name = family.trim().replace(/^(["'])(.*)\1$/, '$2').replace(/\s+/g, ' ').toLowerCase()
  if (!name) return false
  if (hasCjk(name)) return true
  if (CJK_FONT_NAMES.has(name)) return true
  return CJK_FONT_PREFIXES.some((v) => name.startsWith(v))
}

/**
 * 按顶层逗号切分（忽略引号内的逗号）
 */
const splitFamilies = (value: string) => {
  const parts: string[] = []
  let buf = ''
  let quote = ''
  for (const ch of value) {
    if (quote) {
      if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === ',') {
      parts.push(buf)
      buf = ''
      continue
    }
    buf += ch
  }
  parts.push(buf)
  return parts
}

/**
 * font 简写：[style variant weight stretch] size[/line-height] family[, family...]
 */
const FONT_PREFIX_RE = /^(.*?(?:^|\s)(?:[+-]?(?:\d+\.?\d*|\.\d+)(?:px|pt|pc|em|rem|ex|ch|vw|vh|vmin|vmax|cm|mm|in|q|%)|xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|larger|smaller)(?:\s*\/\s*\S+)?\s+)(\S.*)$/i

const parseFont = (font: string) => {
  const m = font.match(FONT_PREFIX_RE)
  if (!m) return;
  return {
    prefix: m[1],
    families: splitFamilies(m[2]).map((v) => v.trim()).filter(Boolean),
  }
}

/**
 * font 简写中是否包含中文字体族
 */
export const hasCjkFontFamily = (font: string) => {
  return parseFont(font)?.families.some(isCjkFontFamily) ?? false
}

/**
 * 移除 font 简写中的中文字体族，并在末尾追加占位族名
 * 占位族名不存在于系统中：全部族名被移除时，浏览器会像未安装该字体一样回退到默认字体
 * @returns 无需处理时返回 undefined
 */
export const stripCjkFontFamilies = (font: string, placeholder: string) => {
  const parsed = parseFont(font)
  if (!parsed) return;

  const kept = parsed.families.filter((v) => !isCjkFontFamily(v))
  if (kept.length === parsed.families.length) return;

  return parsed.prefix + [...kept, placeholder].join(', ')
}

/**
 * 是否是中文本地语音（如 Windows 中文语言包提供的语音）
 */
export const isCjkLocalVoice = (voice: { lang?: string, localService?: boolean }) => {
  return !!voice.localService && /^(zh|yue|cmn|wuu|hak|nan|lzh|gan|hsn)([-_]|$)/i.test(voice.lang ?? '')
}
