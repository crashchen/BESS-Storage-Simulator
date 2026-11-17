# PR #26 合并与发布核验

2026-11-17 19:21:15 CET，PR #26 从 `claude/pcs-v2-night-lighting` 向 `main` squash 合并。本次发布包含 PCS/MV v2 模型、显式 PCF 阴影和连续的晨昏照明。[PR #26](https://github.com/crashchen/BESS-Storage-Simulator/pull/26)

| 核验项 | 结果 |
| --- | --- |
| PR head | `c78c85e957b178e6cef52aa6fcfaaf002909136c`，合并前以该完整 SHA 限定操作 |
| 合并 SHA | [`0f22291f90e7bc62eaaaec122582410aee3f64ba`](https://github.com/crashchen/BESS-Storage-Simulator/commit/0f22291f90e7bc62eaaaec122582410aee3f64ba) |
| 单一父提交 | `c10efb04673041822edbb1547e7e31c2b4ae5623`，为合并前 `main` |
| 文件树 | `9eb80bd461a598646ff3e44b941b89e80aa911a7`，与 PR head 的树相同 |
| squash 说明 | 保留三个原始提交的说明，Codex 与 Claude Opus 5.5 的 `Co-authored-by` 署名各一次 |
| PR CI | [`44146309413`](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/44146309413) 在 `c78c85e` 上通过 |
| main CI | [`44146919391`](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/44146919391) 在 `0f22291` 上完成，结论 `success`，19:23:05 CET |
| Pages | [`44146919846`](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/44146919846) 在 `0f22291` 上完成，结论 `success`，19:23:35 CET |
| 远端与本地 | `main` 和 `origin/main` 均核验到 `0f22291`，本地由原 `main` 快进 |

main CI 和 Pages 的质量任务均使用 Node 24.21.0，lint、340 个测试（26 个文件）、类型检查与构建通过。Pages 质量任务以 `/BESS-Storage-Simulator/` 为构建基路径，`dist` 产物 ID 为 `14357107179`。打包任务生成 Pages 产物 `14357381632`。GitHub Deployments API 记录部署 `7862294754`，环境为 `github-pages`，提交为 `0f22291f90e7bc62eaaaec122582410aee3f64ba`，19:23:36 CET 确认成功。[线上演示](https://crashchen.github.io/BESS-Storage-Simulator/)

19:24:27 CET 逐文件核对线上站点，14 个文件均返回 HTTPS HTTP 200，SHA256 与同次运行的 `dist` 和 Pages 打包内容一致。范围包括入口 HTML、JS、CSS、模型说明和 3 个 GLB。线上 PCS/MV v2 GLB 的 SHA256 为 `3fd747a9e03d0df819b685b9c0bb49b6e38b7cbe898d295dc5860f10836e0a5c`。[部署产物和逐文件核验](pages-verification.json)

用户提供的 CC 复审和浏览器证据保留在原日期记录。参考 [PCS/MV v2 审计](../2026-10-24/README.md)、[照明审计](../2026-10-24-lighting/README.md)和 [CC 复审与颜色常量收口](../2026-10-24-lighting/cc-followup/README.md)。

## 人工验收待办

- [ ] 05:00–06:44 的原生 GPU 截图。
- [ ] 连续转动相机时的闪烁检查。
- [ ] 实体手机测试。
