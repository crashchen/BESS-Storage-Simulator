"""Create the public generic BESS GLB from a branded source asset.

This is a downstream post-process owned by BESS Storage Simulator. It keeps
the source repository untouched, removes the standalone logo decal and its
embedded image, and replaces the branded orange material with a neutral blue.

Run with Blender, passing the source and destination after ``--``:

  /Applications/Blender.app/Contents/MacOS/Blender --background \
    --python scripts/make_generic_bess_glb.py -- SOURCE.glb OUTPUT.glb
"""

from __future__ import annotations

from pathlib import Path
import re
import sys

import bpy


BRAND_TOKEN = "gotion"
GENERIC_ACCENT_NAME = "equipment-blue"
GENERIC_ACCENT_RGBA = (0.055, 0.36, 0.56, 1.0)
BRAND_PATTERN = re.compile(re.escape(BRAND_TOKEN), re.IGNORECASE)
BRAND_ACCENT_PATTERN = re.compile(rf"{re.escape(BRAND_TOKEN)}-orange", re.IGNORECASE)


def parse_paths() -> tuple[Path, Path]:
    try:
        separator = sys.argv.index("--")
        source_arg, output_arg = sys.argv[separator + 1 : separator + 3]
    except (ValueError, IndexError):
        raise SystemExit("Expected: blender ... -- SOURCE.glb OUTPUT.glb") from None

    source = Path(source_arg).expanduser().resolve()
    output = Path(output_arg).expanduser().resolve()
    if not source.is_file():
        raise SystemExit(f"Source GLB does not exist: {source}")
    if source == output:
        raise SystemExit("Source and output must be different files")
    return source, output


def replace_brand_token(name: str) -> str:
    accent_neutralized = BRAND_ACCENT_PATTERN.sub(GENERIC_ACCENT_NAME, name)
    return BRAND_PATTERN.sub("generic", accent_neutralized)


def set_material_color(material: bpy.types.Material) -> None:
    material.name = GENERIC_ACCENT_NAME
    material.diffuse_color = GENERIC_ACCENT_RGBA
    if not material.use_nodes or material.node_tree is None:
        return
    principled = next(
        (node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"),
        None,
    )
    if principled is not None:
        principled.inputs["Base Color"].default_value = GENERIC_ACCENT_RGBA


def remove_branding() -> list[bpy.types.Object]:
    logo_objects = [
        obj
        for obj in bpy.data.objects
        if "logo" in obj.name.lower()
        or any("logo" in material.name.lower() for material in getattr(obj.data, "materials", []))
    ]
    for obj in logo_objects:
        bpy.data.objects.remove(obj, do_unlink=True)

    for material in list(bpy.data.materials):
        lowered = material.name.lower()
        if "logo" in lowered:
            bpy.data.materials.remove(material, do_unlink=True)
        elif BRAND_TOKEN in lowered:
            set_material_color(material)

    # The logo PNG can contain brand metadata even after its mesh is removed.
    for image in list(bpy.data.images):
        bpy.data.images.remove(image, do_unlink=True)

    # GLB exporters may preserve names beyond visible objects. Normalize every
    # named datablock that can survive the downstream export.
    for datablocks in (
        bpy.data.objects,
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.collections,
        bpy.data.scenes,
    ):
        for datablock in datablocks:
            datablock.name = replace_brand_token(datablock.name)

    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for material in list(bpy.data.materials):
        if material.users == 0:
            bpy.data.materials.remove(material)

    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def export_glb(objects: list[bpy.types.Object], output: Path) -> None:
    if not objects:
        raise SystemExit("No mesh objects remain after de-branding")
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=True,
    )


def main() -> None:
    source, output = parse_paths()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    objects = remove_branding()
    export_glb(objects, output)
    print(f"GENERIC_BESS source={source}")
    print(f"GENERIC_BESS output={output} bytes={output.stat().st_size} objects={len(objects)}")


if __name__ == "__main__":
    main()
