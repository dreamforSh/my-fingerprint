import { App, Button, Input, Modal, Select, Tooltip } from "antd"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useShallow } from "zustand/shallow"
import { FolderOpenOutlined, PlusOutlined, SaveOutlined } from "@ant-design/icons"
import { useStorageStore } from "../stores/storage"
import { usePrefsStore } from "../stores/prefs"

export const ProfileToolbar = () => {
  const { t } = useTranslation()
  const { message } = App.useApp()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [profileName, setProfileName] = useState("")

  const {
    profiles = [],
    activeProfileId,
    applyProfile,
    saveCurrentAsProfile,
  } = useStorageStore(
    useShallow((s) => ({
      profiles: s.profiles,
      activeProfileId: s.activeProfileId,
      applyProfile: s.applyProfile,
      saveCurrentAsProfile: s.saveCurrentAsProfile,
    }))
  )

  const { setTab } = usePrefsStore(
    useShallow((s) => ({
      setTab: s.setTab,
    }))
  )

  const handleSelect = async (id: string) => {
    const target = profiles.find((p) => p.id === id)
    if (!target) return
    try {
      await applyProfile(id)
      message.success(t("preset.switch-ok", { name: target.name }))
    } catch (e: any) {
      message.error(e?.message ?? "Failed to apply profile")
    }
  }

  const handleOpenModal = () => {
    setProfileName(`${t("g.preset")} ${profiles.length + 1}`)
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    try {
      await saveCurrentAsProfile(profileName)
      setIsModalOpen(false)
      message.success(t("preset.save-ok"))
    } catch (e: any) {
      message.error(e?.message ?? "Failed to save profile")
    }
  }

  return (
    <div className="mb-2 p-2 bg-[--ant-color-bg-container] rounded-lg flex items-center gap-1.5 shadow-sm">
      <span className="text-xs font-semibold text-[--ant-color-text-secondary] whitespace-nowrap pl-0.5">
        {t("preset.quick-select")}:
      </span>

      <Select
        size="small"
        className="grow min-w-0"
        value={activeProfileId}
        placeholder={profiles.length === 0 ? t("preset.no-custom-presets") : t("preset.quick-select")}
        onChange={handleSelect}
        options={profiles.map((p) => ({
          value: p.id,
          label: (
            <div className="flex items-center justify-between text-xs">
              <span className="truncate max-w-[130px]">{p.name}</span>
            </div>
          ),
        }))}
      />

      <Tooltip title={t("preset.save-current")}>
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={handleOpenModal}
        />
      </Tooltip>

      <Tooltip title={t("preset.manage")}>
        <Button
          size="small"
          icon={<FolderOpenOutlined />}
          onClick={() => setTab("more")}
        />
      </Tooltip>

      <Modal
        title={t("preset.save-current")}
        open={isModalOpen}
        onOk={handleSave}
        onCancel={() => setIsModalOpen(false)}
        okText={t("g.save")}
        cancelText={t("g.cancel")}
        destroyOnClose
      >
        <div className="py-2 flex flex-col gap-2">
          <label className="text-xs text-[--ant-color-text-secondary]">
            {t("preset.input-name")}
          </label>
          <Input
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder={t("preset.input-name-placeholder")}
            onPressEnter={handleSave}
            autoFocus
          />
        </div>
      </Modal>
    </div>
  )
}

export default ProfileToolbar
