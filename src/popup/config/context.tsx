import { createHookContext } from "@/utils/context";
import { useState } from "react";
import { useStorageStore } from "../stores/storage";
import { useShallow } from "zustand/shallow";
import { HookType } from "@/types/enum";

type EnableModeFactory = () => HookMode | undefined | Promise<HookMode | undefined>

/**
 * 本次弹窗内各项关闭前的模式，重新开启时恢复
 */
const lastModes = new Map<string, HookMode>()

/**
 * 开启时的默认模式：可选类型中第一个非系统值的类型
 */
export const firstEnableMode = (types?: HookType[], defaultValue?: any): HookMode | undefined => {
  const type = types?.find((v) => v !== HookType.default)
  if (type == null) return;
  return type === HookType.value ? { type, value: defaultValue } : { type } as HookMode
}

export const {
  Provider: HookModeProvider,
  useCtx: useHookMode,
} = createHookContext(({ obj, name }: {
  obj: object
  name: HookFingerprintKey
}) => {
  const [version, setVersion] = useState(0);
  const { saveConfig } = useStorageStore(useShallow((s) => ({ saveConfig: s.saveConfig })))

  const update = () => {
    saveConfig();
    setVersion(v => v + 1);
  }

  const mode: HookMode = (obj as any)[name] ?? { type: HookType.default }

  const setMode = (v: HookMode) => {
    (obj as any)[name] = v;
    update();
  }

  const setType = (v: HookType) => {
    (obj as any)[name] = { type: v, value: undefined };
    update();
  }

  return {
    version,
    name,
    mode,
    value: (mode as any).value,
    isActive: mode.type !== HookType.default,
    update,
    setMode,
    setType,
    setValue: (v: any) => {
      (obj as any)[name] = { type: HookType.value, value: v };
      update();
    },
    /**
     * 开启：优先恢复关闭前的模式
     */
    enable: async (factory: EnableModeFactory) => {
      const next = lastModes.get(name) ?? await factory()
      if (next) setMode(next)
    },
    /**
     * 关闭：恢复为系统值
     */
    disable: () => {
      if (mode.type !== HookType.default) {
        lastModes.set(name, mode)
      }
      setType(HookType.default)
    },
  }
})
