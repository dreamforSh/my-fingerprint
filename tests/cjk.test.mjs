import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CJK_MASK_CHAR,
  hasCjk,
  maskCjk,
  isCjkFontFamily,
  hasCjkFontFamily,
  stripCjkFontFamilies,
  isCjkLocalVoice,
} from '../src/core/cjk.ts'

const M = CJK_MASK_CHAR

test('hasCjk detects Han, kana, CJK punctuation and fullwidth forms', () => {
  assert.equal(hasCjk('中文'), true)
  assert.equal(hasCjk('あア'), true)
  assert.equal(hasCjk('，。'), true)
  assert.equal(hasCjk('ｆｕｌｌ'), true)
  assert.equal(hasCjk('𠀀'), true)
  assert.equal(hasCjk('Cwm fjordbank glyphs vext quiz, 😃'), false)
  assert.equal(hasCjk('한국어'), false)
})

test('maskCjk replaces every CJK code point with one mask char', () => {
  assert.equal(maskCjk('abc中文def'), `abc${M}${M}def`)
  assert.equal(maskCjk('𠀀x'), `${M}x`)
  assert.equal(maskCjk('plain'), 'plain')
  // global regex must not keep state between calls
  assert.equal(maskCjk('中'), M)
  assert.equal(maskCjk('中'), M)
})

test('isCjkFontFamily matches Chinese font names in any form', () => {
  for (const name of ['"Microsoft YaHei"', "'SimSun'", 'PingFang SC', '  kaiti  ', '微软雅黑', '"宋体"',
    'Noto Sans CJK SC', 'Source Han Serif CN', 'WenQuanYi Micro Hei', 'Microsoft   JhengHei UI']) {
    assert.equal(isCjkFontFamily(name), true, name)
  }
  for (const name of ['Arial', 'serif', 'sans-serif', '"Segoe UI"', 'monospace', 'Noto Sans', 'system-ui', 'Malgun Gothic']) {
    assert.equal(isCjkFontFamily(name), false, name)
  }
})

test('hasCjkFontFamily parses font shorthand families only', () => {
  assert.equal(hasCjkFontFamily('16px "Microsoft YaHei", sans-serif'), true)
  assert.equal(hasCjkFontFamily('italic small-caps bold 12px/1.5 KaiTi'), true)
  assert.equal(hasCjkFontFamily('bold 10px Arial, serif'), false)
  assert.equal(hasCjkFontFamily('caption'), false)
  assert.equal(hasCjkFontFamily('garbage'), false)
})

test('stripCjkFontFamilies keeps style prefix and non-CJK families', () => {
  assert.equal(
    stripCjkFontFamilies('bold 16px "Microsoft YaHei", Arial, sans-serif', '"x-1"'),
    'bold 16px Arial, sans-serif, "x-1"',
  )
  assert.equal(stripCjkFontFamilies('12px KaiTi', '"x-2"'), '12px "x-2"')
  assert.equal(stripCjkFontFamilies('italic 1.2em/2 宋体, "PingFang SC"', '"x-3"'), 'italic 1.2em/2 "x-3"')
  assert.equal(stripCjkFontFamilies('small-caps 700 12px "Foo, Bar", SimHei', '"x-4"'), 'small-caps 700 12px "Foo, Bar", "x-4"')
  assert.equal(stripCjkFontFamilies('10px sans-serif', '"x"'), undefined)
  assert.equal(stripCjkFontFamilies('menu', '"x"'), undefined)
})

test('isCjkLocalVoice only matches local Chinese voices', () => {
  assert.equal(isCjkLocalVoice({ lang: 'zh-CN', localService: true }), true)
  assert.equal(isCjkLocalVoice({ lang: 'zh_TW', localService: true }), true)
  assert.equal(isCjkLocalVoice({ lang: 'yue-HK', localService: true }), true)
  assert.equal(isCjkLocalVoice({ lang: 'zh-CN', localService: false }), false)
  assert.equal(isCjkLocalVoice({ lang: 'en-US', localService: true }), false)
  assert.equal(isCjkLocalVoice({ lang: 'zu-ZA', localService: true }), false)
})

test('cjk helpers keep working after the page overrides String / RegExp / Set methods', () => {
  const saved = {
    exec: RegExp.prototype.exec,
    test: RegExp.prototype.test,
    replace: String.prototype.replace,
    trim: String.prototype.trim,
    toLowerCase: String.prototype.toLowerCase,
    startsWith: String.prototype.startsWith,
    has: Set.prototype.has,
    some: Array.prototype.some,
  }
  try {
    RegExp.prototype.exec = () => null
    RegExp.prototype.test = () => false
    String.prototype.replace = function () { return String(this) }
    String.prototype.trim = () => ''
    String.prototype.toLowerCase = () => ''
    String.prototype.startsWith = () => false
    Set.prototype.has = () => false
    Array.prototype.some = () => false

    assert.equal(hasCjk('中文'), true)
    assert.equal(maskCjk('a中b'), `a${CJK_MASK_CHAR}b`)
    assert.equal(isCjkFontFamily(' "Microsoft YaHei" '), true)
    assert.equal(isCjkFontFamily('Noto Sans CJK SC'), true)
    assert.equal(hasCjkFontFamily('12px SimSun, Arial'), true)
    assert.equal(stripCjkFontFamilies('12px SimSun, Arial', '"x"'), '12px Arial, "x"')
    assert.equal(isCjkLocalVoice({ lang: 'zh-CN', localService: true }), true)
  } finally {
    Object.assign(RegExp.prototype, { exec: saved.exec, test: saved.test })
    Object.assign(String.prototype, { replace: saved.replace, trim: saved.trim, toLowerCase: saved.toLowerCase, startsWith: saved.startsWith })
    Set.prototype.has = saved.has
    Array.prototype.some = saved.some
  }
})
