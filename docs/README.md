# Release History

Use the [project README](../README.md) to run the demo and [CLAUDE.md](../CLAUDE.md)
for contributor invariants. This page lists published releases only.

Dated audit records, screenshots and browser-check scripts up to 2026-11-17 were
removed from `main` to keep the repository small. They remain readable in the
[archived tree at `66a8a74`](https://github.com/crashchen/BESS-Storage-Simulator/tree/66a8a740770d1a1a8d55ba84b42940f1cad9b544/docs/audits).
Test totals below describe their own release commits only.

## Releases

| Date | PR → merge | Change | Tests | Record |
| --- | --- | --- | --- | --- |
| 2026-11-17 | #26 → `0f22291` | PCS/MV v2 model, explicit PCF shadows, day/night lighting | 340 / 26 files | [Release](https://github.com/crashchen/BESS-Storage-Simulator/blob/66a8a740770d1a1a8d55ba84b42940f1cad9b544/docs/audits/2026-11-17/README.md) · [PCS/MV](https://github.com/crashchen/BESS-Storage-Simulator/blob/66a8a740770d1a1a8d55ba84b42940f1cad9b544/docs/audits/2026-10-23/README.md) · [lighting](https://github.com/crashchen/BESS-Storage-Simulator/blob/66a8a740770d1a1a8d55ba84b42940f1cad9b544/docs/audits/2026-10-24-lighting/README.md) |
| 2026-10-13 | #25 → `4ea9a58` | Simulated-time chart axis, landscape HUD clearance, dependency patch | 302 / 25 | [Release](https://github.com/crashchen/BESS-Storage-Simulator/blob/66a8a740770d1a1a8d55ba84b42940f1cad9b544/docs/audits/2026-10-11/README.md) |
| 2026-10-03 | #24 → `fa2d493` | Short-landscape card summary, Solar label hiding | 282 / 23 | [Record](https://github.com/crashchen/BESS-Storage-Simulator/blob/66a8a740770d1a1a8d55ba84b42940f1cad9b544/docs/audits/2026-10-03/compact-card-solar-label.md) |
| 2026-09-25 | #21 → `0c03017` | Card docking, selectable PCS/BESS labels | 276 / 23 | [Record](https://github.com/crashchen/BESS-Storage-Simulator/blob/66a8a740770d1a1a8d55ba84b42940f1cad9b544/docs/audits/2026-09-25/pinned-card-pcs-label.md) |
| 2026-09-25 | #18, #19 | NumericField Reset; short-landscape legend and Grid label | 273 / 23 | [#18](https://github.com/crashchen/BESS-Storage-Simulator/blob/66a8a740770d1a1a8d55ba84b42940f1cad9b544/docs/audits/2026-09-25/numericfield-reset.md) · [#19](https://github.com/crashchen/BESS-Storage-Simulator/blob/66a8a740770d1a1a8d55ba84b42940f1cad9b544/docs/audits/2026-09-25/scene-legend-grid-label.md) |
| 2026-09-24 | #14, #16 | AUTO evening hold and its tariff threshold | 257 / 22, 260 / 22 | [Batch 9](https://github.com/crashchen/BESS-Storage-Simulator/blob/66a8a740770d1a1a8d55ba84b42940f1cad9b544/docs/audits/2026-09-23/batch-9.md) · [Batch 10](https://github.com/crashchen/BESS-Storage-Simulator/blob/66a8a740770d1a1a8d55ba84b42940f1cad9b544/docs/audits/2026-09-24/batch-10.md) |
| 2026-09-23 | #12 → `20dadaf` | Three-part cumulative BESS value | 230 / 21 | [Batch 8](https://github.com/crashchen/BESS-Storage-Simulator/blob/66a8a740770d1a1a8d55ba84b42940f1cad9b544/docs/audits/2026-09-23/batch-8.md) |
| 2026-09-22 | #7, #8, #10 | Equipment scale, camera on resize, labels/legend/loading | 221 / 21, 223 / 21 | [Batch 5](https://github.com/crashchen/BESS-Storage-Simulator/blob/66a8a740770d1a1a8d55ba84b42940f1cad9b544/docs/audits/2026-09-20/batch-5.md) · [6](https://github.com/crashchen/BESS-Storage-Simulator/blob/66a8a740770d1a1a8d55ba84b42940f1cad9b544/docs/audits/2026-09-22/batch-6.md) · [7](https://github.com/crashchen/BESS-Storage-Simulator/blob/66a8a740770d1a1a8d55ba84b42940f1cad9b544/docs/audits/2026-09-22/batch-7.md) |
| 2026-09-19 – 09-20 | #4, #5, #6 | First hardening, telemetry wording, tick convergence, recovery and release gates | 146 / 15 → 197 / 18 | [Audit](https://github.com/crashchen/BESS-Storage-Simulator/blob/66a8a740770d1a1a8d55ba84b42940f1cad9b544/docs/audits/2026-09-08/README.md) · [Batch 2](https://github.com/crashchen/BESS-Storage-Simulator/blob/66a8a740770d1a1a8d55ba84b42940f1cad9b544/docs/audits/2026-09-19/batch-2.md) · [3](https://github.com/crashchen/BESS-Storage-Simulator/blob/66a8a740770d1a1a8d55ba84b42940f1cad9b544/docs/audits/2026-09-19/batch-3.md) · [4](https://github.com/crashchen/BESS-Storage-Simulator/blob/66a8a740770d1a1a8d55ba84b42940f1cad9b544/docs/audits/2026-09-19/batch-4.md) |

Documentation-only follow-ups after a merge do not change the deployed app. The
pre-cleanup long README remains in [tree `891198b`](https://github.com/crashchen/BESS-Storage-Simulator/tree/891198b30731637848148b9b26f279cfc37e34fc).

## Open Work

- Native-GPU dawn capture (05:00–06:44), continuous camera-rotation flicker check and physical iOS/Android touch acceptance.
- Promote key browser smoke checks into a reproducible CI gate; the archived scripts used an external Playwright install.
- Profile before lazy-loading more 3D code; the Three chunk warning is not an FPS measurement.
- Presets stay hidden until each narrative is revalidated.
