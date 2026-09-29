import { Popover, type PopoverProps } from "antd"
import {
  QuestionOutlined,
} from '@ant-design/icons';
import { useTranslation } from "react-i18next";
import { cn } from "@/utils/style";

type Color = 'default' | 'warning' | 'danger'

const triggerColor: Record<Color, string> = {
  default: 'bg-default-100 hover:bg-default-200',
  warning: 'bg-warning-50 hover:bg-warning-100',
  danger: 'bg-danger-50 hover:bg-danger-100',
}

export type TipIconProps = {
  isIconOnly?: boolean
  color?: Color
  className?: string
  style?: React.CSSProperties
  label?: string
  children?: React.ReactNode
} & PopoverProps

export const TipIcon = ({ isIconOnly, color = 'default', className, style, label, children, ...props }: TipIconProps) => {
  return <Popover rootClassName="[&_.ant-popover-inner]:p-2" trigger={['hover', 'focus']} {...props}>
    <button
      type="button"
      aria-label={label}
      className={cn(
        'shrink-0 flex justify-center items-center rounded border-0 p-0 cursor-help duration-200 text-default-600 hover:text-default-900 select-none',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[--ant-color-primary]',
        isIconOnly && 'size-[20px] text-[12px]',
        triggerColor[color],
        className
      )}
      style={style}>{children}</button>
  </Popover>
}

TipIcon.Question = ({ content, ...props }: Omit<TipIconProps, 'icon'>) => {
  const { t } = useTranslation()
  return <TipIcon isIconOnly label={t('g.help')} content={content} {...props} ><QuestionOutlined /></TipIcon>
}

export default TipIcon
