<p align="right"><a href="./README.md">简体中文</a> | <b>English</b></p>

<p align="center">
  <img src="public/logo.png" width="96" height="96" alt="My Fingerprint" />
</p>

<h1 align="center">My Fingerprint</h1>

<p align="center">
  Rewrites browser fingerprints before page scripts run, making cross-site tracking and identification harder.<br/>
  Supports Chrome, Edge and Firefox. Built on Manifest V3.
</p>

<p align="center">
  <a href="https://github.com/dreamforSh/my-fingerprint/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/dreamforSh/my-fingerprint?style=flat" /></a>
  <a href="https://github.com/dreamforSh/my-fingerprint/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/dreamforSh/my-fingerprint?style=flat" /></a>
  <a href="https://github.com/dreamforSh/my-fingerprint/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/dreamforSh/my-fingerprint?style=flat" /></a>
  <a href="https://github.com/dreamforSh/my-fingerprint/issues"><img alt="Issues" src="https://img.shields.io/github/issues/dreamforSh/my-fingerprint?style=flat" /></a>
</p>

<p align="center">
  <a href="#features"><img src="images/icons/features.svg" width="16" height="16" align="absmiddle" alt="" /> Features</a> ·
  <a href="#fingerprint"><img src="images/icons/fingerprint.svg" width="16" height="16" align="absmiddle" alt="" /> Fingerprints</a> ·
  <a href="#how-it-works"><img src="images/icons/layers.svg" width="16" height="16" align="absmiddle" alt="" /> How it works</a> ·
  <a href="#installation"><img src="images/icons/download.svg" width="16" height="16" align="absmiddle" alt="" /> Installation</a> ·
  <a href="#configuration"><img src="images/icons/sliders.svg" width="16" height="16" align="absmiddle" alt="" /> Configuration</a> ·
  <a href="#permissions"><img src="images/icons/lock.svg" width="16" height="16" align="absmiddle" alt="" /> Permissions</a> ·
  <a href="#testing"><img src="images/icons/flask.svg" width="16" height="16" align="absmiddle" alt="" /> Testing</a> ·
  <a href="#development"><img src="images/icons/code.svg" width="16" height="16" align="absmiddle" alt="" /> Development</a> ·
  <a href="#faq"><img src="images/icons/help.svg" width="16" height="16" align="absmiddle" alt="" /> FAQ</a>
</p>

---

## <img src="images/icons/features.svg" width="22" height="22" align="absmiddle" alt="" /> Features <a id="features"></a>

- **Works out of the box**: takes effect with the default configuration right after installation
- **Per-item control**: every fingerprint can use the system value, a custom value, or a random value per tab, per browser launch, per domain or from a global seed
- **Complete coverage**: injected into every frame (including cross-origin iframes and `about:blank`) and every Worker (including Workers loaded from a URL); the User-Agent, Client Hints and Accept-Language request headers are rewritten to match
- **Hard to detect**: hooked APIs match native ones in `toString`, property descriptors, prototype chains and error stacks, and pages cannot switch the protection off by tampering with built-ins
- **Access log**: see which fingerprint APIs the current page read and which frames it loaded
- **Site policies**: exclude mode (whitelist) or inject-only mode (blacklist), with subdomain matching
- **Configuration management**: save several configuration profiles and switch between them; import and export via file or clipboard, remote subscriptions and a preset panel
- **IP module**: sets the timezone and languages from your current public IP
- **Font policy**: lets pages detect only the fonts you allow
- **Cloudflare compatibility**: leaves Cloudflare challenge pages and the Turnstile widget untouched so verification does not keep failing
- Interface in 简体中文, English and 한국어, with light and dark themes

## <img src="images/icons/fingerprint.svg" width="22" height="22" align="absmiddle" alt="" /> Fingerprint protection <a id="fingerprint"></a>

**Strong fingerprints** are highly unique; changing them breaks tracking effectively.

| Item | How it is handled |
| --- | --- |
| Canvas | Noise when reading pixels or exporting images; "Block CJK detection" can be enabled on its own and behaves like a system without CJK fonts |
| WebGL | A tiny offset on fragment shader output changes the rendering result |
| Audio | Noise in audio data |
| WebGPU | Noise in limits, render pass clear colors and data written to buffers |
| Fonts | Noise in element sizes and Canvas text metrics |
| DOMRect | One layout unit of noise on single-line inline elements and Ranges |
| Emoji | Noise in emoji drawing position, text metrics and element sizes |
| WebRTC | Leak prevention (hides candidates that expose local or real public IPs) or fully disabled |
| Speech voices | Hide local CJK voices, or return an empty list |
| Service Worker | Can block sites from registering one |

**Weak fingerprints** are shared by many users; usually there is no need to change them. Enable as needed.

| Item | How it is handled |
| --- | --- |
| User-Agent / Client Hints | Also rewrites `navigator.userAgentData` and request headers (Firefox has no Client Hints) |
| Languages | `navigator.languages`, the Accept-Language header and Intl's default locale stay consistent |
| Timezone | `Date`, `Intl` and `Temporal` all use the spoofed timezone, with DST handled like the browser |
| Screen size, color depth | Device-size queries in `matchMedia` follow the spoofed size |
| Graphics driver info | WebGL vendor and renderer; WebGPU adapter info follows them |
| Logical processors, device memory | Custom or random values |
| Battery status | Pretend to be plugged in, or deny access |

## <img src="images/icons/layers.svg" width="22" height="22" align="absmiddle" alt="" /> How it works <a id="how-it-works"></a>

The extension injects its core script into the page's own execution environment before page scripts run, and rewrites the relevant APIs with proxies:

- **Injection timing**: fast injection mode uses `userScripts` at `document_start`; compatibility mode injects from the background script on navigation. New iframes are injected before the page can access them, and cross-origin iframes are injected synchronously
- **Workers**: blob Workers are injected before they run; Workers loaded from a URL are replaced with a wrapping blob Worker when the page's CSP allows it, with the script address and relative URL resolution behaving like native
- **Consistency**: hooked APIs match native ones in `Function.prototype.toString`, property descriptors, prototype chains, error messages and call stacks; all noise is derived from seeds, so repeated reads on a page give the same result
- **Tamper resistance**: the native methods the hooks need are cached at injection, so pages later replacing `Error`, the array iterator, `Object.defineProperty` and so on cannot disable the protection; the extension talks to pages with a secret rotated every browser session, so pages cannot read seeds or forge messages

JS injection has limits: `@media` rules in stylesheets still match the real screen size, and `new Error().stack` run inside a page callback can still show frames from the injected script. Use a fingerprint browser when you need a fully emulated environment.

## <img src="images/icons/download.svg" width="22" height="22" align="absmiddle" alt="" /> Installation <a id="installation"></a>

Download the package for your browser from [Releases](https://github.com/dreamforSh/my-fingerprint/releases/latest):

| File | Use |
| --- | --- |
| `my-fingerprint-chrome-<version>.zip` | Manual install on Chrome / Edge |
| `my-fingerprint-firefox-<version>.zip` | Manual install on Firefox |
| `my-fingerprint-chrome-webstore-<version>.zip` | Submission to the Chrome Web Store (`update_url` and `key` removed) |

**Chrome / Edge** (102 or later, 120 or later recommended)

1. Unzip the package
2. Open `chrome://extensions` (`edge://extensions` on Edge) and turn on Developer mode
3. Click "Load unpacked" and select the unzipped folder
4. Optional: allow the extension in Incognito / InPrivate from its details page

**Firefox** (136 or later)

The package is not signed by Mozilla:

- Release Firefox: open `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on" and select the zip; it has to be loaded again after a restart
- Developer Edition / Nightly: set `xpinstall.signatures.required` to `false` in `about:config`, rename the zip to `.xpi`, then use "Install Add-on From File" in the add-ons manager

**Enable fast injection** (recommended)

Fast injection finishes before page scripts run and is more compatible. The browser has to allow user scripts:

- Chrome 138+ / Edge 140+: turn on "Allow user scripts" on the extension details page
- Chrome / Edge 120+: turn on Developer mode
- Firefox 136+: grant the permission in the extension

## <img src="images/icons/sliders.svg" width="22" height="22" align="absmiddle" alt="" /> Configuration <a id="configuration"></a>

Click the extension icon to open the panel:

- **Record**: fingerprint APIs read and frames loaded by the current page
- **Config**
  - Strong / weak fingerprints: choose how each item is handled
  - Font policy: only let pages detect the fonts in the list
  - Script settings: global seed (used by "Random by global seed"), fast injection, Cloudflare compatibility
  - Preferences: interface language, theme, log level
  - Profiles: save the current configuration or switch to another profile from the toolbar at the top
- **IP**: set the timezone and languages from your current public IP, with periodic refresh
- **More**
  - Site policies: edit the exclude list or the inject-only list; `example.com` also matches `*.example.com`
  - Configuration file: import, export, copy to and import from the clipboard
  - Subscription: fetch a remote JSON configuration manually or when the extension starts; it overrides current settings and merges site lists; leave it empty to disable. See the template at [example/config/template.json](https://raw.githubusercontent.com/dreamforSh/my-fingerprint/main/example/config/template.json)
  - Preset panel: apply common configurations, or site-specific fixes from the "Known issues" list
  - Site cleanup: clear the current site's cache or reset its data

## <img src="images/icons/lock.svg" width="22" height="22" align="absmiddle" alt="" /> Permissions <a id="permissions"></a>

| Permission | Purpose |
| --- | --- |
| `<all_urls>`, `scripting` | Inject the core script into pages |
| `declarativeNetRequest` | Rewrite the User-Agent, Client Hints and Accept-Language request headers |
| `webRequest` | Read only the CSP response headers to decide whether URL Workers can be wrapped; requests are not modified |
| `tabs`, `activeTab`, `webNavigation` | Apply site policies per tab and show the access log |
| `privacy` | WebRTC leak prevention |
| `storage`, `alarms` | Store the configuration and refresh IP info periodically |
| `userScripts` (optional) | Fast injection mode |
| `browsingData` (optional) | Site cleanup |
| `clipboardRead`, `clipboardWrite` (optional) | Import from and copy configurations to the clipboard |

The extension does not collect or upload browsing data. The only network requests it makes itself are:

- Checking for new versions and fetching online presets: GitHub (`api.github.com`, `raw.githubusercontent.com`)
- IP module (when enabled): `ip-api.com`, for the timezone and languages of your public IP
- Subscription (when an address is set): the address you entered

## <img src="images/icons/flask.svg" width="22" height="22" align="absmiddle" alt="" /> Testing <a id="testing"></a>

Check the results on these sites:

- [CreepJS](https://abrahamjuliot.github.io/creepjs/)
- [browserleaks.com](https://browserleaks.com/)
- [browserscan.net](https://www.browserscan.net/)
- [webbrowsertools.com](https://webbrowsertools.com/)
- [yalala.com](https://www.yalala.com/)
- [uutool.cn](https://uutool.cn/browser/)

## <img src="images/icons/code.svg" width="22" height="22" align="absmiddle" alt="" /> Development <a id="development"></a>

Requires Node.js 22.18 or later.

```bash
npm install
npm run dev            # Chrome / Edge, output in dist
npm run dev:firefox    # Firefox, output in dist-firefox
npm run build          # type-check and build for Chrome / Edge
npm run build:firefox  # type-check and build for Firefox
node --test tests/*.test.mjs
```

Project layout:

| Directory | Contents |
| --- | --- |
| `src/core` | Core script injected into pages: fingerprint hooks, iframe and Worker injection, stack cleaning |
| `src/background` | Background script: configuration storage, request header rules, script registration, CSP reading |
| `src/scripts` | Content script relaying messages between the extension and pages |
| `src/popup` | Extension panel (React) |
| `tests` | Unit tests for the pure core modules |

Pushing a `v*` tag triggers [GitHub Actions](.github/workflows/build.yml) to build the Chrome and Firefox versions. The Chrome package is attached to an automatically created draft release; the Firefox and Web Store packages are uploaded as build artifacts.

## <img src="images/icons/help.svg" width="22" height="22" align="absmiddle" alt="" /> FAQ <a id="faq"></a>

**What if some pages don't work or behave oddly?**

Turn on fast injection first. If problems remain, add the site to the exclude list, or apply the "Known issues" list from the preset panel.

**Why do I need this extension?**

Sites can use browser fingerprints to follow the same user across sites, even after cookies are cleared. Changing key fingerprints breaks that link.

**How is this different from a fingerprint browser?**

A fingerprint browser emulates a complete environment at the engine level and suits multi-account or anti-detection work. This extension uses JS injection; it is lightweight and easy to use, and suits everyday privacy protection.

**Is protecting more fingerprints always better?**

No. Changing one strong fingerprint is usually enough to break tracking; changing too much can break sites or make the environment look unnatural. Enable items as needed.

**What's the difference between strong and weak fingerprints?**

Strong fingerprints are highly unique, so changing them has a clear effect. Weak fingerprints are shared by many users and are usually best left at system values to avoid compatibility issues.

**The extension disappeared after restarting Firefox?**

Release Firefox can only load unsigned extensions temporarily; load it again after restarting, or install it permanently on Developer Edition / Nightly.

## <img src="images/icons/warning.svg" width="22" height="22" align="absmiddle" alt="" /> Disclaimer <a id="disclaimer"></a>

This project is for learning and privacy research only. Do not use it for illegal purposes. You are responsible for any consequences of using it.

## <img src="images/icons/heart.svg" width="22" height="22" align="absmiddle" alt="" /> Credits <a id="credits"></a>

Based on [omegaee/my-fingerprint](https://github.com/omegaee/my-fingerprint). Thanks to the original author and all contributors.

Licensed under the [Apache License 2.0](./LICENSE).
