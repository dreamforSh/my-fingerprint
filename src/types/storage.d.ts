type LocalStorage = {
  version: string
  config: LocalStorageConfig  // 配置
  policies: LocalStoragePolicies  // 策略
}

type LogLevelString = "DEBUG" | "INFO" | "WARN" | "ERROR" | "NONE";

type LocalStorageConfig = {
  enable: boolean
  // 种子
  seed: {
    browser: number
    global: number
  }
  // 指纹
  fp: HookFingerprint
  // 操作
  action: {
    fastInject: boolean
    ipInfo: {
      enable: boolean
      intervalMin: number
      enableTimezone: boolean
      enableLanguages: boolean
    }
    fonts: {
      enable: boolean
      allowlist: string[]
      blocklist: string[]
    }
    cloudflare: {
      enable: boolean  // 在 Cloudflare 验证页/Turnstile 组件上跳过注入，避免误伤真人验证
    }
  }
  // 输入
  input: {
    globalSeed: string
    ipInfo?: {
      ip: string
      countryCode: string
      timezone: string
      languages?: string[]
      createdAt: number
    }
  }
  // 订阅
  subscribe: {
    url: string
  }
  // 首选项
  prefs: {
    language: string
    theme: 'system' | 'light' | 'dark',
    logLevel: LogLevelString
  }
}

type LocalStoragePolicies = {
  whitelist: string[]
  blacklist: string[]
  isBlacklistMode: boolean  // 是否使用黑名单模式
}

type HookFingerprint = {
  navigator: {
    clientHints: DefaultHookMode | ValueHookMode<ClientHintsInfo>
    languages: DefaultHookMode | RandomHookMode | ValueHookMode<string[]>
    hardwareConcurrency: DefaultHookMode | RandomHookMode | ValueHookMode<number>
    deviceMemory: DefaultHookMode | ValueHookMode<number>
  }
  screen: {
    size: DefaultHookMode | RandomHookMode | ValueHookMode<ScreenSize>
    depth: DefaultHookMode | RandomHookMode | ValueHookMode<ScreenDepth>
  }
  normal: {
    gpuInfo: DefaultHookMode | ValueHookMode<GpuInfo>
  }
  other: {
    timezone: DefaultHookMode | ValueHookMode<TimeZoneInfo>
    canvas: DefaultHookMode | RandomHookMode
    canvasCjk: DefaultHookMode | EnableHookMode  // 阻止通过 Canvas 探测中文环境
    audio: DefaultHookMode | RandomHookMode
    webgl: DefaultHookMode | RandomHookMode
    webrtc: DefaultHookMode | EnableHookMode | DisableHookMode
    font: DefaultHookMode | RandomHookMode
    webgpu: DefaultHookMode | RandomHookMode
    domRect: DefaultHookMode | RandomHookMode
    emoji: DefaultHookMode | RandomHookMode
    serviceWorker: DefaultHookMode | DisableHookMode
    speech: DefaultHookMode | EnableHookMode | DisableHookMode  // enabled: 隐藏中文本地语音, disabled: 空列表
    battery: DefaultHookMode | EnableHookMode | DisableHookMode  // enabled: 伪装为接通电源, disabled: 拒绝访问
  }
}

type HookFingerprintKey = keyof HookFingerprint['navigator'] | keyof HookFingerprint['screen'] | keyof HookFingerprint['other'] | keyof HookFingerprint['normal']

type WindowStorage = {
  url: string
  host: string
  seed: number
  hooked: boolean
  browser?: BrowserType
}
