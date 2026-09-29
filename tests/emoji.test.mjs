import test from 'node:test'
import assert from 'node:assert/strict'

import { hasEmoji, isEmojiProbe, EMOJI_TEXT_MAX_LENGTH } from '../src/core/emoji.ts'

test('hasEmoji detects pictographs, ZWJ sequences, flags and keycaps', () => {
  for (const text of ['😀', 'a🤖b', '👩‍💻', '🏳️‍🌈', '🇨🇳', '🇺🇸', '1️⃣', '#⃣', '❤️', '🫨']) {
    assert.equal(hasEmoji(text), true, text)
  }
})

test('hasEmoji ignores plain text and CJK', () => {
  for (const text of ['', 'Cwm fjordbank glyphs vext quiz', '中文', 'あア', '한국어', '12345', '→ ✓ ×']) {
    assert.equal(hasEmoji(text), false, text)
  }
})

test('isEmojiProbe only accepts short emoji text', () => {
  assert.equal(isEmojiProbe('😀'), true)
  assert.equal(isEmojiProbe(null), false)
  assert.equal(isEmojiProbe(undefined), false)
  assert.equal(isEmojiProbe('plain'), false)
  assert.equal(isEmojiProbe('😀'.padEnd(EMOJI_TEXT_MAX_LENGTH + 1, 'x')), false)
})
