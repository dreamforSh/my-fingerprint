/**
 * 片元着色器颜色偏移（WebGL 指纹）
 * 纯函数模块，便于单元测试
 *
 * 运行时处理页面传入的着色器源码：只使用模块加载（注入）时缓存的原生方法，
 * 页面改写 String / RegExp 原型方法也无法让偏移失效
 */

const apply = Reflect.apply
const uncurryThis = (fn: Function) => (self: any, ...args: any[]): any => apply(fn, self, args)
const regExec = uncurryThis(RegExp.prototype.exec) as (re: RegExp, s: string) => RegExpExecArray | null
const strIndexOf = uncurryThis(String.prototype.indexOf) as (s: string, search: string, from?: number) => number
const strSlice = uncurryThis(String.prototype.slice) as (s: string, start?: number, end?: number) => string

const isSpace = (c: string | undefined) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v'
const isDigit = (c: string | undefined) => c != null && c >= '0' && c <= '9'
const isIdentChar = (c: string | undefined) => c != null && (
  (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_'
)

/**
 * 查找独立的标识符（前后都不是标识符字符）
 */
const findIdent = (source: string, name: string, from: number) => {
  let i = from
  while (true) {
    i = strIndexOf(source, name, i)
    if (i === -1) return -1;
    if (!isIdentChar(source[i - 1]) && !isIdentChar(source[i + name.length])) return i;
    i += name.length
  }
}

/** 常量表达式中允许出现的标识符：类型构造函数与布尔字面量 */
const CONSTANT_IDENTS: Record<string, true> = Object.create(null)
for (const id of [
  'vec2', 'vec3', 'vec4', 'ivec2', 'ivec3', 'ivec4', 'uvec2', 'uvec3', 'uvec4', 'bvec2', 'bvec3', 'bvec4',
  'float', 'int', 'uint', 'bool', 'true', 'false',
]) CONSTANT_IDENTS[id] = true

/**
 * 表达式是否只由常量构成（数字、类型构造函数与运算符），如 vec4(1.0, 0.0, 0.0, 1.0)
 * 纯色保持不变：页面绘制已知颜色并逐像素比对时，偏移会被识别出来
 */
export const isConstantExpr = (expr: string) => {
  let i = 0
  while (i < expr.length) {
    const c = expr[i]
    if (isDigit(c) || (c === '.' && isDigit(expr[i + 1]))) {
      i++
      while (i < expr.length && (isIdentChar(expr[i]) || expr[i] === '.')) i++
      continue
    }
    if (isIdentChar(c)) {
      let j = i
      while (j < expr.length && isIdentChar(expr[j])) j++
      if (CONSTANT_IDENTS[strSlice(expr, i, j)] !== true) return false;
      i = j
      continue
    }
    i++
  }
  return true
}

const OUT_RE = /\bout\s+(?:(?:lowp|mediump|highp)\s+)?vec4\s+([A-Za-z_]\w*)/g

/**
 * 片元着色器的颜色输出：GLSL ES 1.00 的 gl_FragColor，GLSL ES 3.00 中声明为 out vec4 的变量
 * 写入 gl_Position 的是顶点着色器，返回空
 */
export const fragmentOutputs = (source: string): string[] => {
  const names: string[] = []
  if (findIdent(source, 'gl_Position', 0) !== -1) return names;
  if (findIdent(source, 'gl_FragColor', 0) !== -1) names[names.length] = 'gl_FragColor'
  OUT_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = regExec(OUT_RE, source)) !== null) {
    names[names.length] = m[1]
  }
  return names
}

/**
 * 为 `name = expr;` 形式的赋值叠加颜色偏移，常量赋值保持不变
 */
const offsetAssignments = (source: string, name: string, offset: string) => {
  let res = ''
  let last = 0
  let from = 0
  while (true) {
    const at = findIdent(source, name, from)
    if (at === -1) break;
    from = at + name.length
    /* 排除其他对象的同名成员 a.name */
    if (source[at - 1] === '.') continue;

    let i = from
    while (isSpace(source[i])) i++
    if (source[i] !== '=' || source[i + 1] === '=') continue;
    i++
    while (isSpace(source[i])) i++

    const end = strIndexOf(source, ';', i)
    if (end <= i) continue;
    from = end + 1

    const expr = strSlice(source, i, end)
    if (isConstantExpr(expr)) continue;
    res += strSlice(source, last, at) + name + ' = ' + offset + ' + (' + expr + ');'
    last = end + 1
  }
  return last === 0 ? source : res + strSlice(source, last)
}

/**
 * 为片元着色器的颜色输出叠加偏移
 * @param offset GLSL 表达式，如 vec4(0.001,0.002,0.003,0)
 */
export const addFragColorOffset = (source: string, offset: string) => {
  const outputs = fragmentOutputs(source)
  let res = source
  for (let i = 0; i < outputs.length; i++) {
    res = offsetAssignments(res, outputs[i], offset)
  }
  return res
}
