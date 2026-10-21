import { hashNumberFromString, makeSeededRandom, seededRandom } from "@/utils/base";
import { debounce } from "@/utils/timer";
import type { FingerprintContext } from "./core";
import { isCloudflareCaller } from "./cloudflare";
import { emitNotice } from "./channel";
import {
  NativeWeakMap, apply, floor, getOwnPropertyDescriptor, getPrototypeOf, nullObject, round, weakMapGet, weakMapSet,
} from "./intrinsics";

//
// --- notification ---
//
let fpNoticePool: Record<string, number> = nullObject()
let iframeNoticePool: Record<string, number> = nullObject()

/**
 * 记录指纹数量
 */
export const notify = (key: string) => {
  if (typeof window === 'undefined') return;
  fpNoticePool[key] = (fpNoticePool[key] ?? 0) + 1
  sendFpRecord()
}

const sendFpRecord = debounce(() => {
  emitNotice('fp', fpNoticePool)
  fpNoticePool = nullObject()
})

/**
 * 记录iframe数量
 */
export const notifyIframeOrigin = (key?: string) => {
  if (!key || key === 'null') key = 'about:blank';
  iframeNoticePool[key] = (iframeNoticePool[key] ?? 0) + 1
  sendIframeRecord()
}

const sendIframeRecord = debounce(() => {
  emitNotice('iframe', iframeNoticePool)
  iframeNoticePool = nullObject()
})

// 
// --- random ---
// 

/**
 * 随机canvas噪音
 */
/*
 * 噪音由种子算出：取整等只用手写实现，页面改写 Math、Array.prototype.push 既拿不到噪音值，也无法清空噪音
 */

export const randomCanvasNoise = (seed: number) => {
  const rand = makeSeededRandom(seed, 255, 0)
  const noise: number[] = []
  for (let i = 0; i < 10; i++) {
    noise[i] = floor(rand())
  }
  return noise
}

/**
 * 获取[x, y, ...]，区间[-1, 1]
 */
export const randomWebglNoise = (seed: number): number[] => {
  const rand = makeSeededRandom(seed, 1, -1)
  const ps: number[] = []
  for (let i = 0; i < 20; i++) {
    ps[i] = rand()
  }
  return ps;
}

/**
 * 获取随机字体噪音
 */
export const randomFontNoise = (seed: number, mark: string): number => {
  const random = seededRandom((seed + hashNumberFromString(mark)) % Number.MAX_SAFE_INTEGER, 3, 0)
  if ((random * 10) % 1 < 0.9) return 0;
  return floor(random) - 1;
}

/**
 * 获取随机屏幕尺寸
 */
export const randomScreenSize = (screen: Screen, seed: number) => {
  const offset = round(seededRandom(seed, 100, -100))
  const ratio = screen.width / screen.height;

  let width: number
  let height: number
  if (screen.width >= screen.height) {
    // 偏移宽度
    width = screen.width + offset;
    height = round(width / ratio);
  } else {
    // 偏移高度
    height = screen.height + offset;
    width = round(height * ratio);
  }

  return { width, height };
}


// 
// --- other ---
// 

type U8Array = Uint8ClampedArray | Uint8Array;

const isPixelEqual = (p1: U8Array, p2: U8Array) => {
  return p1[0] === p2[0] && p1[1] === p2[1] && p1[2] === p2[2] && p1[3] === p2[3];
}

const pixelCopy = (src: U8Array, dst: U8Array, index: number) => {
  dst[0] = src[index]
  dst[1] = src[index + 1]
  dst[2] = src[index + 2]
  dst[3] = src[index + 3]
}

//
// --- 参数转换 ---
//

/*
 * 钩子按参数值决定是否处理时，需先与原生一致地转换参数并写回：
 * 否则页面传入带 toString / valueOf 的对象，判断会被跳过而原生方法照常转换，防护失效
 */

/** DOMString：模板字符串按 ToString 转换（Symbol 抛出 TypeError，与原生一致） */
export const toDOMString = (v: unknown): string => `${v as any}`

/** unsigned long / GLenum */
export const toUint32 = (v: unknown): number => (+(v as any)) >>> 0

//
// --- dom ---
//

/*
 * 查找与进入 iframe 用到的 DOM 方法在注入时缓存：页面若改写 contentWindow、querySelectorAll、
 * nodeName 等，新建的 iframe 就不会被注入，页面可以从中读取真实值
 */
const protoOf = (name: string): any => (globalThis as any)[name]?.prototype
const getterOf = (proto: any, key: string): Function | undefined => proto ? getOwnPropertyDescriptor(proto, key)?.get : undefined

const QUERY_SELECTOR_ALL: Function[] = []
for (const name of ['Element', 'Document', 'DocumentFragment']) {
  const fn = protoOf(name)?.querySelectorAll
  if (fn) QUERY_SELECTOR_ALL[QUERY_SELECTOR_ALL.length] = fn
}

const CONTENT_WINDOW: Function[] = []
for (const name of ['HTMLIFrameElement', 'HTMLFrameElement', 'HTMLObjectElement']) {
  const fn = getterOf(protoOf(name), 'contentWindow')
  if (fn) CONTENT_WINDOW[CONTENT_WINDOW.length] = fn
}

const getNodeListLength = getterOf(protoOf('NodeList'), 'length')
const nodeListItem: Function | undefined = protoOf('NodeList')?.item
const getAddedNodes = getterOf(protoOf('MutationRecord'), 'addedNodes')
const getNodeName = getterOf(protoOf('Node'), 'nodeName')

const EMPTY: any[] = []

const getTypedArrayLength = getterOf(typeof Uint8Array === 'undefined' ? undefined : getPrototypeOf(Uint8Array.prototype), 'length')!

/**
 * TypedArray.length（原生 getter）
 */
export const typedArrayLength = (arr: ArrayLike<number>): number => apply(getTypedArrayLength, arr, [])

const RECT_ACCESSORS: Record<string, PropertyDescriptor | undefined> = nullObject()
for (const key of ['x', 'y', 'width', 'height']) {
  RECT_ACCESSORS[key] = protoOf('DOMRect') && getOwnPropertyDescriptor(protoOf('DOMRect'), key)
}
const getRectListLength = getterOf(protoOf('DOMRectList'), 'length')

/**
 * 读取 DOMRect 属性（原生 getter）
 */
export const rectGet = (rect: DOMRect, key: 'x' | 'y' | 'width' | 'height'): number => apply(RECT_ACCESSORS[key]!.get!, rect, [])

/**
 * 写入 DOMRect 属性（原生 setter）
 */
export const rectSet = (rect: DOMRect, key: 'x' | 'y' | 'width' | 'height', v: number) => apply(RECT_ACCESSORS[key]!.set!, rect, [v])

/**
 * DOMRectList.length（原生 getter）
 */
export const rectListLength = (list: DOMRectList): number => apply(getRectListLength!, list, [])

const NODE_GETTERS = {
  nodeType: getterOf(protoOf('Node'), 'nodeType'),
  firstChild: getterOf(protoOf('Node'), 'firstChild'),
  lastChild: getterOf(protoOf('Node'), 'lastChild'),
  childNodes: getterOf(protoOf('Node'), 'childNodes'),
}
const CHAR_DATA_GETTERS = {
  length: getterOf(protoOf('CharacterData'), 'length'),
  data: getterOf(protoOf('CharacterData'), 'data'),
}
const charDataSubstringData: Function | undefined = protoOf('CharacterData')?.substringData
const RANGE_GETTERS = {
  startContainer: getterOf(protoOf('AbstractRange'), 'startContainer') ?? getterOf(protoOf('Range'), 'startContainer'),
  endContainer: getterOf(protoOf('AbstractRange'), 'endContainer') ?? getterOf(protoOf('Range'), 'endContainer'),
  startOffset: getterOf(protoOf('AbstractRange'), 'startOffset') ?? getterOf(protoOf('Range'), 'startOffset'),
  endOffset: getterOf(protoOf('AbstractRange'), 'endOffset') ?? getterOf(protoOf('Range'), 'endOffset'),
}

/** Node 属性（原生 getter） */
export const nodeGet = (node: any, key: keyof typeof NODE_GETTERS): any => apply(NODE_GETTERS[key]!, node, [])

/** CharacterData 属性（原生 getter） */
export const charDataGet = (node: any, key: keyof typeof CHAR_DATA_GETTERS): any => apply(CHAR_DATA_GETTERS[key]!, node, [])

/** CharacterData.substringData（原生方法） */
export const charDataSubstring = (node: any, offset: number, count: number): string => (
  apply(charDataSubstringData!, node, [offset, count])
)

/** Range 属性（原生 getter） */
export const rangeGet = (range: any, key: keyof typeof RANGE_GETTERS): any => apply(RANGE_GETTERS[key]!, range, [])

/** NodeList.item（原生方法） */
export const nodeListAt = (list: any, i: number): any => apply(nodeListItem!, list, [i])

/**
 * NodeList 转为数组（原生 length / item）
 */
const nodeListToArray = (list: any): any[] => {
  if (!list || !getNodeListLength || !nodeListItem) return EMPTY
  const res: any[] = []
  const len = apply(getNodeListLength, list, [])
  for (let i = 0; i < len; i++) {
    res[i] = apply(nodeListItem, list, [i])
  }
  return res
}

/**
 * 查找节点内的 iframe
 */
export const findIframes = (root: any): any[] => {
  if (root == null || typeof root !== 'object') return EMPTY
  for (let i = 0; i < QUERY_SELECTOR_ALL.length; i++) {
    try {
      return nodeListToArray(apply(QUERY_SELECTOR_ALL[i], root, ['iframe']))
    } catch (_) { }
  }
  return EMPTY
}

/**
 * MutationRecord.addedNodes
 */
export const addedNodesOf = (record: any): any[] => {
  if (!getAddedNodes) return EMPTY
  try {
    return nodeListToArray(apply(getAddedNodes, record, []))
  } catch (_) {
    return EMPTY
  }
}

/**
 * Node.nodeName
 */
export const nodeNameOf = (node: any): string | undefined => {
  if (!getNodeName) return
  try {
    return apply(getNodeName, node, [])
  } catch (_) { }
}

/**
 * 框架元素的 contentWindow
 */
export const contentWindowOf = (node: any): any => {
  for (let i = 0; i < CONTENT_WINDOW.length; i++) {
    try {
      return apply(CONTENT_WINDOW[i], node, [])
    } catch (_) { }
  }
}

//
// --- canvas ---
//

/*
 * 加噪流程用到的画布方法在注入时缓存：页面若改写 getContext、putImageData、width 等，
 * 噪音就写不进画布，toDataURL 会直接返回真实图像。原生方法可跨 realm 调用（只校验对象类型）。
 */
type CanvasNatives = {
  getContext: Function
  width?: Function
  height?: Function
  getImageData: Function
  putImageData: Function
  ctxCanvas?: Function
}

const canvasNativesOf = (canvas: any, ctx2d: any): CanvasNatives | undefined => {
  const cp = canvas?.prototype
  const xp = ctx2d?.prototype
  if (!cp || !xp) return;
  return {
    getContext: cp.getContext,
    width: getterOf(cp, 'width'),
    height: getterOf(cp, 'height'),
    getImageData: xp.getImageData,
    putImageData: xp.putImageData,
    ctxCanvas: getterOf(xp, 'canvas'),
  }
}

const CANVAS_NATIVES = [
  canvasNativesOf(typeof HTMLCanvasElement === 'undefined' ? undefined : HTMLCanvasElement,
    typeof CanvasRenderingContext2D === 'undefined' ? undefined : CanvasRenderingContext2D),
  canvasNativesOf(typeof OffscreenCanvas === 'undefined' ? undefined : OffscreenCanvas,
    typeof OffscreenCanvasRenderingContext2D === 'undefined' ? undefined : OffscreenCanvasRenderingContext2D),
]

const imageDataProto = typeof ImageData === 'undefined' ? undefined : ImageData.prototype
const getImageDataData = getterOf(imageDataProto, 'data')!
const getImageDataWidth = getterOf(imageDataProto, 'width')!
const getImageDataHeight = getterOf(imageDataProto, 'height')!

/**
 * 按对象类型选取原生方法：用无副作用的 getter 判断类型，类型不符时原生 getter 抛出 TypeError
 */
const pickNatives = (self: any, key: 'width' | 'ctxCanvas'): CanvasNatives | undefined => {
  for (let i = 0; i < CANVAS_NATIVES.length; i++) {
    const n = CANVAS_NATIVES[i]
    const brand = n?.[key]
    if (!n || !brand) continue;
    try {
      apply(brand, self, [])
      return n
    } catch (_) { }
  }
}

/**
 * 读取画布尺寸并获取 2d 上下文（原生方法）
 */
export const getCanvas2d = (canvas: any): { width: number, height: number, ctx: any } | undefined => {
  const n = pickNatives(canvas, 'width')
  if (!n) return;
  const width = apply(n.width!, canvas, [])
  const height = apply(n.height!, canvas, [])
  if (!(width > 0 && height > 0)) return;
  const ctx = apply(n.getContext, canvas, ['2d'])
  return ctx ? { width, height, ctx } : undefined
}

/**
 * 在2d画布绘制噪音
 * @param args getImageData 的参数（原样传给原生方法，参数校验与报错与原生一致）
 */
export const drawNoiseTo2d = (
  _: FingerprintContext,
  noise: number[],
  target: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  args: any[],
) => {
  /* 类型不符时交给原生方法抛出与原生一致的错误 */
  const n = pickNatives(target, 'ctxCanvas') ?? (CANVAS_NATIVES[0] ?? CANVAS_NATIVES[1])!
  const imageData = apply(n.getImageData, target, args)
  const sw: number = apply(getImageDataWidth, imageData, [])
  const sh: number = apply(getImageDataHeight, imageData, [])
  /* 空区域无像素可处理，直接返回原始结果（避免后续逻辑与越界访问） */
  if (sw <= 0 || sh <= 0) return imageData;
  if (isCloudflareCaller()) return imageData;

  let noiseIndex = 0;
  let isChanged = false

  const Arr = Uint8ClampedArray;
  const center = new Arr(4)
  const up = new Arr(4)
  const down = new Arr(4)
  const left = new Arr(4)
  const right = new Arr(4)

  const pixelData = apply(getImageDataData, imageData, [])

  outer: for (let row = 1; row < sh - 2; row += 2) {
    for (let col = 1; col < sw - 2; col += 2) {
      if (noise.length === noiseIndex) { break outer; }

      const index = (row * sw + col) * 4;
      pixelCopy(pixelData, center, index)

      pixelCopy(pixelData, up, ((row - 1) * sw + col) * 4)
      if (isPixelEqual(center, up)) continue;

      pixelCopy(pixelData, down, ((row + 1) * sw + col) * 4)
      if (isPixelEqual(center, down)) continue;

      pixelCopy(pixelData, left, (row * sw + (col - 1)) * 4)
      if (isPixelEqual(center, left)) continue;

      pixelCopy(pixelData, right, (row * sw + (col + 1)) * 4)
      if (isPixelEqual(center, right)) continue;

      pixelData[index + 3] = (noise[noiseIndex++] % 256)
      isChanged = true
    }
  }

  if (isChanged) {
    apply(n.putImageData, target, [imageData, args[0], args[1]])
  }

  return imageData
}

type Canvas2d = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

const TEXT_METRICS_KEYS: (keyof TextMetrics)[] = [
  'width',
  'actualBoundingBoxLeft',
  'actualBoundingBoxRight',
  'actualBoundingBoxAscent',
  'actualBoundingBoxDescent',
]

/**
 * 为 measureText 返回的 TextMetrics 添加噪音
 * @param pick 返回噪音标识（相同标识的噪音保持一致），为空则不处理
 * @param noise 根据噪音标识与属性名计算噪音
 */
export const hookTextMetrics = (
  { gthis, win, useProxy, useGetterProxy }: FingerprintContext,
  notifyKey: string,
  pick: (text: string, target: Canvas2d) => string | undefined,
  noise: (mark: string, key: string) => number,
) => {
  const proto = gthis.TextMetrics?.prototype
  if (!proto) return;

  const marks: WeakMap<TextMetrics, string> = new NativeWeakMap()

  const intfs = [win?.CanvasRenderingContext2D, gthis.OffscreenCanvasRenderingContext2D]
  for (let i = 0; i < intfs.length; i++) {
    const intf = intfs[i]
    if (!intf) continue;
    useProxy(intf.prototype, 'measureText', {
      apply(target, thisArg: Canvas2d, args: any) {
        if (isCloudflareCaller()) {
          return apply(target, thisArg, args)
        }
        if (args.length > 0) args[0] = toDOMString(args[0])
        const metrics: TextMetrics = apply(target, thisArg, args)
        const text = args[0]
        if (metrics && typeof text === 'string') {
          const mark = pick(text, thisArg)
          if (mark != null) {
            notify(notifyKey)
            weakMapSet(marks, metrics, mark)
          }
        }
        return metrics
      }
    })
  }

  useGetterProxy(proto, TEXT_METRICS_KEYS, (key, getter) => ({
    apply(target, thisArg: TextMetrics, args: any) {
      if (isCloudflareCaller()) {
        return apply(getter, thisArg, [])
      }
      const value = apply(getter, thisArg, [])
      const mark = weakMapGet(marks, thisArg)
      if (mark == null || typeof value !== 'number' || value === 0) return value;
      return value + noise(mark, key)
    }
  }))
}
