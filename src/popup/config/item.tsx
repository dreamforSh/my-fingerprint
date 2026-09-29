import { Md } from "@/components/data/markdown"
import { Divider, Tag } from "antd"
import { statusDotColors, tagChipStyles, tagColors } from "./styles"
import { useTranslation } from "react-i18next"
import { cn } from "@/utils/style"

type ConfigRowProps = {
  label?: React.ReactNode
  /** 状态点，为空时不显示 */
  status?: keyof typeof statusDotColors
  tags?: string[]
  help?: React.ReactNode
  /** 右侧控件 */
  control?: React.ReactNode
  /** 下方内容 */
  children?: React.ReactNode
  className?: string
}

/**
 * 配置行：标题 + 标签 + 说明 + 右侧控件，下方为可选内容
 */
export const ConfigRow = ({ label, status, tags, help, control, children, className }: ConfigRowProps) => {
  return <div className={cn(
    "py-2 border-0 border-b border-solid border-[--ant-color-split] last:border-b-0",
    "[&_.ant-form-item]:mb-0 [&_.ant-form-item-label]:p-0",
    className,
  )}>
    <div className="min-h-[28px] flex items-center gap-2">
      {status && <span className={cn("size-[7px] shrink-0 rounded-full duration-300", statusDotColors[status])} />}
      <span className={cn("min-w-0", typeof label === 'string' && "truncate")}>{label}</span>
      <TagChips tags={tags} />
      {help}
      {control && <div className="ml-auto shrink-0 flex items-center gap-2">{control}</div>}
    </div>
    {children && <div className="mt-2 flex flex-col gap-2 empty:hidden">{children}</div>}
  </div>
}

/**
 * 标签（不稳定 / 弃用 等）
 */
export const TagChips = ({ tags }: { tags?: string[] }) => {
  const [t] = useTranslation()
  if (!tags?.length) return null;
  return <>
    {tags.map(tag => <span key={tag}
      className={cn(
        "shrink-0 px-1 rounded text-[11px] leading-[16px] whitespace-nowrap",
        tagChipStyles[tag] ?? "bg-[--ant-color-fill-tertiary] text-[--ant-color-text-secondary]",
      )}>
      {t('tag.' + tag)}
    </span>)}
  </>
}

type ConfigItemXProps = {
  children: React.ReactNode
  label?: React.ReactNode
  startContent?: React.ReactNode
  endContent?: React.ReactNode
}

/**
 * 横向配置项：控件位于右侧
 */
export const ConfigItemX = ({ children, label, startContent, endContent }: ConfigItemXProps) => {
  return <ConfigRow
    label={<>{label}{startContent}</>}
    help={endContent}
    control={children}
  />
}

type ConfigItemYProps = {
  children: React.ReactNode
  label?: React.ReactNode
  startContent?: React.ReactNode
  endContent?: React.ReactNode
  className?: string
}

/**
 * 纵向配置项：控件位于下方
 */
export const ConfigItemY = ({ children, label, startContent, endContent, className }: ConfigItemYProps) => {
  return <ConfigRow
    className={className}
    label={<>{label}{startContent}</>}
    help={endContent}
  >
    {children}
  </ConfigRow>
}

/**
 * 配置描述
 */
export const ConfigDesc = ({ desc, tags }: {
  tags?: string[]
  desc: string
}) => {
  const [t] = useTranslation()
  return <>
    {!!tags?.length && <>
      <div className="flex items-center justify-center gap-2">
        {tags.map(tag => <Tag key={tag}
          className="mr-0"
          bordered={false}
          color={(tagColors as any)[tag]}>
          {t('tag.' + tag)}
        </Tag>)}
      </div>
      <Divider rootClassName="my-1" />
    </>}
    <Md>{desc}</Md>
  </>
}
