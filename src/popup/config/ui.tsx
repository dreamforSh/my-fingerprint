import { Select, Switch, type SelectProps } from "antd"
import { useTranslation } from "react-i18next"
import { useMemo, useState } from "react"
import { firstEnableMode, useHookMode } from "./context"
import { statusDotColors } from "./styles"
import { ConfigDesc, ConfigRow } from "./item"
import TipIcon from "@/components/data/tip-icon"
import { HookType } from '@/types/enum'

const useHookTypeOptions = (types: HookType[], name?: string) => {
  const [t, i18n] = useTranslation()

  const makeLable = (value: HookType) => {
    const key = 'type.' + HookType[value];
    const skey = `type.${name}.${HookType[value]}`
    if (!name) return t(key);
    return i18n.exists(skey) ? t(skey) : t(key)
  }

  const options = useMemo(() => {
    const presets = types.filter(v => v !== HookType.default && v !== HookType.value)
    return [
      presets.length && {
        label: <span>{t('g.preset')}</span>,
        title: 'preset',
        options: presets.map((value) => ({
          value,
          label: makeLable(value),
        })),
      },
      types.includes(HookType.value) && {
        label: <span>{t('g.custom')}</span>,
        title: 'custom',
        options: [{
          value: HookType.value,
          label: t('type.' + HookType[HookType.value]),
        }],
      }
    ].filter(v => !!v)
  }, [types, i18n.language])

  return options as SelectProps['options']
}

/**
 * 模式选择器（系统值由开关控制，不在此列出）
 * 可选模式不超过一个时不显示
 */
export const HookModeSelector = ({ types, defaultValue }: {
  types?: HookType[]
  defaultValue?: any
}) => {
  const { name, mode, setType, setValue } = useHookMode()
  const options = useHookTypeOptions(types ?? [], name)

  const count = types?.filter(v => v !== HookType.default).length ?? 0
  if (count <= 1) return null;

  return <Select<HookType>
    options={options}
    value={mode.type}
    onChange={(t) => {
      if (t === HookType.value) {
        setValue(defaultValue)
      } else {
        setType(t)
      }
    }}
  />
}

/**
 * 自定义模式组件
 */
export const HookModeCustom = ({ children }: {
  children?: React.ReactNode | ((ctx: ReturnType<typeof useHookMode>) => React.ReactNode)
}) => {
  const ctx = useHookMode()
  return ctx.mode.type === HookType.value && (typeof children === 'function' ? children(ctx) : children);
}

type HookModeSwitchProps = {
  types?: HookType[]
  defaultValue?: any
  /** 开启时使用的模式，默认为可选类型中第一个非系统值的类型 */
  enableMode?: () => HookMode | undefined | Promise<HookMode | undefined>
}

/**
 * 开关：关闭即系统值
 */
const HookModeSwitch = ({ types, defaultValue, enableMode, label }: HookModeSwitchProps & {
  label: string
}) => {
  const { isActive, enable, disable } = useHookMode()
  const [isPending, setIsPending] = useState(false)

  const onChange = async (checked: boolean) => {
    if (!checked) return disable();
    setIsPending(true)
    try {
      await enable(() => enableMode ? enableMode() : firstEnableMode(types, defaultValue))
    } finally {
      setIsPending(false)
    }
  }

  return <Switch
    size="small"
    checked={isActive}
    loading={isPending}
    onChange={onChange}
    aria-label={label}
  />
}

const HookModeHelp = ({ tags, isDescArray }: {
  tags?: string[]
  isDescArray?: boolean
}) => {
  const [t] = useTranslation()
  const { name } = useHookMode()
  return <TipIcon.Question content={
    <ConfigDesc
      tags={tags}
      desc={t('item.desc.' + name, isDescArray ? { joinArrays: '\n\n' } : undefined)}
    />
  } />
}

/**
 * 指纹配置项
 * @param color 开启时状态点的颜色
 * @param extra 始终显示的附加内容
 */
export const HookModeCard = ({ color = 'success', tags, isDescArray, extra, children, ...props }: HookModeSwitchProps & {
  color?: Exclude<keyof typeof statusDotColors, 'default'>
  tags?: string[] | undefined
  isDescArray?: boolean
  extra?: React.ReactNode
  children?: React.ReactNode
}) => {
  const [t] = useTranslation()
  const { name, isActive } = useHookMode()
  const title = t('item.title.' + name)

  const body = isActive ? children : null

  return <ConfigRow
    status={isActive ? color : 'default'}
    label={title}
    tags={tags}
    help={<HookModeHelp tags={tags} isDescArray={isDescArray} />}
    control={<HookModeSwitch {...props} label={title} />}
  >
    {(body || extra) ? <>{body}{extra}</> : null}
  </ConfigRow>
}

/**
 * 附属开关项（显示在所属配置项内部）
 */
export const HookModeSubItem = ({ tags, isDescArray, ...props }: HookModeSwitchProps & {
  tags?: string[] | undefined
  isDescArray?: boolean
}) => {
  const [t] = useTranslation()
  const { name } = useHookMode()
  const title = t('item.title.' + name)

  return <div className="min-h-[32px] px-2 py-1 flex items-center gap-2 rounded-md bg-[--ant-color-fill-quaternary]">
    <span className="min-w-0 truncate text-[13px]">{title}</span>
    <HookModeHelp tags={tags} isDescArray={isDescArray} />
    <div className="ml-auto shrink-0">
      <HookModeSwitch {...props} label={title} />
    </div>
  </div>
}
