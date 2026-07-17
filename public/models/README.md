# Equipment 3D Models

Supplier-neutral GLB equipment models used by `MicrogridScene`:

- `generic-pcs-mv-skid-5mw-v1.glb` — generic 5 MW / 33 kV PCS + MV
  transformer integrated skid, planning envelope `6.0 × 3.0 × 3.0 m`.
- `generic-main-transformer-50mva-33-220kv-v1.glb` — generic oil-immersed
  grid transformer with radiator banks, HV/LV bushings, conservator, OLTC,
  planning envelope `6.0 × 5.0 × 5.0 m`.

Format contract (pinned by `src/utils/modelAssets.test.ts`):

- glTF 2.0 binary, single embedded buffer, no external textures, no
  Draco/meshopt decoders — loadable by drei's `useGLTF` as-is.
- Metres, centre-ground anchor, static meshes.
- No supplier/brand strings anywhere in the JSON chunk.

Provenance: built with the parametric Blender pipeline in the (private)
`crashchen/switchyard` repo (`tools/blender/`). The copies here were
post-processed with an equal-length byte rename of the material
`gotion-orange` → `accent-orange` inside the JSON chunk; geometry, colors,
and chunk layout are untouched. To regenerate, rebuild in that repo and
re-apply the rename (or rename the spec in its `switchyard_materials.py`
before exporting).

Scene placement (scale, envelope) is configured in `SCENE_3D.models` in
`src/config.ts` — keep this README and that block in sync when adding models.
