import test from 'node:test'
import assert from 'node:assert/strict'

import { isCloudflareChallengeHost } from '../src/core/cloudflare.ts'

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
