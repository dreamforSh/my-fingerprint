import { Tag } from "antd"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

const RootKeys = ['weak', 'strong', 'other']

const KeyColors: Record<string, string> = {
  strong: 'orange',
  weak: 'green',
  other: 'blue'
}

/**
 * 记录项对应的配置项
 */
const TitleAliases: Record<string, string> = {
  fonts: 'font',
  userAgent: 'clientHints',
  appVersion: 'clientHints',
  platform: 'clientHints',
  userAgentData: 'clientHints',
  colorDepth: 'depth',
  pixelDepth: 'depth',
  width: 'size',
  height: 'size',
  availWidth: 'size',
  availHeight: 'size',
}

type FpNoticeItemProps = {
  title: string
  count?: number
  isRoot?: boolean
}

export const FpNoticeItem = ({ title, count, isRoot }: FpNoticeItemProps) => {
  const [t, i18n] = useTranslation()

  const label = useMemo(() => {
    if (isRoot && RootKeys.includes(title)) {
      return t('label.fp-notice.' + title)
    }
    const key = 'item.title.' + (TitleAliases[title] ?? title)
    return i18n.exists(key) ? t(key) : undefined
  }, [isRoot, title, i18n.language])

  return isRoot ?
    <div className="py-[2px] flex justify-between items-center font-bold">
      <div>{label ?? title}</div>
      <Tag
        className="mr-0 text-[14px]"
        color={KeyColors[title]}>
        x {count}
      </Tag>
    </div>
    :
    <div className="min-w-0 flex justify-between items-center gap-2 font-bold">
      <div className="min-w-0 flex items-baseline gap-2">
        <span className="truncate">{label ?? title}</span>
        {label && <span className="shrink-0 font-mono font-normal text-[12px] text-[--ant-color-text-secondary]">{title}</span>}
      </div>
      <div className="shrink-0 mr-2">x {count}</div>
    </div>
}
