import { useShallow } from "zustand/shallow"
import { useStorageStore } from "../stores/storage"
import { Button, Spin, Switch } from "antd"
import { LoadingOutlined } from '@ant-design/icons'
import { ConfigDesc, ConfigItemX } from "../config/item"
import { useTranslation } from "react-i18next"
import TipIcon from "@/components/data/tip-icon"
import { sendToBackground } from "@/utils/message"
import { useState } from "react"
import { useAsyncApi } from "@/utils/hooks"

export const IpModulePanel = ({ }: {}) => {
  const [t] = useTranslation()
  const [currentInfo, setCurrentInfo] = useState<LocalStorageConfig['input']['ipInfo']>()

  const { config, saveConfig, saveConfigAsync, reloadConfig } = useStorageStore(useShallow((s) => ({
    version: s.version,
    config: s.config,
    saveConfig: s.saveConfig,
    saveConfigAsync: s.saveConfigAsync,
    reloadConfig: s.reloadConfig,
  })))
  const action = config?.action.ipInfo;
  const input = currentInfo ?? config?.input.ipInfo;

  const {
    api: reIpInfo,
    isPending,
  } = useAsyncApi(async () => {
    const info = await sendToBackground({
      type: 'ip.refresh',
    })
    setCurrentInfo(info)
    setTimeout(() => {
      reloadConfig();
    }, 1000)
  }, [])

  const changeEnable = async (checked: boolean) => {
    if (!action) return;
    action.enable = checked;
    await saveConfigAsync();
    await reIpInfo();
  }

  return config && action ? <div key={String(!!config)}>
    <div className="p-1 flex items-center justify-between">
      <div>
        <span className="font-bold">{t('label.ip.title')}</span>
        <p className="text-default-500">{t('label.ip.desc')}</p>
      </div>
      <Switch
        className="[&_.ant-switch-inner>span]:font-bold"
        checked={action.enable}
        onChange={changeEnable}
      />
    </div>

    <hr className="my-2 text-default-200" />

    <div>
      <div className="ms-1 mb-2 font-bold">{t('label.ip.current')}</div>
      <div className="relative p-1 bg-[--ant-color-bg-container] rounded-lg">
        {isPending && <div className="absolute inset-0 flex justify-center items-center">
          <Spin indicator={<LoadingOutlined spin />} />
        </div>}
        <table className="border-separate border-spacing-x-4">
          <tbody className="[&_td:first-child]:text-end [&_td:last-child]:text-start">
            <tr>
              <td>{t('label.ip.field.ip')}</td>
              <td>{input?.ip ?? '--'}</td>
            </tr>
            <tr>
              <td>{t('label.ip.field.countryCode')}</td>
              <td>{input?.countryCode ?? '--'}</td>
            </tr>
            <tr>
              <td>{t('label.ip.field.timezone')}</td>
              <td>{input?.timezone ?? '--'}</td>
            </tr>
            <tr>
              <td>{t('label.ip.field.languages')}</td>
              <td>{input?.languages?.join(', ') ?? '--'}</td>
            </tr>
            <tr>
              <td>{t('label.ip.field.createdAt')}</td>
              <td>{input?.createdAt ? new Date(input.createdAt).toLocaleString() : '--'}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex justify-end">
        <Button onClick={reIpInfo}>{t('label.ip.refresh')}</Button>
      </div>
    </div>

    <hr className="my-2 text-default-200" />

    <div>
      <div className="ms-1 mb-2 font-bold">{t('e.config')}</div>

      <div className="px-3 bg-[--ant-color-bg-container] rounded-lg">
        <ConfigItemX
          label={t('item.title.ip-module.enable-languages')}
          endContent={<TipIcon.Question content={<ConfigDesc desc={t('item.desc.ip-module.enable-languages')} />} />}
        >
          <Switch
            className="[&_.ant-switch-inner>span]:font-bold"
            checked={action.enableLanguages}
            onChange={async (checked) => {
              if (action.enableLanguages !== checked) {
                action.enableLanguages = checked
                await saveConfigAsync();
                await reIpInfo();
              }
            }}
          />
        </ConfigItemX>

        <ConfigItemX
          label={t('item.title.ip-module.enable-timezone')}
          endContent={<TipIcon.Question content={<ConfigDesc desc={t('item.desc.ip-module.enable-timezone')} />} />}
        >
          <Switch
            className="[&_.ant-switch-inner>span]:font-bold"
            checked={action.enableTimezone}
            onChange={async (checked) => {
              if (action.enableTimezone !== checked) {
                action.enableTimezone = checked
                await saveConfigAsync();
                await reIpInfo();
              }
            }}
          />
        </ConfigItemX>
      </div>
    </div>

  </div> : <Spin indicator={<LoadingOutlined spin />} />
}