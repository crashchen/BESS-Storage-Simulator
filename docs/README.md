# Documentation and Evidence

Use the [project README](../README.md) to run the demo and understand its limits,
and [CLAUDE.md](../CLAUDE.md) for contributor invariants. Dated records below are
historical evidence, not interchangeable claims about the current checkout.

## Current Release

[2026-10-11 review and release record](audits/2026-10-11/README.md): simulated-time chart,
development dependency patch, responsive HUD clearance and documentation cleanup.
The user supplied CC's final approval, including all three follow-ups, and
authorized squash merge on 2026-10-13. [PR #25](https://github.com/crashchen/BESS-Storage-Simulator/pull/25)
merged as `4ea9a58`; its tree matches reviewed head `06abd38`.
[Main CI](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/38399647078)
and [Pages](https://github.com/crashchen/BESS-Storage-Simulator/actions/runs/38399647051)
passed at that exact merge SHA. The 14 published files matched the local build.
The follow-up changes release documentation only and receives its own CI/Pages checks;
final follow-up SHA and run evidence are recorded in the Vault iteration log.

## Audit History

| Work | Record |
| --- | --- |
| Original deep audit / first hardening batch | [2026-09-08](audits/2026-09-08/README.md) |
| Value wording / sampled state | [Batch 2](audits/2026-09-19/batch-2.md) |
| Tick events / convergence | [Batch 3](audits/2026-09-19/batch-3.md) |
| Recovery / dependencies / release gates | [Batch 4](audits/2026-09-19/batch-4.md) |
| Shared equipment scale / scene access | [Batch 5](audits/2026-09-20/batch-5.md) |
| Preserve manual camera on resize | [Batch 6](audits/2026-09-22/batch-6.md) |
| Readable labels / flow legend / loading | [Batch 7](audits/2026-09-22/batch-7.md) |
| Three-part cumulative BESS value | [Batch 8](audits/2026-09-23/batch-8.md) |
| Conditional evening energy hold | [Batch 9](audits/2026-09-23/batch-9.md) |
| Tariff threshold explanation | [Batch 10](audits/2026-09-24/batch-10.md) |
| Numeric input Reset regression | [PR #18](audits/2026-09-25/numericfield-reset.md) |
| Short-landscape legend / Grid label | [PR #19](audits/2026-09-25/scene-legend-grid-label.md) |
| Card docking / equipment label hit areas | [PR #21 and later GPU report](audits/2026-09-25/pinned-card-pcs-label.md) |
| Compact summary / Solar label | [PR #24](audits/2026-10-03/compact-card-solar-label.md) |

The long pre-cleanup README and agent release narratives remain accessible in
[the immutable 891198b tree](https://github.com/crashchen/BESS-Storage-Simulator/tree/891198b30731637848148b9b26f279cfc37e34fc).
No historical audit or screenshot has been removed. Old test totals, audit counts,
device reports and CI run IDs describe their own dated commits only.

## Open Work

- Physical iOS/Android touch, browser-chrome resizing and native-GPU recovery acceptance.
- Promote selected browser smoke checks into a reproducible CI gate; current scripts use an external Playwright installation.
- Profile first before lazy-loading more 3D code or replacing the state architecture; the existing Three chunk warning is not an FPS measurement.
- Keep presets hidden until their individual narratives are revalidated. Sharing/screenshots, richer visuals and tutorials are optional product work, not release blockers.

Detailed project chronology and the cross-project roadmap also live in the user's
Obsidian housekeeping notes. Those are not bundled with the public application.
