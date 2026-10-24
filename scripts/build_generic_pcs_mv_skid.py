"""Build the simulator's generic PCS/MV skid, without a private source asset.

Blender 5.1: --background --factory-startup --python-exit-code 1
  --python scripts/build_generic_pcs_mv_skid.py [-- --output /tmp/skid.glb]

Metres, centre-ground, Blender Z-up -> glTF Y-up. The 6 x 3 x 3 m envelope
and 5 MW demo convention are not a supplier specification or manufacturing CAD.
Only geometry export is used: no GPU render, textures, network, or upstream writes.
Visual references and reuse limits are documented in public/models/README.md.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
import math
from pathlib import Path
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "public/models/generic-pcs-mv-skid-5mw-v2.glb"
BOX_VERTS = [(x, y, z) for x, y, z in (
    (-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
    (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1),
)]
BOX_FACES = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
             (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]


def material(name, rgb, metallic=0.0, roughness=0.55):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    # Hex-like palette values are sRGB; Blender nodes and glTF factors are linear.
    linear = tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in rgb)
    mat.diffuse_color = (*linear, 1)
    node = mat.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = (*linear, 1)
    node.inputs["Metallic"].default_value = metallic
    node.inputs["Roughness"].default_value = roughness
    mat.use_backface_culling = True
    return mat


class Builder:
    """Batch disconnected solids by assembly/material, not one object per screw."""

    def __init__(self):
        self.parts = defaultdict(lambda: ([], []))

    def mesh(self, assembly, mat, vertices, faces):
        verts, polys = self.parts[(assembly, mat)]
        offset = len(verts)
        verts.extend(vertices)
        polys.extend(tuple(offset + i for i in face) for face in faces)

    def box(self, assembly, mat, size, center, bevel=0, rotation=None):
        vertices = [Vector(tuple(v[i] * size[i] / 2 for i in range(3))) for v in BOX_VERTS]
        faces = BOX_FACES
        if bevel:
            bm = bmesh.new()
            nodes = [bm.verts.new(v) for v in vertices]
            for face in faces:
                bm.faces.new([nodes[i] for i in face])
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect="EDGES")
            bm.verts.index_update()
            vertices = [v.co.copy() for v in bm.verts]
            faces = [tuple(v.index for v in face.verts) for face in bm.faces]
            bm.free()
        transform = rotation if rotation is not None else Matrix.Identity(3)
        self.mesh(assembly, mat, [transform @ v + Vector(center) for v in vertices], faces)

    def rod(self, assembly, mat, start, end, radius, sides=12):
        start, end = Vector(start), Vector(end)
        rotation = (end - start).to_track_quat('Z', 'Y').to_matrix()
        vertices = []
        for origin in (start, end):
            vertices.extend(origin + rotation @ Vector((radius * math.cos(i * math.tau / sides),
                                                       radius * math.sin(i * math.tau / sides), 0))
                            for i in range(sides))
        faces = [tuple(reversed(range(sides))), tuple(range(sides, sides * 2))]
        faces.extend((i, (i + 1) % sides, (i + 1) % sides + sides, i + sides) for i in range(sides))
        self.mesh(assembly, mat, vertices, faces)

    def finish(self):
        for (assembly, mat), (vertices, faces) in self.parts.items():
            mesh = bpy.data.meshes.new(f"{assembly}_{mat.name}")
            mesh.from_pydata(vertices, [], faces)
            mesh.update()
            obj = bpy.data.objects.new(mesh.name, mesh)
            bpy.context.collection.objects.link(obj)
            mesh.materials.append(mat)
            # Flat normals keep panels planar; tiny geometric bevels catch light.
        bpy.context.view_layer.update()


def build():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    body = material('porcelain-shell', (0.83, 0.86, 0.85), 0.12)
    white = material('service-panel', (0.94, 0.95, 0.92), 0.08)
    steel = material('galvanized-steel', (0.57, 0.65, 0.68), 0.55, 0.4)
    dark = material('graphite-trim', (0.12, 0.17, 0.19), 0.2)
    tank = material('transformer-grey', (0.46, 0.56, 0.54), 0.22)
    ceramic = material('insulator-brown', (0.36, 0.23, 0.16), 0.05, 0.28)
    yellow = material('safety-amber', (0.95, 0.73, 0.12))
    green = material('indicator-green', (0.17, 0.70, 0.38))
    red = material('stop-red', (0.73, 0.13, 0.10))
    b = Builder()

    def box(section, mat, size, center, bevel=0, rotation=None):
        b.box(section, mat, size, center, bevel, rotation)

    def louvres(section, x, y, z, width, height, side=1, end_face=False):
        # A vent has a real recessed backing and angled blades; only the
        # transformer safety cage is open all the way through.
        def vent_box(mat, size, center, rotation=None):
            if end_face:
                center = (center[1], center[0], center[2])
                # Map local +Y to world +X so `side` always means outward.
                rotation = Matrix.Rotation(-math.pi / 2, 3, 'Z') @ (rotation if rotation is not None else Matrix.Identity(3))
            box(section, mat, size, center, rotation=rotation)
        vent_box(dark, (width, .025, height), (x, y, z))
        count = max(3, round(height / .075))
        for i in range(count):
            vent_box(body, (width - .045, .065, .027),
                     (x, y + side * .03, z - height / 2 + (i + .5) * height / count),
                     Matrix.Rotation(-side * math.radians(24), 3, 'X'))

    def hardware(section, x, y, side, handle_x):
        for z in (.74, 1.58, 2.39):
            box(section, steel, (.055, .055, .13), (x, y + side * .026, z), .006)
        box(section, dark, (.045, .045, .23), (handle_x, y + side * .034, 1.32), .008)
        b.rod(section, steel, (handle_x, y, 1.13), (handle_x, y, 1.48), .011)

    def warning(section, x, y, z, side):
        box(section, yellow, (.13, .012, .13), (x, y, z), .004)
        box(section, dark, (.013, .012, .056), (x, y + side * .009, z + .015))
        box(section, dark, (.014, .012, .014), (x, y + side * .009, z - .034))

    # Frame, solid floor, roof and genuine feet stay within the original pad.
    for y in (-1.40, 1.40):
        box('Skid_Frame', body, (6, .20, .20), (0, y, .10), .014)
        box('Skid_Frame', white, (6, .16, .16), (0, y, 2.92), .012)
    for x in (-2.90, 2.90):
        box('Skid_Frame', body, (.20, 2.80, .20), (x, 0, .10), .012)
        box('Skid_Frame', white, (.16, 2.80, .16), (x, 0, 2.92), .012)
        for y in (-1.40, 1.40):
            box('Skid_Frame', white, (.16, .16, 2.72), (x, y, 1.52), .012)
            for z in (.11, 2.89):
                box('Skid_Frame', steel, (.20, .20, .20), (x, y, z), .018)
                box('Skid_Frame', dark, (.08, .012, .065), (x, y + math.copysign(.104, y), z), .015)
    # Top at 0.30 m meets cabinet plinths and transformer tray without lifting
    # equipment or changing the shared scene envelope.
    box('Skid_Frame', steel, (5.66, 2.62, .08), (0, 0, .26))
    box('Skid_Frame', body, (5.70, 2.66, .065), (0, 0, 2.85), .009)
    for x in (-2.0, -.87, 1.36, 2.30):
        box('Skid_Frame', white, (.065, 2.66, .025), (x, 0, 2.897), .006)
        box('Skid_Frame', dark, (.16, 2.60, .09), (x, 0, .205))
    for x in (-.89, 1.36):
        for y in (-1.37, 1.37):
            box('Skid_Frame', white, (.08, .10, 2.58), (x, y, 1.53), .008)

    # Two full-depth PCS enclosures, not floating face plates.
    for x in (-2.36, -1.42):
        box('PCS_Cabinets', body, (.86, 2.16, 2.25), (x, 0, 1.44), .025)
        box('PCS_Cabinets', dark, (.84, 2.12, .12), (x, 0, .36), .008)
        for side in (-1, 1):
            y = side * 1.11
            box('PCS_Cabinets', dark, (.81, .035, 2.06), (x, y, 1.40), .012)
            box('PCS_Cabinets', white, (.78, .05, 2.03), (x, y + side * .028, 1.40), .018)
            box('PCS_Cabinets', body, (.90, .32, .25), (x, y, 2.57), .022)
            louvres('PCS_Cabinets', x, y + side * .06, .52, .68, .25, side)
            hardware('PCS_Cabinets', x - .34, y + side * .06, side, x + .29)
            box('PCS_Cabinets', dark, (.20, .016, .11), (x - .17, y + side * .061, 2.12), .01)
            for dz, mat in ((.0, green), (-.085, yellow), (-.17, red)):
                b.rod('PCS_Controls', mat, (x + .19, y + side * .06, 2.17 + dz),
                      (x + .19, y + side * .078, 2.17 + dz), .019)
            warning('PCS_Controls', x - .16, y + side * .065, 1.78, side)

    # Visible transformer, with both radiator banks and roof-level terminals.
    box('Transformer_Equipment', dark, (1.95, 2.24, .10), (.22, 0, .35), .012)
    for x in (-.33, .77):
        box('Transformer_Equipment', steel, (.16, 1.70, .18), (x, 0, .49))
    box('Transformer_Equipment', tank, (1.48, 1.22, 1.36), (.22, 0, 1.25), .035)
    box('Transformer_Equipment', steel, (1.60, 1.34, .10), (.22, 0, 1.98), .015)
    for side in (-1, 1):
        for i in range(17):
            box('Transformer_Equipment', tank, (.035, .30, 1.12),
                (-.48 + i * .0875, side * .77, 1.22))
        for z in (.72, 1.71):
            b.rod('Transformer_Equipment', steel, (-.51, side * .93, z), (.95, side * .93, z), .035)
        box('Transformer_Equipment', steel, (.22, .035, .18), (.22, side * .96, 1.47), .008)
        b.rod('Transformer_Equipment', dark, (.22, side * .99, 1.49), (.22, side * 1.013, 1.49), .055, 20)
    for phase, x in enumerate((-.25, .22, .69)):
        for y in (-.32, .32):
            b.rod('Transformer_Equipment', ceramic, (x, y, 2.03), (x, y, 2.38), .048, 16)
            for z in (2.10, 2.17, 2.24, 2.31):
                b.rod('Transformer_Equipment', ceramic, (x, y, z), (x, y, z + .022), .078, 16)
            b.rod('Transformer_Equipment', steel, (x, y, 2.38), (x, y, 2.47), .028)
            # Separate lanes and heights avoid coincident/intersecting runs;
            # the final drop penetrates the adjacent cabinet's closed shell.
            destination = 1.50 if y > 0 else -1.12
            lane = math.copysign(.40 + phase * .16, y)
            height = 2.56 + phase * .07
            route = [(x, y, 2.47), (x, y, height), (x, lane, height),
                     (destination, lane, height), (destination, lane, 2.42)]
            for start, end in zip(route, route[1:]):
                b.rod('Transformer_Equipment', dark, start, end, .022)
    b.rod('Transformer_Equipment', steel, (.82, .45, .57), (.82, .98, .57), .03)
    box('Transformer_Equipment', red, (.14, .035, .022), (.82, .96, .64))

    # Open mesh gates, NO opaque aperture/backplate hiding the transformer.
    for side in (-1, 1):
        y = side * 1.375
        for x in (-.84, .23, 1.30):
            box('Transformer_Guards', white, (.055, .05, 2.45), (x, y, 1.53), .006)
        for z in (.305, 1.47, 2.755):
            box('Transformer_Guards', white, (2.19, .05, .055), (.23, y, z), .006)
        for i in range(17):
            box('Transformer_Guards', steel, (.009, .012, 2.35), (-.76 + i * .122, y, 1.53))
        for i in range(24):
            box('Transformer_Guards', steel, (2.10, .012, .009), (.23, y, .37 + i * .10))
        hardware('Transformer_Guards', -.82, y, side, .13)
        hardware('Transformer_Guards', 1.28, y, side, .33)
        warning('Transformer_Guards', -.61, y + side * .04, 1.64, side)

    # MV compartment: full body, recessed louvred doors on front/rear/end.
    box('MV_Switchgear', body, (1.32, 2.54, 2.48), (2.08, 0, 1.54), .02)
    for side in (-1, 1):
        y = side * 1.30
        box('MV_Switchgear', dark, (1.24, .035, 2.35), (2.08, y, 1.54), .01)
        box('MV_Switchgear', white, (1.18, .06, 2.28), (2.08, y + side * .025, 1.54), .016)
        for z, height in ((1.95, 1.12), (.92, .64)):
            louvres('MV_Switchgear', 2.08, y + side * .065, z, 1.02, height, side)
        hardware('MV_Switchgear', 2.64, y + side * .065, side, 1.64)
        warning('MV_Switchgear', 2.08, y + side * .067, 1.30, side)
    box('MV_Switchgear', dark, (.035, 2.37, 2.35), (2.77, 0, 1.54), .01)
    box('MV_Switchgear', white, (.05, 2.31, 2.29), (2.80, 0, 1.54), .015)
    for y in (-.59, .59):
        louvres('MV_Switchgear', y, 2.836, 1.60, .99, 1.95, end_face=True)
        b.rod('MV_Switchgear', steel, (2.88, y + .43, .53), (2.88, y + .43, 2.56), .015)
        box('MV_Switchgear', dark, (.035, .16, .045), (2.90, y + .36, 1.30), .008)
    # The PCS end panel is also closed; paired high/low vents give the side depth.
    box('PCS_Cabinets', body, (.08, 2.12, 2.22), (-2.82, 0, 1.44), .012)
    for y in (-.53, .53):
        for z in (.75, 2.05):
            louvres('PCS_Cabinets', y, -2.867, z, .90, .55, side=-1, end_face=True)

    b.finish()
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    build()
    output = args.output.expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB',
                              export_yup=True, export_animations=False,
                              export_cameras=False, export_lights=False,
                              export_texcoords=False, export_normals=True)
    triangles = 0
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            obj.data.calc_loop_triangles()
            triangles += len(obj.data.loop_triangles)
    print(f'Exported {output}: {output.stat().st_size} bytes, {triangles} triangles, '
          f'{len(bpy.context.scene.objects)} batched mesh objects')


if __name__ == '__main__':
    main()
