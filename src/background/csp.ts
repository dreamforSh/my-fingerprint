import { isRestrictiveForWorkers, stripFragment } from "@/core/csp";
import { logManager } from "@/utils/log";

const logger = logManager.createLogger(__LOG_PREFIX_FILE_PATH__);

type CspRecord = {
  url: string
  restrictive: boolean
}

const SESSION_PREFIX = 'csp:'

/* 内存中的记录；Service Worker 被回收后从 storage.session 恢复 */
const records = new Map<number, CspRecord>()

/**
 * 记录顶层文档响应头中的 CSP（只读，不修改响应）
 */
export const watchCsp = () => {
  chrome.webRequest.onHeadersReceived.addListener((details) => {
    if (details.tabId < 0) return;
    let restrictive = false
    for (const header of details.responseHeaders ?? []) {
      const name = header.name.toLowerCase()
      if (name !== 'content-security-policy' && name !== 'content-security-policy-report-only') continue;
      if (isRestrictiveForWorkers(header.value)) restrictive = true
    }
    const record: CspRecord = { url: stripFragment(details.url), restrictive }
    records.set(details.tabId, record)
    chrome.storage.session.set({ [SESSION_PREFIX + details.tabId]: record }).catch(() => { })
  }, { urls: ['<all_urls>'], types: ['main_frame'] }, ['responseHeaders'])

  chrome.tabs.onRemoved.addListener((tabId) => {
    records.delete(tabId)
    chrome.storage.session.remove(SESSION_PREFIX + tabId).catch(() => { })
  })
}

/**
 * 查询标签页当前顶层文档的 CSP 是否限制 Worker
 * 记录的地址与文档地址不一致（如缓存恢复、记录缺失）时视为未知
 */
export const getCsp = async (tabId: number, documentUrl: string) => {
  let record = records.get(tabId)
  if (!record) {
    const key = SESSION_PREFIX + tabId
    record = (await chrome.storage.session.get(key).catch(() => ({})) as Record<string, CspRecord>)[key]
  }
  const known = !!record && record.url === stripFragment(documentUrl)
  logger.debug('getCsp', tabId, documentUrl, record)
  return { known, restrictive: known ? record!.restrictive : true }
}
