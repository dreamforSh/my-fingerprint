/**
 * 由伪装的 WebGL 显卡信息推导 WebGPU 的 GPUAdapterInfo，使两者一致
 * 纯函数模块，便于单元测试
 *
 * 钩取新建的 iframe 时会调用：只使用模块加载（注入）时缓存的原生方法
 */

const apply = Reflect.apply
const regExec = RegExp.prototype.exec
const strToLowerCase = String.prototype.toLowerCase

const test = (re: RegExp, s: string) => apply(regExec, re, [s]) !== null

export type AdapterInfo = {
  vendor: string
  architecture: string
  device: string
  description: string
}

/** 厂商：WebGPU 使用小写的厂商名 */
const VENDORS: [RegExp, string][] = [
  [/nvidia|geforce|quadro|tesla/i, 'nvidia'],
  [/\bamd\b|radeon|\bati\b/i, 'amd'],
  [/intel/i, 'intel'],
  [/apple/i, 'apple'],
  [/qualcomm|adreno/i, 'qualcomm'],
  [/\barm\b|mali/i, 'arm'],
  /* ANGLE 的厂商串都以 "Google Inc." 开头，只按软件渲染器 SwiftShader 判断 */
  [/swiftshader/i, 'google'],
]

/** 架构（Dawn 的命名），无法识别时为空字符串 */
const ARCHITECTURES: Record<string, [RegExp, string][]> = Object.assign(Object.create(null), {
  nvidia: [
    [/rtx\s*50\d\d/i, 'blackwell'],
    [/rtx\s*40\d\d|rtx\s*\d+\s*ada|\bl4\b|l40/i, 'lovelace'],
    [/rtx\s*30\d\d|rtx\s*a\d{3,4}|\ba\d{2,3}\b/i, 'ampere'],
    [/rtx\s*20\d\d|gtx\s*16\d\d|titan\s*rtx|quadro\s*rtx|\bt4\b/i, 'turing'],
    [/gtx\s*10\d\d|titan\s*xp?\b|quadro\s*p\d/i, 'pascal'],
    [/gtx\s*9\d\d|gtx\s*7[45]0/i, 'maxwell'],
  ],
  amd: [
    [/rx\s*9\d{3}/i, 'rdna-4'],
    [/rx\s*7\d{3}|radeon\s*7[0-9]0m/i, 'rdna-3'],
    [/rx\s*6\d{3}|radeon\s*6[0-9]0m/i, 'rdna-2'],
    [/rx\s*5\d{3}/i, 'rdna-1'],
    [/vega/i, 'gcn-5'],
    [/rx\s*[45]\d{2}\b/i, 'gcn-4'],
  ],
  intel: [
    [/arc\(?.*?\)?\s*a\d{3}/i, 'gen-12hp'],
    [/iris\(?r?\)?\s*xe|uhd\s*graphics\s*7\d\d|uhd\s*graphics(?!\s*\d)/i, 'gen-12lp'],
    [/iris\(?r?\)?\s*plus\s*graphics(?!\s*6)|iris\s*plus\s*g[47]/i, 'gen-11'],
    [/uhd\s*graphics\s*6\d\d|hd\s*graphics\s*[56]\d\d|iris\(?r?\)?\s*plus\s*graphics\s*6\d\d/i, 'gen-9'],
  ],
  apple: [
    [/apple\s*m\d/i, 'common-3'],
  ],
})

/**
 * @param vendor WebGL 的 UNMASKED_VENDOR_WEBGL
 * @param renderer WebGL 的 UNMASKED_RENDERER_WEBGL
 */
export const adapterInfoOf = (vendor?: string, renderer?: string): AdapterInfo => {
  const text = (renderer ?? '') + ' ' + (vendor ?? '')
  let name = ''
  for (let i = 0; i < VENDORS.length; i++) {
    if (test(VENDORS[i][0], text)) {
      name = VENDORS[i][1]
      break
    }
  }

  let architecture = ''
  const rules = name ? ARCHITECTURES[name] : undefined
  for (let i = 0; rules && i < rules.length; i++) {
    if (test(rules[i][0], renderer ?? '')) {
      architecture = rules[i][1]
      break
    }
  }

  return {
    vendor: apply(strToLowerCase, name, []),
    architecture,
    device: '',
    description: '',
  }
}
