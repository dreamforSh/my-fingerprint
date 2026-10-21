import { App, Button, Tooltip } from "antd";
import {
  ExportOutlined,
  ImportOutlined,
} from '@ant-design/icons';
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/shallow";
import { useStorageStore } from "../stores/storage";
import VariablePopconfirm from "@/components/feedback/var-popconfirm";
import { requestPermission } from "@/utils/browser";

export type MoreConfigViewProps = {
  className?: string
}

export const MoreConfigView = ({ className }: MoreConfigViewProps) => {
  const [t] = useTranslation()
  const { message } = App.useApp()

  const { storage, importStorage } = useStorageStore(useShallow((s) => ({
    storage: s.storage,
    importStorage: s.importStorage
  })))

  const clipboardExport = async () => {
    await requestPermission('clipboardWrite')

    /* 通信标识只在本次浏览器会话内有效，不导出 */
    const { channel: _, ...exported } = storage ?? {} as LocalStorage
    await navigator.clipboard.writeText(JSON.stringify(exported, null, 2))
      .then(() => message.success(t('tip.config.export-ok')))
      .catch((err) => message.error(`${t('tip.config.export-fail')}: ${err?.message}`))
  }
   
  const clipboardImport = async () => {
    await requestPermission('clipboardRead')

    await navigator.clipboard.readText()
      .then(async (text) => {
        const data = JSON.parse(text)
        if (typeof data !== 'object') {
          throw new Error('Not an object')
        }

        await importStorage(data);
        message.success(t('tip.config.import-ok'));
      })
      .catch((err) => {
        message.error(`${t('tip.config.import-fail')}: ${err?.message}`)
      })
  }

  return <section className={className}>
    <Tooltip title={t('label.json')}>
      <Button icon={<ExportOutlined />} onClick={clipboardExport}>{t('label.clipboard-export')}</Button>
    </Tooltip>
    <VariablePopconfirm
      tooltip={t('label.json')}
      title={t('tip.config.override-current')}
      onConfirm={clipboardImport}>
      <Button icon={<ImportOutlined />}>{t('label.clipboard-import')}</Button>
    </VariablePopconfirm>
  </section>
}

export default MoreConfigView