import { FingerprintContext, WIN_KEY } from "./core";
import { genRandomSeed, existParentDomain } from "@/utils/base";
import { getBrowser } from "@/utils/equipment";
import { sendToWindow } from "@/utils/message";
import { logManager } from '@/utils/log';
import { isCloudflareChallengeHost } from "./cloudflare";

const logger = logManager.createLogger(__LOG_PREFIX_FILE_PATH__);

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

    /**
     * Cloudflare 验证兼容：验证组件（Turnstile / Challenge）会检测环境是否被篡改。
     * 这类组件始终运行在 `challenges.cloudflare.com` 的独立 iframe 中，因此在该上下文中
     * 完全不介入（不设置全局标记、不注入钩子、不监听消息），把验证交还给浏览器与真人，
     * 同时不影响承载页面本身的指纹防护。
     */
    if (storage.config.action.cloudflare?.enable !== false) {
      let selfHost: string | undefined
      try { selfHost = window.location.hostname } catch (_) { }
      if (isCloudflareChallengeHost(selfHost)) {
        logger.debug('skip cloudflare challenge context:', selfHost);
        return;
      }
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

    if (window.top === window) {
      const data: WindowStorage = {
        url: location.href,
        host: location.hostname,
        seed: genRandomSeed(),
        hooked: false,
        browser: getBrowser(navigator.userAgent),
      }
      // @ts-ignore
      window[WIN_KEY] = data;
      window.addEventListener('message', ((ev) => {
        const msg = ev?.data?.__myfp__;
        if (!msg || !ev.source) return;
        if (msg.type === 'core.get-info') {
          sendToWindow(ev.source, {
            type: 'core.run',
            data,
          }, ev.origin)
        }
      }) as WindowMessage.Listener)
      hook(window, data)
      return;
    }

    try {
      /* 同源 */
      const top: any = window.top ?? window
      const data = top[WIN_KEY]
      hook(window, data)
    } catch (_) {
      /* 跨源 */
      window.addEventListener('message', ((ev) => {
        const msg = ev?.data?.__myfp__;
        if (msg?.type === 'core.run') {
          hook(window, msg.data)
        }
      }) as WindowMessage.Listener)
      sendToWindow(window.top ?? window, { type: 'core.get-info' })
    }
  }
  else if (typeof self !== "undefined") {
    const options = args.options;
    if (options) {
      FingerprintContext.hookWorker(self, options)
    }
  }
})()