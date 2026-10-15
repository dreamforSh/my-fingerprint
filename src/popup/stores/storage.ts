import i18n from "@/locales"
import { sendToBackground } from "@/utils/message"
import { debounce } from "@/utils/timer"
import { create } from "zustand"

type State = {
  version: number
  storage?: LocalStorage
  config?: LocalStorageConfig
  policies?: LocalStoragePolicies
  profiles?: CustomProfile[]
  activeProfileId?: string
}

type Actions = {
  loadStorage: () => void
  importStorage: (data: DeepPartial<LocalStorage>) => Promise<void>
  saveConfig: () => void
  savePolicies: () => void
  saveConfigAsync: () => Promise<void>
  reloadConfig: () => Promise<void>
  saveCurrentAsProfile: (name: string, id?: string) => Promise<string>
  applyProfile: (id: string) => Promise<void>
  deleteProfile: (id: string) => Promise<void>
  renameProfile: (id: string, name: string) => Promise<void>
}

export const useStorageStore = create<State & Actions>(((set, get) => {

  const loadStorage = async () => {
    const s = await chrome.storage.local.get() as LocalStorage
    set({
      storage: s,
      config: s.config,
      policies: s.policies,
      profiles: s.profiles ?? [],
    })
  }

  const importStorage = async (data: DeepPartial<LocalStorage>) => {
    const res = await sendToBackground({
      type: 'storage.import',
      storage: data,
    })

    if (res.ok && res.storage) {
      set({
        storage: res.storage,
        config: res.storage.config,
        policies: res.storage.policies,
        profiles: res.storage.profiles ?? [],
      })
    } else {
      throw new Error(
        (res.messageKey ? i18n.t(res.messageKey) : res.message) ?? 'Import failed'
      )
    }
  }

  const _saveConfig = debounce(async () => {
    const v = get().config;
    if (v) {
      sendToBackground({
        type: 'config.set',
        config: v,
      })
    }
  }, 200)

  const _savePolicies = debounce(async () => {
    const v = get().policies;
    if (v) {
      sendToBackground({
        type: 'policies.set',
        policies: v,
      })
    }
  }, 200)

  const saveConfig = () => {
    _saveConfig()
    set(({ version }) => ({
      version: version + 1,
    }))
  }

  const savePolicies = () => {
    _savePolicies()
    set(({ version }) => ({
      version: version + 1,
    }))
  }

  const saveConfigAsync = async () => {
    const v = get().config;
    if (v) {
      await sendToBackground({
        type: 'config.set',
        config: v,
      })
    }
    set(({ version }) => ({
      version: version + 1,
    }))
  }

  const reloadConfig = async () => {
    const { storage } = get()
    const next = await sendToBackground({
      type: 'config.get',
    })
    if (next && storage) {
      storage.config = next;
      set(({ version }) => ({
        config: next,
        version: version + 1,
      }))
    }
  }

  const saveCurrentAsProfile = async (name: string, id?: string): Promise<string> => {
    const { config, profiles = [] } = get()
    if (!config) throw new Error('Config is empty')

    const clonedConfig: LocalStorageConfig = JSON.parse(JSON.stringify(config))
    const now = Date.now()
    let targetId = id
    let newProfiles: CustomProfile[] = profiles

    if (id) {
      const idx = profiles.findIndex(p => p.id === id)
      if (idx !== -1) {
        newProfiles = [...profiles]
        newProfiles[idx] = {
          ...newProfiles[idx],
          name: name.trim() || newProfiles[idx].name,
          updatedAt: now,
          config: clonedConfig,
        }
      } else {
        targetId = undefined
      }
    }

    if (!targetId) {
      targetId = 'profile_' + now + '_' + Math.random().toString(36).slice(2, 7)
      const newProfile: CustomProfile = {
        id: targetId,
        name: name.trim() || `${i18n.t('g.preset')} ${profiles.length + 1}`,
        createdAt: now,
        config: clonedConfig,
      }
      newProfiles = [newProfile, ...profiles]
    }

    set({ profiles: newProfiles, activeProfileId: targetId })
    await sendToBackground({
      type: 'profiles.set',
      profiles: newProfiles,
    })
    return targetId
  }

  const applyProfile = async (id: string) => {
    const { profiles = [], config } = get()
    const target = profiles.find(p => p.id === id)
    if (!target) throw new Error('Profile not found')

    const nextConfig: LocalStorageConfig = JSON.parse(JSON.stringify(target.config))
    // 保留当前的 prefs 与 fastInject 运行状态
    if (config?.prefs) {
      nextConfig.prefs = { ...config.prefs }
    }
    if (config?.action?.fastInject != null) {
      nextConfig.action.fastInject = config.action.fastInject
    }

    set(({ version, storage }) => {
      if (storage) storage.config = nextConfig
      return {
        config: nextConfig,
        activeProfileId: id,
        version: version + 1,
      }
    })

    await sendToBackground({
      type: 'config.set',
      config: nextConfig,
    })
  }

  const deleteProfile = async (id: string) => {
    const { profiles = [], activeProfileId } = get()
    const newProfiles = profiles.filter(p => p.id !== id)
    set({
      profiles: newProfiles,
      activeProfileId: activeProfileId === id ? undefined : activeProfileId,
    })
    await sendToBackground({
      type: 'profiles.set',
      profiles: newProfiles,
    })
  }

  const renameProfile = async (id: string, name: string) => {
    const { profiles = [] } = get()
    const newProfiles = profiles.map(p => {
      if (p.id === id) {
        return { ...p, name: name.trim() || p.name, updatedAt: Date.now() }
      }
      return p
    })
    set({ profiles: newProfiles })
    await sendToBackground({
      type: 'profiles.set',
      profiles: newProfiles,
    })
  }

  return {
    version: 0,

    loadStorage,
    importStorage,
    saveConfig,
    savePolicies,
    saveConfigAsync,
    reloadConfig,
    saveCurrentAsProfile,
    applyProfile,
    deleteProfile,
    renameProfile,
  }
}))