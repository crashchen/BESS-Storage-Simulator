# Equipment 3D Models

Supplier-neutral GLB equipment models used by `MicrogridScene`:

- `generic-bess-5mwh-v1.glb` — representative generic 5 MWh liquid-cooled
  BESS container, planning envelope `6.1 × 2.9 × 2.44 m`.
- `generic-pcs-mv-skid-5mw-v1.glb` — generic 5 MW / 33 kV PCS + MV
  transformer integrated skid, planning envelope `6.0 × 3.0 × 3.0 m`.
- `generic-main-transformer-50mva-33-220kv-v1.glb` — generic oil-immersed
  grid transformer with radiator banks, HV/LV bushings, conservator, OLTC,
  planning envelope `6.0 × 5.0 × 5.0 m`.

Format contract (pinned by `src/utils/modelAssets.test.ts`):

- glTF 2.0 binary, single embedded buffer, no external textures, no
  Draco/meshopt decoders — loadable by drei's `useGLTF` as-is.
- Metres, centre-ground anchor, static meshes.
- None of the banned brand tokens (`BANNED_BRAND_TOKENS` in
  `src/utils/modelAssets.test.ts`) anywhere in the complete GLB byte stream.

Provenance: built with the parametric Blender pipeline in the (private)
`crashchen/switchyard` repo (`tools/blender/`). The PCS-MV and transformer
copies here were post-processed with an equal-length byte rename of the
material `gotion-orange` → `accent-orange` inside the JSON chunk; geometry,
colors, and chunk layout are untouched. The BESS copy is derived downstream
with `scripts/make_generic_bess_glb.py`: its standalone logo mesh, embedded
logo image, and brand metadata are removed, while the brand-colored detail is
renamed and recolored to neutral equipment blue. The source Switchyard asset
is never modified. The current BESS derivative comes from Switchyard commit
`7d22034`.

Each model is a **representative single unit** standing in for station-scale
equipment (the demo site runs up to 186 MW BESS interconnect / 288 MW PCC) —
info cards frame all telemetry as station-level aggregates rather than
single-unit ratings.

All three metre-scale assets use the shared `SCENE_3D.equipmentScale` (0.9).
Do not shrink an individual unit to fit an old placeholder's footprint; resize
its pad and move neighbouring equipment instead. The PCS-MV skid is comparable
in width and height to the BESS container. This preserves relative equipment
proportions, not a 1:1 layout or capacity claim for the entire site.

Files, planning envelopes and unit ratings are configured in `SCENE_3D.models`
in `src/config.ts`; placement and framing are in the same config. Small trims
can extend beyond the nominal planning envelope (the PCS GLB measures about
6.10 × 3.00 × 3.114 m including details), so check the actual GLB bounds when
fitting pads. Keep this README and the config in sync when adding models.
