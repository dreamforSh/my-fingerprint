<p align="right"><b>简体中文</b> | <a href="./README_EN.md">English</a></p>

<p align="center">
  <img src="public/logo.png" width="96" height="96" alt="My Fingerprint" />
</p>

<h1 align="center">My Fingerprint</h1>

<p align="center">
  在网页脚本运行之前改写浏览器指纹，降低被跨站追踪与识别的风险。<br/>
  支持 Chrome、Edge 与 Firefox，基于 Manifest V3。
</p>

<p align="center">
  <a href="https://github.com/dreamforSh/my-fingerprint/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/dreamforSh/my-fingerprint?style=flat" /></a>
  <a href="https://github.com/dreamforSh/my-fingerprint/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/dreamforSh/my-fingerprint?style=flat" /></a>
  <a href="https://github.com/dreamforSh/my-fingerprint/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/dreamforSh/my-fingerprint?style=flat" /></a>
  <a href="https://github.com/dreamforSh/my-fingerprint/issues"><img alt="Issues" src="https://img.shields.io/github/issues/dreamforSh/my-fingerprint?style=flat" /></a>
</p>

<p align="center">
  <a href="#features"><img src="images/icons/features.svg" width="16" height="16" align="absmiddle" alt="" /> 功能</a> ·
  <a href="#fingerprint"><img src="images/icons/fingerprint.svg" width="16" height="16" align="absmiddle" alt="" /> 指纹</a> ·
  <a href="#how-it-works"><img src="images/icons/layers.svg" width="16" height="16" align="absmiddle" alt="" /> 原理</a> ·
  <a href="#installation"><img src="images/icons/download.svg" width="16" height="16" align="absmiddle" alt="" /> 安装</a> ·
  <a href="#configuration"><img src="images/icons/sliders.svg" width="16" height="16" align="absmiddle" alt="" /> 配置</a> ·
  <a href="#permissions"><img src="images/icons/lock.svg" width="16" height="16" align="absmiddle" alt="" /> 权限</a> ·
  <a href="#testing"><img src="images/icons/flask.svg" width="16" height="16" align="absmiddle" alt="" /> 测试</a> ·
  <a href="#development"><img src="images/icons/code.svg" width="16" height="16" align="absmiddle" alt="" /> 开发</a> ·
  <a href="#faq"><img src="images/icons/help.svg" width="16" height="16" align="absmiddle" alt="" /> 常见问题</a>
</p>

---

## <img src="images/icons/features.svg" width="22" height="22" align="absmiddle" alt="" /> 功能特点 <a id="features"></a>

- **开箱即用**：安装后按默认配置生效，不需要额外设置
- **逐项配置**：每项指纹都可以选择系统值、自定义值，或按标签页、浏览器启动、域名、全局种子生成随机值
- **覆盖完整**：注入所有框架（含跨源 iframe 与 `about:blank`）和 Worker（含通过 URL 加载的 Worker），请求头中的 User-Agent、Client Hints、Accept-Language 同步改写
- **难以察觉**：被改写的接口在 `toString`、属性描述符、原型链与报错调用栈上与原生一致，网页改写内置对象也无法关闭防护
- **访问记录**：查看当前网页读取了哪些指纹接口、加载了哪些内嵌框架
- **网站策略**：排除模式（白名单）或仅注入模式（黑名单），支持子域名匹配
- **配置管理**：保存多套配置方案并随时切换；支持文件或剪贴板导入导出、远程订阅与预设面板
- **IP 模块**：根据当前出口 IP 自动设置时区与语言
- **字体策略**：只让网页检测到允许的字体
- **Cloudflare 兼容**：在人机验证页与 Turnstile 组件上不改写指纹，避免验证反复失败
- 界面支持简体中文、English、한국어，提供浅色与深色主题

## <img src="images/icons/fingerprint.svg" width="22" height="22" align="absmiddle" alt="" /> 指纹保护 <a id="fingerprint"></a>

**强指纹**：唯一性高，修改后能明显打断追踪。

| 项目 | 处理方式 |
| --- | --- |
| Canvas | 读取像素、导出图片时加入噪音；可单独开启「阻止中文探测」，按未安装中文字体的系统处理 |
| WebGL | 片元着色器输出加入微小偏移，改变渲染结果 |
| Audio | 音频数据加入噪音 |
| WebGPU | 限制值、渲染通道清除色与写入缓冲的数据加入噪音 |
| Fonts | 元素尺寸与 Canvas 文本测量加入噪音 |
| DOMRect | 单行行内元素与 Range 的尺寸加入一个布局单位的噪音 |
| Emoji | 表情符号的绘制位置、测量结果与元素尺寸加入噪音 |
| WebRTC | 防泄露（屏蔽会暴露本机或真实出口 IP 的候选地址）或完全禁用 |
| 语音合成列表 | 隐藏中文本地语音，或返回空列表 |
| Service Worker | 可禁止网站注册 |

**弱指纹**：重复率高，多数情况下无需修改，按需开启。

| 项目 | 处理方式 |
| --- | --- |
| User-Agent / Client Hints | 同时改写 `navigator.userAgentData` 与请求头（Firefox 没有 Client Hints） |
| 语言 | `navigator.languages`、请求头 Accept-Language 与 Intl 的默认语言保持一致 |
| 时区 | `Date`、`Intl`、`Temporal` 统一按伪装时区计算，夏令时处理与浏览器一致 |
| 屏幕尺寸、色彩深度 | `matchMedia` 中的设备尺寸查询按伪装尺寸求值 |
| 图形驱动信息 | WebGL 的供应商与渲染器，WebGPU 适配器信息随之一致 |
| 逻辑处理器数量、设备内存 | 返回自定义或随机值 |
| 电池状态 | 伪装为接通电源，或拒绝访问 |

## <img src="images/icons/layers.svg" width="22" height="22" align="absmiddle" alt="" /> 工作原理 <a id="how-it-works"></a>

扩展在网页脚本运行之前，把核心脚本注入到网页的执行环境中，以代理改写相关接口：

- **注入时机**：快速注入模式使用 `userScripts` 在 `document_start` 注入；兼容模式由后台脚本在导航时注入。新建的 iframe 在网页能访问它之前即被注入，跨源 iframe 同步注入
- **Worker**：blob Worker 注入后再运行；通过 URL 加载的 Worker 在网页 CSP 允许时改为包装后的 blob Worker，脚本地址、相对路径解析与原生一致
- **一致性**：被改写的接口在 `Function.prototype.toString`、属性描述符、原型链、报错信息与调用栈上与原生一致；所有噪音由种子决定，同一网页内多次读取结果相同
- **抗篡改**：注入时缓存用到的原生方法，网页之后改写 `Error`、数组迭代器、`Object.defineProperty` 等无法让防护失效；扩展与网页之间的通信使用每次浏览器会话轮换的密钥，网页无法读取种子或伪造消息

基于 JS 注入的方案有其局限：样式表中的 `@media` 规则仍按真实屏幕尺寸匹配，在网页回调中执行 `new Error().stack` 也能看到注入脚本的帧。需要模拟完整环境时，请使用指纹浏览器。

## <img src="images/icons/download.svg" width="22" height="22" align="absmiddle" alt="" /> 安装 <a id="installation"></a>

从 [Releases](https://github.com/dreamforSh/my-fingerprint/releases/latest) 下载对应浏览器的扩展包：

| 文件 | 用途 |
| --- | --- |
| `my-fingerprint-chrome-<版本>.zip` | Chrome / Edge 手动安装 |
| `my-fingerprint-firefox-<版本>.zip` | Firefox 手动安装 |
| `my-fingerprint-chrome-webstore-<版本>.zip` | 提交到 Chrome 应用商店（去掉了 `update_url` 与 `key`） |

**Chrome / Edge**（102 及以上，推荐 120 及以上）

1. 解压扩展包
2. 打开 `chrome://extensions`（Edge 为 `edge://extensions`），开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择解压后的目录
4. 可选：在扩展详情中允许在无痕模式下运行

**Firefox**（136 及以上）

扩展包未经 Mozilla 签名：

- 正式版：在 `about:debugging#/runtime/this-firefox` 中点击「临时载入附加组件」，选择 zip 文件，重启浏览器后需重新载入
- Developer Edition / Nightly：在 `about:config` 中把 `xpinstall.signatures.required` 设为 `false`，把 zip 改名为 `.xpi` 后，在附加组件管理器中「从文件安装附加组件」

**开启快速注入**（推荐）

快速注入能在网页脚本之前完成注入，兼容性更好，需要浏览器授权运行用户脚本：

- Chrome 138+ / Edge 140+：在扩展详情页开启「允许运行用户脚本」
- Chrome / Edge 120+：开启开发者模式
- Firefox 136+：在扩展中授予权限

## <img src="images/icons/sliders.svg" width="22" height="22" align="absmiddle" alt="" /> 配置 <a id="configuration"></a>

点击扩展图标打开面板：

- **记录**：当前网页读取的指纹接口与加载的内嵌框架
- **配置**
  - 强指纹 / 弱指纹：逐项选择处理方式
  - 字体策略：只允许网页检测到列表中的字体
  - 脚本配置：全局种子（用于「根据全局种子随机值」）、快速注入、Cloudflare 兼容
  - 个性化：界面语言、主题、日志等级
  - 配置方案：在顶部工具栏保存当前配置，或切换到其他方案
- **IP**：根据当前出口 IP 自动配置时区与语言，可定时刷新
- **更多**
  - 网站策略：编辑排除列表或仅注入列表，`example.com` 同时匹配 `*.example.com`
  - 配置文件：导入导出、复制到剪贴板、从剪贴板导入
  - 订阅：手动或在扩展启动时拉取远程 JSON 配置，订阅内容会覆盖当前设置并合并网站列表；留空表示不订阅。模板见 [example/config/template.json](https://raw.githubusercontent.com/dreamforSh/my-fingerprint/main/example/config/template.json)
  - 预设面板：应用常用配置，或「已知问题列表」中针对特定网站的修复
  - 站点清理：清除当前网站的缓存，或重置站点数据

## <img src="images/icons/lock.svg" width="22" height="22" align="absmiddle" alt="" /> 权限说明 <a id="permissions"></a>

| 权限 | 用途 |
| --- | --- |
| `<all_urls>`、`scripting` | 向网页注入核心脚本 |
| `declarativeNetRequest` | 改写请求头中的 User-Agent、Client Hints 与 Accept-Language |
| `webRequest` | 只读取响应头中的 CSP，判断能否包装 URL 加载的 Worker，不修改请求 |
| `tabs`、`activeTab`、`webNavigation` | 按标签页应用网站策略与显示访问记录 |
| `privacy` | WebRTC 防泄露模式 |
| `storage`、`alarms` | 保存配置，定时刷新 IP 信息 |
| `userScripts`（可选） | 快速注入模式 |
| `browsingData`（可选） | 站点清理 |
| `clipboardRead`、`clipboardWrite`（可选） | 从剪贴板导入、复制配置 |

扩展不收集、不上传浏览数据。扩展自身发出的网络请求只有：

- 检查新版本、获取在线预设：请求 GitHub（`api.github.com`、`raw.githubusercontent.com`）
- IP 模块（开启后）：请求 `ip-api.com` 获取出口 IP 的时区与语言
- 订阅（填写地址后）：请求你填写的地址

## <img src="images/icons/flask.svg" width="22" height="22" align="absmiddle" alt="" /> 测试 <a id="testing"></a>

可以用以下网站检查效果：

- [CreepJS](https://abrahamjuliot.github.io/creepjs/)
- [browserleaks.com](https://browserleaks.com/)
- [browserscan.net](https://www.browserscan.net/)
- [webbrowsertools.com](https://webbrowsertools.com/)
- [yalala.com](https://www.yalala.com/)
- [uutool.cn](https://uutool.cn/browser/)

## <img src="images/icons/code.svg" width="22" height="22" align="absmiddle" alt="" /> 开发 <a id="development"></a>

需要 Node.js 22.18 及以上。

```bash
npm install
npm run dev            # Chrome / Edge，输出到 dist
npm run dev:firefox    # Firefox，输出到 dist-firefox
npm run build          # 类型检查并构建 Chrome / Edge 版本
npm run build:firefox  # 类型检查并构建 Firefox 版本
node --test tests/*.test.mjs
```

目录结构：

| 目录 | 内容 |
| --- | --- |
| `src/core` | 注入网页的核心脚本：各项指纹的改写、iframe 与 Worker 注入、调用栈清理等 |
| `src/background` | 后台脚本：配置存储、请求头规则、脚本注册、CSP 读取 |
| `src/scripts` | 内容脚本：在扩展与网页之间转发消息 |
| `src/popup` | 扩展面板（React） |
| `tests` | 核心纯函数模块的单元测试 |

推送 `v*` 标签会触发 [GitHub Actions](.github/workflows/build.yml) 构建 Chrome 与 Firefox 版本，Chrome 扩展包附在自动创建的草稿 Release 中，Firefox 与应用商店扩展包作为构建产物上传。

## <img src="images/icons/help.svg" width="22" height="22" align="absmiddle" alt="" /> 常见问题 <a id="faq"></a>

**某些网页不生效或出现异常怎么办？**

先开启快速注入模式。仍有异常时，可以把网站加入排除列表，或在预设面板中应用「已知问题列表」。

**为什么需要这个扩展？**

网站可以通过浏览器指纹在不同站点之间追踪同一个用户，即使清除了 Cookie 也一样。改写关键指纹能打断这种关联。

**和指纹浏览器有什么区别？**

指纹浏览器从浏览器内核层面模拟完整环境，适合多账号、反检测等场景。本扩展基于 JS 注入，轻量、易用，适合日常隐私保护。

**保护的指纹越多越好吗？**

不一定。多数情况下改写一项强指纹就足以打断追踪；改写过多可能影响网页功能，或让环境显得不自然。建议按需开启。

**强指纹和弱指纹有什么区别？**

强指纹唯一性高，修改后效果明显；弱指纹在大量用户中重复，通常保持系统值即可，避免影响兼容性。

**Firefox 中重启后扩展消失了？**

正式版 Firefox 只能临时载入未签名的扩展，重启后需要重新载入，或改用 Developer Edition / Nightly 长期安装。

## <img src="images/icons/warning.svg" width="22" height="22" align="absmiddle" alt="" /> 声明 <a id="disclaimer"></a>

本项目仅用于学习与隐私保护研究，请勿用于违法用途。使用本项目造成的任何后果由使用者自行承担。

## <img src="images/icons/heart.svg" width="22" height="22" align="absmiddle" alt="" /> 鸣谢 <a id="credits"></a>

本项目基于 [omegaee/my-fingerprint](https://github.com/omegaee/my-fingerprint) 开发，感谢原作者与所有贡献者。

以 [Apache License 2.0](./LICENSE) 开源。
