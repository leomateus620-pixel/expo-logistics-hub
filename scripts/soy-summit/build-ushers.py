"""Build two generic adult male event attendants from MakeHuman CC0 system assets.

Run with Blender 4.5 --background --factory-startup --python this_file --
  --mpfb-source <mpfb2/src> --assets <extracted system pack> --output <folder>
MPFB is an external authoring tool only; it is not installed into the web app.
"""
import argparse
import json
import sys
import tempfile
from pathlib import Path
import bpy
import addon_utils

args = argparse.ArgumentParser()
args.add_argument('--mpfb-source', required=True)
args.add_argument('--assets', required=True)
args.add_argument('--output', required=True)
options = args.parse_args(sys.argv[sys.argv.index('--') + 1:])
sys.path.insert(0, options.mpfb_source)
# Source checkout in an isolated background process, without installing an
# extension or saving the artist's Blender preferences.
extension_path = bpy.utils.extension_path_user
def source_extension_path(package, path='', create=False):
    if package != 'mpfb':
        return extension_path(package, path=path, create=create)
    folder = Path(tempfile.gettempdir()) / 'soy-summit-tools' / 'mpfb-user' / path
    folder.mkdir(parents=True, exist_ok=True)
    return str(folder)
bpy.utils.extension_path_user = source_extension_path
addon_utils.enable('mpfb', default_set=True, persistent=False)
from mpfb.services.humanservice import HumanService
from mpfb.services.targetservice import TargetService
from mpfb.services.exportservice import ExportService

assets = Path(options.assets)
out = Path(options.output)
out.mkdir(parents=True, exist_ok=True)

def asset(name):
    found = list(assets.rglob(name))
    if not found:
        raise RuntimeError('Missing CC0 source asset: ' + name)
    return str(found[0])

profiles = [
    dict(name='usher-left', age=.34, height=.56, weight=.44, muscle=.48,
         skin='young_caucasian_male.mhmat', hair='short02.mhclo', brow='eyebrow001.mhclo'),
    dict(name='usher-right', age=.48, height=.50, weight=.48, muscle=.43,
         skin='middleage_caucasian_male.mhmat', hair='short01.mhclo', brow='eyebrow003.mhclo'),
]
report = []
for profile in profiles:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    macro = TargetService.get_default_macro_info_dict()
    macro.update(gender=1., age=profile['age'], height=profile['height'],
                 weight=profile['weight'], muscle=profile['muscle'],
                 race=dict(asian=0., caucasian=1., african=0.))
    human = HumanService.create_human(macro_detail_dict=macro)
    human.name = profile['name'] + '-body'
    HumanService.set_character_skin(asset(profile['skin']), human, skin_type='GAMEENGINE')
    rig = HumanService.add_builtin_rig(human, 'mixamo')
    rig.name = profile['name']
    sources = [
        ('Eyes', 'high-poly.mhclo'), ('Eyebrows', profile['brow']),
        ('Eyelashes', 'eyelashes01.mhclo'), ('Hair', profile['hair']),
        ('Teeth', 'teeth_base.mhclo'), ('Clothes', 'male_elegantsuit01.mhclo'),
        ('Clothes', 'shoes01.mhclo'),
    ]
    for kind, filename in sources:
        obj = HumanService.add_mhclo_asset(asset(filename), human, asset_type=kind,
                                          material_type='GAMEENGINE', subdiv_levels=0)
        if kind in ['Hair', 'Eyebrows', 'Eyelashes']:
            for mat in obj.data.materials:
                if not mat or not mat.use_nodes:
                    continue
                for node in mat.node_tree.nodes:
                    if node.type == 'BSDF_PRINCIPLED':
                        node.inputs['Roughness'].default_value = .72
    TargetService.bake_targets(human)
    ExportService.bake_modifiers_remove_helpers(human, bake_masks=True,
                                                bake_subdiv=False, remove_helpers=True)
    # Authoring images remain outside the app. Embedded maps are capped at 1K.
    for image in bpy.data.images:
        if image.source != 'FILE' or image.size[0] == 0:
            continue
        longest = max(image.size)
        if longest > 1024:
            ratio = 1024 / longest
            image.scale(round(image.size[0] * ratio), round(image.size[1] * ratio))
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            for polygon in obj.data.polygons:
                polygon.use_smooth = True
    filename = out / (profile['name'] + '.glb')
    bpy.ops.export_scene.gltf(filepath=str(filename), export_format='GLB',
                              export_animations=False, export_morph=False,
                              export_apply=False, export_image_format='AUTO')
    report.append(dict(profile=profile, sources=[name for _, name in sources],
                       sourceExportBytes=filename.stat().st_size,
                       bones=[bone.name for bone in rig.data.bones]))
    print('EXPORTED', filename, filename.stat().st_size, flush=True)
(out / 'ushers-authoring.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
