import { useStorageStore } from "@/popup/stores/storage"
import { HookType } from '@/types/enum'
import { memo } from "react"
import { Spin } from "antd"
import { LoadingOutlined } from '@ant-design/icons'
import { useShallow } from "zustand/shallow"
import { HookModeProvider } from "../context"
import { HookModeCard, HookModeSelector, HookModeSubItem } from "../ui"

const baseTypes = [HookType.default, HookType.page, HookType.browser, HookType.domain, HookType.global]
const switchTypes = [HookType.default, HookType.enabled, HookType.disabled]
const disabledTypes = [HookType.default, HookType.disabled]
const enabledTypes = [HookType.default, HookType.enabled]

const unstableTag = ['unstable']

/**
 * 强指纹配置项（用于统计开启数量）
 */
export const STRONG_FP_ITEMS: Pair<keyof HookFingerprint, HookFingerprintKey>[] = [
  ['other', 'canvas'],
  ['other', 'canvasCjk'],
  ['other', 'webgl'],
  ['other', 'audio'],
  ['other', 'webrtc'],
  ['other', 'webgpu'],
  ['other', 'font'],
  ['other', 'domRect'],
  ['other', 'emoji'],
  ['other', 'speech'],
  ['other', 'serviceWorker'],
]

export const StrongFpConfigGroup = memo(() => {
  const { config } = useStorageStore(useShallow((s) => ({
    config: s.config,
    version: s.version,
  })))
  const fp = config?.fp

  return fp ? <div key={String(!!config)}>

    <HookModeProvider obj={fp.other} name='canvas'>
      <HookModeCard types={baseTypes} extra={
        <HookModeProvider obj={fp.other} name='canvasCjk'>
          <HookModeSubItem types={enabledTypes} isDescArray />
        </HookModeProvider>
      }>
        <HookModeSelector types={baseTypes} />
      </HookModeCard>
    </HookModeProvider>

    <HookModeProvider obj={fp.other} name='webgl'>
      <HookModeCard types={baseTypes}>
        <HookModeSelector types={baseTypes} />
      </HookModeCard>
    </HookModeProvider>

    <HookModeProvider obj={fp.other} name='audio'>
      <HookModeCard types={baseTypes}>
        <HookModeSelector types={baseTypes} />
      </HookModeCard>
    </HookModeProvider>

    <HookModeProvider obj={fp.other} name='webrtc'>
      <HookModeCard color='warning' isDescArray tags={unstableTag} types={switchTypes}>
        <HookModeSelector types={switchTypes} />
      </HookModeCard>
    </HookModeProvider>

    <HookModeProvider obj={fp.other} name='webgpu'>
      <HookModeCard types={baseTypes}>
        <HookModeSelector types={baseTypes} />
      </HookModeCard>
    </HookModeProvider>

    <HookModeProvider obj={fp.other} name='font'>
      <HookModeCard types={baseTypes}>
        <HookModeSelector types={baseTypes} />
      </HookModeCard>
    </HookModeProvider>

    <HookModeProvider obj={fp.other} name='domRect'>
      <HookModeCard types={baseTypes}>
        <HookModeSelector types={baseTypes} />
      </HookModeCard>
    </HookModeProvider>

    <HookModeProvider obj={fp.other} name='emoji'>
      <HookModeCard isDescArray types={baseTypes}>
        <HookModeSelector types={baseTypes} />
      </HookModeCard>
    </HookModeProvider>

    <HookModeProvider obj={fp.other} name='speech'>
      <HookModeCard isDescArray types={switchTypes}>
        <HookModeSelector types={switchTypes} />
      </HookModeCard>
    </HookModeProvider>

    <HookModeProvider obj={fp.other} name='serviceWorker'>
      <HookModeCard color='warning' isDescArray tags={unstableTag} types={disabledTypes} />
    </HookModeProvider>

  </div> : <Spin indicator={<LoadingOutlined spin />} />
})

export default StrongFpConfigGroup
