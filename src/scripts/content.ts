/* ----- */
/* 避免import导入，否则build时content会模块化拆分 */
/* ----- */

export {}

const sendToBackground: BackgroundMessage.Sender = (message) => {
  return chrome.runtime.sendMessage(message);
}

const debounce = function <T extends (...args: any) => any>(func: T, wait?: number): (...args: Parameters<T>) => void {
  wait = wait || 300;
  let timeout: number;
  return function (...args: any[]) {
    clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

/* ----- */
/* 脚本内容 */
/* ----- */

const fpNoticePool: Record<string, number> = {}
const iframeNoticePool: Record<string, number> = {}

/**
 * 更新badge
 */
const snedBadgeInfo = debounce(() => {
  const keys = Object.keys(fpNoticePool)
  const isHigh = keys.some(v => v.startsWith('strong.'))
  sendToBackground({
    type: 'badge.set',
    text: String(keys.length),
    level: isHigh ? 2 : 1,
  })
})

/**
 * 核心脚本的通知
 * 事件名每次浏览器会话随机生成（见 background/storage.ts），页面不知道事件名，无法监听或伪造
 * detail 格式：`fp|{json}` 或 `iframe|{json}`
 */
chrome.storage.local.get('channel').then(({ channel }) => {
  const id = (channel as StorageChannel | undefined)?.id
  if (!id) return;
  window.addEventListener(id, (ev) => {
    const detail = (ev as CustomEvent).detail
    if (typeof detail !== 'string') return;
    const i = detail.indexOf('|')
    if (i === -1) return;

    const kind = detail.slice(0, i)
    const pool = kind === 'fp' ? fpNoticePool : kind === 'iframe' ? iframeNoticePool : undefined
    if (!pool) return;

    let data: Record<string, unknown>
    try {
      data = JSON.parse(detail.slice(i + 1))
    } catch (_) {
      return
    }
    if (!data || typeof data !== 'object') return;
    for (const src of Object.keys(data)) {
      const n = data[src]
      if (typeof n === 'number') pool[src] = (pool[src] ?? 0) + n
    }
    if (kind === 'fp') snedBadgeInfo()
  })
}).catch(() => { })

/**
 * runtime消息处理
 */
chrome.runtime.onMessage.addListener(((msg, sender, sendResponse) => {
  switch (msg?.type) {
    case 'notice.get.iframe': {
      sendResponse<'notice.get.iframe'>(iframeNoticePool)
      return false;
    }
    case 'notice.get.fp': {
      sendResponse<'notice.get.fp'>(fpNoticePool)
      return false;
    }
  }
}) as TabMessage.Listener)