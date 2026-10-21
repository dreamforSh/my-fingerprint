import {
  apply, construct, getOwnPropertyDescriptor, hasOwn, nullObject, stringify, strIndexOf, strSlice,
} from './intrinsics'

/**
 * 核心脚本之间、核心脚本与内容脚本之间的通信
 *
 * 页面能监听 window 上的 message 事件，也能读取以 Symbol.for 注册的属性，
 * 所以通信标识都由后台生成的会话密钥派生，页面无法识别、读取或伪造：
 * - 同源窗口：顶层窗口上以密钥派生的 symbol 保存页面信息；
 *   通知以随机事件名的 CustomEvent 交给内容脚本，页面不知道事件名就收不到
 * - 跨源 iframe：postMessage 的键名由密钥派生，接收方在页面的监听器之前处理并截断事件；
 *   顶层只回复页面已知的信息（主机名、页面标识）与签名，页面种子由 iframe 根据密钥自行计算
 */

export type NoticeKind = 'fp' | 'iframe'

type ChannelState = {
  secret: string
  event: string
  msgKey: string
  winKey: symbol
}

let state: ChannelState

/* ---------- 原生方法（注入时缓存） ---------- */

const imul = Math.imul
const strCharCodeAt = String.prototype.charCodeAt
const NativeCustomEvent = typeof CustomEvent === 'undefined' ? undefined : CustomEvent
const eventTargetProto = typeof EventTarget === 'undefined' ? undefined : EventTarget.prototype
const nativeDispatchEvent = eventTargetProto?.dispatchEvent
const nativeAddEventListener = eventTargetProto?.addEventListener
const nativeStopImmediatePropagation = typeof Event === 'undefined' ? undefined : Event.prototype.stopImmediatePropagation
const messageEventProto = typeof MessageEvent === 'undefined' ? undefined : MessageEvent.prototype
const getMessageData = messageEventProto && getOwnPropertyDescriptor(messageEventProto, 'data')?.get
const getMessageSource = messageEventProto && getOwnPropertyDescriptor(messageEventProto, 'source')?.get
const getMessageOrigin = messageEventProto && getOwnPropertyDescriptor(messageEventProto, 'origin')?.get
const getCustomEventDetail = typeof CustomEvent === 'undefined' ? undefined : getOwnPropertyDescriptor(CustomEvent.prototype, 'detail')?.get

/**
 * 带种子的 53 位字符串哈希（cyrb53）
 */
const hash53 = (str: string, seed = 0) => {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = apply(strCharCodeAt, str, [i])
    h1 = imul(h1 ^ ch, 2654435761)
    h2 = imul(h2 ^ ch, 1597334677)
  }
  h1 = imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

/**
 * 初始化通信标识
 * @param channel 后台生成的会话密钥与事件名
 * @param fallback 缺少密钥时（旧配置）用于派生的值，需在同一会话的各框架中一致
 */
export const initChannel = (channel: StorageChannel | undefined, fallback: string) => {
  const secret = channel?.secret || fallback
  state = {
    secret,
    event: channel?.id || ('e' + hash53(secret, 1)),
    msgKey: 'm' + hash53(secret, 2),
    winKey: Symbol.for('k' + hash53(secret, 3)),
  }
}

/**
 * 顶层窗口上保存页面信息、子窗口上标记已注入所用的键
 */
export const channelWinKey = (): symbol | undefined => state?.winKey

/**
 * 签名，只有持有密钥的核心脚本能生成与校验
 */
export const sign = (msg: string) => '' + hash53(state.secret + '|' + msg + '|' + state.secret, 5)

/**
 * 根据页面标识派生页面种子，同一页面的各框架结果一致，页面拿到标识也算不出种子
 */
export const derivePageSeed = (loadId: string) => hash53(state.secret + '|seed|' + loadId, 7) || 1

/**
 * 按 `|` 拆分出前 n 段，最后一段包含剩余内容
 */
export const splitPayload = (payload: string, n: number): string[] => {
  const res: string[] = []
  let rest = payload
  for (let i = 0; i < n - 1; i++) {
    const j = strIndexOf(rest, '|')
    if (j === -1) break
    res[res.length] = strSlice(rest, 0, j)
    rest = strSlice(rest, j + 1)
  }
  res[res.length] = rest
  return res
}

/* ---------- 发送 ---------- */

/**
 * 交给顶层窗口的内容脚本（同源时直接派发事件）
 */
const dispatchToContent = (win: Window, detail: string) => {
  const init: CustomEventInit = nullObject()
  init.detail = detail
  const ev = construct(NativeCustomEvent!, [state.event, init])
  apply(nativeDispatchEvent!, win, [ev])
}

/**
 * 向窗口发送消息
 * 跨源窗口的 postMessage 由浏览器提供，目标页面无法改写
 */
export const postToWindow = (win: any, payload: string, targetOrigin = '*') => {
  const msg = nullObject()
  msg[state.msgKey] = payload
  apply(win.postMessage, win, [msg, targetOrigin])
}

/**
 * 发送通知给内容脚本（汇总在顶层窗口）
 */
export const emitNotice = (kind: NoticeKind, data: Record<string, number>) => {
  const json = stringify(data)
  const top = window.top ?? window
  try {
    dispatchToContent(top, kind + '|' + json)
  } catch (_) {
    /* 跨源：交给顶层的核心脚本转发 */
    postToWindow(top, 'notice|' + kind + '|' + json)
  }
}

/**
 * 顶层核心脚本转发跨源 iframe 的通知
 */
export const relayNotice = (kind: string, json: string) => {
  dispatchToContent(window, kind + '|' + json)
}

/* ---------- 接收 ---------- */

/**
 * 监听内容脚本发来的事件（事件名为通道事件名加后缀，页面不知道事件名）
 * detail 为字符串，可在内容脚本与页面的不同 world 之间传递
 */
export const onContentEvent = (suffix: string, listener: (detail: string) => void) => {
  if (!nativeAddEventListener || !getCustomEventDetail) return;
  apply(nativeAddEventListener, window, [state.event + suffix, (ev: Event) => {
    let detail: unknown
    try {
      detail = apply(getCustomEventDetail, ev, [])
    } catch (_) {
      return
    }
    if (typeof detail === 'string') listener(detail)
  }])
}

type Listener = (payload: string, source: MessageEventSource | null, origin: string) => void

/**
 * 监听本通道的消息
 * 注入时以捕获方式注册，先于页面的监听器执行，并阻止页面收到本通道的消息
 */
export const onChannelMessage = (win: Window, listener: Listener) => {
  apply(nativeAddEventListener!, win, ['message', (ev: MessageEvent) => {
    /* 页面构造的事件（可携带 Proxy 观察属性读取）不处理 */
    if (!ev.isTrusted) return
    const data = apply(getMessageData!, ev, [])
    if (!data || typeof data !== 'object' || !hasOwn(data, state.msgKey)) return
    const payload = data[state.msgKey]
    if (typeof payload !== 'string') return

    apply(nativeStopImmediatePropagation!, ev, [])
    listener(payload, apply(getMessageSource!, ev, []), apply(getMessageOrigin!, ev, []))
  }, true])
}
