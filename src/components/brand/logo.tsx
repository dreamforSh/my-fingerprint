import { useId } from "react"
import { LOGO_RIDGES, LOGO_RIDGE_WIDTH, LOGO_SIZE } from "@/utils/logo"

type LogoProps = {
  size?: number | string
  className?: string
  /** 无障碍名称，为空时视为装饰性图形 */
  title?: string
}

/**
 * 品牌标志（SVG 实现，颜色跟随 currentColor）
 */
export const Logo = ({ size = 24, className, title }: LogoProps) => {
  const maskId = 'logo-mask' + useId().replace(/:/g, '')
  const half = LOGO_SIZE / 2

  return <svg
    width={size}
    height={size}
    viewBox={`0 0 ${LOGO_SIZE} ${LOGO_SIZE}`}
    className={className}
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    focusable="false"
  >
    <mask id={maskId}>
      <rect width={LOGO_SIZE} height={LOGO_SIZE} fill="#fff" />
      <g fill="none" stroke="#000" strokeWidth={LOGO_RIDGE_WIDTH} strokeLinecap="round">
        {LOGO_RIDGES.map((d) => <path key={d} d={d} />)}
      </g>
    </mask>
    <circle cx={half} cy={half} r={half} fill="currentColor" mask={`url(#${maskId})`} />
  </svg>
}

export default Logo
