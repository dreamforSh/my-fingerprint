/**
 * 品牌标志几何数据（坐标系 128 × 128）
 * 实心圆盘，镂空两道指纹纹路；SVG 组件与工具栏图标共用同一份数据
 */
export const LOGO_SIZE = 128

export const LOGO_RIDGE_WIDTH = 10

export const LOGO_RIDGES = [
  'M6 99.5C23.5 90.5 29.75 79.25 29.75 63.25A34 34 0 0 1 97.75 63.25C97.75 93.75 91.5 105.25 78.25 127.75',
  'M63.75 66C63.75 93.75 52 108 28 129.25',
] as const

export const LOGO_COLORS = {
  active: '#000000',
  paused: '#BFBFBF',
}

/**
 * 在 2d 画布上绘制标志
 */
export const drawLogo = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  size: number,
  color: string,
) => {
  const half = LOGO_SIZE / 2
  ctx.clearRect(0, 0, size, size)
  ctx.save()
  ctx.scale(size / LOGO_SIZE, size / LOGO_SIZE)

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(half, half, half, 0, Math.PI * 2)
  ctx.fill()

  ctx.globalCompositeOperation = 'destination-out'
  ctx.lineWidth = LOGO_RIDGE_WIDTH
  ctx.lineCap = 'round'
  for (const d of LOGO_RIDGES) {
    ctx.stroke(new Path2D(d))
  }
  ctx.restore()
}
