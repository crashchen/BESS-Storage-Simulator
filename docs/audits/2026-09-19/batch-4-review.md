# 第四批 CC 复审与收尾

**发布更新（2026-09-20）**：PR #5 已合并为 `622f1e6`，PR #6 随后以 main 为目标合并为 `be9eb17`；[CI 35504681930](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35504681930) 和 [Pages 35504682035](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/35504682035) 成功，当前线上包含第二至第四批。下文保留开发/复审时的阶段状态；第五批本地工作另见 [新批次记录](../2026-09-20/batch-5.md)。

记录日期：2026-09-20。用户提供完整 CC 报告；本代理未调用、恢复或调度 CC。报告末尾混有第二、三批的旧复审内容，下面仅记录第四批的新结论，旧问题归属仍见 [第二、三批复审](cc-review.md)。

## 复审结论与证据归属

CC 结论：第四批没有阻塞项，可以提交评审。其独立复跑为 Node **26.8.2** 下 lint、196 测试 / 18 文件、Pages 子路径构建通过，依赖 audit 全量/生产均 0。这不替代 Codex 在 Node **24.21.0** 的原始验证。

用户报告还确认了以下对抗性检查：让图表实际进入启动静态依赖图、给图表增加尚未加载的独立静态依赖，分别触发构建门禁；在插件中加入类型错误会被 tsc 拒绝。真实浏览器 503 下，图表使用 attempt=0/1 恢复并复用成功模块，GLB 持续失败/撤销失败后的重试保留容量与运行读数。以上为用户提供的独立证据；Codex 上一轮的浏览器记录见 [第四批原验收](batch-4.md)，本轮未重做浏览器故障注入。

CC 未独立运行 actionlint 或 Node 24，也未实跑远端 reusable workflow 的 artifact 交接；本轮亦不将静态门禁检查冒称已完成 Pages 发布。390 CSS 视口和真实 GPU 故障的原有限制保持不变。

## 本轮收尾

1. **P2 自动化缺口已补。** `Recovery.test.tsx` 不传 `load` prop，直接走生产 `loadChart`。只替换原生动态 import 的底层传输函数与虚拟资产 URL，检查 Pages 子路径、既有 query 保留、两次失败后 attempt=0/1/2、最新 history，以及卸载/重开后复用成功模块且不再 import。没有把生产 URL/cache 算法复制进测试替身。`importTelemetryChart.ts` 只承接原先的原生 import；URL 与成功缓存仍由原加载器管理。
2. **反向验证已完成。** 临时删掉 `url.searchParams.set('attempt', ...)` 后，只运行新增用例会在 URL 断言处失败：期望 0/1/2，实际得到三个相同的 URL。随后逐字恢复源文件，再跑完整验收通过。此测试保护加载器决策；浏览器自身缓存行为仍由真实 HTTP 注入证据支持。
3. **P3 环境说明已修。** README 与 vault 操作指南先说明 Node 24.21.0，可用已有版本管理器或官方包的 bin/PATH；nvm 变为可选。保留 engines 的 Node 24 支持范围，没有因 Node 26 上一次通过就扩大支持声明，也没有替换本机全局 Node。
4. **GLB 恢复成本已记。** 渲染错误无法定位单个失败资产，重试会清除全部三个 URL，包括成功资产；context loss 不清成功缓存。CC 报告的偶发额外请求不在本轮复现范围，不据此确定竞态根因。
5. **独立 PR 仍有 CI。** 当时 PR #5 尚未合并，第四批以其分支为评审基线；现在两者已合并，见页首更新。CI 的 pull_request 不再限制目标为 main，使这种依赖 PR 也执行检查；push 及 Pages 自动发布仍仅监听 main。

## 收尾验收

2026-09-20，Node 24.21.0：lint、**197 测试 / 18 文件**、`BASE_URL=/BESS-Storage-Simulator/ npm run build`、actionlint 1.7.12 全部 exit 0。新增用例可单独运行：

```bash
npm test -- src/components/Recovery.test.tsx -t 'fresh production loader URLs'
```

使用 README 中的 Node 激活方式后执行。产物图表 352.94 kB、app-shared 0.17 kB、Three 724.90 kB（gzip 187.61 kB）；Three 体积提示保留。依赖未在本轮改动，audit 零条与 clean npm ci 的快照仍归属 2026-09-19。

提交复审时，README、CLAUDE、原审计实施状态及 vault 五篇同步该轮收尾；当时第二至第四批未合并/部署，线上为 PR #4 / `053c82c`。现已发布，见页首更新。多日 AUTO 留电策略、累计价值拆项继续单独排期；手机相机和键盘设备选择已在第五批工作树完成，待用户复审。
