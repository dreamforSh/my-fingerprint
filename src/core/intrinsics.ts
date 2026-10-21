/**
 * 注入时缓存的原生对象与方法
 *
 * 核心脚本先于页面脚本运行，但页面之后可以改写 Reflect、Function.prototype.call、Error、
 * Object.prototype 等全局对象。钩子若在运行时再去读取它们，原始函数、原始值与内部标识
 * 会经由页面的实现泄露，伪装也可能被整体关闭。钩子内部统一使用这里在注入时取得的引用。
 */

const R = Reflect

export const apply = R.apply
export const construct = R.construct
export const reflectGet = R.get
export const reflectSetPrototypeOf = R.setPrototypeOf
export const reflectDeleteProperty = R.deleteProperty

/** 代理处理器的全部陷阱对应的原生 Reflect 方法 */
export const NATIVE_TRAPS = {
  apply: R.apply,
  construct: R.construct,
  get: R.get,
  set: R.set,
  has: R.has,
  deleteProperty: R.deleteProperty,
  defineProperty: R.defineProperty,
  getOwnPropertyDescriptor: R.getOwnPropertyDescriptor,
  ownKeys: R.ownKeys,
  getPrototypeOf: R.getPrototypeOf,
  setPrototypeOf: R.setPrototypeOf,
  isExtensible: R.isExtensible,
  preventExtensions: R.preventExtensions,
} as const

export type ProxyTrap = keyof typeof NATIVE_TRAPS

export const PROXY_TRAPS = R.ownKeys(NATIVE_TRAPS) as ProxyTrap[]

export const NativeProxy = Proxy
export const NativeMap = Map
export const NativeSet = Set
export const NativeWeakMap = WeakMap
export const NativeWeakSet = WeakSet
export const NativeError = Error
export const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
export const defineProperty = Object.defineProperty
export const getPrototypeOf = Object.getPrototypeOf
export const getOwnPropertyNames = Object.getOwnPropertyNames
export const objectCreate = Object.create
export const objectFreeze = Object.freeze
export const stringify = JSON.stringify
export const parseJson = JSON.parse
export const isArray = Array.isArray
export const numIsNaN = isNaN
export const numParseFloat = parseFloat
export const mathRandom = Math.random
export const mathFloor = Math.floor
export const fround = Math.fround
export const ITERATOR: typeof Symbol.iterator = Symbol.iterator

/**
 * 将原型方法转为普通函数，调用时不再经过页面可改写的 call / apply
 * @example uncurryThis(String.prototype.slice)('abc', 1) // 'bc'
 */
export const uncurryThis = (fn: Function) => (self: any, ...args: any[]): any => apply(fn, self, args)

export const hasOwn = uncurryThis(Object.prototype.hasOwnProperty) as (obj: any, key: PropertyKey) => boolean
export const bind = uncurryThis(Function.prototype.bind) as <F extends Function>(fn: F, self: any) => F
export const fnToString = uncurryThis(Function.prototype.toString) as (fn: Function) => string
export const promiseThen = uncurryThis(Promise.prototype.then) as <T>(p: Promise<T>, onFulfilled: (v: T) => any) => Promise<any>
export const weakSetHas = uncurryThis(WeakSet.prototype.has) as (set: WeakSet<object>, v: any) => boolean
export const weakSetAdd = uncurryThis(WeakSet.prototype.add) as (set: WeakSet<object>, v: object) => void
export const weakSetDelete = uncurryThis(WeakSet.prototype.delete) as (set: WeakSet<object>, v: any) => boolean
export const setHas = uncurryThis(Set.prototype.has) as <T>(set: Set<T>, v: any) => boolean
export const setAdd = uncurryThis(Set.prototype.add) as <T>(set: Set<T>, v: T) => void
/** Set.prototype 上的原生方法（按名称取用） */
export const SET_METHODS: Record<PropertyKey, Function> = objectCreate(null)
for (const k of R.ownKeys(Set.prototype)) {
  const d = getOwnPropertyDescriptor(Set.prototype, k)
  if (d) SET_METHODS[k] = typeof d.value === 'function' ? d.value : d.get
}
export const isView = ArrayBuffer.isView
const arrayBufferByteLength = getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')?.get
/** 是否是 ArrayBuffer 或 ArrayBufferView（原生判断，可识别其他 realm 的对象） */
export const isBinaryData = (v: unknown) => {
  if (v == null || typeof v !== 'object') return false
  if (isView(v)) return true
  try {
    apply(arrayBufferByteLength!, v, [])
    return true
  } catch (_) {
    return false
  }
}
const typedArrayTag = getOwnPropertyDescriptor(getPrototypeOf(Uint8Array.prototype), Symbol.toStringTag)?.get
/** TypedArray 的类型名（如 'Float32Array'），不是 TypedArray 时为 undefined */
export const typedArrayName = (v: unknown): string | undefined => apply(typedArrayTag!, v, [])
export const mapGet = uncurryThis(Map.prototype.get) as <K, V>(map: Map<K, V>, k: K) => V | undefined
export const mapSet = uncurryThis(Map.prototype.set) as <K, V>(map: Map<K, V>, k: K, v: V) => void
export const mapDelete = uncurryThis(Map.prototype.delete) as <K, V>(map: Map<K, V>, k: K) => boolean
export const regExec = uncurryThis(RegExp.prototype.exec) as (re: RegExp, s: string) => RegExpExecArray | null
export const weakMapGet = uncurryThis(WeakMap.prototype.get) as <V>(map: WeakMap<object, V>, k: any) => V | undefined
export const weakMapSet = uncurryThis(WeakMap.prototype.set) as <V>(map: WeakMap<object, V>, k: object, v: V) => void
export const strIndexOf = uncurryThis(String.prototype.indexOf) as (s: string, search: string, from?: number) => number
export const strLastIndexOf = uncurryThis(String.prototype.lastIndexOf) as (s: string, search: string, from?: number) => number
export const strSlice = uncurryThis(String.prototype.slice) as (s: string, start?: number, end?: number) => string
export const strToLowerCase = uncurryThis(String.prototype.toLowerCase) as (s: string) => string

/** 不带原型的对象：读取不存在的属性时不会走到页面可改写的 Object.prototype */
export const nullObject = <T extends object = Record<string, any>>(): T => objectCreate(null)

/**
 * 向下取整（不经过页面可改写的 Math.floor：传入的常是由种子算出的噪音）
 */
export const floor = (x: number) => {
  const t = x - x % 1
  return t > x ? t - 1 : t
}

/**
 * 四舍五入，与 Math.round 一致
 */
export const round = (x: number) => floor(x + 0.5)
