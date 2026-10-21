import test from 'node:test'
import assert from 'node:assert/strict'

import { adapterInfoOf } from '../src/core/gpu.ts'

test('adapterInfoOf derives WebGPU vendor and architecture from the WebGL renderer', () => {
  const cases = [
    ['Google Inc. (NVIDIA)', 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'nvidia', 'ampere'],
    ['Google Inc. (NVIDIA)', 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'nvidia', 'lovelace'],
    ['Google Inc. (NVIDIA)', 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)', 'nvidia', 'turing'],
    ['Google Inc. (AMD)', 'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)', 'amd', 'rdna-2'],
    ['Google Inc. (Intel)', 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'intel', 'gen-9'],
    ['Google Inc. (Intel)', 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'intel', 'gen-12lp'],
    ['Google Inc. (Apple)', 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', 'apple', 'common-3'],
    ['Google Inc. (Unknown)', 'ANGLE (Unknown, SomeGPU, OpenGL)', '', ''],
  ]
  for (const [vendor, renderer, v, arch] of cases) {
    const info = adapterInfoOf(vendor, renderer)
    assert.equal(info.vendor, v, renderer)
    assert.equal(info.architecture, arch, renderer)
    assert.equal(info.device, '')
    assert.equal(info.description, '')
  }
})

test('adapterInfoOf keeps working after the page overrides RegExp / String methods', () => {
  const saved = { exec: RegExp.prototype.exec, lower: String.prototype.toLowerCase }
  try {
    RegExp.prototype.exec = () => null
    String.prototype.toLowerCase = () => 'x'
    assert.equal(adapterInfoOf('Google Inc. (NVIDIA)', 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060, D3D11)').vendor, 'nvidia')
  } finally {
    RegExp.prototype.exec = saved.exec
    String.prototype.toLowerCase = saved.lower
  }
})
