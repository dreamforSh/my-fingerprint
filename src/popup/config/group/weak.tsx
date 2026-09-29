import { memo, useEffect, useState } from "react"
import { useStorageStore } from "@/popup/stores/storage"
import { HookType } from '@/types/enum'
import { Input, InputNumber, Select, Spin } from "antd"
import { LoadingOutlined } from '@ant-design/icons'
import TimeZoneConfigItem, { getCurrentTimeZone } from "../special/timezone"
import { getBrowserInfo } from "@/utils/browser"
import { useShallow } from "zustand/shallow"
import ClientHintsConfigItem, { getCurrentClientHints } from "../special/client-hints"
import GPUInfoConfigItem, { getCurrentGpuInfo } from "../special/gpu-info"
import { HookModeProvider } from "../context"
import { HookModeCard, HookModeCustom, HookModeSelector } from "../ui"

const baseTypes = [HookType.default, HookType.page, HookType.browser, HookType.domain, HookType.global]
const baseValueTypes = [...baseTypes, HookType.value]
const valueTypes = [HookType.default, HookType.value]
const switchTypes = [HookType.default, HookType.enabled, HookType.disabled]

const deprecatedTag = ['deprecated']
const unstableTag = ['unstable']

const isFirefox = getBrowserInfo(navigator.userAgent).name === 'firefox'
const hasDeviceMemory = 'deviceMemory' in navigator
const hasBattery = 'getBattery' in navigator

const MEMORY_OPTIONS = [0.25, 0.5, 1, 2, 4, 8, 16, 32].map((value) => ({
  value,
  label: `${value} GB`,
}))

/**
 * 弱指纹配置项（用于统计开启数量）
 */
export const WEAK_FP_ITEMS: Pair<keyof HookFingerprint, HookFingerprintKey>[] = [
  ['other', 'timezone'],
  ['navigator', 'languages'],
  ...(isFirefox ? [] : [['navigator', 'clientHints']] as Pair<keyof HookFingerprint, HookFingerprintKey>[]),
  ['normal', 'gpuInfo'],
  ['screen', 'size'],
  ['screen', 'depth'],
  ['navigator', 'hardwareConcurrency'],
  ...(hasDeviceMemory ? [['navigator', 'deviceMemory']] as Pair<keyof HookFingerprint, HookFingerprintKey>[] : []),
  ...(hasBattery ? [['other', 'battery']] as Pair<keyof HookFingerprint, HookFingerprintKey>[] : []),
]

const parseList = (text: string) => text.split(',').map(v => v.trim()).filter(Boolean)

/**
 * 逗号分隔的列表输入框，输入过程中保留原始文本
 */
const ListInput = ({ value, fallback, onChange }: {
  value?: string[]
  fallback: string[]
  onChange: (list: string[]) => void
}) => {
  const [text, setText] = useState(() => (value ?? fallback).join(', '))

  useEffect(() => {
    if (value && parseList(text).join(',') !== value.join(',')) {
      setText(value.join(', '))
    }
  }, [value])

  return <Input
    placeholder={fallback.join(', ')}
    value={text}
    onChange={({ target }) => {
      setText(target.value)
      const list = parseList(target.value)
      onChange(list.length ? list : fallback)
    }}
  />
}

export const WeakFpConfigGroup = memo(() => {
  const { config } = useStorageStore(useShallow((s) => ({
    config: s.config,
    version: s.version,
  })))
  const fp = config?.fp

  const defaultLanguages = [...navigator.languages]

  return fp ? <div key={String(!!config)}>
    {/* timezone */}
    <HookModeProvider obj={fp.other} name='timezone'>
      <HookModeCard isDescArray enableMode={() => ({ type: HookType.value, value: getCurrentTimeZone() })}>
        <TimeZoneConfigItem />
      </HookModeCard>
    </HookModeProvider>

    {/* languages */}
    <HookModeProvider obj={fp.navigator} name='languages'>
      <HookModeCard isDescArray types={valueTypes} defaultValue={defaultLanguages}>
        <HookModeCustom>{({ value, setValue }) => (
          <ListInput value={value} fallback={defaultLanguages} onChange={setValue} />
        )}</HookModeCustom>
      </HookModeCard>
    </HookModeProvider>

    {/* clientHints */}
    {!isFirefox && (
      <HookModeProvider obj={fp.navigator} name='clientHints'>
        <HookModeCard color='warning' isDescArray tags={unstableTag} enableMode={async () => {
          const value = await getCurrentClientHints()
          return value && { type: HookType.value, value }
        }}>
          <ClientHintsConfigItem />
        </HookModeCard>
      </HookModeProvider>
    )}

    {/* gpuInfo */}
    <HookModeProvider obj={fp.normal} name='gpuInfo'>
      <HookModeCard color='warning' isDescArray tags={unstableTag} enableMode={() => ({ type: HookType.value, value: getCurrentGpuInfo() })}>
        <GPUInfoConfigItem />
      </HookModeCard>
    </HookModeProvider>

    {/* screen size */}
    <HookModeProvider obj={fp.screen} name='size'>
      <HookModeCard color='warning' tags={unstableTag} types={baseValueTypes}>
        <HookModeSelector types={baseValueTypes} defaultValue={{
          width: screen.width,
          height: screen.height,
        }} />
        <HookModeCustom>{({ value, setValue }) => <div className="grid grid-cols-2 gap-2">
          <InputNumber
            addonBefore='width'
            min={1}
            precision={0}
            value={value?.width ?? screen.width}
            onChange={(v) => setValue({ ...value, width: v ?? undefined })}
          />
          <InputNumber
            addonBefore='height'
            min={1}
            precision={0}
            value={value?.height ?? screen.height}
            onChange={(v) => setValue({ ...value, height: v ?? undefined })}
          />
        </div>}</HookModeCustom>
      </HookModeCard>
    </HookModeProvider>

    {/* screen colorDepth */}
    <HookModeProvider obj={fp.screen} name='depth'>
      <HookModeCard color='error' tags={deprecatedTag} types={valueTypes} defaultValue={{
        colorDepth: screen.colorDepth,
        pixelDepth: screen.pixelDepth,
      }}>
        <HookModeCustom>{({ value, setValue }) => <div className="grid grid-cols-2 gap-2">
          <InputNumber
            addonBefore='color'
            min={1}
            precision={0}
            value={value?.colorDepth ?? screen.colorDepth}
            onChange={(v) => setValue({ ...value, colorDepth: v ?? undefined })}
          />
          <InputNumber
            addonBefore='pixel'
            min={1}
            precision={0}
            value={value?.pixelDepth ?? screen.pixelDepth}
            onChange={(v) => setValue({ ...value, pixelDepth: v ?? undefined })}
          />
        </div>}</HookModeCustom>
      </HookModeCard>
    </HookModeProvider>

    {/* navigator hardwareConcurrency */}
    <HookModeProvider obj={fp.navigator} name='hardwareConcurrency'>
      <HookModeCard color='error' tags={deprecatedTag} types={valueTypes} defaultValue={navigator.hardwareConcurrency}>
        <HookModeCustom>{({ value, setValue }) => (
          <InputNumber
            className="w-full"
            min={1}
            precision={0}
            placeholder={String(navigator.hardwareConcurrency)}
            value={value ?? navigator.hardwareConcurrency}
            onChange={(v) => setValue(v ?? navigator.hardwareConcurrency)}
          />
        )}</HookModeCustom>
      </HookModeCard>
    </HookModeProvider>

    {/* navigator deviceMemory */}
    {hasDeviceMemory && (
      <HookModeProvider obj={fp.navigator} name='deviceMemory'>
        <HookModeCard types={valueTypes} defaultValue={8}>
          <HookModeCustom>{({ value, setValue }) => (
            <Select options={MEMORY_OPTIONS} value={value ?? 8} onChange={setValue} />
          )}</HookModeCustom>
        </HookModeCard>
      </HookModeProvider>
    )}

    {/* battery */}
    {hasBattery && (
      <HookModeProvider obj={fp.other} name='battery'>
        <HookModeCard isDescArray types={switchTypes}>
          <HookModeSelector types={switchTypes} />
        </HookModeCard>
      </HookModeProvider>
    )}

  </div> : <Spin indicator={<LoadingOutlined spin />} />
})

export default WeakFpConfigGroup
