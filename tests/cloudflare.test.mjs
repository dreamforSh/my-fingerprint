import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'

import {
  isCloudflareChallengeHost,
  hasCloudflareChallengeTiming,
  isCloudflareChallengeContext,
  isCloudflareScriptUrl,
  isCloudflareCaller,
} from '../src/core/cloudflare.ts'

test('isCloudflareChallengeHost matches the Turnstile / challenge host', () => {
  assert.equal(isCloudflareChallengeHost('challenges.cloudflare.com'), true)
  assert.equal(isCloudflareChallengeHost('CHALLENGES.CLOUDFLARE.COM'), true)
  assert.equal(isCloudflareChallengeHost('foo.challenges.cloudflare.com'), true)
})

test('isCloudflareChallengeHost ignores unrelated and look-alike hosts', () => {
  for (const host of [
    'cloudflare.com',
    'www.cloudflare.com',
    'challenges.cloudflare.com.evil.com',
    'notchallenges.cloudflare.com',
    'example.com',
    '',
    null,
    undefined,
  ]) {
    assert.equal(isCloudflareChallengeHost(host), false, String(host))
  }
})

test('hasCloudflareChallengeTiming detects the challenge page Server-Timing entry', () => {
  assert.equal(hasCloudflareChallengeTiming([{ name: 'chlray', description: 'a42b890d793420a7' }]), true)
  assert.equal(hasCloudflareChallengeTiming([{ name: 'cfL4' }, { name: 'chlray' }]), true)
  assert.equal(hasCloudflareChallengeTiming([{ name: 'cfL4' }, { name: 'cfExtPri' }]), false)
  assert.equal(hasCloudflareChallengeTiming([]), false)
  assert.equal(hasCloudflareChallengeTiming(null), false)
  assert.equal(hasCloudflareChallengeTiming(undefined), false)
})

const fakeWindow = ({ hostname = '', origin = 'null', ancestorOrigins, serverTiming = [] } = {}) => ({
  origin,
  location: { hostname, ancestorOrigins },
  performance: {
    getEntriesByType: (type) => type === 'navigation' ? [{ serverTiming }] : [],
  },
})

test('isCloudflareChallengeContext matches the widget frame and its sub-frames', () => {
  const cf = 'https://challenges.cloudflare.com'
  // Turnstile iframe
  assert.equal(isCloudflareChallengeContext(fakeWindow({ hostname: 'challenges.cloudflare.com', origin: cf })), true)
  // about:blank / blob: sub-frame created by the widget
  assert.equal(isCloudflareChallengeContext(fakeWindow({ origin: cf })), true)
  // sandboxed descendant of the widget
  assert.equal(isCloudflareChallengeContext(fakeWindow({ ancestorOrigins: [cf, 'https://example.com'] })), true)
})

test('isCloudflareChallengeContext matches the interstitial challenge page on the site domain', () => {
  assert.equal(isCloudflareChallengeContext(fakeWindow({
    hostname: 'example.com',
    origin: 'https://example.com',
    serverTiming: [{ name: 'chlray', description: 'a42b890d793420a7' }],
  })), true)
})

test('isCloudflareChallengeContext ignores normal pages', () => {
  // host page embedding the widget
  assert.equal(isCloudflareChallengeContext(fakeWindow({
    hostname: 'example.com',
    origin: 'https://example.com',
    ancestorOrigins: [],
    serverTiming: [{ name: 'cfL4' }],
  })), false)
  // cross-origin iframe inside a normal page
  assert.equal(isCloudflareChallengeContext(fakeWindow({
    hostname: 'ads.example.net',
    origin: 'https://ads.example.net',
    ancestorOrigins: ['https://example.com'],
  })), false)
  assert.equal(isCloudflareChallengeContext({
    location: { hostname: 'example.com' },
    performance: { getEntriesByType: () => { throw new Error('denied') } },
  }), false)
})

test('isCloudflareChallengeContext matches path and DOM challenge markers', () => {
  assert.equal(isCloudflareChallengeContext({
    location: { hostname: 'example.com', pathname: '/cdn-cgi/challenge-platform/h/b/orchestrate/chk/v1' }
  }), true)
  assert.equal(isCloudflareChallengeContext({
    location: { hostname: 'example.com', pathname: '/turnstile/v0/api.js' }
  }), true)
  assert.equal(isCloudflareChallengeContext({
    location: { hostname: 'example.com' },
    document: { getElementById: (id) => id === 'challenge-running' ? {} : null }
  }), true)
  assert.equal(isCloudflareChallengeContext({
    location: { hostname: 'example.com' },
    document: { title: 'Just a moment... | Cloudflare' }
  }), true)
})

test('isCloudflareScriptUrl matches by host and same-origin challenge path only', () => {
  assert.equal(isCloudflareScriptUrl('https://challenges.cloudflare.com/turnstile/v0/api.js'), true)
  assert.equal(isCloudflareScriptUrl('https://CHALLENGES.cloudflare.com:443/x.js'), true)
  assert.equal(isCloudflareScriptUrl('https://example.com/cdn-cgi/challenge-platform/scripts/jsd/main.js', 'https://example.com'), true)
  // 第三方域名借用该路径
  assert.equal(isCloudflareScriptUrl('https://evil.com/cdn-cgi/challenge-platform/fp.js', 'https://example.com'), false)
  // 只含关键词
  assert.equal(isCloudflareScriptUrl('https://example.com/turnstile.js', 'https://example.com'), false)
  assert.equal(isCloudflareScriptUrl('https://example.com/x.js?u=challenges.cloudflare.com', 'https://example.com'), false)
  assert.equal(isCloudflareScriptUrl('https://challenges.cloudflare.com.evil.com/x.js'), false)
  assert.equal(isCloudflareScriptUrl('https://user@challenges.cloudflare.com@evil.com/x.js'), false)
  assert.equal(isCloudflareScriptUrl('blob:https://challenges.cloudflare.com/uuid'), false)
  assert.equal(isCloudflareScriptUrl(undefined), false)
})

test('isCloudflareCaller is false for ordinary callers', () => {
  assert.equal(isCloudflareCaller(), false)
})

test('isCloudflareCaller ignores function names and spoofed sourceURL', () => {
  // 函数名含关键词
  function turnstile() { return isCloudflareCaller() }
  assert.equal(turnstile(), false)
  // eval / new Function 声明的 sourceURL 不算真实脚本地址
  globalThis.__isCfCaller = isCloudflareCaller
  try {
    assert.equal(eval('__isCfCaller()\n//# sourceURL=https://challenges.cloudflare.com/x.js'), false)
    assert.equal(new Function('return __isCfCaller()\n//# sourceURL=https://challenges.cloudflare.com/y.js')(), false)
  } finally {
    delete globalThis.__isCfCaller
  }
})

test('isCloudflareCaller recognizes a direct call from a Cloudflare script', () => {
  const run = vm.runInThisContext(
    '(function (fn) { return fn() })',
    { filename: 'https://challenges.cloudflare.com/turnstile/v0/api.js' },
  )
  // 由 Cloudflare 脚本直接调用
  assert.equal(run(isCloudflareCaller), true)
  // Cloudflare 脚本回调页面代码，再由页面代码调用：不算
  assert.equal(run(() => isCloudflareCaller()), false)
})

test('isCloudflareCaller stays off when the page overrides globals', () => {
  const RealError = globalThis.Error
  const realIndexOf = String.prototype.indexOf
  function turnstile() { return isCloudflareCaller() }
  try {
    globalThis.Error = function () { return { stack: 'at turnstile (https://challenges.cloudflare.com/x.js:1:1)' } }
    String.prototype.indexOf = () => 0
    assert.equal(turnstile(), false)
  } finally {
    globalThis.Error = RealError
    String.prototype.indexOf = realIndexOf
  }
  // 页面以访问器占用 prepareStackTrace，返回伪造的调用栈
  Object.defineProperty(RealError, 'prepareStackTrace', {
    configurable: true,
    get: () => () => [{ getFileName: () => 'https://challenges.cloudflare.com/x.js', isEval: () => false }],
    set: () => { },
  })
  try {
    assert.equal(turnstile(), false)
  } finally {
    delete RealError.prepareStackTrace
  }
})
