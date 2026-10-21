import test from 'node:test'
import assert from 'node:assert/strict'

import { addFragColorOffset, fragmentOutputs, isConstantExpr } from '../src/core/glsl.ts'

const OFFSET = 'vec4(0.001,0.002,0.003,0)'

test('isConstantExpr only accepts literals and type constructors', () => {
  assert.equal(isConstantExpr('vec4(1.0, 0.0, 0.0, 1.0)'), true)
  assert.equal(isConstantExpr('vec4(1e-3, .5, 2.0 * 0.5, 1)'), true)
  assert.equal(isConstantExpr('vec4(v, 0.0, 1.0)'), false)
  assert.equal(isConstantExpr('vec4(gl_FragCoord.x / 32.0, gl_FragCoord.y / 32.0, 0.5, 1.0)'), false)
  assert.equal(isConstantExpr('u_color'), false)
})

test('fragmentOutputs finds gl_FragColor and ES 3.00 out vec4 variables, skips vertex shaders', () => {
  assert.deepEqual(fragmentOutputs('void main(){gl_FragColor=vec4(v,0.0,1.0);}'), ['gl_FragColor'])
  assert.deepEqual(fragmentOutputs('#version 300 es\nprecision highp float;out vec4 o;void main(){o=vec4(1.0);}'), ['o'])
  assert.deepEqual(fragmentOutputs('#version 300 es\nlayout(location = 0) out highp vec4 color;'), ['color'])
  assert.deepEqual(fragmentOutputs('#version 300 es\nin vec2 p;out vec4 v_color;void main(){gl_Position=vec4(p,0,1);}'), [])
  assert.deepEqual(fragmentOutputs('#version 300 es\nout ivec4 o;'), [])
})

test('addFragColorOffset offsets every non-constant assignment', () => {
  assert.equal(
    addFragColorOffset('void main(){gl_FragColor=vec4(v,0.0,1.0);}', OFFSET),
    `void main(){gl_FragColor = ${OFFSET} + (vec4(v,0.0,1.0));}`,
  )
  assert.equal(
    addFragColorOffset('void main(){gl_FragColor = vec4(gl_FragCoord.x/32.0, gl_FragCoord.y/32.0, 0.5, 1.0);}', OFFSET),
    `void main(){gl_FragColor = ${OFFSET} + (vec4(gl_FragCoord.x/32.0, gl_FragCoord.y/32.0, 0.5, 1.0));}`,
  )
  const es3 = '#version 300 es\nout vec4 o;void main(){ if (a) { o = vec4(0.0); return; } o = vec4(v, 1.0); }'
  assert.equal(
    addFragColorOffset(es3, OFFSET),
    `#version 300 es\nout vec4 o;void main(){ if (a) { o = vec4(0.0); return; } o = ${OFFSET} + (vec4(v, 1.0)); }`,
  )
})

test('addFragColorOffset leaves constant colors, comparisons, members and compound assignments unchanged', () => {
  for (const src of [
    'void main(){gl_FragColor=vec4(1.0,0.0,0.0,1.0);}',
    'void main(){ if (gl_FragColor == x) {} }',
    '#version 300 es\nout vec4 o;void main(){ s.o = vec4(v, 1.0); o += vec4(v, 1.0); }',
    '#version 300 es\nin vec2 p;out vec4 o;void main(){ o = vec4(p, 0, 1); gl_Position = o; }',
  ]) {
    assert.equal(addFragColorOffset(src, OFFSET), src, src)
  }
})

test('addFragColorOffset keeps working after the page overrides String / RegExp methods', () => {
  const saved = { exec: RegExp.prototype.exec, indexOf: String.prototype.indexOf, slice: String.prototype.slice }
  try {
    RegExp.prototype.exec = () => null
    String.prototype.indexOf = () => -1
    String.prototype.slice = () => ''
    assert.equal(
      addFragColorOffset('#version 300 es\nout vec4 o;void main(){o=vec4(v,1.0);}', OFFSET),
      `#version 300 es\nout vec4 o;void main(){o = ${OFFSET} + (vec4(v,1.0));}`,
    )
  } finally {
    Object.assign(RegExp.prototype, { exec: saved.exec })
    Object.assign(String.prototype, { indexOf: saved.indexOf, slice: saved.slice })
  }
})
