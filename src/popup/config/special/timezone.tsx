import { useEffect, useMemo, useState } from "react"
import { HookType } from '@/types/enum'
import { Form, Input, Select } from "antd"
import { sharedAsync } from "@/utils/timer"
import { LocalApi, type TimeZoneOption } from "@/api/local"
import { useI18n } from "@/utils/hooks"
import { useHookMode } from "../context"
import { HookModeCustom } from "../ui"
import { isCurrentlyDST, longOffsetToReadable, timeZoneToLongOffset } from "@/utils/timezone"

type OptionType = (string & {}) | HookType

/**
 * 验证语言环境值是否有效
 */
function validateLocale(locale: Intl.LocalesArgument) {
  try {
    new Intl.DateTimeFormat(locale);
    return true;   // 有效
  } catch (e) {
    return false;  // 无效
  }
}

/**
 * 验证时区是否有效
 */
const validateTimeZone = (zone: string) => {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch (e) {
    return false
  }
}


const fetchTimezones = sharedAsync(LocalApi.timezone)

/**
 * 当前系统时区
 */
export const getCurrentTimeZone = (): TimeZoneInfo => {
  const opts = Intl.DateTimeFormat().resolvedOptions();
  return {
    zone: opts.timeZone,
    locales: [opts.locale],
  }
}

const TimeZoneConfigItem = ({ }: {}) => {
  const { t, i18n, asLang } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const [localPreset, setLocalPreset] = useState<TimeZoneOption[]>([])
  const [isZoneInvalid, setIsZoneInvalid] = useState(false)
  const [isLocalesInvalid, setIsLocalesInvalid] = useState(false)

  const { mode, value: modeValue = {}, version, setValue } = useHookMode()

  const currentTz = useMemo(getCurrentTimeZone, [])

  const defaultLocales = currentTz.locales.join(', ');

  useEffect(() => {
    if (modeValue?.zone) {
      setIsZoneInvalid(!validateTimeZone(modeValue.zone))
    }
    if (modeValue?.locales) {
      setIsLocalesInvalid(!modeValue.locales.every(validateLocale))
    }
  }, [version])

  useEffect(() => {
    if (!isOpen || localPreset.length != 0) return;
    fetchTimezones()
      .then(setLocalPreset)
      .catch((e) => {
        console.warn(e)
      })
  }, [isOpen])

  const options = useMemo(() => {
    return [
      {
        label: <span>{t('g.special')}</span>,
        title: 'special',
        options: [
          {
            value: HookType.value,
            label: t('type.' + HookType[HookType.value]),
          },
        ],
      },
      localPreset && {
        label: <span>{t('g.preset')}</span>,
        title: 'preset',
        options: localPreset
          .map((v) => ({
            ...v,
            label: asLang(v.title) ?? '',
          }))
          .sort((a, b) => a.label.localeCompare(b.label))
          .map((tz) => {
            const offset = timeZoneToLongOffset(tz.zone)
            const isDST = isCurrentlyDST(tz.zone)
            return {
              value: tz.key,
              label: `${tz.label} (${offset ? longOffsetToReadable(offset) : 'N/A'}${isDST ? `, ${t('label.timezone.daylight')}` : ''})`,
            }
          }),
      },
    ].filter(v => !!v)
  }, [i18n.language, localPreset])

  const onChange = (v: OptionType) => {
    if (v === HookType.value) {
      setValue({ ...currentTz })
    } else {
      const preset = localPreset?.find(item => item.key === v);
      if (preset) {
        const { title, ...rest } = preset;
        setValue(rest)
      }
    }
  }

  const currentOption = modeValue.key || mode.type;

  return <>
    <Select<OptionType>
      open={isOpen}
      onOpenChange={setIsOpen}
      options={options}
      value={currentOption}
      onChange={onChange}
    />
    <HookModeCustom>
      <Form.Item label={t('item.sub.tz.zone')}>
        <Input
          status={isZoneInvalid ? 'error' : undefined}
          placeholder={currentTz.zone}
          value={modeValue.zone ?? currentTz.zone}
          onChange={({ target }) => setValue({
            ...modeValue,
            key: undefined,
            zone: target.value || currentTz.zone
          })}
        />
        {isZoneInvalid && <p className="text-danger-500">{t('item.sub.tz.invalid-zone')}</p>}
      </Form.Item>
      <Form.Item key={currentOption} label={t('item.sub.tz.locales')}>
        <Input
          status={isLocalesInvalid ? 'error' : undefined}
          placeholder={defaultLocales}
          defaultValue={modeValue.locales?.join?.(', ') ?? defaultLocales}
          onChange={({ target }) => setValue({
            ...modeValue,
            key: undefined,
            locales: target.value ? target.value.split(',').map((v) => v.trim()).filter(Boolean) : currentTz.locales,
          })}
        />
        {isLocalesInvalid && <p className="text-danger-500">{t('item.sub.tz.invalid-locales')}</p>}
      </Form.Item>
    </HookModeCustom>
  </>
}

export default TimeZoneConfigItem