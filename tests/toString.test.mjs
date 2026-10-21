import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * 按 src/core/core.ts 的 newProxy 与 src/core/tasks.ts 的 .toString 钩子复现：
 * 代理注册到 myProxy，get 陷阱对 symbol.raw 返回原始对象
 */
const symbol = { raw: Symbol('RawValue') }
const myProxy = new WeakSet()

function useRaw(target) {
  if (target == null) return target
  let raw = target[symbol.raw]
  while (raw != null && myProxy.has(raw)) {
    raw = raw[symbol.raw]
  }
  return raw ?? target
}

function newProxy(target, handler) {
  const proxy = new Proxy(target, {
    ...handler,
    get(t, prop, receiver) {
      if (prop === symbol.raw) return t
      return Reflect.get(t, prop, receiver)
    },
  })
  myProxy.add(proxy)
  return proxy
}

function hookToString() {
  const rawToString = Function.prototype.toString
  Function.prototype.toString = newProxy(rawToString, {
    apply(target, self, args) {
      try {
        if (self != null && myProxy.has(self)) {
          const raw = useRaw(self)
          if (raw) return Reflect.apply(target, raw, args)
        }
        return Reflect.apply(target, self, args)
      } catch (e) {
        if (e && typeof e.stack === 'string') {
          const es = e.stack.split('\n')
          const applyIdx = es.findIndex((l, idx) => idx > 0 && l.includes('apply'))
          es.splice(applyIdx !== -1 ? applyIdx : 2, 1)
          e.stack = es.join('\n')
        }
        throw e
      }
    }
  })
  return () => { Function.prototype.toString = rawToString }
}

test('Function.prototype.toString: first caller keeps its own source', () => {
  const restore = hookToString()
  try {
    function pageFn() { return 42 }
    // 回归：页面第一个调用 toString 的函数不能被当成 toString 自身
    assert.equal(pageFn.toString(), 'function pageFn() { return 42 }')
    assert.equal(pageFn.toString(), 'function pageFn() { return 42 }')
    assert.equal(String(pageFn), 'function pageFn() { return 42 }')
  } finally {
    restore()
  }
})

test('Function.prototype.toString native spoofing and unwrap', () => {
  const restore = hookToString()
  try {
    // 原生方法被代理（含多层代理）
    const rawNative = Object.getOwnPropertyDescriptor(Date.prototype, 'getHours').value
    const proxyNative = newProxy(newProxy(rawNative, {}), {})

    // 1. 被代理的原生方法 toString 行为
    assert.equal(proxyNative.toString(), 'function getHours() { [native code] }')
    assert.equal(Function.prototype.toString.call(proxyNative), 'function getHours() { [native code] }')
    assert.equal(proxyNative.name, 'getHours')
    assert.equal(proxyNative.length, 0)

    // 2. Function.prototype.toString 自身的 toString 输出与元数据
    assert.equal(Function.prototype.toString.toString(), 'function toString() { [native code] }')
    assert.equal(Function.prototype.toString.call(Function.prototype.toString), 'function toString() { [native code] }')
    assert.equal(Function.prototype.toString.name, 'toString')
    assert.equal(Function.prototype.toString.length, 0)

    // 3. 非法 thisArg 的报错堆栈不暴露代理的 apply
    try {
      Function.prototype.toString.call({})
      assert.fail('Should throw TypeError')
    } catch (e) {
      assert.equal(e.name, 'TypeError')
      assert.ok(e.message.includes('Function.prototype.toString requires that \'this\' be a Function'))
      assert.ok(!e.stack.includes('apply'), 'Stack trace should not contain proxy apply frames')
    }
  } finally {
    restore()
  }
})
