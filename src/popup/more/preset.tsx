import { GithubApi } from "@/api/github"
import { sharedAsync } from "@/utils/timer"
import { App, Button, Divider, Input, Modal, Popconfirm, Spin, Tag, Tooltip } from "antd"
import { useEffect, useMemo, useState } from "react"
import { CheckOutlined, DeleteOutlined, EditOutlined, LoadingOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons'
import { useShallow } from "zustand/shallow"
import { useStorageStore } from "../stores/storage"
import { useI18n } from "@/utils/hooks"
import { HookType } from "@/types/enum"

type PresetItem = {
  file: string
  name: I18nString
  description: I18nString
}

const getLocalPresets = sharedAsync(async () => {
  const url = chrome.runtime.getURL('presets/index.json')
  return await fetch(url).then(res => {
    if (!res.ok) throw new Error(res.statusText);
    return res.json()
  })
})

const getOnlinePresets = sharedAsync(async () => {
  return GithubApi.getJson('/example/presets/index.json')
})

/**
 * 预设内容面板
 */
const PresetPanel = ({ }: {
}) => {
  const { t, asLang } = useI18n()
  const { message } = App.useApp()

  const [localPresets, setLocalPresets] = useState<PresetItem[]>()
  const [onlinePresets, setOnlinePresets] = useState<PresetItem[]>()
  const [selectedKey, setSelectedKey] = useState<string>()
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')

  const {
    profiles = [],
    importStorage,
    saveCurrentAsProfile,
    applyProfile,
    deleteProfile,
    renameProfile,
  } = useStorageStore(useShallow((s) => ({
    profiles: s.profiles,
    importStorage: s.importStorage,
    saveCurrentAsProfile: s.saveCurrentAsProfile,
    applyProfile: s.applyProfile,
    deleteProfile: s.deleteProfile,
    renameProfile: s.renameProfile,
  })))

  useEffect(() => {
    getLocalPresets()
      .then(v => setLocalPresets(Array.isArray(v.presets) ? v.presets : []))
      .catch(() => setLocalPresets([]));
    getOnlinePresets()
      .then(v => setOnlinePresets(Array.isArray(v.presets) ? v.presets : []))
      .catch(() => setOnlinePresets([]));
  }, [])

  // 默认选中第一个自定义预设或第一个本地预设
  useEffect(() => {
    if (selectedKey) return;
    if (profiles.length > 0) {
      setSelectedKey(`custom:${profiles[0].id}`)
    } else if (localPresets && localPresets.length > 0) {
      setSelectedKey(`local:${localPresets[0].file}`)
    }
  }, [profiles, localPresets, selectedKey])

  const onApplyStaticPreset = (preset?: DeepPartial<LocalStorage>) => {
    if (!preset) return;
    importStorage(preset)
      .then(() => message.success(t('tip.config.import-ok')))
      .catch((err) => message.warning(`${t('tip.config.import-fail')}: ${err?.message}`))
  }

  const handleOpenSaveModal = () => {
    setNewProfileName(`${t('g.preset')} ${profiles.length + 1}`)
    setIsSaveModalOpen(true)
  }

  const handleSaveProfile = async () => {
    try {
      const id = await saveCurrentAsProfile(newProfileName)
      setSelectedKey(`custom:${id}`)
      setIsSaveModalOpen(false)
      message.success(t('preset.save-ok'))
    } catch (e: any) {
      message.error(e?.message ?? 'Save failed')
    }
  }

  const handleApplyCustomProfile = async (id: string, name: string) => {
    try {
      await applyProfile(id)
      message.success(t('preset.switch-ok', { name }))
    } catch (e: any) {
      message.error(e?.message ?? 'Apply failed')
    }
  }

  const handleOverwriteCustomProfile = async (id: string, name: string) => {
    try {
      await saveCurrentAsProfile(name, id)
      message.success(t('preset.update-ok'))
    } catch (e: any) {
      message.error(e?.message ?? 'Overwrite failed')
    }
  }

  const handleDeleteCustomProfile = async (id: string) => {
    try {
      await deleteProfile(id)
      message.success(t('preset.delete-ok'))
      if (selectedKey === `custom:${id}`) {
        setSelectedKey(undefined)
      }
    } catch (e: any) {
      message.error(e?.message ?? 'Delete failed')
    }
  }

  const selectedCustomProfile = useMemo(() => {
    if (!selectedKey?.startsWith('custom:')) return null
    const id = selectedKey.split(':')[1]
    return profiles.find(p => p.id === id)
  }, [selectedKey, profiles])

  const infoProps = useMemo(() => {
    if (!selectedKey) return;
    if (selectedKey.startsWith('local:')) {
      const key = selectedKey.split(':')[1]
      const item = localPresets?.find(v => v.file === key)
      return item && { item, mode: 'local' as const };
    }
    if (selectedKey.startsWith('online:')) {
      const key = selectedKey.split(':')[1]
      const item = onlinePresets?.find(v => v.file === key)
      return item && { item, mode: 'online' as const };
    }
  }, [selectedKey, localPresets, onlinePresets])

  return localPresets == null && onlinePresets == null ?
    <div className="w-full h-56 flex-center">
      <Spin indicator={<LoadingOutlined spin />} />
    </div> :
    <div className="w-full min-h-[220px] max-h-[320px] flex flex-col">
      <div className="w-full flex justify-between items-center pb-2 border-b border-[--ant-color-border-secondary]">
        <span className="text-xs font-semibold text-[--ant-color-text-secondary]">
          {t('preset.count', { count: profiles.length })}
        </span>
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={handleOpenSaveModal}
        >
          {t('preset.save-current')}
        </Button>
      </div>

      <div className="w-full grow p-2 flex overflow-hidden animate-fadeIn">
        <div className="w-28 shrink-0 flex flex-col overflow-y-auto no-scrollbar gap-2 pr-1">
          {/* 我的预设 */}
          <div>
            <div className="text-[11px] font-bold text-[--ant-color-primary] mb-1 flex items-center justify-between">
              <span>{t('preset.my-presets')}</span>
              <span className="text-[10px] text-[--ant-color-text-quaternary]">({profiles.length})</span>
            </div>
            {profiles.length === 0 ? (
              <div className="text-[11px] text-[--ant-color-text-quaternary] py-1 italic">
                {t('tip.data.empty')}
              </div>
            ) : (
              profiles.map(p => (
                <PresetItemView
                  key={p.id}
                  title={p.name}
                  className={`custom:${p.id}` === selectedKey ? 'bg-[--ant-color-primary-bg] font-medium text-[--ant-color-primary]' : undefined}
                  onSelect={() => setSelectedKey(`custom:${p.id}`)}
                />
              ))
            )}
          </div>

          <Divider className="my-0.5" />

          {/* 本地预设 */}
          {localPresets && localPresets.length !== 0 && (
            <div>
              <div className="text-[11px] font-bold text-[--ant-color-text-secondary] mb-1">
                {t('g.local')}
              </div>
              {localPresets.map(v => (
                <PresetItemView
                  key={v.file}
                  title={asLang(v.name)}
                  className={`local:${v.file}` === selectedKey ? 'bg-[--ant-color-primary-bg]' : undefined}
                  onSelect={() => setSelectedKey(`local:${v.file}`)}
                />
              ))}
            </div>
          )}

          {/* 在线预设 */}
          {onlinePresets && onlinePresets.length !== 0 && (
            <div>
              <div className="text-[11px] font-bold text-[--ant-color-text-secondary] mb-1">
                {t('g.online')}
              </div>
              {onlinePresets.map(v => (
                <PresetItemView
                  key={v.file}
                  title={asLang(v.name)}
                  className={`online:${v.file}` === selectedKey ? 'bg-[--ant-color-primary-bg]' : undefined}
                  onSelect={() => setSelectedKey(`online:${v.file}`)}
                />
              ))}
            </div>
          )}
        </div>

        <Divider className="h-full mx-2 my-0" type="vertical" />

        <div className="grow rounded overflow-y-auto no-scrollbar pl-1">
          {selectedCustomProfile ? (
            <CustomProfileInfoView
              profile={selectedCustomProfile}
              onApply={() => handleApplyCustomProfile(selectedCustomProfile.id, selectedCustomProfile.name)}
              onOverwrite={() => handleOverwriteCustomProfile(selectedCustomProfile.id, selectedCustomProfile.name)}
              onDelete={() => handleDeleteCustomProfile(selectedCustomProfile.id)}
              onRename={(newName) => renameProfile(selectedCustomProfile.id, newName)}
            />
          ) : infoProps ? (
            <PresetInfoView {...infoProps} onApply={onApplyStaticPreset} />
          ) : (
            <div className="h-full flex-center text-xs text-[--ant-color-text-quaternary]">
              {t('tip.data.please-select')}
            </div>
          )}
        </div>
      </div>

      {/* 保存新预设弹窗 */}
      <Modal
        title={t('preset.save-current')}
        open={isSaveModalOpen}
        onOk={handleSaveProfile}
        onCancel={() => setIsSaveModalOpen(false)}
        okText={t('g.save')}
        cancelText={t('g.cancel')}
        destroyOnClose
      >
        <div className="py-2 flex flex-col gap-2">
          <label className="text-xs text-[--ant-color-text-secondary]">
            {t('preset.input-name')}
          </label>
          <Input
            value={newProfileName}
            onChange={e => setNewProfileName(e.target.value)}
            placeholder={t('preset.input-name-placeholder')}
            onPressEnter={handleSaveProfile}
            autoFocus
          />
        </div>
      </Modal>
    </div>
}

/**
 * 预设项列表项
 */
const PresetItemView = ({ title, onSelect, className }: {
  title?: string
  onSelect?: () => void
  className?: string
}) => {
  return <div
    className={"px-2 py-1 text-xs truncate rounded hover:bg-[--ant-color-primary-bg-hover] cursor-pointer duration-200 " + (className ?? '')}
    onClick={onSelect}
    title={title}
  >
    <span>{title ?? 'null'}</span>
  </div>
}

/**
 * 自定义预设详情视图
 */
const CustomProfileInfoView = ({
  profile,
  onApply,
  onOverwrite,
  onDelete,
  onRename,
}: {
  profile: CustomProfile
  onApply: () => void
  onOverwrite: () => void
  onDelete: () => void
  onRename: (newName: string) => void
}) => {
  const { t } = useI18n()
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(profile.name)

  useEffect(() => {
    setEditName(profile.name)
    setIsEditing(false)
  }, [profile.id, profile.name])

  const handleSaveRename = () => {
    if (editName.trim()) {
      onRename(editName.trim())
    }
    setIsEditing(false)
  }

  const summary = useMemo(() => {
    const fp = profile.config?.fp
    const ch = fp?.navigator?.clientHints
    let platform = '默认'
    let brand = ''
    if (ch && ch.type === HookType.value && (ch as any).value) {
      const val = (ch as any).value
      platform = val.platform || ''
      const b0 = val.brands?.[0]
      if (b0) brand = `${b0.brand} ${b0.version?.split('.')[0] || ''}`
    }

    const formatHook = (type?: HookType) => {
      switch (type) {
        case HookType.default: return '默认'
        case HookType.value: return '自定义'
        case HookType.page: return '标签页随机'
        case HookType.browser: return '启动随机'
        case HookType.domain: return '域名随机'
        case HookType.global: return '全局随机'
        case HookType.enabled: return '已启用'
        case HookType.disabled: return '已禁用'
        default: return '默认'
      }
    }

    const canvas = formatHook(fp?.other?.canvas?.type)
    const webgl = formatHook(fp?.other?.webgl?.type)
    const webrtc = formatHook(fp?.other?.webrtc?.type)
    const audio = formatHook(fp?.other?.audio?.type)

    return {
      platform,
      brand,
      canvas,
      webgl,
      webrtc,
      audio,
    }
  }, [profile.config])

  const dateStr = useMemo(() => {
    const d = new Date(profile.updatedAt || profile.createdAt)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }, [profile.createdAt, profile.updatedAt])

  return <div className="h-full flex flex-col gap-2 overflow-y-auto no-scrollbar text-xs">
    <div className="flex items-center justify-between gap-1">
      <div className="flex items-center gap-1">
        <Tag color="cyan">{t('preset.my-presets')}</Tag>
        <span className="text-[10px] text-[--ant-color-text-quaternary]">{dateStr}</span>
      </div>
    </div>

    {/* 预设名称编辑 */}
    <div className="flex items-center gap-1 font-bold text-sm">
      {isEditing ? (
        <div className="flex items-center gap-1 w-full">
          <Input
            size="small"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onPressEnter={handleSaveRename}
            autoFocus
          />
          <Button size="small" type="primary" icon={<CheckOutlined />} onClick={handleSaveRename} />
        </div>
      ) : (
        <div className="flex items-center justify-between w-full group">
          <span className="truncate" title={profile.name}>{profile.name}</span>
          <Tooltip title={t('preset.rename')}>
            <Button
              size="small"
              type="text"
              icon={<EditOutlined className="text-xs text-[--ant-color-text-tertiary]" />}
              onClick={() => setIsEditing(true)}
            />
          </Tooltip>
        </div>
      )}
    </div>

    {/* 指纹摘要列表 */}
    <div className="bg-[--ant-color-fill-quaternary] p-2 rounded flex flex-col gap-1 text-[11px]">
      <div className="text-[11px] font-semibold text-[--ant-color-text-secondary] mb-0.5">
        {t('preset.details')}
      </div>
      <div className="flex justify-between">
        <span className="text-[--ant-color-text-tertiary]">ClientHints:</span>
        <span className="font-mono text-right truncate max-w-[140px]">
          {summary.platform} {summary.brand}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-[--ant-color-text-tertiary]">Canvas / WebGL:</span>
        <span className="font-mono">{summary.canvas} / {summary.webgl}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-[--ant-color-text-tertiary]">WebRTC / Audio:</span>
        <span className="font-mono">{summary.webrtc} / {summary.audio}</span>
      </div>
    </div>

    {/* 操作按钮组 */}
    <div className="mt-auto pt-2 flex flex-col gap-1.5">
      <Button
        type="primary"
        size="small"
        className="w-full"
        onClick={onApply}
      >
        {t('g.apply')}
      </Button>

      <div className="flex gap-1.5">
        <Popconfirm
          title={t('preset.update-current')}
          description={t('preset.update-confirm')}
          onConfirm={onOverwrite}
          okText={t('g.confirm')}
          cancelText={t('g.cancel')}
        >
          <Button size="small" className="flex-1" icon={<SaveOutlined />}>
            {t('preset.update-current')}
          </Button>
        </Popconfirm>

        <Popconfirm
          title={t('preset.delete-confirm')}
          onConfirm={onDelete}
          okText={t('g.confirm')}
          cancelText={t('g.cancel')}
        >
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </div>
    </div>
  </div>
}

/**
 * 静态预设信息展示
 */
const PresetInfoView = ({ mode, item, onApply }: {
  mode: 'local' | 'online' | (string & {})
  item: PresetItem
  onApply?: (preset: DeepPartial<LocalStorage>) => void
}) => {
  const { t, asLang } = useI18n()

  const [isLoading, setIsLoading] = useState(false)
  const [preset, setPreset] = useState<DeepPartial<LocalStorage>>()

  const manifest = useMemo(() => chrome.runtime.getManifest(), [])

  useEffect(() => {
    if (!item?.file) return;
    const url = mode === 'local' ?
      chrome.runtime.getURL(`presets/${item.file}`) :
      mode === 'online' ?
        GithubApi.asRawUrl(`example/presets/${item.file}`) :
        null;

    if (!url) {
      setPreset(undefined)
      return;
    };

    setIsLoading(true)
    setPreset(undefined)
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(res.statusText);
        return res.json()
      })
      .then(setPreset)
      .catch(() => setPreset(undefined))
      .finally(() => setIsLoading(false))
  }, [mode, item])

  return isLoading ?
    <div className="h-full flex-center"><Spin indicator={<LoadingOutlined spin />} /></div> :
    preset == null ?
      <div className="h-full flex-center text-xs text-[--ant-color-text-quaternary]">{t('tip.data.unsupport')}</div> :
      <div className="h-full flex flex-col gap-2 overflow-y-auto no-scrollbar text-xs">
        <div>
          <Tag>{t('g.' + mode)}</Tag>
          {preset.version && <Tag>v{preset.version}</Tag>}
          {preset.version != null && manifest.version !== preset.version && <Tag color='error'>{t('tip.version.mismatch')}</Tag>}
        </div>
        <p className="font-bold text-sm m-0">{asLang(item.name) ?? 'null'}</p>
        <p className="text-[--ant-color-text-secondary] m-0 leading-relaxed">{asLang(item.description) ?? 'null'}</p>
        <div className="mt-auto pt-2">
          <Popconfirm
            title={t('g.apply')}
            description={t('tip.config.override-current')}
            onConfirm={() => onApply?.(preset)}
            okText={t('g.confirm')}
            cancelText={t('g.cancel')}
          >
            <Button type="primary" size="small" className="w-full">{t('g.apply')}</Button>
          </Popconfirm>
        </div>
      </div>
}

export default PresetPanel