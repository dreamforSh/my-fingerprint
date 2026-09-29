import { Badge, Collapse, type CollapseProps } from "antd"
import { useTranslation } from "react-i18next"
import WeakFpConfigGroup, { WEAK_FP_ITEMS } from "./group/weak"
import StrongFpConfigGroup, { STRONG_FP_ITEMS } from "./group/strong"
import PrefsConfigGroup from "./group/prefs"
import ScriptConfigGroup from "./group/script"
import { useShallow } from "zustand/shallow"
import { useStorageStore } from "../stores/storage"
import { FontConfigGroup } from "./font-group"
import { HookType } from "@/types/enum"
import { cn } from "@/utils/style"

type FpItems = Pair<keyof HookFingerprint, HookFingerprintKey>[]

const countActive = (fp: HookFingerprint | undefined, items: FpItems) => {
  if (!fp) return 0;
  return items.filter(([group, key]) => {
    const mode: HookMode | undefined = (fp[group] as any)?.[key]
    return mode != null && mode.type !== HookType.default
  }).length
}

/**
 * 已开启数量
 */
const CountPill = ({ count, total }: { count: number, total?: number }) => {
  const [t] = useTranslation()
  const text = total == null ? (count ? t('g.enabled') : t('g.disabled')) : `${count}/${total}`
  return <span
    className={cn(
      "px-2 rounded-full text-[12px] leading-[20px] tabular-nums duration-200",
      count ?
        "bg-success-50 text-success-700" :
        "bg-[--ant-color-fill-tertiary] text-[--ant-color-text-secondary]",
    )}
    title={total == null ? undefined : t('label.config.active', { count, total })}
  >{text}</span>
}

export const FConfig = () => {
  const [t] = useTranslation()

  const { config } = useStorageStore(useShallow((state) => ({
    config: state.config,
    version: state.version,
  })))

  const isShowScriptBadge = !config?.action.fastInject;

  const items: CollapseProps['items'] = [
    {
      key: 'strong',
      label: t('label.config.strong'),
      extra: <CountPill count={countActive(config?.fp, STRONG_FP_ITEMS)} total={STRONG_FP_ITEMS.length} />,
      children: <StrongFpConfigGroup />,
    },
    {
      key: 'weak',
      label: t('label.config.weak'),
      extra: <CountPill count={countActive(config?.fp, WEAK_FP_ITEMS)} total={WEAK_FP_ITEMS.length} />,
      children: <WeakFpConfigGroup />,
    },
    {
      key: 'font',
      label: t('label.config.font'),
      extra: <CountPill count={config?.action.fonts.enable ? 1 : 0} />,
      children: <FontConfigGroup />,
    },
    {
      key: 'script',
      label: <Badge dot={isShowScriptBadge} offset={[4, 0]}>{t('label.config.script')}</Badge>,
      children: <ScriptConfigGroup />,
    },
    {
      key: 'prefs',
      label: t('label.config.prefs'),
      children: <PrefsConfigGroup />,
    },
  ].map((item) => ({
    ...item,
    className: cn(
      'mb-2 last:mb-0 !border-0 bg-[--ant-color-bg-container] !rounded-lg overflow-hidden',
      '[&>.ant-collapse-header]:!items-center [&>.ant-collapse-header]:!py-2.5 [&>.ant-collapse-header]:font-bold',
      '[&_.ant-collapse-content-box]:!px-3 [&_.ant-collapse-content-box]:!pt-0',
    ),
  }))

  return <Collapse
    size='small'
    className="h-full bg-[--ant-layout-body-bg] overflow-auto no-scrollbar"
    bordered={false}
    accordion
    expandIconPosition="end"
    items={items} />
}

export default FConfig
