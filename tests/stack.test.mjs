import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'

import { guardTrap, stackRealmsOf } from '../src/core/stack.ts'

/*
 * 打包后注入脚本是单个文件：这里把处理器代码以 stack.ts 的文件名运行，扮演注入脚本，
 * 其帧应从报错调用栈中去掉；以 page.js 运行的代码扮演页面脚本，其帧应保留
 */
const OWN_FILE = new URL('../src/core/stack.ts', import.meta.url).href
const own = (src) => vm.runInThisContext(src, { filename: OWN_FILE })
const page = (src) => vm.runInThisContext(src, { filename: 'page.js' })

const realms = stackRealmsOf(Error)

/** 与 core.ts 一致：包装处理器的全部陷阱 */
const guarded = (handler) => {
  const res = Object.create(null)
  for (const key of Reflect.ownKeys(handler)) res[key] = guardTrap(handler[key], key, realms)
  return res
}

const run = page(`(function run(f, depth) {
  const step = (n) => n ? step(n - 1) : f()
  return step(depth || 0)
})`)

const stackOf = (f, depth) => {
  try {
    run(f, depth)
  } catch (e) {
    return e.stack
  }
  assert.fail('expected a throw')
}

/** 原生与钩取后在同一调用点取调用栈 */
const both = (fns, make, depth) => fns.map((fn) => stackOf(make(fn), depth))

test('apply trap: stack equals the native one', () => {
  const raw = Function.prototype.toString
  const hooked = new Proxy(raw, guarded(own(`({
    apply(target, self, args) {
      return Reflect.apply(target, self, args)
    },
  })`)))
  const [native, actual] = both([raw, hooked], page('(fn) => () => fn.call({})'))
  assert.equal(actual, native)
  assert.ok(!actual.includes(OWN_FILE))
})

test('non-call trap: drops builtins called inside the trap', () => {
  const fn = function target() { }
  /* 与 core.ts 一致：以普通函数调用 Object.setPrototypeOf 抛出成环错误 */
  const handler = guarded(own(`(() => {
    const setPrototypeOf = Object.setPrototypeOf
    return {
      setPrototypeOf(target, proto) {
        if (Object.getPrototypeOf(proto) === globalThis.__cyclicProxy) return setPrototypeOf(target, target)
        return Reflect.setPrototypeOf(target, proto)
      },
    }
  })()`))
  const proxy = globalThis.__cyclicProxy = new Proxy(fn, handler)
  try {
    const [native, actual] = both([fn, proxy], page('(p) => () => Object.setPrototypeOf(p, Object.create(p))'))
    assert.equal(actual, native)
    /* 只剩页面调用的那一帧（类型名随引擎版本为 Object 或 Function） */
    assert.match(actual.split('\n')[1], /^ {4}at \w+\.setPrototypeOf \(<anonymous>\)$/)
    assert.doesNotMatch(actual.split('\n')[2], /setPrototypeOf/)
  } finally {
    delete globalThis.__cyclicProxy
  }
})

test('deep page stacks keep stackTraceLimit page frames', () => {
  const raw = Function.prototype.toString
  const hooked = new Proxy(raw, guarded(own(`({
    apply: (target, self, args) => (() => (() => Reflect.apply(target, self, args))())(),
  })`)))
  const [native, actual] = both([raw, hooked], page('(fn) => () => fn.call(1)'), 30)
  assert.equal(actual.split('\n').length, Error.stackTraceLimit + 1)
  assert.equal(actual, native)
})

test('header follows the engine when the message changes after creation', () => {
  /* 新版 V8 以创建时的消息作首行，旧版在格式化时读取 message：均应与原生一致 */
  const native = stackOf(page(`() => {
    const e = new TypeError('short')
    e.message = 'long'
    throw e
  }`))
  const hooked = new Proxy(function f() { }, guarded(own(`({
    apply() {
      const e = new TypeError('short')
      e.message = 'long'
      throw e
    },
  })`)))
  const stack = stackOf(page('(fn) => () => fn()')(hooked))
  assert.equal(stack.split('\n')[0], native.split('\n')[0])
  assert.ok(!stack.includes(OWN_FILE))
})

test('page prepareStackTrace receives only page frames', () => {
  const hooked = new Proxy(Function.prototype.toString, guarded(own(`({
    apply: (target, self, args) => Reflect.apply(target, self, args),
  })`)))
  const prev = Error.prepareStackTrace
  Error.prepareStackTrace = (err, sites) => sites.map((s) => s.getFileName() ?? 'builtin')
  try {
    const files = stackOf(page('(fn) => () => fn.call({})')(hooked))
    assert.ok(Array.isArray(files))
    assert.ok(!files.includes(OWN_FILE), files.join())
    assert.deepEqual(files.slice(0, 4), ['builtin', 'page.js', 'page.js', 'page.js'])
  } finally {
    Error.prepareStackTrace = prev
  }
})

test('already formatted stacks and non-errors are left alone', () => {
  const formatted = new Error('x')
  const text = formatted.stack
  const thrown = { stack: 'custom' }
  const hooked = new Proxy(function f() { }, guarded(own(`({
    apply(_, __, [what]) {
      throw what
    },
  })`)))
  assert.throws(() => hooked(formatted), (e) => e === formatted && e.stack === text)
  assert.throws(() => hooked(thrown), (e) => e === thrown && e.stack === 'custom')
})

test('trap results pass through unchanged', () => {
  const hooked = new Proxy(function f() { }, guarded(own(`({
    apply: (_, self, args) => [self, ...args],
    get: (target, key) => key === 'answer' ? 42 : Reflect.get(target, key),
  })`)))
  assert.deepEqual(hooked.call(1, 2, 3), [1, 2, 3])
  assert.equal(hooked.answer, 42)
})
