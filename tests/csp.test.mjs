import test from 'node:test'
import assert from 'node:assert/strict'

import { isRestrictiveForWorkers, stripFragment } from '../src/core/csp.ts'

test('isRestrictiveForWorkers flags directives that affect workers and their requests', () => {
  for (const policy of [
    "default-src 'self'",
    "script-src 'nonce-abc' 'strict-dynamic'",
    "worker-src 'self'",
    "child-src blob:",
    "connect-src 'self'",
    "upgrade-insecure-requests; Script-Src 'self'",
    "frame-ancestors 'none', worker-src 'self'",
    "require-trusted-types-for 'script'",
  ]) {
    assert.equal(isRestrictiveForWorkers(policy), true, policy)
  }
})

test('isRestrictiveForWorkers ignores policies without such directives', () => {
  for (const policy of [
    '',
    null,
    undefined,
    "frame-ancestors 'self'",
    'upgrade-insecure-requests; block-all-mixed-content',
    "report-uri /csp; img-src 'self'; style-src 'self'",
    "img-src script-src",
  ]) {
    assert.equal(isRestrictiveForWorkers(policy), false, String(policy))
  }
})

test('stripFragment removes the fragment only', () => {
  assert.equal(stripFragment('https://a.com/x?y=1#z'), 'https://a.com/x?y=1')
  assert.equal(stripFragment('https://a.com/'), 'https://a.com/')
})
