import { getLocalStorage } from "./storage"
import { HookType } from '@/types/enum'
import { isDefaultMode } from "@/utils/storage"
import { logManager } from '@/utils/log';
import { getBrowserInfo } from "@/utils/browser";
import { CF_CHALLENGE_HOSTS } from "@/core/cloudflare";

const logger = logManager.createLogger(__LOG_PREFIX_FILE_PATH__);

type RuleHeader = chrome.declarativeNetRequest.ModifyHeaderInfo

const UA_NET_RULE_ID = 1
const CF_REQUEST_RULE_ID = 2
const CF_INITIATOR_RULE_ID = 3
const RULE_IDS = [UA_NET_RULE_ID, CF_REQUEST_RULE_ID, CF_INITIATOR_RULE_ID]

const MEMORY = {
  browser: getBrowserInfo(),
}

const isHookNetRequest = (storage: LocalStorage) => {
  const fp = storage.config.fp
  return !isDefaultMode([
    fp.navigator.clientHints,
    fp.navigator.languages,
  ])
}

const genUaRules = ({ config }: LocalStorage): readonly RuleHeader[] => {
  const uaMode = config.fp.navigator.clientHints
  if (uaMode.type !== HookType.value) return [];

  const { ua, uaData } = uaMode.value;
  if (ua == null && uaData == null) return [];

  const fullVersionList = uaData.versions;
  const brands = fullVersionList?.map(v => ({
    ...v,
    version: v.version?.split('.')[0] ?? ''
  }))

  const makeRule = (header: string, value: string) => {
    return value == null ? undefined : {
      header,
      operation: "set",
      value,
    }
  }

  const res = [
    makeRule("User-Agent", ua.userAgent),
    makeRule("Sec-Ch-Ua-Arch", `"${uaData.arch}"`),
    makeRule("Sec-Ch-Ua-Bitness", `"${uaData.bitness}"`),
    makeRule("Sec-Ch-Ua-Platform", `"${uaData.platform}"`),
    makeRule("Sec-Ch-Ua-Platform-Version", `"${uaData.platformVersion}"`),
    makeRule("Sec-Ch-Ua-Mobile", uaData.mobile ? "?1" : "?0"),
    makeRule("Sec-Ch-Ua-Model", `"${uaData.model}"`),
    makeRule("Sec-Ch-Ua-Form-Factors", uaData.formFactors.map(v => `"${v}"`).join(", ")),
    makeRule("Sec-Ch-Ua-Full-Version", `"${uaData.uaFullVersion}"`),
    makeRule("Sec-Ch-Ua", brands.map((brand) => `"${brand.brand}";v="${brand.version}"`).join(", ")),
    makeRule("Sec-Ch-Ua-Full-Version-List", fullVersionList.map((brand) => `"${brand.brand}";v="${brand.version}"`).join(", ")),
  ].filter(Boolean) as RuleHeader[]

  logger.debug('genUaRules:', res)

  return res;
}

const genLanguageRules = ({ config }: LocalStorage): readonly RuleHeader[] => {
  const langsMode = config.fp.navigator.languages

  if (langsMode.type !== HookType.value) return [];

  const res: RuleHeader[] = []
  const langs = langsMode.value;

  if (langs?.length) {
    const [first, ...rest] = langs
    let qFactor = 1
    for (let i = 0; i < rest.length && qFactor > 0.1; i++) {
      qFactor -= 0.1
      rest[i] = `${rest[i]};q=${qFactor.toFixed(1)}`
    }
    res.push({
      header: "Accept-Language",
      operation: "set" as any,
      value: [first, ...rest].join(","),
    })
  }

  logger.debug('genLanguageRules:', res)

  return res;
}

/**
 * Cloudflare 验证兼容：验证组件内不改写请求头
 * 组件内不注入脚本，若请求头仍被改写，User-Agent / Client Hints / Accept-Language
 * 会与组件内的 navigator 不一致，验证直接失败（如 Turnstile 300010）
 * allow 规则优先级高于改写规则，使改写规则对这些请求失效
 */
const genCloudflareRules = (
  { config }: LocalStorage,
  resourceTypes: chrome.declarativeNetRequest.ResourceType[],
): chrome.declarativeNetRequest.Rule[] => {
  if (config.action.cloudflare?.enable === false) return [];
  const action = { type: "allow" as any }
  return [
    /* 发往验证组件的请求（iframe 文档、组件接口） */
    {
      id: CF_REQUEST_RULE_ID,
      priority: 2,
      action,
      condition: { resourceTypes, requestDomains: [...CF_CHALLENGE_HOSTS] },
    },
    /* 验证组件发起的请求 */
    {
      id: CF_INITIATOR_RULE_ID,
      priority: 2,
      action,
      condition: { resourceTypes, initiatorDomains: [...CF_CHALLENGE_HOSTS] },
    },
  ]
}

/**
 * 删除请求头规则
 */
const removeRules = async () => {
  return await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: RULE_IDS,
  }).catch(() => { })
}

/**
 * 刷新请求头
 */
export const reRequestHeader = async (excludeTabId?: number, includeTabId?: number) => {
  const { storage } = await getLocalStorage()

  if (!storage.config.enable || !isHookNetRequest(storage)) {
    return await removeRules()
  }

  /* 构建 Rules */
  const uaRules = MEMORY.browser.name === 'firefox' ? [] : genUaRules(storage);
  const langRules = genLanguageRules(storage);
  const rules = [
    ...uaRules,
    ...langRules,
  ]

  if (!rules || rules.length === 0) {
    return await removeRules()
  }

  const srs = await chrome.declarativeNetRequest.getSessionRules()
  const prev = srs.find(r => r.id === UA_NET_RULE_ID)

  /* 构建 Condition */
  let condition: chrome.declarativeNetRequest.RuleCondition;
  const resourceTypes = Object.values(chrome.declarativeNetRequest.ResourceType)

  if (storage.policies.isBlacklistMode) {
    /* 黑名单模式 */
    const set = new Set(prev?.condition?.tabIds);
    if (includeTabId != null) {
      set.add(includeTabId);
    }
    condition = {
      resourceTypes,
      initiatorDomains: storage.policies.blacklist.length > 0 ? [...storage.policies.blacklist] : undefined,
      tabIds: set.size > 0 ? [...set] : undefined,
    }
    // 黑名单模式下，如果没有任何条件，则删除规则
    if (!condition.initiatorDomains && !condition.tabIds) {
      return await removeRules()
    }
  } else {
    /* 白名单模式 */
    const set = new Set(prev?.condition?.excludedTabIds);
    if (excludeTabId != null) {
      set.add(excludeTabId);
    }
    condition = {
      resourceTypes,
      excludedInitiatorDomains: storage.policies.whitelist.length > 0 ? [...storage.policies.whitelist] : undefined,
      excludedTabIds: set.size > 0 ? [...set] : undefined,
    }
  }

  logger.debug('reRequestHeader', 'rules:', rules, '\ncondition:', condition)

  /* 更新 SessionRules */
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: RULE_IDS,
    addRules: [{
      id: UA_NET_RULE_ID,
      condition,
      action: {
        type: "modifyHeaders" as any,
        requestHeaders: rules,
      },
    }, ...genCloudflareRules(storage, resourceTypes)]
  }).catch((e) => {
    logger.error('reRequestHeader updateSessionRules error:', e);
  })
}
