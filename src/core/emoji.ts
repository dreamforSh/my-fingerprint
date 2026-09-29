/**
 * Emoji 检测
 * 纯函数模块，不依赖运行环境，便于单元测试
 */

/**
 * 表情符号：图形符号、区域指示符（国旗）、键帽组合符
 */
const EMOJI_TEST = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u

/**
 * 文本长度上限，超出时不视为 Emoji 探测文本
 */
export const EMOJI_TEXT_MAX_LENGTH = 64

export const hasEmoji = (text: string) => EMOJI_TEST.test(text)

/**
 * 是否是用于 Emoji 探测的短文本
 */
export const isEmojiProbe = (text: string | null | undefined): text is string => {
  return !!text && text.length <= EMOJI_TEXT_MAX_LENGTH && hasEmoji(text)
}
