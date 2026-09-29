import { Button, Tooltip } from "antd"
import { GithubOutlined, PoweroffOutlined } from '@ant-design/icons'
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useShallow } from "zustand/shallow"
import Logo from "@/components/brand/logo"
import { compareVersions } from "@/utils/base"
import { sendToBackground } from "@/utils/message"
import { cn } from "@/utils/style"
import { useStorageStore } from "../stores/storage"

const REPO_URL = 'https://github.com/omegaee/my-fingerprint'

export const PopupHeader = () => {
  const [t] = useTranslation()
  const [latest, setLatest] = useState<string>()

  const manifest = useMemo(() => chrome.runtime.getManifest(), [])

  const { config, saveConfig } = useStorageStore(useShallow((s) => ({
    version: s.version,
    config: s.config,
    saveConfig: s.saveConfig,
  })))

  useEffect(() => {
    sendToBackground({ type: 'version.latest' }).then((v) => v && setLatest(v))
  }, [])

  const hasNewVersion = !!latest && compareVersions(manifest.version, latest) === -1
  const isEnabled = !!config?.enable

  const switchEnable = () => {
    if (!config) return;
    config.enable = !config.enable
    saveConfig()
  }

  return <header className="h-[40px] flex items-center gap-2">
    <Logo
      size={26}
      title="My Fingerprint"
      className={cn('shrink-0 duration-300', isEnabled ? 'text-[--ant-color-primary]' : 'text-[--ant-color-text-quaternary]')}
    />
    <h1 className="m-0 text-[17px] leading-none font-black tracking-tight whitespace-nowrap">My Fingerprint</h1>

    <Tooltip title={hasNewVersion ?
      t('header.new-version', { version: latest }) :
      t('header.current-version', { version: manifest.version })}>
      <a
        href={`${REPO_URL}/releases`}
        target="_blank"
        rel="noreferrer"
        className={cn(
          'px-1.5 rounded-full font-mono text-[11px] leading-[18px] no-underline duration-200 flex items-center gap-1',
          hasNewVersion ?
            'bg-warning-50 text-warning-700 hover:bg-warning-100' :
            'bg-[--ant-color-fill-tertiary] text-[--ant-color-text-secondary] hover:text-[--ant-color-text]',
        )}
      >
        {hasNewVersion && <span className="size-[6px] rounded-full bg-warning-500" />}
        v{manifest.version}
      </a>
    </Tooltip>

    <div className="ml-auto flex items-center gap-1">
      <Tooltip title={t('header.github')}>
        <Button
          type="text"
          icon={<GithubOutlined className="text-[16px]" />}
          href={REPO_URL}
          target="_blank"
          aria-label={t('header.github')}
        />
      </Tooltip>
      <Tooltip title={isEnabled ? t('power.on') : t('power.off')} placement="bottomRight">
        <Button
          shape="circle"
          type={isEnabled ? 'primary' : 'default'}
          icon={<PoweroffOutlined />}
          aria-label={isEnabled ? t('power.on') : t('power.off')}
          aria-pressed={isEnabled}
          disabled={!config}
          onClick={switchEnable}
        />
      </Tooltip>
    </div>
  </header>
}

export default PopupHeader
