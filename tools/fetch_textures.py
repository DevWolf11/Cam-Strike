# Downloads the map surface textures from Poly Haven (CC0) into assets/textures/:
# <name>_col.jpg (1024 px colour) and <name>_nrm.jpg (512 px OpenGL normal map).
# Real-world tile sizes come from each asset's /info "dimensions" (mm) and live in js/mapassets.js SURF.
# Derived textures made afterwards: container_grey (greyscale container_side, tinted per container
# in game), crate (composed from wood_planks), diamond_plate (desaturated metal_plate).
#   python3 tools/fetch_textures.py
import json, os, urllib.request, concurrent.futures
from PIL import Image

UA = {'User-Agent': 'Mozilla/5.0'}
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'textures')
TEX = dict(
  sirocco_ground='sandstone_cracks', sirocco_sand='sandy_gravel_02', sandstone='sandstone_blocks_08', plaster_beige='beige_wall_002',
  adobe='clay_plaster', sandbrick='white_sandstone_bricks_03', pavement_red='red_sandstone_pavement', patio='patio_tiles',
  cobble='cobblestone_square', tile_pattern='patterned_terracotta_tiling', plaster_white='plastered_wall_02',
  plaster_damaged='damaged_plaster', stone_rubble='plaster_stone_wall_02', plaster_red='red_plaster_weathered',
  asphalt='asphalt_02', concrete_floor='concrete_floor_worn_001', concrete_wall='concrete_wall_006', factory_brick='factory_brick',
  corrugated='corrugated_iron_02', metal_sheet_red='box_profile_metal_sheet', container='container_side', block_wall='concrete_block_wall',
  diamond_plate='metal_plate', rusty='rusty_metal_02', concrete_light='concrete_wall_008', factory_panel='factory_wall',
  grey_plaster='grey_plaster_02', anti_skid='anti_skid_tiles', grass='grass_path_2', wood='wood_planks', door_wood='wood_shutter',
  shutter='rusty_metal_shutter', roof_clay='clay_roof_tiles_02',
)

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()

def one(item):
    name, pid = item
    files = json.loads(get(f'https://api.polyhaven.com/files/{pid}'))
    info = json.loads(get(f'https://api.polyhaven.com/info/{pid}'))
    for kind, key, px, q in (('col', 'Diffuse', 1024, 80), ('nrm', 'nor_gl', 512, 85)):
        f = files[key]['1k'].get('jpg') or files[key]['1k']['png']
        tmp = os.path.join(OUT, f'.{pid}_{kind}')
        open(tmp, 'wb').write(get(f['url']))
        im = Image.open(tmp).convert('RGB')
        if im.size[0] != px: im = im.resize((px, px), Image.LANCZOS)
        im.save(os.path.join(OUT, f'{name}_{kind}.jpg'), quality=q, optimize=True, progressive=True)
        os.remove(tmp)
    dims = info.get('dimensions')
    return name, round(dims[0] / 1000, 2) if dims else None

with concurrent.futures.ThreadPoolExecutor(6) as ex:
    for name, size in ex.map(one, TEX.items()): print(f'{name}: {size} m')
