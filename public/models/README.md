# Equipment 3D Models

Supplier-neutral GLB equipment models used by `MicrogridScene`:

- `generic-bess-5mwh-v1.glb` — representative generic 5 MWh liquid-cooled
  BESS container, planning envelope `6.1 × 2.9 × 2.44 m`.
- `generic-pcs-mv-skid-5mw-v2.glb` — generic 5 MW / 33 kV PCS + MV
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

## Provenance and Rebuilding

- **PCS/MV v2:** rebuilt in this repo with
  `scripts/build_generic_pcs_mv_skid.py`; no private files or upstream imports
  required. Full-depth PCS cabinets, visible transformer/radiators/bushings,
  open geometric safety mesh, louvred MV doors and a closed structural roof.
  The old v1 binary is retired from the public bundle, preserved in Git.
- **BESS:** downstream derivative of Switchyard `7d22034`, built with
  `scripts/make_generic_bess_glb.py`. Removes the standalone logo mesh,
  embedded image and brand metadata; recolors the accent to equipment blue.
- **Main transformer:** copied from Switchyard; the original generic geometry
  remains unchanged. The initial PCS v1 copy used only the equal-length
  `gotion-orange` → `accent-orange` material-name replacement.

No Switchyard source is modified. The independent PCS script and GLB can be
reviewed for reverse-integration there later; that integration is **not done**.

```bash
blender --background --factory-startup --python-exit-code 1 \
  --python scripts/build_generic_pcs_mv_skid.py
# Optional alternate destination; export only, no rendering:
blender --background --factory-startup --python-exit-code 1 \
  --python scripts/build_generic_pcs_mv_skid.py -- --output /tmp/pcs-mv.glb
```

Tested with Blender 5.1.2. The script generates geometry, never a GPU preview.
Metre-scale glTF Y-up export keeps the centre-ground anchor. Visual references:
the user-supplied skid photograph, [Sinexcel's 20ft station](https://en.sinexcel.com/energy-storage/details.html?id=26)
and [Power Electronics' MV Skid Compact](https://power-electronics.com/en/storage/mv-skid-compact).
These inform generic compartment proportions, not copied CAD, logos, images,
certification or vendor ratings. In particular, **5 MW / 33 kV remains the demo's
own representative convention**, not a claim about either reference product.
Token tests check known strings, not comprehensive IP or engineering clearance.

PCS v2: 1,034,084 bytes, 22,332 triangles, 26 assembly/material mesh batches,
9 materials and no textures. V1 had 1,253,268 bytes, 24,536 triangles and
7 mesh batches. Smaller transfer/triangle count does not imply better FPS:
draw submissions increase. The geometry tests bound size, triangles and meshes,
and raycast through both guards to protect actual transformer visibility.
Cabinet-side tests originate in the inter-cabinet gap, with a hollow-cabinet
negative control; louvre slopes, separated cable runs and floor contact also
have real-GLB regression coverage. See the [archived follow-up](https://github.com/crashchen/BESS-Storage-Simulator/blob/66a8a740770d1a1a8d55ba84b42940f1cad9b544/docs/audits/2026-10-24/README.md)
for hashes, rebuilding evidence and acceptance limits.

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
can extend beyond the nominal planning envelope (PCS v2 measures about
6.00 × 3.00 × 3.028 m including details), so check the actual GLB bounds when
fitting pads. Keep this README and the config in sync when adding models.
