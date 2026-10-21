import test from 'node:test'
import assert from 'node:assert/strict'

import { rewriteMediaQuery } from '../src/core/media.ts'

const real = { width: 1536, height: 864 }
const spoof = { width: 1920, height: 1080 }
const rw = (q) => rewriteMediaQuery(q, real, spoof)

test('queries without device features are unchanged', () => {
  for (const q of ['(min-width: 100px)', 'screen and (max-width: calc(10px + 2em))', 'print', 'not all',
    '(prefers-color-scheme: dark)', '(-webkit-min-device-pixel-ratio: 1)', '(min-resolution: 2dppx)']) {
    assert.equal(rw(q), q)
  }
})

test('device-width / device-height values are shifted by the real - spoof difference', () => {
  assert.equal(rw('(device-width: 1920px)'), '(device-width: calc(1920px - 384px))')
  assert.equal(rw('(min-device-width: 1000px)'), '(min-device-width: calc(1000px - 384px))')
  assert.equal(rw('(max-device-height: 50em)'), '(max-device-height: calc(50em - 216px))')
  assert.equal(rw('screen and (min-device-width: 10cm), print'), 'screen and (min-device-width: calc(10cm - 384px)), print')
  assert.equal(rewriteMediaQuery('(device-width: 100px)', spoof, real), '(device-width: calc(100px + 384px))')
})

test('range syntax shifts every value next to the feature', () => {
  assert.equal(rw('(device-width > 1919px)'), '(device-width > calc(1919px - 384px))')
  assert.equal(rw('(1000px <= device-height < 1100px)'), '(calc(1000px - 216px) <= device-height < calc(1100px - 216px))')
})

test('nested conditions are rewritten', () => {
  assert.equal(
    rw('((device-width > 10px) and (not (device-height < 5px)))'),
    '((device-width > calc(10px - 384px)) and (not (device-height < calc(5px - 216px))))',
  )
})

test('unitless zero becomes 0px, other unitless values stay invalid', () => {
  assert.equal(rw('(device-width: 0)'), '(device-width: calc(0px - 384px))')
  assert.equal(rw('(device-width: 100)'), '(device-width: 100)')
  /* 无效值仍无效（求值为假，与原查询一致） */
  assert.equal(rw('(device-width: foo)'), '(device-width: calc(foo - 384px))')
})

test('device-aspect-ratio is evaluated against the spoofed size', () => {
  const sq = { width: 1000, height: 1000 }
  const r = (q) => rewriteMediaQuery(q, sq, spoof)
  assert.equal(r('(device-aspect-ratio: 16 / 9)'), '(width >= 0px)')
  assert.equal(r('(device-aspect-ratio: 1 / 1)'), '(width < 0px)')
  assert.equal(r('(min-device-aspect-ratio: 4 / 3)'), '(width >= 0px)')
  assert.equal(r('(max-device-aspect-ratio: 4 / 3)'), '(width < 0px)')
  assert.equal(r('(device-aspect-ratio > 1.5 / 1)'), '(width >= 0px)')
  assert.equal(r('(2 / 1 < device-aspect-ratio)'), '(width < 0px)')
  assert.equal(r('(1 / 1 < device-aspect-ratio <= 16 / 9)'), '(width >= 0px)')
  assert.equal(r('not screen and (device-aspect-ratio: 16 / 9)'), 'not screen and (width >= 0px)')
})

test('survives page tampering with built-in prototypes', () => {
  const saved = [RegExp.prototype.exec, String.prototype.trim, String.prototype.slice, Array.prototype[Symbol.iterator]]
  RegExp.prototype.exec = () => null
  String.prototype.trim = () => 'x'
  String.prototype.slice = () => 'x'
  Array.prototype[Symbol.iterator] = function* () { }
  try {
    assert.equal(rw('(device-width: 1920px)'), '(device-width: calc(1920px - 384px))')
    assert.equal(rewriteMediaQuery('(device-aspect-ratio: 16 / 9)', real, spoof), '(width >= 0px)')
  } finally {
    Array.prototype[Symbol.iterator] = saved[3]
    RegExp.prototype.exec = saved[0]
    String.prototype.trim = saved[1]
    String.prototype.slice = saved[2]
  }
})
