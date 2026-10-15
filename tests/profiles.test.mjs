import test from 'node:test'
import assert from 'node:assert/strict'

test('profile data model and deep clone isolation', () => {
  const originalConfig = {
    enable: true,
    seed: { browser: 12345, global: 67890 },
    fp: {
      navigator: { clientHints: { type: 1, value: { platform: 'Windows' } } },
      other: { canvas: { type: 2 }, webgl: { type: 2 } }
    },
    action: { fastInject: true },
    prefs: { language: 'zh-CN', theme: 'system', logLevel: 'NONE' }
  }

  // 保存为快照
  const profile = {
    id: 'profile_test_1',
    name: 'Windows Test',
    createdAt: Date.now(),
    config: JSON.parse(JSON.stringify(originalConfig))
  }

  // 修改原对象，快照不受影响
  originalConfig.fp.navigator.clientHints.value.platform = 'macOS'
  assert.equal(profile.config.fp.navigator.clientHints.value.platform, 'Windows')

  // 模拟应用 profile 并保留当前运行环境 prefs 和 fastInject
  const currentRunningConfig = {
    enable: false,
    seed: { browser: 99999, global: 88888 },
    action: { fastInject: false },
    prefs: { language: 'en-US', theme: 'dark', logLevel: 'DEBUG' }
  }

  const nextConfig = JSON.parse(JSON.stringify(profile.config))
  if (currentRunningConfig.prefs) {
    nextConfig.prefs = { ...currentRunningConfig.prefs }
  }
  if (currentRunningConfig.action?.fastInject != null) {
    nextConfig.action.fastInject = currentRunningConfig.action.fastInject
  }

  // 验证生效值
  assert.equal(nextConfig.fp.navigator.clientHints.value.platform, 'Windows')
  assert.equal(nextConfig.prefs.language, 'en-US') // 保留
  assert.equal(nextConfig.prefs.theme, 'dark') // 保留
  assert.equal(nextConfig.action.fastInject, false) // 保留
})

test('profile list management operations: add, overwrite, rename, delete', () => {
  let profiles = []

  // 1. 添加预设
  const p1 = {
    id: 'p1',
    name: 'Profile 1',
    createdAt: 1000,
    config: { seed: { browser: 1 } }
  }
  profiles = [p1, ...profiles]
  assert.equal(profiles.length, 1)

  // 2. 覆盖更新预设
  const now = 2000
  const updatedConfig = { seed: { browser: 2 } }
  profiles = profiles.map(p => p.id === 'p1' ? { ...p, config: updatedConfig, updatedAt: now } : p)
  assert.equal(profiles[0].config.seed.browser, 2)
  assert.equal(profiles[0].updatedAt, 2000)

  // 3. 重命名预设
  profiles = profiles.map(p => p.id === 'p1' ? { ...p, name: 'Renamed Profile' } : p)
  assert.equal(profiles[0].name, 'Renamed Profile')

  // 4. 删除预设
  profiles = profiles.filter(p => p.id !== 'p1')
  assert.equal(profiles.length, 0)
})
