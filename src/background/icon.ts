import { drawLogo, LOGO_COLORS } from "@/utils/logo";
import { logManager } from "@/utils/log";

const logger = logManager.createLogger(__LOG_PREFIX_FILE_PATH__);

const ICON_SIZES = [16, 32] as const

let mEnabled: boolean | undefined

/**
 * 绘制工具栏图标
 */
const renderIcon = (color: string) => {
  const imageData: { [size: number]: ImageData } = {}
  for (const size of ICON_SIZES) {
    const ctx = new OffscreenCanvas(size, size).getContext('2d')
    if (!ctx) throw new Error('2d context unavailable')
    drawLogo(ctx, size, color)
    imageData[size] = ctx.getImageData(0, 0, size, size)
  }
  return imageData
}

/**
 * 根据扩展开关状态刷新工具栏图标（关闭时显示灰色图标）
 */
export const reActionIcon = async (enabled: boolean) => {
  if (mEnabled === enabled) return;
  try {
    await chrome.action.setIcon({
      imageData: renderIcon(enabled ? LOGO_COLORS.active : LOGO_COLORS.paused),
    })
    mEnabled = enabled
  } catch (e) {
    logger.warn('reActionIcon failed:', e)
  }
}
