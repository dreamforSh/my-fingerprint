/**
 * background消息事件
 */
declare namespace BackgroundMessage {
  /**
   * 事件
   */
  type Event = {
    type: 'storage.import'
    storage: DeepPartial<LocalStorage>
    $: {
      ok: boolean
      messageKey?: string
      message?: string
      storage?: LocalStorage
    }
  } | {
    type: 'config.get'
    $?: LocalStorageConfig
  } | {
    type: 'config.set'
    config: DeepPartial<LocalStorageConfig>
  } | {
    type: 'policies.set'
    policies: LocalStoragePolicies
  } | {
    type: 'profiles.set'
    profiles: CustomProfile[]
  } | {
    type: 'version.latest'
    $?: string
  } | {
    type: 'site.cleanup'
    urls: string[]
    scope: 'cache' | 'all'
    $: {
      ok: boolean
      scope: 'cache' | 'all'
      messageKey?: string
      message?: string
    }
  } | {
    type: 'api.check'
    api: string
    $: boolean | string
  } | {
    type: 'badge.set'
    text: string
    level: 1 | 2
  } | {
    type: 'ip.refresh'
    $: LocalStorageConfig['input']['ipInfo']
  } | {
    /* 当前文档的 CSP 是否限制 Worker（由顶层框架的内容脚本询问） */
    type: 'csp.get'
    $: { known: boolean, restrictive: boolean }
  }

  type ResultField = '$'

  type Type = Event['type']

  type EventByType<T extends Type> = Extract<Event, { type: T }>

  type ParamByType<T extends Type> = EventByType<T> extends any
    ? Omit<EventByType<T>, ResultField>
    : EventByType<T>

  type ResultByType<T extends Type> = ResultField extends keyof EventByType<T>
    ? EventByType<T>[ResultField]
    : void;

  type Param<T extends Event> = T extends any ? Omit<T, ResultField> : never

  type Sender = <T extends BackgroundMessage.Type>(message: BackgroundMessage.ParamByType<T>)
    => Promise<BackgroundMessage.ResultByType<T>>

  type Listener = (
    msg: Param<Event>,
    sender: chrome.runtime.MessageSender,
    sendResponse: <T extends Type>(response: ResultByType<T>) => void,
  ) => boolean | void
}

/**
 * tab消息事件
 */
declare namespace TabMessage {
  /**
   * 事件
   */
  type Event = {
    type: 'notice.get.iframe'
    $: Record<string, number>
  } | {
    type: 'notice.get.fp'
    $: Record<string, number>
  }

  type ResultField = '$'

  type Type = Event['type']

  type EventByType<T extends Type> = Extract<Event, { type: T }>

  type ParamByType<T extends Type> = EventByType<T> extends any
    ? Omit<EventByType<T>, ResultField>
    : never

  type ResultByType<T extends Type> = ResultField extends keyof EventByType<T>
    ? EventByType<T>[ResultField]
    : void;

  type Sender = <T extends Type>(tabId: number, message: ParamByType<T>)
    => Promise<ResultByType<T>>

  type Param<T extends Event> = T extends any ? Omit<T, ResultField> : never

  type Listener = (
    msg: Param<Event>,
    sender: chrome.runtime.MessageSender,
    sendResponse: <T extends Type>(response: ResultByType<T>) => void,
  ) => boolean | void
}
