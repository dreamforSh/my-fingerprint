import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isCloudflareChallengeHost,
  hasCloudflareChallengeTiming,
  isCloudflareChallengeContext,
  isCloudflareElement,
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

test('isCloudflareElement detects challenge iframe elements', () => {
  assert.equal(isCloudflareElement({ nodeName: 'IFRAME', src: 'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/...' }), true)
  assert.equal(isCloudflareElement({ nodeName: 'IFRAME', src: 'https://example.com/cdn-cgi/challenge-platform/orchestrate' }), true)
  assert.equal(isCloudflareElement({ nodeName: 'IFRAME', id: 'cf-turnstile-wrapper' }), true)
  assert.equal(isCloudflareElement({ nodeName: 'IFRAME', src: 'https://example.com/embed' }), false)
  assert.equal(isCloudflareElement({ nodeName: 'DIV', id: 'cf-turnstile-wrapper' }), false)
  assert.equal(isCloudflareElement(null), false)
})

test('isCloudflareCaller identifies Cloudflare stack traces', () => {
  assert.equal(isCloudflareCaller(), false)
})
