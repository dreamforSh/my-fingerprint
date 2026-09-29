/**
 * 配置项状态点颜色
 */
export const statusDotColors = {
  default: "bg-[--ant-color-fill]",
  success: "bg-[--ant-color-success]",
  warning: "bg-[--ant-color-warning]",
  error: "bg-[--ant-color-error]",
}

export const tagColors = {
  unstable: 'orange',
  deprecated: 'red',
  'unsupport-import': 'cyan',
}

/**
 * 行内标签样式（小字号，保证对比度）
 */
export const tagChipStyles: Record<string, string> = {
  unstable: 'bg-warning-50 text-warning-700',
  deprecated: 'bg-danger-50 text-danger-700',
}
