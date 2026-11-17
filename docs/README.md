# Documentation and Evidence

Use the [project README](../README.md) to run the demo and understand its limits,
and [CLAUDE.md](../CLAUDE.md) for contributor invariants. Dated records below are
historical evidence, not interchangeable claims about the current checkout.

## PCS/MV Review Records

[2026-10-23 PCS/MV rebuild](audits/2026-10-23/README.md): independent generic
asset, open transformer guards, solid cabinets, shadow correction and scoped
documentation housekeeping. [2026-10-24 CC follow-up](audits/2026-10-24/README.md)
records the supplied review, strengthened geometry tests and rebuilt asset.
Dated records distinguish reviewed code, subsequent fixes and deployment;
this index does not duplicate transient workflow status.

## Day/Night Lighting

[2026-10-24 lighting follow-up](audits/2026-10-24-lighting/README.md) records the
explicit PCF shadow setting, night fill and continuous dawn/dusk lighting.
It separates combined-light model checks, controlled browser fixtures, live
simulation smoke checks and the remaining native-device visual acceptance.
The [subsequent CC review and colour-constant cleanup](audits/2026-10-24-lighting/cc-followup/README.md)
records the user-supplied approval, native-GPU coverage and the narrowly scoped
local follow-up; the earlier evidence remains frozen at its original state.

## Published Releases

[2026-11-17 PR #26 release record](audits/2026-11-17/README.md) covers the PCS/MV
v2 model, explicit PCF shadow selection, day/night lighting and Pages release
from `0f22291`. The dated record lists the checks and open visual acceptance work.

[2026-10-11 PR #25 review and release record](audits/2026-10-11/README.md) covers
the simulated-time chart, dependency patch, responsive HUD clearance and
documentation cleanup. The release history includes squash commit `4ea9a58`
and documentation follow-up `c10efb0`.

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
