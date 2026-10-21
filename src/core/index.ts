import { FingerprintContext } from "./core";
import { genRandomSeed, existParentDomain } from "@/utils/base";
import { getBrowser } from "@/utils/equipment";
import { logManager } from '@/utils/log';
import { isCloudflareChallengeContext } from "./cloudflare";
import {
  channelWinKey, derivePageSeed, initChannel, onChannelMessage, onContentEvent, postToWindow, relayNotice, sign,
  splitPayload,
} from "./channel";
import { defineProperty, fnToString, stringify } from "./intrinsics";

const logger = logManager.createLogger(__LOG_PREFIX_FILE_PATH__);

/**
 * 顶层窗口的源（ancestorOrigins 的最后一项），不可用或为不透明源时返回 undefined
 */
const topOriginOf = (ancestors?: DOMStringList): string | undefined => {
  if (!ancestors || !ancestors.length) return;
  const origin = ancestors[ancestors.length - 1]
  return origin && origin !== 'null' ? origin : undefined
}

/**
 * 源中的主机名（注入时调用，页面脚本尚未运行）
 */
const hostOfOrigin = (origin: string): string | undefined => {
  try {
    return new URL(origin).hostname || undefined
  } catch (_) { }
}

// @ts-ignore
const args = _args;

// ------------
// script entry
// ------------
(() => {
  const storage: LocalStorage | undefined = args.storage;

  let logLevel = storage?.config?.prefs?.logLevel as LogLevelString | undefined;

  if (!logLevel) {
    logger.warn("get logLevel from storage failed");
    logLevel = "INFO";
  }
  logManager.setLevel(logLevel);

  logger.debug("coreInject args", args);

  if (typeof window !== "undefined") {
    // @ts-ignore
    if (!args.fun && typeof coreInject === 'function') args.fun = coreInject;
    if (!window || !storage) return;

    /* 页面脚本运行前完成：注入 Worker 所需的源码与配置、通信标识 */
    if (typeof args.fun === 'function') {
      args.funSrc = fnToString(args.fun);
      args.funName = args.fun.name;
    }
    args.confJson = stringify(storage.config);
    initChannel(storage.channel, `${storage.config.seed.browser}:${storage.config.seed.global}`);
    const winKey = channelWinKey()!;

    /**
     * Cloudflare 验证兼容：验证组件（Turnstile / Challenge）会检测环境是否被篡改。
     * 验证上下文包括 `challenges.cloudflare.com` 的 iframe（及其子框架）与站点域名下的人机验证页，
     * 在其中完全不介入（不设置全局标记、不注入钩子、不监听消息），把验证交还给浏览器与真人，
     * 同时不影响承载页面本身的指纹防护。请求头的跳过见 background/request.ts。
     */
    if (storage.config.action.cloudflare?.enable !== false && isCloudflareChallengeContext(window)) {
      logger.debug('skip cloudflare challenge context:', location.href);
      return;
    }

    const hook = (win: Window & typeof globalThis, data: WindowStorage | undefined) => {
      if (!data) return;

      const ps = storage.policies;
      if (ps.isBlacklistMode) {
        if (!existParentDomain(ps.blacklist, data.host)) return;
        if (win.location.hostname !== data.host && !existParentDomain(ps.blacklist, win.location.hostname)) return;
      } else {
        if (existParentDomain(ps.whitelist, data.host)) return;
        if (win.location.hostname !== data.host && existParentDomain(ps.whitelist, win.location.hostname)) return;
      }

      try {
        FingerprintContext.hookWindow(win, {
          info: data,
          conf: storage.config,
          args,
        });
      } catch (_) { }
    }

    const browser = getBrowser(navigator.userAgent);

    if (window.top === window) {
      /* 页面标识可公开，页面种子由密钥与标识派生 */
      const loadId = '' + genRandomSeed();
      const data: WindowStorage = {
        host: location.hostname,
        loadId,
        seed: derivePageSeed(loadId),
        hooked: false,
        browser,
      }
      try {
        defineProperty(window, winKey, {
          value: data,
          writable: true,
          configurable: true,
          enumerable: false,
        });
      } catch (_) {
        // @ts-ignore
        window[winKey] = data;
      }

      /* 页面 CSP 是否允许把 URL Worker 换成 blob Worker（后台读取响应头，经内容脚本转交） */
      onContentEvent(':csp', (detail) => {
        if (detail === 'allow' || detail === 'deny') data.workerBlob = detail
      })

      onChannelMessage(window, (payload, source, origin) => {
        const parts = splitPayload(payload, 3);
        const type = parts[0], kind = parts[1], json = parts[2];
        if (type === 'get' && source) {
          /* 回复跨源 iframe：只含页面已知的信息与签名 */
          const body = data.host + '|' + loadId;
          postToWindow(source, 'run|' + body + '|' + sign('run|' + body), origin === 'null' ? '*' : origin);
        } else if (type === 'notice' && kind && json) {
          relayNotice(kind, json);
        }
      })
      hook(window, data)
      return;
    }

    try {
      /* 同源 */
      const top: any = window.top ?? window
      const data = top[winKey]
      hook(window, data)
    } catch (_) {
      /*
       * 跨源：能经 location.ancestorOrigins 同步得知顶层源时（Chrome）立即注入，iframe 自己的脚本运行前即受保护；
       * 页面种子无法同步取得，改由密钥与顶层源派生（同一会话、同一顶层站点内稳定）
       */
      const topOrigin = topOriginOf(location.ancestorOrigins)
      const topHost = topOrigin && hostOfOrigin(topOrigin)
      if (topHost) {
        const loadId = 'origin:' + topOrigin
        hook(window, {
          host: topHost,
          loadId,
          seed: derivePageSeed(loadId),
          hooked: false,
          browser,
        })
        return;
      }

      /* 否则（Firefox）向顶层取得页面信息后注入 */
      let done = false
      onChannelMessage(window, (payload) => {
        if (done) return;
        const parts = splitPayload(payload, 4);
        const type = parts[0], host = parts[1], loadId = parts[2], tag = parts[3];
        if (type !== 'run' || !loadId || tag !== sign('run|' + host + '|' + loadId)) return;
        done = true
        hook(window, {
          host,
          loadId,
          seed: derivePageSeed(loadId),
          hooked: false,
          browser,
        })
      })
      postToWindow(window.top ?? window, 'get')
    }
  }
  else if (typeof self !== "undefined") {
    const options = args.options;
    if (options) {
      FingerprintContext.hookWorker(self, options)
    }
  }
})()
