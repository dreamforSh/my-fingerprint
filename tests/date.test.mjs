import test from 'node:test'
import assert from 'node:assert/strict'

/* 非 UTC、非整点的时区：按本地时间与按 UTC 解析的结果必然不同 */
process.env.TZ = 'Asia/Kolkata'

const { isLocalDateString } = await import('../src/core/date.ts')

/** [字符串, 年, 月(0 起), 日, 时, 分, 秒] */
const CASES = [
  ['2024-01-15T10:00:00', 2024, 0, 15, 10, 0, 0],
  ['2024-01-15T10:00', 2024, 0, 15, 10, 0, 0],
  ['2024-01-15T10:00:00.250', 2024, 0, 15, 10, 0, 0.25],
  ['2024-01-15T10:00:00Z', 2024, 0, 15, 10, 0, 0],
  ['2024-01-15T10:00:00+00:00', 2024, 0, 15, 10, 0, 0],
  ['2024-01-15T10:00:00-05:00', 2024, 0, 15, 15, 0, 0],
  ['2024-01-15', 2024, 0, 15, 0, 0, 0],
  ['2024-01', 2024, 0, 1, 0, 0, 0],
  ['2024', 2024, 0, 1, 0, 0, 0],
  ['+002024-01-15T10:00:00', 2024, 0, 15, 10, 0, 0],
  [' 2024-01-15', 2024, 0, 15, 0, 0, 0],
  ['2024-01-15 ', 2024, 0, 15, 0, 0, 0],
  ['2024-01-15t10:00:00', 2024, 0, 15, 10, 0, 0],
  ['2024-01-15T10:00:00z', 2024, 0, 15, 10, 0, 0],
  ['2024-01-15T10:00:00+0000', 2024, 0, 15, 10, 0, 0],
  ['2024-01-15 10:00:00', 2024, 0, 15, 10, 0, 0],
  ['2024-1-15', 2024, 0, 15, 0, 0, 0],
  ['2024/01/15 10:00:00', 2024, 0, 15, 10, 0, 0],
  ['2024/01/15', 2024, 0, 15, 0, 0, 0],
  ['01/15/2024', 2024, 0, 15, 0, 0, 0],
  ['1/15/2024 10:00 PM', 2024, 0, 15, 22, 0, 0],
  ['Jan 15 2024 10:00:00', 2024, 0, 15, 10, 0, 0],
  ['January 15, 2024 10:00:00', 2024, 0, 15, 10, 0, 0],
  ['15 January 2024', 2024, 0, 15, 0, 0, 0],
  ['Mon Jan 15 2024 10:00:00 GMT+0000', 2024, 0, 15, 10, 0, 0],
  ['Mon Jan 15 2024 10:00:00 GMT+0000 (Coordinated Universal Time)', 2024, 0, 15, 10, 0, 0],
  ['Mon Jan 15 2024 10:00:00 GMT+0530 (India Standard Time)', 2024, 0, 15, 4, 30, 0],
  ['Jan 15 2024 10:00:00 UTC', 2024, 0, 15, 10, 0, 0],
  ['Jan 15 2024 10:00:00 Z', 2024, 0, 15, 10, 0, 0],
  ['Jan 15 2024 10:00:00 +0000', 2024, 0, 15, 10, 0, 0],
  ['Jan 15 2024 10:00:00 -0500', 2024, 0, 15, 15, 0, 0],
  ['Jan 15 2024 10:00:00 EST', 2024, 0, 15, 15, 0, 0],
  ['15 Jan 2024 10:00:00 GMT', 2024, 0, 15, 10, 0, 0],
  ['Mon, 15 Jan 2024 10:00:00 GMT', 2024, 0, 15, 10, 0, 0],
  ['Jan 15 2024 10:00:00 (UTC)', 2024, 0, 15, 10, 0, 0],
  ['Monday, January 15, 2024', 2024, 0, 15, 0, 0, 0],
]

test('local-time classification matches the engine', () => {
  for (const [s, y, mo, d, h, mi, sec] of CASES) {
    const parsed = Date.parse(s)
    assert.ok(!Number.isNaN(parsed), `engine cannot parse ${JSON.stringify(s)}`)
    const local = new Date(y, mo, d, h, mi, Math.floor(sec), (sec % 1) * 1000).getTime()
    const utc = Date.UTC(y, mo, d, h, mi, Math.floor(sec), (sec % 1) * 1000)
    const engineLocal = parsed === local
    /* 用例本身须能区分：按本地或按 UTC（含偏移已折算到 UTC 分量）之一 */
    assert.ok(engineLocal || parsed === utc, `unexpected result for ${JSON.stringify(s)}: ${new Date(parsed).toISOString()}`)
    assert.equal(isLocalDateString(s), engineLocal, JSON.stringify(s))
  }
})

test('survives page tampering with RegExp.prototype.exec', () => {
  const exec = RegExp.prototype.exec
  RegExp.prototype.exec = () => null
  try {
    assert.equal(isLocalDateString('2024-01-15T10:00:00'), true)
    assert.equal(isLocalDateString('2024-01-15'), false)
    assert.equal(isLocalDateString('Jan 15 2024 10:00:00 GMT'), false)
  } finally {
    RegExp.prototype.exec = exec
  }
})
