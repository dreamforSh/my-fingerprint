import { Popconfirm, Switch, Tooltip } from "antd"
import { GlobalOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useShallow } from "zustand/shallow"
import { selectParentDomains, tryUrl } from "@/utils/base"
import { cn } from "@/utils/style"
import { useStorageStore } from "../stores/storage"

type Tone = 'success' | 'warning' | 'default'

const toneStyles: Record<Tone, { icon: string, text: string }> = {
  success: {
    icon: 'bg-success-50 text-success-600',
    text: 'text-success-700',
  },
  warning: {
    icon: 'bg-warning-50 text-warning-600',
    text: 'text-warning-700',
  },
  default: {
    icon: 'bg-[--ant-color-fill-tertiary] text-[--ant-color-text-tertiary]',
    text: 'text-[--ant-color-text-secondary]',
  },
}

/**
 * 当前网站的防护状态与开关
 */
export const SiteCard = ({ tab }: { tab?: chrome.tabs.Tab }) => {
  const [t] = useTranslation()

  const { config, policies, savePolicies } = useStorageStore(useShallow((s) => ({
    version: s.version,
    config: s.config,
    policies: s.policies,
    savePolicies: s.savePolicies,
  })))

  const url = useMemo(() => tab?.url ? tryUrl(tab.url) : undefined, [tab?.url])
  const hostname = url && (url.protocol === 'http:' || url.protocol === 'https:') ? url.hostname : undefined
  const displayName = hostname ?? (url ? (url.host ? `${url.protocol}//${url.host}` : url.href) : '--')

  const isBlacklistMode = !!policies?.isBlacklistMode
  const siteList = policies ? (isBlacklistMode ? policies.blacklist : policies.whitelist) : []

  /* 匹配到的自身或父域名 */
  const matched = hostname ? selectParentDomains(siteList, hostname) : []
  const domainMode = matched.length === 0 ? 'none' : siteList.includes(hostname!) ? 'self' : 'sub'
  const isListed = domainMode !== 'none'
  const isProtected = isBlacklistMode ? isListed : !isListed

  const [tone, status]: [Tone, string] = (() => {
    const domain = matched[0]
    if (!hostname) return ['default', t('site.status.unsupported')];
    if (!config?.enable) return ['default', t('site.status.paused')];
    if (isProtected) {
      return ['success', domainMode === 'sub' ? t('site.status.protected-parent', { domain }) : t('site.status.protected')]
    }
    if (isBlacklistMode) return ['warning', t('site.status.not-listed')];
    return ['warning', domainMode === 'sub' ? t('site.status.excluded-parent', { domain }) : t('site.status.excluded')]
  })()

  const actionTip = isBlacklistMode ?
    (isListed ? t('site.action.uninject') : t('site.action.inject')) :
    (isListed ? t('site.action.include') : t('site.action.exclude'))

  const switchSiteList = () => {
    if (!policies || !hostname) return;

    if (domainMode === 'none') {
      /* 添加名单 */
      siteList.push(hostname)
    } else if (domainMode === 'self') {
      /* 移除自身 */
      const idx = siteList.indexOf(hostname);
      if (idx !== -1) siteList.splice(idx, 1);
    } else {
      /* 移除父域名 */
      for (const domain of matched) {
        const idx = siteList.indexOf(domain);
        if (idx !== -1) siteList.splice(idx, 1);
      }
    }

    savePolicies()
  }

  return <section className="px-3 py-[8px] flex items-center gap-3 rounded-lg bg-[--ant-color-bg-container]">
    <span className={cn('size-[36px] shrink-0 rounded-lg flex-center text-[18px] duration-300', toneStyles[tone].icon)}>
      {tone === 'success' ? <SafetyCertificateOutlined /> : <GlobalOutlined />}
    </span>

    <div className="min-w-0 grow">
      <div className="font-mono font-bold text-[14px] leading-[20px] truncate" title={displayName}>{displayName}</div>
      <div className={cn('text-[12px] leading-[18px] truncate duration-300', toneStyles[tone].text)} role="status">{status}</div>
    </div>

    {hostname && policies && (domainMode === 'sub' ?
      /* 父域名在名单中：需确认后移除父域名 */
      <Popconfirm
        title={t('tip.domain.remove-parent')}
        description={matched.join(', ')}
        placement='bottomRight'
        onConfirm={switchSiteList}
        okText={t('g.confirm')}
        cancelText={t('g.cancel')}
        okType='danger'>
        <Switch className="shrink-0" checked={isProtected} aria-label={t('site.protect')} />
      </Popconfirm> :
      <Tooltip title={actionTip} placement='bottomRight'>
        <Switch className="shrink-0" checked={isProtected} aria-label={t('site.protect')} onChange={switchSiteList} />
      </Tooltip>
    )}
  </section>
}

export default SiteCard
