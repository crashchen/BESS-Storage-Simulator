# 第四批：加载恢复与发布门禁

日期：2026-09-19。分支：`codex/audit-batch-4-recovery`。基线：第二、三批提交 `33ed745fc990d67a6e73f03bbc91155cf641e74a`，对应 [PR #5](https://github.com/crashchen/BESS-Storage-Simulator/pull/5)；该 PR 的 [CI](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35467702457) 已通过，尚未合并或部署。第四批保持独立分支，以 PR #5 为依赖提交评审；2026-09-20 用户转交的 CC 报告无阻塞项，后续收尾见 [复审记录](batch-4-review.md)。本代理未调用或调度 CC。线上仍为 PR #4 / `053c82c`。

## 本批交付

- 图表局部 ErrorBoundary 保留控制、模拟与历史；Retry 同时替换失败的 React.lazy 和 ErrorBoundary。生产故障注入证明，仅替换 lazy 不够：浏览器仍会保留失败的模块记录。新增 Rollup 发出的独立图表入口 URL，每次失败重试使用新的 `attempt` query，成功模块保留供抽屉再次打开复用。
- 开发模式显式预构建 Recharts（optimizeDeps.include），避免新入口首次加载才触发依赖发现和整页刷新。
- 图表和 Recharts/D3 的专用代码合为一个延迟入口，已加载的 React/R3F 与公共格式化函数仍共享。`build/telemetryChunk.ts` 在构建时检查：图表不在启动静态依赖图中，且它的全部外部静态依赖都属于已加载的启动图。这样重试不会再次落入另一个失败的图表依赖缓存。共享 formatTime 单独约 0.17 kB，图表约 352.94 kB。
- 根 AppErrorBoundary 捕获其子树的未处理渲染错误，显示可操作兜底；明确 Reload 会开始新模拟、旧运行不能恢复，不自动 reload。根边界不声称能捕获 React 启动前的入口下载失败、事件回调错误或任意异步错误。
- 3D 渲染/模型加载失败时，Retry 逐个清除三种设备的 `useGLTF` 单 URL 缓存键，再重建 Canvas；统一 URL helper 保证加载/预加载/清除都带相同 BASE_URL。不能一次 clear(URL数组)，因为那是不同的缓存键。该错误边界不能定位具体失败模型，因此会重新加载三种设备，包括先前成功的模型；这是恢复成本。单纯 WebGL context loss 不清成功模型缓存，沿用原状态保持和监听器清理。
- 删除未接通的 PerformanceMonitor/AdaptiveDpr 及死配置，保留原 DPR 1–2 上下限。不声称已实现 FPS 驱动降级或获得 GPU 性能提升。
- Node 固定为 `.nvmrc` 的 24.21.0 LTS，package engines 与 CI 一致；本机从官方包校验 SHA256 后使用临时运行时验证，未改用户全局 Node。
- 同一 deploy workflow 内先调用共享 CI 的 quality（npm ci → lint → test → build），再下载同一次 run 的 dist 上传 Pages；build/deploy 依赖 quality，不再独立重建未经过测试的发布包。PR 与 main CI 仍可独立运行，发布链自身有质量门禁。
- `npm audit fix --ignore-scripts` 仅做原 semver 范围内更新，未强制主版本升级：Vite 7.3.6、Vitest 4.1.11、fflate 0.8.3 / 0.6.11 等。随后 Node 24 下干净 npm ci、完整检查通过。

## 验收

以下为 2026-09-19 原验收；2026-09-20 补生产加载器回归后，Node 24 下 lint、**197 测试 / 18 文件**、Pages 子路径构建和 actionlint 通过。CC 的独立复跑使用 Node 26.8.2 / 196 测试，不混作 Node 24 证据。

- Node 24.21.0，`npm ci` 成功，lint / **196 测试、18 文件** / `BASE_URL=/BESS-Storage-Simulator/ npm run build` 全部 exit 0。
- `actionlint` 1.7.12 检查两个 workflow 通过。未在远端故意制造红色 quality run 或触发 Pages 发布；门禁依据明确 needs 图和静态检查，不能冒称完成远端失败注入。
- npm audit 全量及 `--omit=dev` 均 0 条公告命中；更新前 16（9 high、5 moderate、2 low）。[依赖快照](dependency-audit.json) 记录 lockfile 哈希及公告链接。这不是无漏洞证明，也不把更新前条目认作已可利用漏洞；主要 dev 工具公告涉及开发服务，生产 fflate 公告涉及畸形 ZIP 解压，当前 GLB 为自带资源且没有上传 ZIP 的产品路径。
- Three chunk 724.90 kB 提示仍在（Node 24 构建 gzip 187.61 kB；旧环境 186.40 kB 是历史结果）。Three Clock/PCFSoftShadowMap 弃用提示仍属于后续升级工作。

### 真实浏览器故障注入

使用构建产物与真实 Pages 子路径，本机 HTTP 服务对选定资源返回 503/no-store；通过真实 UI 操作，没有注入模拟状态或替换浏览器模块实现。

1. 图表入口 503：打开 Metrics 后仅图表出现 fallback，时钟和累计值继续变化。撤销 503，Retry 后图表出现且仍包含失败期间的历史，模拟没有回到 08:00/65%/€0。最初仅重建 lazy 的实现确实重试失败，因此补了独立入口与新 URL。
2. GLB 503：BESS 模型初次下载失败，显示 3D fallback；仍可将容量设为 600 MWh 并运行/暂停。网络继续失败时 Retry 再次局部失败；恢复网络后再次 Retry，三个 GLB 与场景恢复。前后 HUD 保持 **08:27 / Pause / 74% / 76.4 MW / +€5554**，自定义容量保留。App 集成测试另核对完整 state/history 严格相等，而不是只看这些舍入读数。
3. 图表重试已经在最终构建上重验；成功后关闭抽屉，再次阻断图表请求并重开，图表仍正常显示，确认成功模块复用。桌面 1280×720 场景截图确认模型恢复。尝试设置 390×844 时，本轮 IAB 实际 CSS 宽仍为 860，因此不将它记为手机验收；实测错误卡 clientWidth/scrollWidth 都为 304，无内部横向溢出。原第二批真实手机证据保持独立，第四批未新增成功的 390 CSS 视口证据。
4. Vite 开发模式点检通过：图表出现后仍 RUN、累计结果继续、自定义600MWh保留，没有加载error；已补Recharts预构建，避免入口对静态扫描不透明带来的首次依赖发现刷新。
5. 故障注入自然产生已预期的网络/加载 error；不宣称该过程 console 零 error。未注入真实 GPU context loss，原模拟事件回归仍在。

新增/扩展测试覆盖：拒绝的 lazy 可重试并接收最新 history、父状态保留；重复失败保留局部提示与 reload 数据丢失说明；根渲染兜底；GLB 失败清正确的三个键，真实 App/hook/reducer/history 在重试前后不变。构建依赖图检查和真实 HTTP 注入补足 mock 无法证明浏览器 module-map 行为的限制。

## 可复现检查与 CC 入口

```bash
node --version # 激活 Node 24.21.0 后检查；nvm 非必需，见 README Local Development
npm ci
npm run lint
npm test
BASE_URL=/BESS-Storage-Simulator/ npm run build
# 若本机已安装：actionlint
npm audit
npm audit --omit=dev
git diff 33ed745fc990d67a6e73f03bbc91155cf641e74a
git ls-files --others --exclude-standard
```

故障服务仅绑定 loopback，不改生产代码；结束后 Ctrl-C：

```bash
printf '%s' '{"fail":"telemetry-chart"}' > /tmp/bess-fault-mode.json
python3 docs/audits/2026-09-19/fault-server.py
# 浏览器访问 http://127.0.0.1:5178/BESS-Storage-Simulator/
# Start，打开 Metrics，等待图表 fallback；另一个终端撤销故障：
printf '%s' '{}' > /tmp/bess-fault-mode.json
# 点击 Retry chart，确认历史保留。
# GLB 场景改成下面的规则，再刷新测试页：
printf '%s' '{"fail":"generic-bess-5mwh"}' > /tmp/bess-fault-mode.json
```

旧部署已删除的 chunk、持久资源损坏或组件代码错误仍可能无法通过重试修复；界面明确提示需要 reload 时会清空运行。没有自动重载，也没有新增跨页持久化。

## 后续

第四批已收到用户安排的 CC 无阻塞复审；生产加载器自动化覆盖和不依赖 nvm 的复现说明已补齐。第二、三批 PR #5 待合并；第四批以该分支为 PR 基线，CI 扩展到所有 PR 目标分支，main push/Pages 范围不变。本批未发布。多日 AUTO 自消纳/峰段留电目标仍单独决策，见 [复审记录](cc-review.md)。累计价值拆项、手机相机构图、键盘设备选择、加载占位和其他持续体验项保留，未宣称审计 backlog 已全部清零。


实现依据：[React.lazy 的 Promise 缓存与错误边界](https://react.dev/reference/react/lazy)、[Rollup emitFile / ROLLUP_FILE_URL](https://rollupjs.org/plugin-development/#this-emitfile)、[Node 24.21.0 官方发布](https://github.com/nodejs/node/releases/tag/v24.21.0)。drei 的清缓存键语义另核对了当前安装版 `Gltf.js` / R3F `useLoader`，未仅依据在线最新文档。

Housekeeping：README、CLAUDE、审计状态和 vault 五篇随复审收尾同步；vault 分别记录已核验提交、工作树及线上 PR #4 / `053c82c`，不把未合并分支写成已部署。五篇写入前后均核对 SHA256，保留各批历史验收归属。
