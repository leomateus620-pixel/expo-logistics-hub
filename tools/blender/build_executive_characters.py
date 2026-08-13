"""Build the FENASOJA executive character GLBs with Blender 4.5 LTS.

The generator is intentionally deterministic and self contained.  It authors two
lightweight, metrically-scaled characters from primitive and custom meshes,
creates a real armature/skin, and exports four NLA animation clips (Idle, Walk,
Wave, SeatedIdle). No runtime Blender dependency is required by the web
application.

Usage (PowerShell):

    & 'C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe' `
      --background --python tools/blender/build_executive_characters.py -- `
      --output-dir public/models/executives

Optional preview renders can be produced outside the web bundle with
``--preview-dir <path>``.  The preview render is never included in the GLB.
"""

from __future__ import annotations

import argparse
from array import array
import hashlib
import json
import math
from pathlib import Path
import random
import shutil
import struct
import subprocess
import sys
from typing import Iterable, Sequence

import bpy
from mathutils import Euler, Vector


FPS = 30
TAU = math.tau
# The curved reference-face layer complements explicit facial geometry at the
# Commercial Map camera distance. It is not a substitute for a scan-grade
# texture/displacement capture.
USE_REFERENCE_FACE_TEXTURE = True
ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_DIR = ROOT_DIR / "public" / "models" / "executives"
DEFAULT_FABIANO_TURNAROUND = ROOT_DIR / "docs" / "character-reference" / "fabiano-soltis-turnaround.png"
DEFAULT_DJEISON_TURNAROUND = ROOT_DIR / "docs" / "character-reference" / "djeison-drey-turnaround.png"


PROFILES = {
    "fabiano-soltis": {
        "slug": "fabiano-soltis",
        "object_name": "FabianoSoltis",
        "display_name": "Fabiano Soltis",
        "role": "Presidente da FENASOJA",
        "height": 1.78,
        "shoulder_width": 0.475,
        "waist_width": 0.345,
        "build": "atlético, ombros definidos e postura executiva ereta",
        "skin": (0.70, 0.47, 0.34, 1.0),
        "skin_style": "warm",
        "hair": (0.020, 0.014, 0.012, 1.0),
        "beard": (0.055, 0.038, 0.029, 1.0),
        "eyes": (0.16, 0.105, 0.066, 1.0),
        "suit": (0.025, 0.065, 0.145, 1.0),
        "suit_edge": (0.040, 0.090, 0.185, 1.0),
        "tie": (0.018, 0.185, 0.105, 1.0),
        "shoe": (0.095, 0.042, 0.022, 1.0),
        "metal": (0.22, 0.24, 0.26, 1.0),
        "head": (0.202, 0.218, 0.278),
        "jaw_width": 0.154,
        "eye_spacing": 0.072,
        "nose_length": 0.050,
        "nose_width": 0.030,
        "mouth_width": 0.074,
        "glasses": "rectangular",
        "hair_style": "dark_swept",
        "beard_style": "short_stubble",
        "carries_mate": False,
        "turnaround_crop": (0.690, 0.070, 0.250, 0.600),
        "profile_summary": {
            "face": "rosto oval anguloso, mandíbula limpa, olhos castanhos próximos, nariz reto e sorriso discreto",
            "hair": "cabelo castanho-escuro curto, volumoso no topo e penteado lateralmente",
            "accessories": "óculos executivos finos prateados",
            "clothing": "terno azul-marinho ajustado, camisa branca, gravata verde e sapatos marrons",
            "animation": "postura sentada madura, respiração discreta e mãos em repouso sem atravessar o sofá",
        },
    },
    "djeison-drey": {
        "slug": "djeison-drey",
        "object_name": "DjeisonDrey",
        "display_name": "Djeison Drey",
        "role": "Vice-Presidente da FENASOJA",
        "height": 1.84,
        "shoulder_width": 0.515,
        "waist_width": 0.395,
        "build": "porte alto e robusto, tórax amplo e postura cordial",
        "skin": (0.80, 0.57, 0.43, 1.0),
        "skin_style": "freckled",
        "hair": (0.28, 0.13, 0.045, 1.0),
        "beard": (0.33, 0.10, 0.035, 1.0),
        "eyes": (0.18, 0.34, 0.44, 1.0),
        "suit": (0.145, 0.155, 0.165, 1.0),
        "suit_edge": (0.205, 0.215, 0.225, 1.0),
        "tie": (0.018, 0.185, 0.105, 1.0),
        "shoe": (0.22, 0.095, 0.035, 1.0),
        "metal": (0.42, 0.25, 0.08, 1.0),
        "head": (0.222, 0.228, 0.286),
        "jaw_width": 0.184,
        "eye_spacing": 0.080,
        "nose_length": 0.054,
        "nose_width": 0.034,
        "mouth_width": 0.082,
        "glasses": "rounded",
        "hair_style": "ginger_tousled",
        "beard_style": "full_ginger",
        "carries_mate": True,
        "turnaround_crop": (0.680, 0.040, 0.270, 0.620),
        "profile_summary": {
            "face": "rosto quadrado-oval amplo, olhos azulados, nariz definido e assimetria cordial no sorriso",
            "hair": "cabelo ruivo-claro curto, texturizado e levemente despenteado",
            "accessories": "óculos grandes arredondados em metal dourado e chimarrão na mão esquerda",
            "clothing": "terno cinza de alfaiataria, camisa branca, gravata verde e sapatos conhaque",
            "animation": "postura sentada cordial, respiração fora de fase e braço esquerdo estável no chimarrão",
        },
    },
}


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--preview-dir", type=Path)
    parser.add_argument("--closeup-preview-dir", type=Path)
    parser.add_argument("--skip-export", action="store_true", help="Build and render QA frames without writing GLBs/manifest.")
    parser.add_argument("--fabiano-turnaround", type=Path, default=DEFAULT_FABIANO_TURNAROUND)
    parser.add_argument("--djeison-turnaround", type=Path, default=DEFAULT_DJEISON_TURNAROUND)
    parser.add_argument(
        "--only",
        choices=("all", *PROFILES.keys()),
        default="all",
        help="Build one character or both.",
    )
    return parser.parse_args(argv)


def linear_to_srgb(value: float) -> float:
    return 12.92 * value if value <= 0.0031308 else 1.055 * value ** (1 / 2.4) - 0.055


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def clean_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.actions,
        bpy.data.armatures,
        bpy.data.curves,
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in list(datablocks):
            datablocks.remove(datablock)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "METERS"
    scene.unit_settings.scale_length = 1.0
    scene.render.fps = FPS
    scene.frame_start = 0
    scene.frame_end = 120


def make_texture_image(name: str, base_color: Sequence[float], style: str, size: int = 64):
    seed = int.from_bytes(hashlib.sha256(name.encode("utf-8")).digest()[:8], "little")
    rng = random.Random(seed)
    image = bpy.data.images.new(f"{name}_Texture", width=size, height=size, alpha=True)
    pixels = array("f")
    rgb = tuple(float(c) for c in base_color[:3])
    freckle_points: set[tuple[int, int]] = set()
    if style == "freckled":
        freckle_points = {(rng.randrange(size), rng.randrange(size)) for _ in range(size // 2)}

    for y in range(size):
        for x in range(size):
            noise = rng.uniform(-1.0, 1.0)
            multiplier = 1.0
            if style == "fabric":
                weave = (0.018 if x % 4 == 0 else -0.006) + (0.014 if y % 4 == 0 else 0.0)
                multiplier += weave + noise * 0.012
            elif style == "shirt":
                multiplier += (0.012 if x % 6 == 0 else 0.0) + noise * 0.006
            elif style in {"warm", "freckled"}:
                multiplier += noise * 0.025
            elif style == "leather":
                multiplier += noise * 0.035 + 0.012 * math.sin((x + y) * 0.7)
            elif style == "hair":
                multiplier += noise * 0.05 + 0.025 * math.sin((x * 0.8) + (y * 0.22))
            if (x, y) in freckle_points:
                color = (rgb[0] * 0.58, rgb[1] * 0.45, rgb[2] * 0.40)
            else:
                color = tuple(clamp(channel * multiplier) for channel in rgb)
            pixels.extend((*color, 1.0))
    image.pixels.foreach_set(pixels)
    image.pack()
    image.colorspace_settings.name = "sRGB"
    return image


def make_material(
    name: str,
    color: Sequence[float],
    *,
    roughness: float = 0.5,
    metallic: float = 0.0,
    alpha: float = 1.0,
    texture_style: str | None = None,
    coat: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = (color[0], color[1], color[2], alpha)
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (color[0], color[1], color[2], alpha)
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Alpha"].default_value = alpha
    if "Coat Weight" in principled.inputs:
        principled.inputs["Coat Weight"].default_value = coat
        principled.inputs["Coat Roughness"].default_value = max(0.06, roughness * 0.35)
    if texture_style:
        image = make_texture_image(name, color, texture_style)
        texture = nodes.new("ShaderNodeTexImage")
        texture.name = f"{name}_ColorTexture"
        texture.image = image
        texture.interpolation = "Linear"
        links.new(texture.outputs["Color"], principled.inputs["Base Color"])
    if alpha < 1.0:
        material.surface_render_method = "DITHERED"
        material.use_transparency_overlap = False
    return material


def extract_face_texture(source_path: Path, target_path: Path, crop: Sequence[float], size: tuple[int, int] = (512, 512)) -> Path:
    """Extract a feathered front-face texture from an approved turnaround.

    Crop coordinates are top-left normalized values. Blender's pixel buffer is
    bottom-up, so the y conversion is kept explicit here. The emitted TGA is an
    intermediate source artifact; Blender embeds it as PNG inside each GLB.
    """
    source = bpy.data.images.load(str(source_path), check_existing=False)
    source_width, source_height = source.size
    crop_x, crop_top, crop_width, crop_height = crop
    x0 = int(round(crop_x * source_width))
    top = int(round(crop_top * source_height))
    width = max(2, int(round(crop_width * source_width)))
    height = max(2, int(round(crop_height * source_height)))
    y0 = source_height - top - height
    target_width, target_height = size

    # Accessing a slice forces Blender to load the packed PNG pixel buffer.
    # `foreach_get` alone can return an uninitialised zero buffer for a freshly
    # loaded image while running headless on Windows.
    source_pixels = array("f", source.pixels[:])
    target_pixels = array("f", [0.0]) * (target_width * target_height * 4)
    for ty in range(target_height):
        v = (ty + 0.5) / target_height
        # Blender image buffers are bottom-up, while the target TGA is emitted
        # with a top-left origin. Flip the source sample so the embedded face is
        # upright in glTF and Eevee.
        sy = max(0, min(source_height - 1, y0 + int((1.0 - v) * height)))
        for tx in range(target_width):
            u = (tx + 0.5) / target_width
            sx = max(0, min(source_width - 1, x0 + int(u * width)))
            source_index = (sy * source_width + sx) * 4
            red, green, blue, _ = source_pixels[source_index : source_index + 4]
            # The face silhouette is slightly wider above the jaw.  A soft
            # superellipse avoids a rectangular photo-card edge on the head.
            nx = abs((u - 0.5) / 0.49)
            ny = abs((v - 0.50) / 0.47)
            if v < 0.33:
                allowed_x = 1.0
            elif v > 0.72:
                allowed_x = 0.82 + (1.0 - v) * 0.36
            else:
                allowed_x = 0.98
            distance = (nx / allowed_x) ** 2.4 + ny**2.25
            # Feather broadly enough that the portrait melts into the
            # underlying sculpt instead of reading as a square photo card.
            alpha = clamp((0.84 - distance) / 0.42)
            target_index = (ty * target_width + tx) * 4
            target_pixels[target_index] = red
            target_pixels[target_index + 1] = green
            target_pixels[target_index + 2] = blue
            target_pixels[target_index + 3] = alpha

    target = bpy.data.images.new(f"{target_path.stem}_Extract", width=target_width, height=target_height, alpha=True)
    target.pixels.foreach_set(target_pixels)
    target.update()
    sample = target.pixels[(target_height // 2 * target_width + target_width // 2) * 4 : (target_height // 2 * target_width + target_width // 2) * 4 + 4]
    print(f"[executives] Face extraction center RGBA: {tuple(round(float(value), 3) for value in sample)}")
    target_path.parent.mkdir(parents=True, exist_ok=True)
    # `Image.save()`/`save_render()` can write a black buffer for generated
    # float images in Blender's Windows headless mode.  Write a standards-based
    # uncompressed 32-bit TGA directly; Blender and glTF both ingest it without
    # an auxiliary image library and the alpha edge remains lossless.
    tga_path = target_path.with_suffix(".tga")
    header = struct.pack(
        "<BBBHHBHHHHBB",
        0,
        0,
        2,
        0,
        0,
        0,
        0,
        0,
        target_width,
        target_height,
        32,
        0x28,
    )
    payload = bytearray(target_width * target_height * 4)
    for pixel_index in range(target_width * target_height):
        source_index = pixel_index * 4
        destination_index = source_index
        red = int(round(clamp(target_pixels[source_index]) * 255))
        green = int(round(clamp(target_pixels[source_index + 1]) * 255))
        blue = int(round(clamp(target_pixels[source_index + 2]) * 255))
        alpha = int(round(clamp(target_pixels[source_index + 3]) * 255))
        payload[destination_index : destination_index + 4] = bytes((blue, green, red, alpha))
    tga_path.write_bytes(header + payload)
    bpy.data.images.remove(source)
    bpy.data.images.remove(target)
    return tga_path


def make_face_material(profile: dict, texture_path: Path) -> bpy.types.Material:
    material = bpy.data.materials.new(f"{profile['object_name']}_ReferenceFace")
    material.use_nodes = True
    material.surface_render_method = "DITHERED"
    material.use_transparency_overlap = False
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = nodes.get("Principled BSDF")
    principled.inputs["Roughness"].default_value = 0.48
    principled.inputs["Metallic"].default_value = 0.0
    principled.inputs["Alpha"].default_value = 1.0
    texture = nodes.new("ShaderNodeTexImage")
    texture.name = f"{profile['object_name']}_FaceTexture"
    texture.image = bpy.data.images.load(str(texture_path), check_existing=False)
    texture.image.colorspace_settings.name = "sRGB"
    texture.interpolation = "Linear"
    texcoord = nodes.new("ShaderNodeTexCoord")
    texcoord.name = f"{profile['object_name']}_FaceUV"
    # The source crop already frames the full face. Direct UVs are deliberate:
    # a prior Mapping node pushed values outside 0..1, making glTF repeat the
    # portrait into white strips over the eyes and hair.
    links.new(texcoord.outputs["UV"], texture.inputs["Vector"])
    tint = nodes.new("ShaderNodeMixRGB")
    tint.name = f"{profile['object_name']}_FaceExposure"
    tint.blend_type = "MULTIPLY"
    tint.inputs[0].default_value = 1.0
    tint.inputs[2].default_value = (0.64, 0.64, 0.64, 1.0)
    links.new(texture.outputs["Color"], tint.inputs[1])
    links.new(tint.outputs["Color"], principled.inputs["Base Color"])
    links.new(texture.outputs["Alpha"], principled.inputs["Alpha"])
    return material


def make_materials(profile: dict) -> dict[str, bpy.types.Material]:
    materials = {
        "skin": make_material(f"{profile['object_name']}_Skin", profile["skin"], roughness=0.58, texture_style=profile["skin_style"]),
        "skin_warm": make_material(
            f"{profile['object_name']}_SkinWarm",
            tuple(min(1.0, c * 0.93 + 0.035) for c in profile["skin"][:3]) + (1.0,),
            roughness=0.62,
        ),
        "hair": make_material(f"{profile['object_name']}_Hair", profile["hair"], roughness=0.74, texture_style="hair"),
        "beard": make_material(
            f"{profile['object_name']}_Beard",
            profile["beard"],
            roughness=0.78,
            alpha=0.58 if profile["beard_style"] == "short_stubble" else 1.0,
            texture_style="hair",
        ),
        "eye_white": make_material(f"{profile['object_name']}_Sclera", (0.82, 0.80, 0.75, 1.0), roughness=0.26, coat=0.3),
        "iris": make_material(f"{profile['object_name']}_Iris", profile["eyes"], roughness=0.23, coat=0.45),
        "pupil": make_material(f"{profile['object_name']}_Pupil", (0.005, 0.004, 0.003, 1.0), roughness=0.18, coat=0.5),
        "lip": make_material(f"{profile['object_name']}_Lips", (0.42, 0.17, 0.14, 1.0), roughness=0.52),
        "suit": make_material(f"{profile['object_name']}_Suit", profile["suit"], roughness=0.72, texture_style="fabric"),
        "suit_edge": make_material(f"{profile['object_name']}_SuitEdge", profile["suit_edge"], roughness=0.68, texture_style="fabric"),
        "shirt": make_material(f"{profile['object_name']}_Shirt", (0.88, 0.89, 0.89, 1.0), roughness=0.67, texture_style="shirt"),
        "tie": make_material(f"{profile['object_name']}_Tie", profile["tie"], roughness=0.47, texture_style="fabric", coat=0.06),
        "shoe": make_material(f"{profile['object_name']}_Leather", profile["shoe"], roughness=0.34, texture_style="leather", coat=0.22),
        "sole": make_material(f"{profile['object_name']}_Sole", (0.025, 0.020, 0.018, 1.0), roughness=0.8),
        "metal": make_material(f"{profile['object_name']}_GlassesMetal", profile["metal"], roughness=0.24, metallic=0.88),
        "lens": make_material(f"{profile['object_name']}_Lens", (0.55, 0.70, 0.75, 1.0), roughness=0.06, alpha=0.14, coat=0.85),
        "button": make_material(f"{profile['object_name']}_Buttons", (0.025, 0.028, 0.030, 1.0), roughness=0.32, coat=0.15),
        "mate_wood": make_material("Chimarrao_CuiaWood", (0.065, 0.033, 0.018, 1.0), roughness=0.38, texture_style="leather", coat=0.14),
        "mate_rim": make_material("Chimarrao_Rim", (0.34, 0.19, 0.065, 1.0), roughness=0.34, metallic=0.15),
        "mate_metal": make_material("Chimarrao_BombaMetal", (0.58, 0.62, 0.64, 1.0), roughness=0.18, metallic=0.92, coat=0.25),
        "mate_herb": make_material("Chimarrao_ErvaMate", (0.105, 0.22, 0.055, 1.0), roughness=0.88),
    }
    face_texture_path = profile.get("face_texture_path")
    if USE_REFERENCE_FACE_TEXTURE and face_texture_path and Path(face_texture_path).exists():
        materials["face_photo"] = make_face_material(profile, Path(face_texture_path))
    return materials


def set_material(obj: bpy.types.Object, material: bpy.types.Material) -> bpy.types.Object:
    if obj.type == "MESH":
        obj.data.materials.append(material)
    return obj


def smooth_mesh(obj: bpy.types.Object, smooth: bool = True) -> None:
    if obj.type != "MESH":
        return
    for polygon in obj.data.polygons:
        polygon.use_smooth = smooth


def apply_transform(obj: bpy.types.Object) -> None:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.select_set(False)


def add_uv_sphere(
    name: str,
    location: Sequence[float],
    scale: Sequence[float],
    material: bpy.types.Material,
    *,
    segments: int = 24,
    rings: int = 16,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    apply_transform(obj)
    set_material(obj, material)
    smooth_mesh(obj)
    return obj


def add_rounded_cube(
    name: str,
    location: Sequence[float],
    dimensions: Sequence[float],
    material: bpy.types.Material,
    *,
    bevel: float = 0.012,
    rotation: Sequence[float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    apply_transform(obj)
    set_material(obj, material)
    if bevel > 0:
        modifier = obj.modifiers.new("Tailoring bevel", "BEVEL")
        modifier.width = min(bevel, min(dimensions) * 0.42)
        modifier.segments = 2
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.select_set(False)
        smooth_mesh(obj)
    return obj


def orient_z_axis(obj: bpy.types.Object, start: Sequence[float], end: Sequence[float]) -> None:
    vector = Vector(end) - Vector(start)
    obj.location = (Vector(start) + Vector(end)) * 0.5
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(vector.normalized())


def add_tapered_segment(
    name: str,
    start: Sequence[float],
    end: Sequence[float],
    radius_start: float,
    radius_end: float,
    material: bpy.types.Material,
    *,
    vertices: int = 18,
    bevel: float = 0.006,
) -> bpy.types.Object:
    length = (Vector(end) - Vector(start)).length
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius_start,
        radius2=radius_end,
        depth=length,
    )
    obj = bpy.context.object
    obj.name = name
    orient_z_axis(obj, start, end)
    apply_transform(obj)
    set_material(obj, material)
    if bevel:
        modifier = obj.modifiers.new("Garment edge softness", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.select_set(False)
    smooth_mesh(obj)
    return obj


def add_frustum(
    name: str,
    center: Sequence[float],
    bottom_width: float,
    top_width: float,
    height: float,
    bottom_depth: float,
    top_depth: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    cx, cy, cz = center
    z0 = cz - height * 0.5
    z1 = cz + height * 0.5
    verts = [
        (cx - bottom_width / 2, cy - bottom_depth / 2, z0),
        (cx + bottom_width / 2, cy - bottom_depth / 2, z0),
        (cx + bottom_width / 2, cy + bottom_depth / 2, z0),
        (cx - bottom_width / 2, cy + bottom_depth / 2, z0),
        (cx - top_width / 2, cy - top_depth / 2, z1),
        (cx + top_width / 2, cy - top_depth / 2, z1),
        (cx + top_width / 2, cy + top_depth / 2, z1),
        (cx - top_width / 2, cy + top_depth / 2, z1),
    ]
    faces = [
        (0, 3, 2, 1),
        (4, 5, 6, 7),
        (0, 1, 5, 4),
        (1, 2, 6, 5),
        (2, 3, 7, 6),
        (3, 0, 4, 7),
    ]
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_material(obj, material)
    bevel = obj.modifiers.new("Tailored soft edge", "BEVEL")
    bevel.width = 0.010
    bevel.segments = 2
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    obj.select_set(False)
    smooth_mesh(obj)
    return obj


def add_elliptical_loft(
    name: str,
    rings: Sequence[tuple[float, float, float, float]],
    material: bpy.types.Material,
    *,
    segments: int = 32,
    front_fullness: float = 1.035,
) -> bpy.types.Object:
    """Create one smooth anatomical/garment volume from elliptical rings.

    Rings use ``(z, radius_x, radius_y, center_y)``. Negative Y is the authored
    front of the character. A small front-fullness bias gives the chest and face
    a human profile without relying on overlapping spheres.
    """
    if len(rings) < 2:
        raise ValueError(f"{name}: at least two loft rings are required")
    vertices: list[tuple[float, float, float]] = []
    for z, radius_x, radius_y, center_y in rings:
        for segment in range(segments):
            angle = TAU * segment / segments
            sin_angle = math.sin(angle)
            y_radius = radius_y * (front_fullness if sin_angle < 0 else 1.0)
            vertices.append((radius_x * math.cos(angle), center_y + y_radius * sin_angle, z))
    faces: list[tuple[int, ...]] = []
    faces.append(tuple(reversed(range(segments))))
    for ring_index in range(len(rings) - 1):
        for segment in range(segments):
            next_segment = (segment + 1) % segments
            a = ring_index * segments + segment
            b = ring_index * segments + next_segment
            c = (ring_index + 1) * segments + next_segment
            d = (ring_index + 1) * segments + segment
            faces.append((a, b, c, d))
    top_start = (len(rings) - 1) * segments
    faces.append(tuple(top_start + segment for segment in range(segments)))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_material(obj, material)
    # Fabric materials carry deterministic woven textures. Custom lofts need a
    # UV layer even when the weave is subtle, otherwise glTF validator correctly
    # rejects the textured primitive.
    uv_layer = mesh.uv_layers.new(name="LoftUV")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index]
            uv_layer.data[loop_index].uv = (vertex.co.x * 2.0 + 0.5, vertex.co.z * 2.0)
    smooth_mesh(obj)
    return obj


def add_oriented_loft(
    name: str,
    start: Sequence[float],
    end: Sequence[float],
    radii: Sequence[tuple[float, float, float]],
    material: bpy.types.Material,
    *,
    segments: int = 24,
) -> bpy.types.Object:
    """Build a smooth limb/garment volume along an arbitrary bone axis.

    Each radius tuple is ``(t, radius_x, radius_y)`` along the start/end span.
    The extra intermediate rings create a continuous tapered sleeve or trouser
    silhouette and avoid the visible hard-cylinder sections of the old mesh.
    """
    start_vector = Vector(start)
    end_vector = Vector(end)
    axis = end_vector - start_vector
    length = axis.length
    if length <= 1e-6:
        raise ValueError(f"{name}: zero-length oriented loft")
    direction = axis.normalized()
    helper = Vector((0.0, 0.0, 1.0)) if abs(direction.z) < 0.92 else Vector((0.0, 1.0, 0.0))
    tangent_x = helper.cross(direction).normalized()
    tangent_y = direction.cross(tangent_x).normalized()
    vertices: list[tuple[float, float, float]] = []
    for t, radius_x, radius_y in radii:
        center = start_vector + direction * (length * t)
        for segment in range(segments):
            angle = TAU * segment / segments
            vertex = center + tangent_x * (math.cos(angle) * radius_x) + tangent_y * (math.sin(angle) * radius_y)
            vertices.append(tuple(vertex))
    faces: list[tuple[int, ...]] = [tuple(reversed(range(segments)))]
    for ring_index in range(len(radii) - 1):
        for segment in range(segments):
            following = (segment + 1) % segments
            a = ring_index * segments + segment
            b = ring_index * segments + following
            c = (ring_index + 1) * segments + following
            d = (ring_index + 1) * segments + segment
            faces.append((a, b, c, d))
    top = (len(radii) - 1) * segments
    faces.append(tuple(top + segment for segment in range(segments)))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_material(obj, material)
    uv_layer = mesh.uv_layers.new(name="LimbLoftUV")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index]
            uv_layer.data[loop_index].uv = (vertex.co.x * 2.0 + 0.5, vertex.co.z * 2.0)
    smooth_mesh(obj)
    return obj


def add_prism(
    name: str,
    points_xz: Sequence[tuple[float, float]],
    front_y: float,
    thickness: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    count = len(points_xz)
    verts = [(x, front_y, z) for x, z in points_xz] + [(x, front_y + thickness, z) for x, z in points_xz]
    faces: list[tuple[int, ...]] = [tuple(range(count)), tuple(range(count, count * 2))[::-1]]
    for index in range(count):
        next_index = (index + 1) % count
        faces.append((index, next_index, next_index + count, index + count))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_material(obj, material)
    bevel = obj.modifiers.new("Cloth thickness", "BEVEL")
    bevel.width = min(0.004, thickness * 0.28)
    bevel.segments = 2
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    obj.select_set(False)
    smooth_mesh(obj)
    return obj


def make_poly_curve(
    name: str,
    points: Sequence[Sequence[float]],
    material: bpy.types.Material,
    *,
    bevel_depth: float,
    cyclic: bool = False,
    resolution: int = 1,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(f"{name}_Curve", type="CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = resolution
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 2
    spline = curve.splines.new("NURBS" if len(points) > 3 and not cyclic else "POLY")
    spline.points.add(len(points) - 1)
    for spline_point, point in zip(spline.points, points):
        spline_point.co = (*point, 1.0)
    if spline.type == "NURBS":
        spline.order_u = min(3, len(points))
        spline.use_endpoint_u = True
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    curve.materials.append(material)
    return obj


def curve_to_mesh(obj: bpy.types.Object) -> bpy.types.Object:
    if obj.type != "CURVE":
        return obj
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj.select_set(False)
    return obj


def join_meshes(objects: Iterable[bpy.types.Object], name: str) -> bpy.types.Object:
    meshes = [curve_to_mesh(obj) for obj in objects if obj is not None]
    if not meshes:
        raise ValueError(f"No meshes supplied for {name}")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = name
    joined.data.name = f"{name}_Mesh"
    bpy.ops.object.select_all(action="DESELECT")
    return joined


def rig_mesh(obj: bpy.types.Object, armature: bpy.types.Object, bone_name: str) -> bpy.types.Object:
    group = obj.vertex_groups.new(name=bone_name)
    group.add(range(len(obj.data.vertices)), 1.0, "REPLACE")
    modifier = obj.modifiers.new("Executive armature", "ARMATURE")
    modifier.object = armature
    modifier.use_deform_preserve_volume = True
    # Blender's 4.5 exporter requires this neutral parent to associate meshes
    # with the armature while baking NLA.  Runtime transforms are applied to a
    # wrapper containing the entire imported glTF scene, never to this one node.
    obj.parent = armature
    obj.matrix_parent_inverse = armature.matrix_world.inverted()
    obj["rigid_weight_bone"] = bone_name
    return obj


def create_armature(profile: dict) -> tuple[bpy.types.Object, dict[str, tuple[Vector, Vector]]]:
    h = profile["height"]
    factor = h / 1.80
    shoulder = profile["shoulder_width"] / 2
    hip_x = profile["waist_width"] * 0.30
    ankle_x = profile["waist_width"] * 0.25
    z_ankle = 0.105 * factor
    z_knee = 0.515 * factor
    z_hip = 0.955 * factor
    z_chest = 1.335 * factor
    z_shoulder = 1.455 * factor
    z_neck = 1.515 * factor
    z_head_top = h - 0.015

    endpoints: dict[str, tuple[Vector, Vector]] = {
        "Root": (Vector((0, 0, 0)), Vector((0, 0, 0.10 * factor))),
        "Hips": (Vector((0, 0, z_hip)), Vector((0, 0, 1.06 * factor))),
        "Spine": (Vector((0, 0, z_hip)), Vector((0, 0, 1.225 * factor))),
        "Chest": (Vector((0, 0, 1.225 * factor)), Vector((0, 0, z_shoulder))),
        "Neck": (Vector((0, 0, z_shoulder)), Vector((0, 0, z_neck))),
        "Head": (Vector((0, 0, z_neck)), Vector((0, 0, z_head_top))),
    }
    for side, sign in (("L", 1.0), ("R", -1.0)):
        endpoints[f"UpperLeg.{side}"] = (
            Vector((sign * hip_x, 0, z_hip)),
            Vector((sign * ankle_x * 1.06, 0.006, z_knee)),
        )
        endpoints[f"LowerLeg.{side}"] = (
            endpoints[f"UpperLeg.{side}"][1],
            Vector((sign * ankle_x, 0, z_ankle)),
        )
        endpoints[f"Foot.{side}"] = (
            endpoints[f"LowerLeg.{side}"][1],
            Vector((sign * ankle_x, -0.205 * factor, 0.070 * factor)),
        )
        upper_start = Vector((sign * shoulder, 0, z_shoulder))
        if profile["carries_mate"] and side == "L":
            elbow = Vector((sign * (shoulder + 0.060 * factor), -0.025, 1.205 * factor))
            wrist = Vector((0.205 * factor, -0.235 * factor, 1.135 * factor))
            hand_end = Vector((0.125 * factor, -0.305 * factor, 1.120 * factor))
        else:
            elbow = Vector((sign * (shoulder + 0.060 * factor), 0.0, 1.165 * factor))
            wrist = Vector((sign * (shoulder + 0.070 * factor), -0.012, 0.905 * factor))
            hand_end = Vector((sign * (shoulder + 0.064 * factor), -0.030, 0.790 * factor))
        endpoints[f"UpperArm.{side}"] = (upper_start, elbow)
        endpoints[f"Forearm.{side}"] = (elbow, wrist)
        endpoints[f"Hand.{side}"] = (wrist, hand_end)

    armature_data = bpy.data.armatures.new(f"{profile['object_name']}_RigData")
    armature = bpy.data.objects.new(f"{profile['object_name']}_Rig", armature_data)
    bpy.context.collection.objects.link(armature)
    armature.show_in_front = False
    armature.data.display_type = "OCTAHEDRAL"
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    parents = {
        "Hips": "Root",
        "Spine": "Hips",
        "Chest": "Spine",
        "Neck": "Chest",
        "Head": "Neck",
        "UpperLeg.L": "Hips",
        "LowerLeg.L": "UpperLeg.L",
        "Foot.L": "LowerLeg.L",
        "UpperLeg.R": "Hips",
        "LowerLeg.R": "UpperLeg.R",
        "Foot.R": "LowerLeg.R",
        "UpperArm.L": "Chest",
        "Forearm.L": "UpperArm.L",
        "Hand.L": "Forearm.L",
        "UpperArm.R": "Chest",
        "Forearm.R": "UpperArm.R",
        "Hand.R": "Forearm.R",
    }
    for bone_name, (head, tail) in endpoints.items():
        bone = armature_data.edit_bones.new(bone_name)
        bone.head = head
        bone.tail = tail
        bone.use_deform = bone_name != "Root"
        if bone_name in parents:
            bone.parent = armature_data.edit_bones[parents[bone_name]]
            bone.use_connect = False
    bpy.ops.object.mode_set(mode="POSE")
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_mode = "XYZ"
    bpy.ops.object.mode_set(mode="OBJECT")
    armature.select_set(False)
    armature["display_name"] = profile["display_name"]
    armature["role"] = profile["role"]
    armature["height_m"] = profile["height"]
    armature["forward_axis"] = "+Z in glTF / -Y in Blender authoring space"
    armature["root_motion"] = "removed"
    armature["reference_basis"] = "user-supplied photographs and approved generated turnaround"
    return armature, endpoints


def create_lower_body(profile: dict, materials: dict, armature: bpy.types.Object, endpoints: dict) -> list[bpy.types.Object]:
    h_factor = profile["height"] / 1.80
    objects: list[bpy.types.Object] = []
    pelvis_parts = [
        add_frustum(
            f"{profile['object_name']}_TrouserWaistBase",
            (0, 0.015, 0.985 * h_factor),
            profile["waist_width"] * 0.82,
            profile["waist_width"],
            0.185 * h_factor,
            0.225,
            0.245,
            materials["suit"],
        ),
        add_rounded_cube(
            f"{profile['object_name']}_Belt",
            (0, 0.030, 1.037 * h_factor),
            (profile["waist_width"] * 0.90, 0.155, 0.020),
            materials["shoe"],
            bevel=0.004,
        ),
        add_rounded_cube(
            f"{profile['object_name']}_BeltBuckle",
            (0, -0.050, 1.037 * h_factor),
            (0.032, 0.007, 0.020),
            materials["metal"],
            bevel=0.003,
        ),
    ]
    objects.append(rig_mesh(join_meshes(pelvis_parts, f"{profile['object_name']}_TrousersWaist"), armature, "Hips"))

    for side in ("L", "R"):
        upper_start, upper_end = endpoints[f"UpperLeg.{side}"]
        lower_start, lower_end = endpoints[f"LowerLeg.{side}"]
        thigh_radius = 0.090 * h_factor if profile["slug"] == "djeison-drey" else 0.082 * h_factor
        thigh = add_oriented_loft(
            f"{profile['object_name']}_TrouserUpper.{side}",
            upper_start + Vector((0, 0.012, -0.015)),
            upper_end,
            [
                (0.0, thigh_radius * 1.04, thigh_radius * 0.94),
                (0.18, thigh_radius * 1.00, thigh_radius * 0.91),
                (0.52, thigh_radius * 0.88, thigh_radius * 0.83),
                (0.84, thigh_radius * 0.76, thigh_radius * 0.73),
                (1.0, thigh_radius * 0.73, thigh_radius * 0.70),
            ],
            materials["suit"],
            segments=24,
        )
        crease = add_tapered_segment(
            f"{profile['object_name']}_TrouserCreaseUpper.{side}",
            upper_start + Vector((0, -0.084, -0.035)),
            upper_end + Vector((0, -0.055, 0.020)),
            0.0035,
            0.0025,
            materials["suit_edge"],
            vertices=8,
            bevel=0.001,
        )
        objects.append(rig_mesh(join_meshes([thigh, crease], f"{profile['object_name']}_UpperLeg.{side}"), armature, f"UpperLeg.{side}"))

        calf_radius = 0.064 * h_factor
        calf = add_oriented_loft(
            f"{profile['object_name']}_TrouserLower.{side}",
            lower_start,
            lower_end + Vector((0, 0, 0.015)),
            [
                (0.0, calf_radius * 1.02, calf_radius * 0.98),
                (0.20, calf_radius * 0.98, calf_radius * 0.94),
                (0.48, calf_radius * 1.02, calf_radius * 0.90),
                (0.78, calf_radius * 0.82, calf_radius * 0.77),
                (1.0, calf_radius * 0.72, calf_radius * 0.68),
            ],
            materials["suit"],
            segments=24,
        )
        knee_cover = add_uv_sphere(
            f"{profile['object_name']}_TailoredKnee.{side}",
            lower_start,
            (0.063 * h_factor, 0.060 * h_factor, 0.064 * h_factor),
            materials["suit"],
            segments=20,
            rings=12,
        )
        lower_crease = add_tapered_segment(
            f"{profile['object_name']}_TrouserCreaseLower.{side}",
            lower_start + Vector((0, -0.056, -0.015)),
            lower_end + Vector((0, -0.040, 0.035)),
            0.0028,
            0.0022,
            materials["suit_edge"],
            vertices=8,
            bevel=0.001,
        )
        objects.append(rig_mesh(join_meshes([calf, knee_cover, lower_crease], f"{profile['object_name']}_LowerLeg.{side}"), armature, f"LowerLeg.{side}"))

        sign = 1 if side == "L" else -1
        ankle = lower_end
        shoe_parts = [
            add_rounded_cube(
                f"{profile['object_name']}_Sole.{side}",
                (ankle.x, -0.080 * h_factor, 0.030 * h_factor),
                (0.125 * h_factor, 0.285 * h_factor, 0.030 * h_factor),
                materials["sole"],
                bevel=0.012,
            ),
            add_uv_sphere(
                f"{profile['object_name']}_ShoeUpper.{side}",
                (ankle.x, -0.073 * h_factor, 0.069 * h_factor),
                (0.061 * h_factor, 0.130 * h_factor, 0.047 * h_factor),
                materials["shoe"],
                segments=20,
                rings=12,
            ),
            add_rounded_cube(
                f"{profile['object_name']}_Heel.{side}",
                (ankle.x, 0.034 * h_factor, 0.052 * h_factor),
                (0.102 * h_factor, 0.065 * h_factor, 0.060 * h_factor),
                materials["shoe"],
                bevel=0.010,
            ),
        ]
        for lace_index in range(3):
            y = -0.055 - lace_index * 0.025
            shoe_parts.append(
                make_poly_curve(
                    f"{profile['object_name']}_Lace{lace_index}.{side}",
                    [
                        (ankle.x - 0.035 * h_factor, y, 0.106 * h_factor),
                        (ankle.x + 0.035 * h_factor, y, 0.106 * h_factor),
                    ],
                    materials["sole"],
                    bevel_depth=0.0018,
                )
            )
        objects.append(rig_mesh(join_meshes(shoe_parts, f"{profile['object_name']}_Shoe.{side}"), armature, f"Foot.{side}"))
    return objects


def create_upper_body(profile: dict, materials: dict, armature: bpy.types.Object, endpoints: dict) -> list[bpy.types.Object]:
    factor = profile["height"] / 1.80
    shoulder_width = profile["shoulder_width"]
    waist_width = profile["waist_width"]
    torso_depth = 0.225 if profile["slug"] == "fabiano-soltis" else 0.250
    front_y = -torso_depth * 0.505
    upper_parts: list[bpy.types.Object] = [
        add_elliptical_loft(
            f"{profile['object_name']}_JacketAnatomicalShell",
            [
                (1.055 * factor, waist_width * 0.44, torso_depth * 0.38, 0.020),
                (1.125 * factor, waist_width * 0.50, torso_depth * 0.44, 0.014),
                (1.245 * factor, shoulder_width * 0.425, torso_depth * 0.49, 0.008),
                (1.355 * factor, shoulder_width * 0.485, torso_depth * 0.50, 0.004),
                (1.425 * factor, shoulder_width * 0.455, torso_depth * 0.43, 0.002),
            ],
            materials["suit"],
            segments=36,
            front_fullness=1.055 if profile["slug"] == "djeison-drey" else 1.040,
        ),
        add_prism(
            f"{profile['object_name']}_ShirtBib",
            [(-0.082, 1.430 * factor), (0.082, 1.430 * factor), (0.050, 1.085 * factor), (-0.050, 1.085 * factor)],
            front_y - 0.010,
            0.012,
            materials["shirt"],
        ),
        add_prism(
            f"{profile['object_name']}_JacketFrontLeft",
            [
                (-shoulder_width * 0.49, 1.430 * factor),
                (-0.072, 1.415 * factor),
                (-0.020, 1.090 * factor),
                (-waist_width * 0.49, 1.060 * factor),
            ],
            front_y - 0.016,
            0.018,
            materials["suit"],
        ),
        add_prism(
            f"{profile['object_name']}_JacketFrontRight",
            [
                (0.072, 1.415 * factor),
                (shoulder_width * 0.49, 1.430 * factor),
                (waist_width * 0.49, 1.060 * factor),
                (0.020, 1.090 * factor),
            ],
            front_y - 0.016,
            0.018,
            materials["suit"],
        ),
        add_prism(
            f"{profile['object_name']}_LapelLeft",
            [(-0.085, 1.425 * factor), (-0.020, 1.265 * factor), (-0.105, 1.330 * factor), (-0.165, 1.410 * factor)],
            front_y - 0.038,
            0.012,
            materials["suit_edge"],
        ),
        add_prism(
            f"{profile['object_name']}_LapelRight",
            [(0.085, 1.425 * factor), (0.165, 1.410 * factor), (0.105, 1.330 * factor), (0.020, 1.265 * factor)],
            front_y - 0.038,
            0.012,
            materials["suit_edge"],
        ),
        add_prism(
            f"{profile['object_name']}_TieBlade",
            [(-0.030, 1.382 * factor), (0.030, 1.382 * factor), (0.022, 1.150 * factor), (0, 1.100 * factor), (-0.022, 1.150 * factor)],
            front_y - 0.054,
            0.010,
            materials["tie"],
        ),
        add_prism(
            f"{profile['object_name']}_TieKnot",
            [(-0.033, 1.425 * factor), (0.033, 1.425 * factor), (0.024, 1.372 * factor), (-0.024, 1.372 * factor)],
            front_y - 0.056,
            0.012,
            materials["tie"],
        ),
    ]
    for button_index, z in enumerate((1.235, 1.145)):
        upper_parts.append(
            add_uv_sphere(
                f"{profile['object_name']}_JacketButton{button_index}",
                (0, front_y - 0.066, z * factor),
                (0.009, 0.004, 0.009),
                materials["button"],
                segments=12,
                rings=8,
            )
        )
    for side_sign in (-1, 1):
        upper_parts.append(
            add_rounded_cube(
                f"{profile['object_name']}_PocketFlap{side_sign}",
                (side_sign * shoulder_width * 0.32, front_y - 0.052, 1.155 * factor),
                (shoulder_width * 0.25, 0.014, 0.030),
                materials["suit_edge"],
                bevel=0.004,
                rotation=(0, 0, side_sign * 0.035),
            )
        )
    upper_body = rig_mesh(join_meshes(upper_parts, f"{profile['object_name']}_TailoredUpperBody"), armature, "Chest")

    neck_start = Vector((0, 0.008, 1.435 * factor))
    neck_end = Vector((0, 0.004, 1.575 * factor))
    neck_parts = [
        add_tapered_segment(
            f"{profile['object_name']}_NeckSkin",
            neck_start,
            neck_end,
            0.058 * factor if profile["slug"] == "djeison-drey" else 0.052 * factor,
            0.050 * factor if profile["slug"] == "djeison-drey" else 0.046 * factor,
            materials["skin"],
            vertices=22,
            bevel=0.004,
        ),
        add_prism(
            f"{profile['object_name']}_ShirtCollarLeft",
            [(-0.078, 1.475 * factor), (-0.006, 1.425 * factor), (-0.047, 1.392 * factor), (-0.108, 1.445 * factor)],
            front_y - 0.061,
            0.010,
            materials["shirt"],
        ),
        add_prism(
            f"{profile['object_name']}_ShirtCollarRight",
            [(0.078, 1.475 * factor), (0.108, 1.445 * factor), (0.047, 1.392 * factor), (0.006, 1.425 * factor)],
            front_y - 0.061,
            0.010,
            materials["shirt"],
        ),
    ]
    neck = rig_mesh(join_meshes(neck_parts, f"{profile['object_name']}_NeckAndCollar"), armature, "Neck")

    objects = [upper_body, neck]
    for side in ("L", "R"):
        upper_start, upper_end = endpoints[f"UpperArm.{side}"]
        lower_start, lower_end = endpoints[f"Forearm.{side}"]
        upper_radius = 0.065 * factor if profile["slug"] == "djeison-drey" else 0.059 * factor
        upper_sleeve = add_oriented_loft(
            f"{profile['object_name']}_JacketUpperSleeve.{side}",
            upper_start,
            upper_end,
            [
                (0.0, upper_radius * 0.82, upper_radius * 0.78),
                (0.12, upper_radius * 0.94, upper_radius * 0.89),
                (0.26, upper_radius * 1.00, upper_radius * 0.94),
                (0.48, upper_radius * 0.91, upper_radius * 0.88),
                (0.82, upper_radius * 0.79, upper_radius * 0.77),
                (1.0, upper_radius * 0.75, upper_radius * 0.73),
            ],
            materials["suit"],
            segments=24,
        )
        objects.append(rig_mesh(join_meshes([upper_sleeve], f"{profile['object_name']}_UpperArm.{side}"), armature, f"UpperArm.{side}"))

        forearm_sleeve = add_oriented_loft(
            f"{profile['object_name']}_JacketForearmSleeve.{side}",
            lower_start,
            lower_end,
            [
                (0.0, upper_radius * 0.78, upper_radius * 0.75),
                (0.18, upper_radius * 0.78, upper_radius * 0.74),
                (0.52, upper_radius * 0.71, upper_radius * 0.68),
                (0.84, upper_radius * 0.63, upper_radius * 0.60),
                (1.0, upper_radius * 0.60, upper_radius * 0.57),
            ],
            materials["suit"],
            segments=24,
        )
        elbow_cover = add_uv_sphere(
            f"{profile['object_name']}_TailoredElbow.{side}",
            lower_start,
            (upper_radius * 0.82, upper_radius * 0.78, upper_radius * 0.82),
            materials["suit"],
            segments=18,
            rings=10,
        )
        cuff_vector = (lower_start - lower_end).normalized() * 0.024
        cuff = add_tapered_segment(
            f"{profile['object_name']}_ShirtCuff.{side}",
            lower_end + cuff_vector,
            lower_end - cuff_vector * 0.35,
            upper_radius * 0.61,
            upper_radius * 0.58,
            materials["shirt"],
            vertices=18,
            bevel=0.003,
        )
        objects.append(rig_mesh(join_meshes([forearm_sleeve, elbow_cover, cuff], f"{profile['object_name']}_Forearm.{side}"), armature, f"Forearm.{side}"))
    return objects


def create_hand(profile: dict, materials: dict, armature: bpy.types.Object, endpoints: dict, side: str) -> bpy.types.Object:
    start, end = endpoints[f"Hand.{side}"]
    factor = profile["height"] / 1.80
    vector = end - start
    center = start + vector * 0.50
    parts: list[bpy.types.Object] = []
    if profile["carries_mate"] and side == "L":
        parts.append(add_uv_sphere(f"{profile['object_name']}_Palm.{side}", center, (0.050, 0.033, 0.066), materials["skin"], segments=20, rings=12))
        cup_center = Vector((0.105 * factor, -0.320 * factor, 1.145 * factor))
        for index, z_offset in enumerate((-0.036, -0.012, 0.014, 0.038)):
            radius = 0.0068 - index * 0.00025
            angle_start = math.radians(-68)
            angle_end = math.radians(58)
            points = []
            for step in range(7):
                angle = angle_start + (angle_end - angle_start) * step / 6
                points.append(
                    (
                        cup_center.x + math.cos(angle) * (0.061 + index * 0.001),
                        cup_center.y + math.sin(angle) * (0.061 + index * 0.001),
                        cup_center.z + z_offset,
                    )
                )
            parts.append(make_poly_curve(f"{profile['object_name']}_GripFinger{index}.{side}", points, materials["skin"], bevel_depth=radius, resolution=2))
        thumb_points = [
            center + Vector((-0.015, -0.015, 0.020)),
            cup_center + Vector((0.045, -0.030, 0.038)),
            cup_center + Vector((0.015, -0.050, 0.035)),
        ]
        parts.append(make_poly_curve(f"{profile['object_name']}_GripThumb.{side}", thumb_points, materials["skin"], bevel_depth=0.008, resolution=2))
    else:
        palm = add_uv_sphere(f"{profile['object_name']}_Palm.{side}", center, (0.043 * factor, 0.026 * factor, 0.061 * factor), materials["skin"], segments=20, rings=12)
        palm.rotation_mode = "QUATERNION"
        palm.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(vector.normalized())
        parts.append(palm)
        sign = 1 if side == "L" else -1
        for finger_index in range(4):
            x_offset = sign * (finger_index - 1.5) * 0.011
            finger_start = end + Vector((x_offset, -0.004 * finger_index, 0.028))
            finger_end = finger_start + vector.normalized() * 0.050
            parts.append(
                add_tapered_segment(
                    f"{profile['object_name']}_Finger{finger_index}.{side}",
                    finger_start,
                    finger_end,
                    0.0065,
                    0.0050,
                    materials["skin"],
                    vertices=10,
                    bevel=0.002,
                )
            )
        thumb_start = center + Vector((-sign * 0.034, -0.008, 0.010))
        thumb_end = thumb_start + Vector((-sign * 0.020, -0.014, -0.032))
        parts.append(add_tapered_segment(f"{profile['object_name']}_Thumb.{side}", thumb_start, thumb_end, 0.008, 0.006, materials["skin"], vertices=10, bevel=0.002))
    return rig_mesh(join_meshes(parts, f"{profile['object_name']}_Hand.{side}"), armature, f"Hand.{side}")


def create_spherical_cap(
    name: str,
    center: Sequence[float],
    radii: Sequence[float],
    material: bpy.types.Material,
    *,
    rings: int = 9,
    segments: int = 30,
    front_drop: float = 0.0,
    max_theta: float = math.pi * 0.51,
) -> bpy.types.Object:
    cx, cy, cz = center
    rx, ry, rz = radii
    verts: list[tuple[float, float, float]] = []
    for ring in range(rings + 1):
        theta = max_theta * ring / rings
        for segment in range(segments):
            phi = TAU * segment / segments
            front = max(0.0, -math.sin(phi))
            adjusted_theta = theta + front_drop * front * (ring / rings)
            verts.append(
                (
                    cx + rx * math.sin(adjusted_theta) * math.cos(phi),
                    cy + ry * math.sin(adjusted_theta) * math.sin(phi),
                    cz + rz * math.cos(adjusted_theta),
                )
            )
    faces: list[tuple[int, int, int, int]] = []
    for ring in range(rings):
        for segment in range(segments):
            next_segment = (segment + 1) % segments
            a = ring * segments + segment
            b = ring * segments + next_segment
            c = (ring + 1) * segments + next_segment
            d = (ring + 1) * segments + segment
            faces.append((a, b, c, d))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_material(obj, material)
    solidify = obj.modifiers.new("Hair cap thickness", "SOLIDIFY")
    solidify.thickness = 0.004
    solidify.offset = 0.0
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=solidify.name)
    obj.select_set(False)
    smooth_mesh(obj)
    return obj


def create_reference_face_surface(
    profile: dict,
    center_z: float,
    material: bpy.types.Material,
    *,
    columns: int = 20,
    rows: int = 26,
) -> bpy.types.Object:
    """Create a curved, alpha-feathered photo surface over the sculpted head.

    This is not a flat billboard: vertices follow the front half of the head
    ellipsoid, retaining useful parallax around cheeks, forehead and jaw.
    """
    head_width, head_depth, head_height = profile["head"]
    radius_x = head_width * 0.492
    radius_y = head_depth * 0.515
    radius_z = head_height * 0.492
    vertices: list[tuple[float, float, float]] = []
    vertex_uvs: list[tuple[float, float]] = []
    for row in range(rows + 1):
        v = row / rows
        normalized_z = (v - 0.5) * 1.90
        for column in range(columns + 1):
            u = column / columns
            normalized_x = (u - 0.5) * 1.92
            radial = normalized_x * normalized_x + normalized_z * normalized_z
            front_factor = math.sqrt(max(0.04, 1.0 - min(0.96, radial)))
            # A slightly flatter mid-face gives the portrait room without
            # sacrificing the curved cheek silhouette at oblique angles.
            y = -radius_y * (0.80 + 0.21 * front_factor) - 0.0025
            x = normalized_x * radius_x
            z = center_z + normalized_z * radius_z
            vertices.append((x, y, z))
            vertex_uvs.append((u, v))
    faces: list[tuple[int, int, int, int]] = []
    for row in range(rows):
        for column in range(columns):
            a = row * (columns + 1) + column
            b = a + 1
            d = (row + 1) * (columns + 1) + column
            c = d + 1
            faces.append((a, b, c, d))
    mesh = bpy.data.meshes.new(f"{profile['object_name']}_ReferenceFace_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="ReferenceFaceUV")
    for loop in mesh.loops:
        uv_layer.data[loop.index].uv = vertex_uvs[loop.vertex_index]
    obj = bpy.data.objects.new(f"{profile['object_name']}_ReferenceFace", mesh)
    bpy.context.collection.objects.link(obj)
    set_material(obj, material)
    smooth_mesh(obj)
    obj["likeness_surface"] = "approved turnaround crop mapped to curved face geometry"
    return obj


def create_lower_face_hair_surface(
    profile: dict,
    center_z: float,
    material: bpy.types.Material,
    *,
    full_beard: bool,
    columns: int = 24,
    rows: int = 14,
) -> bpy.types.Object:
    """Create a close-fitting beard/stubble layer over the sculpted jaw.

    A thin curved shell follows the lower-face ellipse.  This avoids the
    detached "beard ball" silhouette created by overlapping spheres while
    retaining a light enough mesh for the map's long camera distances.
    """
    head_width, head_depth, head_height = profile["head"]
    vertices: list[tuple[float, float, float]] = []
    vertex_uvs: list[tuple[float, float]] = []
    for row in range(rows + 1):
        v = row / rows
        # Narrow at the chin, broad across the lower cheeks. Djeison's full
        # beard rises higher and wraps farther around the jaw than Fabiano's
        # close stubble.
        z_normalized = -0.47 + v * (0.21 if full_beard else 0.18)
        width_factor = (0.50 + 0.42 * math.sin(v * math.pi * 0.76)) if full_beard else (0.43 + 0.38 * math.sin(v * math.pi * 0.82))
        for column in range(columns + 1):
            u = column / columns
            x_normalized = (u - 0.5) * 2.0
            x = x_normalized * head_width * width_factor * 0.50
            wrap = math.sqrt(max(0.05, 1.0 - min(0.95, x_normalized * x_normalized)))
            # Keep the beard shell behind the modeled lips/moustache while
            # remaining just proud of the jaw skin.
            y = -head_depth * (0.410 + 0.087 * wrap) - (0.0018 if full_beard else 0.001)
            z = center_z + z_normalized * head_height
            vertices.append((x, y, z))
            vertex_uvs.append((u, v))
    faces: list[tuple[int, int, int, int]] = []
    for row in range(rows):
        for column in range(columns):
            a = row * (columns + 1) + column
            b = a + 1
            d = (row + 1) * (columns + 1) + column
            c = d + 1
            faces.append((a, b, c, d))
    mesh = bpy.data.meshes.new(f"{profile['object_name']}_FacialHairSurface_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="FacialHairUV")
    for loop in mesh.loops:
        uv_layer.data[loop.index].uv = vertex_uvs[loop.vertex_index]
    obj = bpy.data.objects.new(f"{profile['object_name']}_FacialHairSurface", mesh)
    bpy.context.collection.objects.link(obj)
    set_material(obj, material)
    solidify = obj.modifiers.new("Facial hair thickness", "SOLIDIFY")
    solidify.thickness = 0.004 if full_beard else 0.002
    solidify.offset = 0.0
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=solidify.name)
    obj.select_set(False)
    smooth_mesh(obj)
    return obj


def rounded_rectangle_points(cx: float, y: float, cz: float, width: float, height: float, radius: float, segments: int = 4):
    points: list[tuple[float, float, float]] = []
    for corner_x, corner_z, start_angle in (
        (cx + width / 2 - radius, cz + height / 2 - radius, 0),
        (cx - width / 2 + radius, cz + height / 2 - radius, 90),
        (cx - width / 2 + radius, cz - height / 2 + radius, 180),
        (cx + width / 2 - radius, cz - height / 2 + radius, 270),
    ):
        for step in range(segments + 1):
            angle = math.radians(start_angle + step * 90 / segments)
            points.append((corner_x + radius * math.cos(angle), y, corner_z + radius * math.sin(angle)))
    return points


def create_head(profile: dict, materials: dict, armature: bpy.types.Object, endpoints: dict) -> list[bpy.types.Object]:
    factor = profile["height"] / 1.80
    head_width, head_depth, head_height = profile["head"]
    head_top = profile["height"] - 0.015
    center_z = head_top - head_height / 2
    center = Vector((0, 0, center_z))
    chin_width = profile["jaw_width"] * (0.36 if profile["slug"] == "fabiano-soltis" else 0.42)
    skin_parts: list[bpy.types.Object] = [
        add_elliptical_loft(
            f"{profile['object_name']}_ContinuousHead",
            [
                (center_z - head_height * 0.50, 0.002, 0.002, 0.007),
                (center_z - head_height * 0.47, chin_width * 0.72, head_depth * 0.17, 0.0065),
                (center_z - head_height * 0.39, profile["jaw_width"] * 0.43, head_depth * 0.405, 0.003),
                (center_z - head_height * 0.30, profile["jaw_width"] * 0.48, head_depth * 0.455, 0.000),
                (center_z - head_height * 0.19, head_width * 0.465, head_depth * 0.49, -0.002),
                (center_z + head_height * 0.05, head_width * 0.505, head_depth * 0.505, 0.000),
                (center_z + head_height * 0.27, head_width * 0.49, head_depth * 0.475, 0.004),
                (center_z + head_height * 0.43, head_width * 0.37, head_depth * 0.355, 0.008),
                (center_z + head_height * 0.48, head_width * 0.20, head_depth * 0.20, 0.010),
                (center_z + head_height * 0.50, 0.002, 0.002, 0.010),
            ],
            materials["skin"],
            segments=40,
            front_fullness=1.055,
        ),
    ]
    cheek_z = center_z - 0.010 * factor
    for side_sign, asymmetry in ((-1, -0.002), (1, 0.0025)):
        skin_parts.append(
            add_uv_sphere(
                f"{profile['object_name']}_Cheek{side_sign}",
                (side_sign * head_width * 0.255, -head_depth * 0.480 - asymmetry, cheek_z + asymmetry),
                (head_width * 0.165, head_depth * 0.040, head_height * 0.105),
                materials["skin_warm"],
                segments=20,
                rings=12,
            )
        )
        skin_parts.append(
            add_uv_sphere(
                f"{profile['object_name']}_Ear{side_sign}",
                (side_sign * head_width * 0.53, 0.002, center_z - 0.005),
                (0.019 * factor, 0.011 * factor, 0.036 * factor),
                materials["skin"],
                segments=18,
                rings=12,
            )
        )
    nose_bridge_start = Vector((0, -head_depth * 0.49, center_z + head_height * 0.145))
    nose_tip = Vector((0, -head_depth * 0.49 - profile["nose_length"], center_z - head_height * 0.005))
    skin_parts.append(
        add_tapered_segment(
            f"{profile['object_name']}_NoseBridge",
            nose_bridge_start,
            nose_tip,
            profile["nose_width"] * 0.34,
            profile["nose_width"] * 0.47,
            materials["skin"],
            vertices=18,
            bevel=0.003,
        )
    )
    skin_parts.append(
        add_uv_sphere(
            f"{profile['object_name']}_NoseTip",
            nose_tip,
            (profile["nose_width"] * 0.55, profile["nose_width"] * 0.43, profile["nose_width"] * 0.43),
            materials["skin_warm"],
            segments=20,
            rings=12,
        )
    )
    head_skin = rig_mesh(join_meshes(skin_parts, f"{profile['object_name']}_HeadSkin"), armature, "Head")

    reference_face = None
    if "face_photo" in materials:
        reference_face = rig_mesh(
            create_reference_face_surface(profile, center_z, materials["face_photo"]),
            armature,
            "Head",
        )

    eye_parts: list[bpy.types.Object] = []
    eye_z = center_z + head_height * 0.105
    eye_y = -head_depth * 0.505
    iris_radius = 0.0064 if profile["slug"] == "fabiano-soltis" else 0.0068
    for side_sign in (-1, 1):
        eye_x = side_sign * profile["eye_spacing"] / 2
        eye_parts.extend(
            [
                add_uv_sphere(
                    f"{profile['object_name']}_EyeWhite{side_sign}",
                    (eye_x, eye_y, eye_z + side_sign * 0.001),
                    (0.0185, 0.0065, 0.0088),
                    materials["eye_white"],
                    segments=20,
                    rings=12,
                ),
                add_uv_sphere(
                    f"{profile['object_name']}_Iris{side_sign}",
                    (eye_x, eye_y - 0.0082, eye_z + side_sign * 0.001),
                    (iris_radius, 0.0018, iris_radius),
                    materials["iris"],
                    segments=18,
                    rings=10,
                ),
                add_uv_sphere(
                    f"{profile['object_name']}_Pupil{side_sign}",
                    (eye_x, eye_y - 0.0105, eye_z + side_sign * 0.001),
                    (iris_radius * 0.39, 0.0012, iris_radius * 0.39),
                    materials["pupil"],
                    segments=16,
                    rings=8,
                ),
            ]
        )
        brow_y = eye_y - 0.012
        brow_z = eye_z + 0.030 + (0.003 if side_sign == 1 else 0)
        eye_parts.append(
            make_poly_curve(
                f"{profile['object_name']}_Eyebrow{side_sign}",
                [
                    (eye_x - 0.026, brow_y, brow_z - 0.003),
                    (eye_x, brow_y - 0.002, brow_z + 0.004),
                    (eye_x + 0.026, brow_y, brow_z - 0.001),
                ],
                materials["hair"],
                bevel_depth=0.0028 if profile["slug"] == "djeison-drey" else 0.0024,
                resolution=2,
            )
        )
    eyes = rig_mesh(join_meshes(eye_parts, f"{profile['object_name']}_EyesAndBrows"), armature, "Head")

    mouth_z = center_z - head_height * 0.205
    mouth_y = -head_depth * 0.515
    smile_lift = 0.004 if profile["slug"] == "fabiano-soltis" else 0.006
    mouth_parts = [
        make_poly_curve(
            f"{profile['object_name']}_UpperLip",
            [
                (-profile["mouth_width"] / 2, mouth_y, mouth_z + smile_lift),
                (-profile["mouth_width"] * 0.17, mouth_y - 0.004, mouth_z + 0.001),
                (0, mouth_y - 0.005, mouth_z + 0.004),
                (profile["mouth_width"] * 0.17, mouth_y - 0.004, mouth_z + 0.0015),
                (profile["mouth_width"] / 2, mouth_y, mouth_z + smile_lift * 1.12),
            ],
            materials["lip"],
            bevel_depth=0.0034,
            resolution=2,
        ),
        make_poly_curve(
            f"{profile['object_name']}_LowerLip",
            [
                (-profile["mouth_width"] * 0.43, mouth_y, mouth_z - 0.001),
                (0, mouth_y - 0.0045, mouth_z - 0.007),
                (profile["mouth_width"] * 0.43, mouth_y, mouth_z - 0.001),
            ],
            materials["lip"],
            bevel_depth=0.0038,
            resolution=2,
        ),
    ]
    mouth = rig_mesh(join_meshes(mouth_parts, f"{profile['object_name']}_Mouth"), armature, "Head")

    # The reference-face material already contains the approved eye, eyebrow
    # and mouth placement. Keeping procedural features on top of that portrait
    # produced doubled pupils/lips and was the main source of the mannequin-like
    # expression seen in the previous QA render. Preserve the fallback geometry
    # only for texture-free regeneration.
    if reference_face is not None:
        bpy.data.objects.remove(eyes, do_unlink=True)
        bpy.data.objects.remove(mouth, do_unlink=True)
        eyes = None
        mouth = None

    hair_parts: list[bpy.types.Object] = [
        create_spherical_cap(
            f"{profile['object_name']}_HairCap",
            (0, 0.006, center_z + 0.010),
            (head_width * 0.515, head_depth * 0.515, head_height * 0.51),
            materials["hair"],
            front_drop=0.055 if profile["slug"] == "fabiano-soltis" else 0.028,
            max_theta=math.pi * 0.39,
            rings=12,
            segments=40,
        )
    ]
    rng = random.Random(2704 if profile["slug"] == "fabiano-soltis" else 1308)
    clump_count = 48 if profile["slug"] == "fabiano-soltis" else 56
    for index in range(clump_count):
        angle = TAU * (index / clump_count) + rng.uniform(-0.09, 0.09)
        radial = rng.uniform(0.18, 0.86)
        x = math.cos(angle) * head_width * 0.42 * radial
        y = math.sin(angle) * head_depth * 0.42 * radial
        surface_z = center_z + head_height * (0.505 - 0.17 * radial * radial)
        if profile["hair_style"] == "dark_swept":
            end_offset = Vector((0.020 + 0.020 * radial, 0.007, 0.013 + 0.010 * (1 - radial)))
        else:
            end_offset = Vector((rng.uniform(-0.013, 0.018), rng.uniform(-0.006, 0.013), rng.uniform(0.012, 0.028)))
        start = Vector((x, y, surface_z - 0.012))
        mid = start + end_offset * 0.55 + Vector((0, 0, 0.006))
        end = start + end_offset
        hair_parts.append(
            make_poly_curve(
                f"{profile['object_name']}_HairClump{index}",
                [start, mid, end],
                materials["hair"],
                bevel_depth=0.0027 if profile["slug"] == "djeison-drey" else 0.0023,
                resolution=2,
            )
        )
    hair = rig_mesh(join_meshes(hair_parts, f"{profile['object_name']}_Hair"), armature, "Head")

    beard_parts: list[bpy.types.Object] = []
    if reference_face is not None:
        # Portrait carries the complete beard/moustache likeness. A separate
        # shell produced a visible chin band in close-up, so omit it here.
        beard_parts = []
    elif profile["beard_style"] == "short_stubble":
        beard_parts.extend(
            [
                create_lower_face_hair_surface(profile, center_z, materials["beard"], full_beard=False),
                make_poly_curve(
                    f"{profile['object_name']}_StubbleMoustache",
                    [(-0.030, mouth_y - 0.002, mouth_z + 0.015), (0, mouth_y - 0.004, mouth_z + 0.011), (0.030, mouth_y - 0.002, mouth_z + 0.015)],
                    materials["beard"],
                    bevel_depth=0.0028,
                    resolution=2,
                ),
            ]
        )
    else:
        beard_parts.extend(
            [
                create_lower_face_hair_surface(profile, center_z, materials["beard"], full_beard=True),
                make_poly_curve(
                    f"{profile['object_name']}_MoustacheLeft",
                    [(-0.002, mouth_y - 0.006, mouth_z + 0.018), (-0.018, mouth_y - 0.008, mouth_z + 0.021), (-0.040, mouth_y - 0.003, mouth_z + 0.016)],
                    materials["beard"],
                    bevel_depth=0.0048,
                    resolution=2,
                ),
                make_poly_curve(
                    f"{profile['object_name']}_MoustacheRight",
                    [(0.002, mouth_y - 0.006, mouth_z + 0.018), (0.018, mouth_y - 0.008, mouth_z + 0.021), (0.040, mouth_y - 0.003, mouth_z + 0.016)],
                    materials["beard"],
                    bevel_depth=0.0048,
                    resolution=2,
                ),
            ]
        )
    beard = rig_mesh(join_meshes(beard_parts, f"{profile['object_name']}_FacialHair"), armature, "Head") if beard_parts else None

    glasses_parts: list[bpy.types.Object] = []
    glasses_y = eye_y - 0.022
    for side_sign in (-1, 1):
        lens_x = side_sign * profile["eye_spacing"] * 0.54
        if profile["glasses"] == "rectangular":
            frame_points = rounded_rectangle_points(lens_x, glasses_y, eye_z, 0.065, 0.040, 0.009, segments=3)
            lens_scale = (0.029, 0.002, 0.016)
        else:
            frame_points = [
                (lens_x + math.cos(angle) * 0.036, glasses_y, eye_z + math.sin(angle) * 0.027)
                for angle in [TAU * index / 24 for index in range(24)]
            ]
            lens_scale = (0.033, 0.002, 0.024)
        glasses_parts.append(
            make_poly_curve(
                f"{profile['object_name']}_GlassesFrame{side_sign}",
                frame_points,
                materials["metal"],
                bevel_depth=0.0017 if profile["glasses"] == "rectangular" else 0.0021,
                cyclic=True,
            )
        )
    inner = profile["eye_spacing"] * 0.54 - (0.033 if profile["glasses"] == "rectangular" else 0.036)
    glasses_parts.append(
        make_poly_curve(
            f"{profile['object_name']}_GlassesBridge",
            [(-inner, glasses_y, eye_z + 0.003), (0, glasses_y - 0.004, eye_z + 0.008), (inner, glasses_y, eye_z + 0.003)],
            materials["metal"],
            bevel_depth=0.0017,
            resolution=2,
        )
    )
    outer = profile["eye_spacing"] * 0.54 + (0.034 if profile["glasses"] == "rectangular" else 0.037)
    for side_sign in (-1, 1):
        glasses_parts.append(
            make_poly_curve(
                f"{profile['object_name']}_GlassesTemple{side_sign}",
                [
                    (side_sign * outer, glasses_y + 0.001, eye_z + 0.002),
                    (side_sign * head_width * 0.51, -head_depth * 0.20, eye_z),
                    (side_sign * head_width * 0.52, 0.010, eye_z - 0.010),
                ],
                materials["metal"],
                bevel_depth=0.0016,
                resolution=2,
            )
        )
    glasses = rig_mesh(join_meshes(glasses_parts, f"{profile['object_name']}_Glasses"), armature, "Head")
    return [part for part in (head_skin, reference_face, eyes, mouth, hair, beard, glasses) if part is not None]


def create_lathed_object(
    name: str,
    profile_rz: Sequence[tuple[float, float]],
    center: Sequence[float],
    material: bpy.types.Material,
    *,
    segments: int = 28,
) -> bpy.types.Object:
    cx, cy, cz = center
    verts: list[tuple[float, float, float]] = []
    for radius, z in profile_rz:
        for segment in range(segments):
            angle = TAU * segment / segments
            verts.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle), cz + z))
    faces: list[tuple[int, int, int, int]] = []
    for ring in range(len(profile_rz) - 1):
        for segment in range(segments):
            next_segment = (segment + 1) % segments
            faces.append(
                (
                    ring * segments + segment,
                    ring * segments + next_segment,
                    (ring + 1) * segments + next_segment,
                    (ring + 1) * segments + segment,
                )
            )
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_material(obj, material)
    smooth_mesh(obj)
    return obj


def create_chimarrao(profile: dict, materials: dict, armature: bpy.types.Object) -> list[bpy.types.Object]:
    factor = profile["height"] / 1.80
    center = Vector((0.105 * factor, -0.320 * factor, 1.145 * factor))
    cup_profile = [
        (0.030, -0.082),
        (0.047, -0.070),
        (0.060, -0.035),
        (0.066, 0.012),
        (0.059, 0.062),
        (0.057, 0.077),
    ]
    cup = create_lathed_object("Chimarrao_Cuia", cup_profile, center, materials["mate_wood"], segments=32)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.058, minor_radius=0.006, major_segments=32, minor_segments=10, location=center + Vector((0, 0, 0.076)))
    rim = bpy.context.object
    rim.name = "Chimarrao_CuiaRim"
    set_material(rim, materials["mate_rim"])
    smooth_mesh(rim)
    cup_group = rig_mesh(join_meshes([cup, rim], "Chimarrao_Cuia"), armature, "Hand.L")

    herb_parts: list[bpy.types.Object] = [
        add_uv_sphere("Chimarrao_ErvaSurface", center + Vector((0, 0, 0.074)), (0.052, 0.052, 0.010), materials["mate_herb"], segments=24, rings=10)
    ]
    rng = random.Random(1948)
    for index in range(18):
        angle = rng.random() * TAU
        radius = math.sqrt(rng.random()) * 0.044
        herb_parts.append(
            add_uv_sphere(
                f"Chimarrao_ErvaLeaf{index}",
                center + Vector((math.cos(angle) * radius, math.sin(angle) * radius, 0.081 + rng.uniform(-0.002, 0.004))),
                (0.0045, 0.0025, 0.0018),
                materials["mate_herb"],
                segments=8,
                rings=6,
            )
        )
    herb_group = rig_mesh(join_meshes(herb_parts, "Chimarrao_ErvaMate"), armature, "Hand.L")

    straw_start = center + Vector((0.015, 0.004, 0.078))
    straw_mid = center + Vector((0.022, 0.010, 0.145))
    straw_end = center + Vector((0.030, 0.012, 0.235))
    bomba_parts: list[bpy.types.Object] = [
        add_tapered_segment("Chimarrao_BombaStemLower", straw_start, straw_mid, 0.0055, 0.0048, materials["mate_metal"], vertices=14, bevel=0.0015),
        add_tapered_segment("Chimarrao_BombaStemUpper", straw_mid, straw_end, 0.0048, 0.0043, materials["mate_metal"], vertices=14, bevel=0.0012),
        add_uv_sphere("Chimarrao_BombaFilterDetail", straw_start, (0.009, 0.007, 0.016), materials["mate_metal"], segments=14, rings=8),
        add_tapered_segment(
            "Chimarrao_BombaMouthpiece",
            straw_end,
            straw_end + Vector((0.002, -0.014, 0.022)),
            0.0065,
            0.0052,
            materials["mate_metal"],
            vertices=14,
            bevel=0.0015,
        ),
    ]
    bomba_group = rig_mesh(join_meshes(bomba_parts, "Chimarrao_Bomba"), armature, "Hand.L")
    cup_group["cultural_prop"] = "cuia de porongo com acabamento escuro"
    herb_group["cultural_prop"] = "erva-mate surface"
    bomba_group["cultural_prop"] = "bomba metálica"
    return [cup_group, herb_group, bomba_group]


def reset_pose(armature: bpy.types.Object) -> None:
    for bone in armature.pose.bones:
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = Euler((0.0, 0.0, 0.0), "XYZ")
        bone.location = (0.0, 0.0, 0.0)
        bone.scale = (1.0, 1.0, 1.0)


def key_bone(
    armature: bpy.types.Object,
    bone_name: str,
    frame: int,
    *,
    rotation: Sequence[float] | None = None,
    location: Sequence[float] | None = None,
    scale: Sequence[float] | None = None,
) -> None:
    bone = armature.pose.bones[bone_name]
    if rotation is not None:
        bone.rotation_euler = rotation
        bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=bone_name)
    if location is not None:
        bone.location = location
        bone.keyframe_insert(data_path="location", frame=frame, group=bone_name)
    if scale is not None:
        bone.scale = scale
        bone.keyframe_insert(data_path="scale", frame=frame, group=bone_name)


def finalize_action(armature: bpy.types.Object, action: bpy.types.Action, frame_end: int, *, loop: bool) -> None:
    action.frame_start = 0
    action.frame_end = frame_end
    action["loop"] = loop
    action["fps"] = FPS
    # Blender 4.5 stores keyframes on channel bags.  Walking through all fcurves
    # through the compatibility accessor keeps this script usable on 4.2-4.5.
    try:
        fcurves = action.fcurves
    except AttributeError:
        fcurves = []
    for fcurve in fcurves:
        for keyframe in fcurve.keyframe_points:
            keyframe.interpolation = "BEZIER"
            keyframe.handle_left_type = "AUTO_CLAMPED"
            keyframe.handle_right_type = "AUTO_CLAMPED"
    track = armature.animation_data.nla_tracks.new()
    track.name = action.name
    strip = track.strips.new(action.name, 0, action)
    strip.name = action.name
    strip.action_frame_start = 0
    strip.action_frame_end = frame_end
    strip.extrapolation = "NOTHING"
    if loop:
        strip.repeat = 1.0
    armature.animation_data.action = None


def create_idle_action(profile: dict, armature: bpy.types.Object) -> None:
    reset_pose(armature)
    action = bpy.data.actions.new("Idle")
    armature.animation_data.action = action
    phase = 0.0 if profile["slug"] == "fabiano-soltis" else 0.37
    for frame in (0, 30, 60, 90, 120):
        angle = TAU * frame / 120 + phase
        key_bone(armature, "Chest", frame, rotation=(0.010 * math.sin(angle), 0.006 * math.cos(angle), 0.009 * math.sin(angle * 0.5)))
        key_bone(armature, "Neck", frame, rotation=(0.004 * math.cos(angle), 0.006 * math.sin(angle * 0.5), -0.012 * math.sin(angle)))
        key_bone(armature, "Head", frame, rotation=(0.006 * math.sin(angle), 0.005 * math.cos(angle), 0.014 * math.sin(angle * 0.5)))
        key_bone(armature, "Hips", frame, rotation=(0.0, 0.003 * math.sin(angle), -0.004 * math.sin(angle)))
        key_bone(armature, "UpperArm.R", frame, rotation=(0.010 * math.sin(angle), 0.0, 0.006 * math.cos(angle)))
        if not profile["carries_mate"]:
            key_bone(armature, "UpperArm.L", frame, rotation=(-0.008 * math.sin(angle), 0.0, -0.005 * math.cos(angle)))
    finalize_action(armature, action, 120, loop=True)


def create_walk_action(profile: dict, armature: bpy.types.Object) -> None:
    reset_pose(armature)
    action = bpy.data.actions.new("Walk")
    armature.animation_data.action = action
    frames = (0, 8, 15, 23, 30)
    phase_values = (0.0, 1.0, 0.0, -1.0, 0.0)
    stride = 0.36 if profile["slug"] == "fabiano-soltis" else 0.39
    for frame, phase in zip(frames, phase_values):
        key_bone(armature, "UpperLeg.L", frame, rotation=(stride * phase, 0.0, 0.010))
        key_bone(armature, "UpperLeg.R", frame, rotation=(-stride * phase, 0.0, -0.010))
        key_bone(armature, "LowerLeg.L", frame, rotation=(0.22 * max(0.0, -phase) + 0.04 * abs(phase), 0.0, 0.0))
        key_bone(armature, "LowerLeg.R", frame, rotation=(0.22 * max(0.0, phase) + 0.04 * abs(phase), 0.0, 0.0))
        key_bone(armature, "Foot.L", frame, rotation=(-0.11 * phase, 0.0, 0.0))
        key_bone(armature, "Foot.R", frame, rotation=(0.11 * phase, 0.0, 0.0))
        key_bone(armature, "Hips", frame, rotation=(0.0, 0.012 * phase, -0.030 * phase))
        key_bone(armature, "Chest", frame, rotation=(0.015, -0.008 * phase, 0.035 * phase))
        key_bone(armature, "Head", frame, rotation=(-0.010, 0.0, -0.014 * phase))
        key_bone(armature, "UpperArm.R", frame, rotation=(-0.30 * phase, 0.0, -0.018))
        key_bone(armature, "Forearm.R", frame, rotation=(0.06 + 0.04 * abs(phase), 0.0, 0.0))
        if profile["carries_mate"]:
            key_bone(armature, "UpperArm.L", frame, rotation=(0.020 * phase, 0.010, 0.0))
            key_bone(armature, "Forearm.L", frame, rotation=(-0.012 * phase, 0.0, 0.0))
            key_bone(armature, "Hand.L", frame, rotation=(0.0, 0.0, -0.010 * phase))
        else:
            key_bone(armature, "UpperArm.L", frame, rotation=(0.30 * phase, 0.0, 0.018))
            key_bone(armature, "Forearm.L", frame, rotation=(0.06 + 0.04 * abs(phase), 0.0, 0.0))
    finalize_action(armature, action, 30, loop=True)


def create_wave_action(profile: dict, armature: bpy.types.Object) -> None:
    reset_pose(armature)
    action = bpy.data.actions.new("Wave")
    armature.animation_data.action = action
    # A contained executive wave: raise, three small hand oscillations, settle.
    keyframes = {
        0: (0.0, 0.0, 0.0),
        16: (-0.15, -0.15, -1.48),
        28: (-0.18, -0.22, -1.60),
        40: (-0.16, -0.10, -1.54),
        52: (-0.18, -0.22, -1.60),
        64: (-0.16, -0.10, -1.54),
        76: (-0.12, -0.12, -1.34),
        96: (0.0, 0.0, 0.0),
    }
    for frame, upper_rotation in keyframes.items():
        raised = 0.0 if frame in (0, 96) else 1.0
        key_bone(armature, "UpperArm.R", frame, rotation=upper_rotation)
        key_bone(armature, "Forearm.R", frame, rotation=(-0.92 * raised, 0.10 * raised, -0.12 * raised))
        hand_wave = 0.0
        if frame in (28, 52):
            hand_wave = -0.28
        elif frame in (40, 64):
            hand_wave = 0.28
        key_bone(armature, "Hand.R", frame, rotation=(0.05 * raised, hand_wave, -0.10 * raised))
        key_bone(armature, "Chest", frame, rotation=(0.0, 0.0, 0.035 * raised))
        key_bone(armature, "Head", frame, rotation=(-0.025 * raised, 0.0, 0.065 * raised))
        if profile["carries_mate"]:
            key_bone(armature, "UpperArm.L", frame, rotation=(0.0, 0.0, 0.0))
            key_bone(armature, "Forearm.L", frame, rotation=(0.0, 0.0, 0.0))
    finalize_action(armature, action, 96, loop=False)


def create_seated_idle_action(profile: dict, armature: bpy.types.Object) -> None:
    """Author a sofa-compatible seated loop without translating the Root.

    The hips move back and down while the opposing thigh/calf rotations place
    both feet on the original ground plane.  Keeping the scene Root fixed lets
    R3F position each character independently on a shared sofa wrapper.
    """
    reset_pose(armature)
    action = bpy.data.actions.new("SeatedIdle")
    armature.animation_data.action = action
    factor = profile["height"] / 1.80
    # The Casa da Soja sofa places its back roughly 0.66 m behind each runtime
    # root. A 0.435 m hip offset keeps the pelvis on the cushion while leaving
    # breathing room for the jacket and backrest.
    hip_back = 0.435 * factor
    hip_drop = -0.455 * factor
    phase = 0.0 if profile["slug"] == "fabiano-soltis" else 0.31
    for frame in (0, 30, 60, 90, 120):
        angle = TAU * frame / 120 + phase
        breath = math.sin(angle)
        sway = math.sin(angle * 0.5)
        key_bone(
            armature,
            "Hips",
            frame,
            # Hips is a vertical Blender bone: pose-local Y maps to authored Z
            # and pose-local -Z maps to authored +Y (backward).
            location=(0.0, hip_drop + 0.0025 * breath, -hip_back),
            rotation=(0.012 + 0.003 * breath, 0.004 * sway, -0.004 * breath),
        )
        key_bone(armature, "Spine", frame, rotation=(0.050 + 0.007 * breath, 0.004 * sway, 0.005 * breath))
        key_bone(armature, "Chest", frame, rotation=(0.025 + 0.006 * breath, -0.004 * sway, 0.006 * breath))
        key_bone(armature, "Neck", frame, rotation=(-0.018 - 0.003 * breath, 0.003 * sway, -0.006 * breath))
        key_bone(armature, "Head", frame, rotation=(-0.012 + 0.004 * breath, 0.004 * sway, 0.008 * sway))

        # Small asymmetries prevent a mirrored mannequin pose. In authoring
        # space -Y is forward; negative upper-leg X rotation moves knees there.
        key_bone(armature, "UpperLeg.L", frame, rotation=(-1.405 + 0.004 * breath, 0.012, -0.075))
        key_bone(armature, "UpperLeg.R", frame, rotation=(-1.365 - 0.004 * breath, -0.010, 0.065))
        key_bone(armature, "LowerLeg.L", frame, rotation=(1.395 - 0.003 * breath, -0.010, 0.012))
        key_bone(armature, "LowerLeg.R", frame, rotation=(1.355 + 0.003 * breath, 0.012, -0.010))
        key_bone(armature, "Foot.L", frame, rotation=(0.0, -0.012, -0.012), location=(0.0, 0.0, -0.105 * factor))
        key_bone(armature, "Foot.R", frame, rotation=(0.0, 0.012, 0.010), location=(0.0, 0.0, -0.105 * factor))

        # Fabiano rests both hands toward his thighs. Djeison preserves the
        # authored left-hand chimarrao grip while his right hand rests forward.
        key_bone(armature, "UpperArm.R", frame, rotation=(0.035 + 0.005 * breath, -0.018, -0.035))
        key_bone(armature, "Forearm.R", frame, rotation=(-0.53 + 0.006 * breath, 0.025, 0.015))
        key_bone(armature, "Hand.R", frame, rotation=(0.06, -0.035 + 0.008 * breath, 0.02))
        if profile["carries_mate"]:
            key_bone(armature, "UpperArm.L", frame, rotation=(0.015 + 0.003 * breath, 0.008, 0.012))
            key_bone(armature, "Forearm.L", frame, rotation=(-0.035, -0.008, 0.010))
            key_bone(armature, "Hand.L", frame, rotation=(0.008, 0.0, -0.008 * breath))
        else:
            key_bone(armature, "UpperArm.L", frame, rotation=(0.025 - 0.004 * breath, 0.018, 0.032))
            key_bone(armature, "Forearm.L", frame, rotation=(-0.49 - 0.005 * breath, -0.025, -0.012))
            key_bone(armature, "Hand.L", frame, rotation=(0.055, 0.030 - 0.006 * breath, -0.018))
    finalize_action(armature, action, 120, loop=True)


def activate_animation_track(armature: bpy.types.Object, clip_name: str) -> None:
    for track in armature.animation_data.nla_tracks:
        track.mute = track.name != clip_name
        track.is_solo = False


def measure_evaluated_bounds(*, name_fragment: str | None = None) -> tuple[list[float], list[float]]:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    minimum = Vector((float("inf"), float("inf"), float("inf")))
    maximum = Vector((float("-inf"), float("-inf"), float("-inf")))
    matched = False
    for source_object in bpy.context.scene.objects:
        if source_object.type != "MESH" or (name_fragment and name_fragment not in source_object.name):
            continue
        evaluated = source_object.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            for vertex in mesh.vertices:
                world = evaluated.matrix_world @ vertex.co
                minimum.x = min(minimum.x, world.x)
                minimum.y = min(minimum.y, world.y)
                minimum.z = min(minimum.z, world.z)
                maximum.x = max(maximum.x, world.x)
                maximum.y = max(maximum.y, world.y)
                maximum.z = max(maximum.z, world.z)
                matched = True
        finally:
            evaluated.to_mesh_clear()
    if not matched:
        raise RuntimeError(f"No evaluated mesh vertices matched {name_fragment!r}")
    return [float(value) for value in minimum], [float(value) for value in maximum]


def validate_seated_pose(profile: dict, armature: bpy.types.Object) -> dict:
    """Evaluate the deformed `SeatedIdle` pose against the shared-sofa contract."""
    activate_animation_track(armature, "SeatedIdle")
    bpy.context.scene.frame_set(30)
    bpy.context.view_layer.update()
    hip_world = armature.matrix_world @ armature.pose.bones["Hips"].matrix.translation
    root_world = armature.matrix_world @ armature.pose.bones["Root"].matrix.translation
    bounds_min, bounds_max = measure_evaluated_bounds()
    shoe_min, shoe_max = measure_evaluated_bounds(name_fragment="Shoe.")
    factor = profile["height"] / 1.80
    expected_back = 0.435 * factor
    joint_debug = {
        name: tuple(round(float(value), 4) for value in (armature.matrix_world @ armature.pose.bones[name].matrix.translation))
        for name in ("Hips", "UpperLeg.L", "LowerLeg.L", "Foot.L", "UpperLeg.R", "LowerLeg.R", "Foot.R")
    }
    print(f"[executives] Seated joint audit {profile['slug']}: {joint_debug}; shoes Z={shoe_min[2]:.4f}..{shoe_max[2]:.4f}")
    if abs(root_world.x) > 1e-5 or abs(root_world.y) > 1e-5 or abs(root_world.z) > 1e-5:
        raise RuntimeError(f"{profile['slug']}: SeatedIdle moves Root to {tuple(root_world)}")
    if not expected_back - 0.035 <= hip_world.y <= expected_back + 0.035:
        raise RuntimeError(f"{profile['slug']}: seated hip back offset is {hip_world.y:.3f} m")
    if not 0.44 <= hip_world.z <= 0.56:
        raise RuntimeError(f"{profile['slug']}: seated hip height is {hip_world.z:.3f} m")
    if not -0.035 <= shoe_min[2] <= 0.08:
        raise RuntimeError(f"{profile['slug']}: seated shoes miss floor, minimum Z={shoe_min[2]:.3f} m")
    # Blender authoring (X, Y, Z) maps to glTF (X, Z, -Y).
    gltf_min = [bounds_min[0], bounds_min[2], -bounds_max[1]]
    gltf_max = [bounds_max[0], bounds_max[2], -bounds_min[1]]
    metrics = {
        "frame": 30,
        "root_translation_m": [round(value, 6) for value in root_world],
        "hip_authoring_xyz_m": [round(value, 4) for value in hip_world],
        "seat_height_m": round(float(hip_world.z), 4),
        "hip_back_offset_m": round(float(hip_world.y), 4),
        "shoe_vertical_bounds_m": [round(shoe_min[2], 4), round(shoe_max[2], 4)],
        "deformed_aabb_gltf_m": {
            "min": [round(value, 4) for value in gltf_min],
            "max": [round(value, 4) for value in gltf_max],
        },
    }
    for track in armature.animation_data.nla_tracks:
        track.mute = False
    bpy.context.scene.frame_set(0)
    return metrics


def create_animations(profile: dict, armature: bpy.types.Object) -> None:
    armature.animation_data_create()
    create_idle_action(profile, armature)
    create_walk_action(profile, armature)
    create_wave_action(profile, armature)
    create_seated_idle_action(profile, armature)
    for track in armature.animation_data.nla_tracks:
        track.mute = False
        track.is_solo = False


def build_character(profile: dict) -> bpy.types.Object:
    materials = make_materials(profile)
    armature, endpoints = create_armature(profile)
    create_lower_body(profile, materials, armature, endpoints)
    create_upper_body(profile, materials, armature, endpoints)
    create_hand(profile, materials, armature, endpoints, "L")
    create_hand(profile, materials, armature, endpoints, "R")
    create_head(profile, materials, armature, endpoints)
    if profile["carries_mate"]:
        create_chimarrao(profile, materials, armature)
    create_animations(profile, armature)
    profile["seated_pose_metrics"] = validate_seated_pose(profile, armature)
    armature["profile_summary"] = json.dumps(profile["profile_summary"], ensure_ascii=False)
    armature["animation_clips"] = "Idle, Walk, Wave, SeatedIdle"
    armature["seated_contract"] = "Root fixed at floor; Hips back 0.435x height factor and down 0.455x; target cushion top 0.50 m"
    armature["seated_pose_metrics"] = json.dumps(profile["seated_pose_metrics"], ensure_ascii=False)
    armature["modeling_method"] = "deterministic procedural geometry with identity-specific proportions"
    armature["garment_construction"] = "separate jacket shell, front panels, lapels, shirt, tie, cuffs and trousers"
    return armature


def export_character(profile: dict, armature: bpy.types.Object, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.frame_set(0)
    reset_pose(armature)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        use_selection=False,
        export_yup=True,
        export_apply=False,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        export_materials="EXPORT",
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_skins=True,
        export_armature_object_remove=False,
        export_all_influences=False,
        export_influence_nb=4,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_nla_strips=True,
        export_force_sampling=True,
        export_frame_step=1,
        export_optimize_animation_size=True,
        export_optimize_animation_keep_anim_armature=True,
        export_reset_pose_bones=True,
        export_def_bones=True,
        export_leaf_bone=False,
        export_image_format="AUTO",
        export_image_quality=82,
        export_shared_accessors=True,
        export_try_sparse_sk=True,
        export_try_omit_sparse_sk=True,
        export_draco_mesh_compression_enable=False,
        check_existing=False,
    )
    flatten_exported_glb(output_path)


def flatten_exported_glb(output_path: Path) -> None:
    """Promote skinned mesh nodes to glTF roots after Blender's NLA bake.

    Blender 4.5 needs the mesh->armature parenting while exporting NLA actions,
    but Khronos recommends skinned mesh nodes at the scene root.  glTF-Transform
    performs that hierarchy-only normalization without joining/simplifying
    meshes, changing textures, compressing buffers, or altering clip names.
    The npm command is optional for local regeneration: when unavailable the
    GLB remains valid and the R3F integration still transforms its outer scene
    wrapper.  CI/release builds should provide `npx.cmd` or `npx`.
    """
    npx = shutil.which("npx.cmd") or shutil.which("npx")
    if npx is None:
        print("[executives] glTF-Transform unavailable; keeping Blender hierarchy (valid with validator warnings).")
        return
    temporary_path = output_path.with_name(f".{output_path.stem}-flattened.glb")
    command = [
        npx,
        "--yes",
        "@gltf-transform/cli@4.2.1",
        "optimize",
        str(output_path),
        str(temporary_path),
        "--compress",
        "false",
        "--flatten",
        "true",
        "--join",
        "false",
        "--instance",
        "false",
        "--prune",
        "true",
        "--prune-attributes",
        "true",
        "--prune-solid-textures",
        "false",
        "--resample",
        "false",
        "--weld",
        "false",
        "--simplify",
        "false",
        "--texture-compress",
        "false",
        "--palette",
        "false",
    ]
    try:
        subprocess.run(command, cwd=str(ROOT_DIR), check=True, timeout=90)
        temporary_path.replace(output_path)
        print("[executives] Normalized skinned meshes to glTF scene roots with glTF-Transform 4.2.1.")
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        temporary_path.unlink(missing_ok=True)
        print(f"[executives] glTF hierarchy normalization skipped: {error}")


def read_glb_json(path: Path) -> dict:
    data = path.read_bytes()
    magic, version, total_length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or total_length != len(data):
        raise RuntimeError(f"Invalid GLB header: {path}")
    offset = 12
    while offset < len(data):
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset : offset + chunk_length]
        offset += chunk_length
        if chunk_type == 0x4E4F534A:
            return json.loads(chunk.decode("utf-8"))
    raise RuntimeError(f"GLB has no JSON chunk: {path}")


def summarize_glb(path: Path, profile: dict) -> dict:
    gltf = read_glb_json(path)
    nodes = gltf.get("nodes", [])
    node_names = [node.get("name", "") for node in nodes]
    animation_names = [animation.get("name", "") for animation in gltf.get("animations", [])]
    accessors = gltf.get("accessors", [])
    min_values = [float("inf"), float("inf"), float("inf")]
    max_values = [float("-inf"), float("-inf"), float("-inf")]
    for mesh in gltf.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            accessor_index = primitive.get("attributes", {}).get("POSITION")
            if accessor_index is None:
                continue
            accessor = accessors[accessor_index]
            if "min" not in accessor or "max" not in accessor:
                continue
            for axis in range(3):
                min_values[axis] = min(min_values[axis], accessor["min"][axis])
                max_values[axis] = max(max_values[axis], accessor["max"][axis])

    root_indices = {index for index, node in enumerate(nodes) if node.get("name") == "Root"}
    root_translation_range = 0.0
    for animation in gltf.get("animations", []):
        samplers = animation.get("samplers", [])
        for channel in animation.get("channels", []):
            target = channel.get("target", {})
            if target.get("node") not in root_indices or target.get("path") != "translation":
                continue
            output_accessor = accessors[samplers[channel["sampler"]]["output"]]
            if "min" in output_accessor and "max" in output_accessor:
                root_translation_range = max(
                    root_translation_range,
                    *(abs(float(high) - float(low)) for low, high in zip(output_accessor["min"], output_accessor["max"])),
                )

    expected_clips = {"Idle", "Walk", "Wave", "SeatedIdle"}
    if set(animation_names) != expected_clips:
        raise RuntimeError(f"{path.name}: expected clips {sorted(expected_clips)}, got {animation_names}")
    if not gltf.get("skins"):
        raise RuntimeError(f"{path.name}: export contains no glTF skin")
    if root_translation_range > 1e-5:
        raise RuntimeError(f"{path.name}: root motion range is {root_translation_range}")
    if f"{profile['object_name']}_Rig" not in node_names:
        raise RuntimeError(f"{path.name}: rig node missing")
    if profile["carries_mate"]:
        for required in ("Chimarrao_Cuia", "Chimarrao_Bomba", "Chimarrao_ErvaMate"):
            if required not in node_names:
                raise RuntimeError(f"{path.name}: missing {required}")

    size_bytes = path.stat().st_size
    if size_bytes > 8_000_000:
        raise RuntimeError(f"{path.name}: {size_bytes} bytes exceeds the 8 MB per-character budget")
    return {
        "file": path.name,
        "bytes": size_bytes,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "nodes": len(nodes),
        "meshes": len(gltf.get("meshes", [])),
        "materials": len(gltf.get("materials", [])),
        "skins": len(gltf.get("skins", [])),
        "animations": animation_names,
        "root_translation_range": root_translation_range,
        "accessor_bounds": {"min": min_values, "max": max_values},
        "height_m": profile["height"],
        "forward_axis": "+Z",
        "profile": profile["profile_summary"],
        "seated_pose": profile.get("seated_pose_metrics"),
    }


def build_manifest(output_dir: Path, summaries: Sequence[dict]) -> Path:
    manifest_path = output_dir / "manifest.json"
    existing: dict = {}
    if manifest_path.exists():
        try:
            existing = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            existing = {}
    by_slug = {entry.get("file", "").removesuffix(".glb"): entry for entry in existing.get("characters", [])}
    by_slug.update({entry["file"].removesuffix(".glb"): entry for entry in summaries})
    # Always refresh every existing GLB after post-export normalization.  This
    # keeps hashes/sizes trustworthy even when only one character is rebuilt.
    for slug, profile in PROFILES.items():
        path = output_dir / f"{slug}.glb"
        if path.exists() and slug not in {entry["file"].removesuffix(".glb") for entry in summaries}:
            by_slug[slug] = summarize_glb(path, profile)
    manifest = {
        "schema_version": 1,
        "generator": "tools/blender/build_executive_characters.py",
        "blender_version": bpy.app.version_string,
        "units": "meters",
        "origin": "grounded between the feet",
        "animation_fps": FPS,
        "post_export": "glTF-Transform 4.2.1 hierarchy flatten plus unused attribute pruning; no mesh join, simplification, texture recompression, or geometry compression",
        "clips": {
            "Idle": {"duration_seconds": 4.0, "loop": True},
            "Walk": {"duration_seconds": 1.0, "loop": True},
            "Wave": {"duration_seconds": 3.2, "loop": False},
            "SeatedIdle": {"duration_seconds": 4.0, "loop": True},
        },
        "characters": [by_slug[slug] for slug in sorted(by_slug)],
        "limitations": [
            "Procedural likeness is identity-specific but is not a photogrammetry or FACS facial scan.",
            "Garments are layered rigid-weight meshes with modeled thickness and tailoring; real-time cloth simulation is intentionally omitted.",
            "Hair and beard use lightweight geometric clumps rather than strand-hair simulation.",
            "Visual QA is calibrated for the Commercial Map camera; the assets are not scan-grade cinematic close-up humans.",
        ],
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest_path


def render_preview(profile: dict, armature: bpy.types.Object, preview_path: Path) -> None:
    preview_path.parent.mkdir(parents=True, exist_ok=True)
    activate_animation_track(armature, "SeatedIdle")
    bpy.context.scene.frame_set(30)

    bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, -0.003))
    ground = bpy.context.object
    ground.name = "PreviewGround"
    ground.data.materials.append(make_material("PreviewGround", (0.16, 0.18, 0.16, 1.0), roughness=0.9))

    sofa_material = make_material("PreviewSofaFabric", (0.43, 0.38, 0.31, 1.0), roughness=0.86, texture_style="fabric")
    sofa_edge = make_material("PreviewSofaEdge", (0.20, 0.17, 0.14, 1.0), roughness=0.74, texture_style="leather")
    add_rounded_cube("PreviewSofaSeat", (0, 0.31, 0.425), (0.96, 0.76, 0.15), sofa_material, bevel=0.055)
    add_rounded_cube("PreviewSofaBack", (0, 0.64, 0.825), (1.04, 0.18, 0.76), sofa_material, bevel=0.065, rotation=(math.radians(-4), 0, 0))
    for side_sign in (-1, 1):
        add_rounded_cube(
            f"PreviewSofaArm{side_sign}",
            (side_sign * 0.535, 0.29, 0.63),
            (0.14, 0.76, 0.38),
            sofa_edge,
            bevel=0.045,
        )

    bpy.ops.object.camera_add(location=(2.18, -4.35, 1.42))
    camera = bpy.context.object
    camera.name = "PreviewCamera"
    target = Vector((0, 0.18, 0.77))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 68
    bpy.context.scene.camera = camera

    def add_area(name: str, location: Sequence[float], energy: float, size: float, color: Sequence[float]):
        data = bpy.data.lights.new(name, type="AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        data.color = color
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()

    add_area("PreviewKey", (-2.4, -3.0, 3.2), 1050, 2.2, (1.0, 0.87, 0.72))
    add_area("PreviewFill", (2.8, -2.0, 2.2), 700, 2.8, (0.62, 0.74, 1.0))
    add_area("PreviewRim", (0.8, 2.0, 2.8), 950, 1.8, (0.75, 0.88, 1.0))

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 720
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.filepath = str(preview_path)
    scene.render.image_settings.color_mode = "RGBA"
    scene.world.color = (0.025, 0.030, 0.035)
    scene.view_settings.look = "AgX - Medium High Contrast"
    bpy.ops.render.render(write_still=True)


def render_face_closeup(profile: dict, armature: bpy.types.Object, preview_path: Path) -> None:
    """Render an isolated face/upper-torso QA frame before release export."""
    preview_path.parent.mkdir(parents=True, exist_ok=True)
    activate_animation_track(armature, "SeatedIdle")
    bpy.context.scene.frame_set(30)
    bpy.ops.mesh.primitive_plane_add(size=5, location=(0, 0.75, -0.003))
    ground = bpy.context.object
    ground.name = "CloseupGround"
    ground.data.materials.append(make_material("CloseupGroundMaterial", (0.13, 0.15, 0.16, 1.0), roughness=0.92))
    bpy.ops.object.camera_add(location=(0.42, -2.15, 1.46))
    camera = bpy.context.object
    camera.name = "CloseupCamera"
    target = Vector((0, 0.34, 1.08))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 76
    bpy.context.scene.camera = camera

    def add_area(name: str, location: Sequence[float], energy: float, size: float, color: Sequence[float]):
        data = bpy.data.lights.new(name, type="AREA")
        data.energy = energy
        data.size = size
        data.color = color
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()

    add_area("CloseupKey", (-1.2, -1.7, 2.55), 920, 1.7, (1.0, 0.88, 0.76))
    add_area("CloseupFill", (1.5, -1.4, 1.85), 540, 1.9, (0.66, 0.78, 1.0))
    add_area("CloseupRim", (0.3, 1.7, 2.1), 760, 1.4, (0.82, 0.90, 1.0))
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 720
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.filepath = str(preview_path)
    scene.world.color = (0.025, 0.030, 0.035)
    scene.view_settings.look = "AgX - Medium High Contrast"
    bpy.ops.render.render(write_still=True)


def main() -> None:
    args = parse_args()
    output_dir = args.output_dir.resolve()
    selected = list(PROFILES.values()) if args.only == "all" else [PROFILES[args.only]]
    turnaround_sources = {
        "fabiano-soltis": args.fabiano_turnaround.resolve() if args.fabiano_turnaround else None,
        "djeison-drey": args.djeison_turnaround.resolve() if args.djeison_turnaround else None,
    }
    summaries: list[dict] = []
    for base_profile in selected:
        profile = dict(base_profile)
        clean_scene()
        texture_path = output_dir / "textures" / f"{profile['slug']}-face.tga"
        source_path = turnaround_sources[profile["slug"]]
        crop = profile["turnaround_crop"]
        if source_path:
            if not source_path.exists():
                raise FileNotFoundError(f"Turnaround does not exist: {source_path}")
            texture_path = extract_face_texture(source_path, texture_path, crop)
        if texture_path.exists():
            profile["face_texture_path"] = texture_path
        print(f"[executives] Building {profile['display_name']}...")
        armature = build_character(profile)
        output_path = output_dir / f"{profile['slug']}.glb"
        if not args.skip_export:
            export_character(profile, armature, output_path)
            summary = summarize_glb(output_path, profile)
            summaries.append(summary)
            print(
                f"[executives] Validated {output_path.name}: "
                f"{summary['bytes'] / 1024:.1f} KiB, {summary['nodes']} nodes, "
                f"{summary['meshes']} meshes, clips={summary['animations']}"
            )
        if args.preview_dir:
            render_preview(profile, armature, args.preview_dir.resolve() / f"{profile['slug']}-seated-preview.png")
        if args.closeup_preview_dir:
            for obj in list(bpy.context.scene.objects):
                if obj.name.startswith("Preview"):
                    bpy.data.objects.remove(obj, do_unlink=True)
            render_face_closeup(profile, armature, args.closeup_preview_dir.resolve() / f"{profile['slug']}-face-closeup.png")

    manifest_path = build_manifest(output_dir, summaries) if not args.skip_export else None
    texture_dir = output_dir / "textures"
    if texture_dir.exists():
        shutil.rmtree(texture_dir)
    if manifest_path:
        print(f"[executives] Wrote {manifest_path}")
if __name__ == "__main__":
    main()
