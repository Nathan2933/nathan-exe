"""
NATHAN.EXE — Town Builder (V1.0)

Builds a stylised, compact, low-poly game town, then saves:
  source/nathan_town.blend             Editable source
  web/public/assets/nathan_town.glb  Runtime 3D model (glTF 2.0)
  web/public/data/level.json         Runtime colliders, spawn & interactables

Blender 4.0+ | Run from Scripting > Open... > Run Script, OR:
  blender --background --python tools/build_world.py

IMPORTANT: This script clears all objects in the active Blender scene.

Edit ZONES, WORLD, PALETTE, etc., then rerun to regenerate the game map.
"""
from __future__ import annotations

import bpy
import math
import json
import os
import random
from pathlib import Path
from mathutils import Vector

# ------------------------- MODIFY THE MAP HERE -------------------------
# Blender is X/Y ground plane, Z height. Web glTF is X/Z ground plane, Y height.
WORLD = {"half_extent": 84, "road_width": 12.0, "ground_size": 186.0}
ZONES = {
    "fitness": {"center": (-50.0, 48.0), "size": (30.0, 23.0), "height": 11.5},
    "russia":  {"center": ( 50.0, 48.0), "size": (36.0, 24.0), "height": 13.0},
    "projects":{"center": (-50.0,-48.0), "size": (33.0, 24.0), "height": 10.5},
    "future":  {"center": ( 50.0,-48.0), "size": (32.0, 23.0), "height": 14.0},
}
PLAYER_SPAWN = (0.0, -8.0)  # Blender coordinates (x, y).
RANDOM_SEED = 81
REBUILD_ALL = True

PALETTE = {
    "ground": "#8FA482", "grass_light": "#A1B28D", "grass_dark": "#729176",
    "asphalt": "#424B58", "lane": "#F3E5B3", "curb": "#B7B4A4",
    "walk": "#CDC9BB", "plaza": "#D8CAB4", "stone": "#9B9C92",
    "wall": "#D7D2C3", "wall_dark": "#AAA99F", "ink": "#27333A",
    "roof": "#353E49", "wood": "#9E7958", "bark": "#605E48",
    "leaf": "#3C795E", "leaf_light": "#5B9B77", "snow": "#D6E7E7",
    "snow_shadow": "#B1C9D2", "campus": "#A6B8BE", "brick": "#9C857D",
    "metal": "#596A75", "glass": "#79C0C9", "glass_dark": "#366B80",
    "fitness": "#E5A46E", "fitness_dark": "#955B45", "blue": "#7CAFC8",
    "future": "#AAA4DB", "future_dark": "#5B648C", "cyan": "#6ED2CA",
    "yellow": "#E3C773", "white": "#F4F0DF", "orange": "#ECA56D",
}

# ------------------------------- STATE ----------------------------------
mat_cache = {}
collections = {}
colliders = []
interactions = []
all_export_objects = []
_rng = random.Random(RANDOM_SEED)


def determine_root():
    env = os.getenv("NATHAN_EXE_ROOT")
    if env:
        return Path(env).expanduser().resolve()
    filename = globals().get("__file__", "")
    try:
        p = Path(filename).resolve()
        if p.is_file() and p.parent.name == "tools":
            return p.parent.parent
    except (OSError, ValueError):
        pass
    # Works when running an externally opened script in Blender's Text Editor.
    try:
        space = bpy.context.space_data
        txt = getattr(space, "text", None)
        if txt and txt.filepath:
            p = Path(bpy.path.abspath(txt.filepath)).resolve()
            if p.is_file() and p.parent.name == "tools":
                return p.parent.parent
    except (OSError, ValueError, AttributeError):
        pass
    return Path.home() / "NATHAN_EXE_GAME"


ROOT = determine_root()


def hex_to_rgba(h):
    h = h.lstrip("#")
    # Hex sRGB -> linear working-space values for Blender materials; glTF keeps colors.
    def linear(v):
        v = int(v, 16) / 255.0
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return tuple(linear(h[i:i+2]) for i in (0, 2, 4)) + (1.0,)


def material(name, hex_color=None, emissive=0.0, metallic=0.0):
    key = (name, emissive, metallic)
    if key in mat_cache:
        return mat_cache[key]
    color = hex_color or PALETTE.get(name, "#cccccc")
    m = bpy.data.materials.new("MAT_" + name.upper() + ("_GLOW" if emissive else ""))
    m.use_nodes = True
    m.diffuse_color = hex_to_rgba(color)
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = hex_to_rgba(color)
        bsdf.inputs["Roughness"].default_value = 0.82
        bsdf.inputs["Metallic"].default_value = metallic
        if emissive:
            col = bsdf.inputs.get("Emission Color")
            strength = bsdf.inputs.get("Emission Strength")
            if col:
                col.default_value = hex_to_rgba(color)
            if strength:
                strength.default_value = emissive
    mat_cache[key] = m
    return m


def init_scene():
    if REBUILD_ALL:
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.delete(use_global=False)
        for col in list(bpy.data.collections):
            if col.name.startswith(("01_TERRAIN_ROADS", "02_PLAZA", "03_FITNESS",
                                    "04_RUSSIA", "05_PROJECTS", "06_FUTURE",
                                    "07_LANDSCAPE", "08_PROPS", "09_VISUAL_GUIDES",
                                    "10_LIGHTS_CAMERAS")) or col.users == 0:
                bpy.data.collections.remove(col, do_unlink=True)
    try:
        bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT"
    except (TypeError, ValueError):
        bpy.context.scene.render.engine = "CYCLES"
    bpy.context.scene.render.resolution_x = 1600
    bpy.context.scene.render.resolution_y = 900
    bpy.context.scene.render.resolution_percentage = 100
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0
    bpy.context.scene.world.color = (0.22, 0.27, 0.32)
    for name in ("01_TERRAIN_ROADS", "02_PLAZA", "03_FITNESS", "04_RUSSIA",
                 "05_PROJECTS", "06_FUTURE", "07_LANDSCAPE", "08_PROPS",
                 "09_VISUAL_GUIDES", "10_LIGHTS_CAMERAS"):
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
        collections[name] = coll


def put_in(obj, collection, export=True):
    for old in tuple(obj.users_collection):
        old.objects.unlink(obj)
    collections[collection].objects.link(obj)
    obj["nathan_static"] = True
    obj["nathan_export"] = bool(export)
    if export and obj.type == "MESH":
        all_export_objects.append(obj)
    return obj


def box(name, xyz, dims, mat, group="08_PROPS", bevel=0.0, export=True):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material(mat))
    if bevel:
        mod = obj.modifiers.new(name="Soft low-poly edges", type="BEVEL")
        mod.width = bevel
        mod.segments = 1
        if hasattr(mod, "affect"):
            mod.affect = "EDGES"
        mod2 = obj.modifiers.new(name="Weighted normals", type="WEIGHTED_NORMAL")
        mod2.keep_sharp = True
    return put_in(obj, group, export)


def cyl(name, xyz, radius, height, mat, group="08_PROPS", verts=10, export=True):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=height, location=xyz)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material(mat))
    return put_in(obj, group, export)


def cone(name, xyz, r1, r2, depth, mat, group="07_LANDSCAPE", verts=8):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, location=xyz)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material(mat))
    return put_in(obj, group)


def sphere(name, xyz, radius, mat, group="07_LANDSCAPE"):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=radius, location=xyz)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material(mat))
    return put_in(obj, group)


def ring(name, xyz, radius, mat, group="08_PROPS"):
    bpy.ops.mesh.primitive_torus_add(major_segments=32, minor_segments=6,
                                     location=xyz, major_radius=radius,
                                     minor_radius=0.095)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material(mat, emissive=1.5))
    return put_in(obj, group)


def text_mesh(name, body, xyz, size, mat, face="south", group="08_PROPS"):
    # Convert text to mesh! Blender Font/Text objects do not directly export to glTF.
    # Local text X points screen-right when viewed from the facade's outward normal.
    rot = (math.radians(90), 0.0, 0.0 if face == "south" else math.pi)
    bpy.ops.object.text_add(location=xyz, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.data.body = body
    obj.data.size = size
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.extrude = 0.008
    obj.data.bevel_depth = 0.002
    obj.data.materials.append(material(mat))
    bpy.ops.object.convert(target="MESH")
    return put_in(bpy.context.object, group)


def mesh(name, verts, faces, mat, group="08_PROPS"):
    data = bpy.data.meshes.new(name + "_mesh")
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    obj.data.materials.append(material(mat))
    return put_in(obj, group)


def roof_gable(name, x, y, w, d, eave_z, peak_z, mat, group):
    # Roof ridge runs horizontally along X. Simple six-vertex low-poly roof.
    a, b = x - w/2, x + w/2
    c, e = y - d/2, y + d/2
    v = [(a,c,eave_z),(b,c,eave_z),(a,e,eave_z),(b,e,eave_z),
         (a,y,peak_z),(b,y,peak_z)]
    f = [(0,1,5,4),(4,5,3,2),(0,4,2),(1,3,5),(0,2,3,1)]
    return mesh(name,v,f,mat,group)


def register_collider(name, x, y, width, depth):
    # Slightly expanded building footprint, for forgiving third-person collision.
    colliders.append({"id": name, "x": round(x,3), "z": round(-y,3),
                      "halfX": round(width/2+0.2,3), "halfZ": round(depth/2+0.2,3)})


def marker(name, x, y, accent, group):
    ring("INTERACT_RING_"+name, (x,y,0.28), 2.55, accent, group)
    cyl("INTERACT_PAD_"+name, (x,y,0.14), 1.35, 0.24, "ink", group, verts=12)
    cyl("INTERACT_CORE_"+name, (x,y,0.285), 0.70, 0.05, accent, group, verts=12)
    text_mesh("INTERACT_E_"+name, "E", (x,y-0.05 if y>0 else y+0.05,0.312),
              0.65, "white", face="south" if y>0 else "north", group=group)


def add_interaction(zone_id, title, chapter, subtitle, highlights, accent):
    item = ZONES[zone_id]
    x,y = item["center"]
    w,d = item["size"]
    sign = 1 if y > 0 else -1
    front = y - sign*d/2
    py = front - sign*6.2
    marker(zone_id,x,py,accent,{
        "fitness":"03_FITNESS", "russia":"04_RUSSIA",
        "projects":"05_PROJECTS", "future":"06_FUTURE"}[zone_id])
    interactions.append({
        "id":zone_id, "title":title, "chapter":chapter, "subtitle":subtitle,
        "highlights":highlights, "x":x, "z":-py, "radius":5.2,
    })
    return py


def floor_path(name, x, near_y, group="01_TERRAIN_ROADS"):
    # Automatic connecting walkway from east-west main road to building entrance.
    center_y = near_y * 0.5
    length = abs(near_y) + 1
    box(name,(x,center_y,0.14),(5.3,length,0.19),"walk",group)
    # Centre stepping lines imply direction without cluttering the route.
    for j in range(int(2.5), int(abs(near_y)-2), 6):
        yy = j if near_y>0 else -j
        box(name+"_tile",(x,yy,0.255),(4.9,0.07,0.025),"stone",group)


def tree(x,y,scale=1.0,pine=False,snow=False):
    if pine:
        cyl("PINE_TRUNK",(x,y,1.45*scale),0.34*scale,2.9*scale,"bark",verts=8)
        cone("PINE_LOWER",(x,y,3.4*scale),2.3*scale,0,4.1*scale,
             "grass_dark" if not snow else "leaf",verts=7)
        cone("PINE_TOP",(x,y,5.4*scale),1.65*scale,0,3.7*scale,
             "leaf" if not snow else "snow_shadow",verts=7)
        if snow:
            cone("SNOW_CAP",(x,y,7.1*scale),0.8*scale,0,0.8*scale,"snow",verts=7)
    else:
        cyl("TREE_TRUNK",(x,y,1.6*scale),0.3*scale,3.2*scale,"bark",verts=7)
        sphere("TREE_CROWN_A",(x,y,4.2*scale),2.0*scale,
               "leaf_light" if _rng.random() > 0.5 else "leaf")
        sphere("TREE_CROWN_B",(x+0.9*scale,y-0.15*scale,4.5*scale),1.35*scale,"leaf")


def light_post(x,y):
    cyl("LIGHT_POST",(x,y,2.9),0.12,5.8,"ink",verts=8)
    box("LAMP_HEAD",(x,y,5.85),(1.2,0.55,0.28),"metal")
    box("LAMP_GLOW",(x,y,5.64),(0.9,0.43,0.10),"yellow")


def bench(x,y,rot=0):
    # Lightweight low-poly urban bench, rotated as a parent group would be.
    # Benches do not block runtime movement in v1.
    for dx in (-1.1,1.1):
        box("BENCH_LEG",(x+dx,y,0.42),(0.18,0.6,0.84),"ink")
    box("BENCH_SEAT",(x,y,0.92),(3,0.82,0.22),"wood",bevel=0.08)
    box("BENCH_BACK",(x,y+0.33,1.42),(3,0.19,0.95),"wood",bevel=0.05)


def signplate(name, cx, cy, width, depth, height, front_face, body, accent, group, z=None):
    face_y = cy - depth/2 if front_face == "south" else cy+depth/2
    outward = -1 if front_face == "south" else 1
    z = z if z is not None else height-1.5
    box(name+"_BACKGROUND",(cx,face_y+0.26*outward,z),(width-4,0.35,1.65),"ink",group,bevel=0.12)
    box(name+"_LINE",(cx,face_y+0.46*outward,z-0.67),(width-4,0.09,0.10),accent,group)
    text_mesh(name+"_TYPE",body,(cx,face_y+0.49*outward,z+0.06),0.78,
              "white",face=front_face,group=group)


def facade_windows(cx, cy, w, d, h, group, face="south", rows=2, count=5, color="glass"):
    fy = cy-d/2 if face=="south" else cy+d/2
    side = -1 if face == "south" else 1
    for row in range(rows):
        zz = 3.6 + row*3.0
        for i in range(count):
            xx = cx + (i-(count-1)/2)*(w-8)/max(count-1,1)
            # Main central door area is deliberately clear on the ground floor.
            if row==0 and abs(xx-cx) < 3:
                continue
            box("WINDOW_FRAME",(xx,fy+side*0.11,zz),
                (2.65,0.20,1.95),"ink",group,bevel=0.06)
            box("WINDOW_PANE",(xx,fy+side*0.25,zz),
                (2.30,0.09,1.64),color,group)
            box("WINDOW_MULLION",(xx,fy+side*0.32,zz),
                (0.07,0.06,1.62),"wall",group)


# --------------------------- WORLD GEOMETRY ------------------------------
def build_ground_roads():
    half = WORLD["half_extent"]
    box("WORLD_GROUND",(0,0,-0.27),(WORLD["ground_size"],WORLD["ground_size"],0.5),
        "ground","01_TERRAIN_ROADS")
    # District ground color blocking: three subtle ground environments.
    rx,ry = ZONES["russia"]["center"]
    lx,ly = ZONES["projects"]["center"]
    fx,fy = ZONES["future"]["center"]
    box("RUSSIA_SNOW_BIOME",(rx,ry,0.014),(69,69,0.08),"snow_shadow","01_TERRAIN_ROADS")
    box("RUSSIA_SNOW_SURFACE",(rx,ry,0.075),(65,65,0.06),"snow","01_TERRAIN_ROADS")
    box("LAB_DISTRICT_GROUND",(lx,ly,0.04),(69,69,0.10),"grass_dark","01_TERRAIN_ROADS")
    box("FUTURE_DISTRICT_GROUND",(fx,fy,0.04),(69,69,0.10),"grass_light","01_TERRAIN_ROADS")
    # Two walkable arterial roads with markings.
    box("EAST_WEST_ROAD",(0,0,0.10),(169,12.0,0.18),"asphalt","01_TERRAIN_ROADS")
    box("NORTH_SOUTH_ROAD",(0,0,0.105),(12.0,169,0.18),"asphalt","01_TERRAIN_ROADS")
    for p in range(-76,77,13):
        if abs(p)>15:
            box("EAST_WEST_LANE_STRIPE",(p,0,0.205),(5.3,0.20,0.028),"lane","01_TERRAIN_ROADS")
            box("NORTH_SOUTH_LANE_STRIPE",(0,p,0.205),(0.20,5.3,0.028),"lane","01_TERRAIN_ROADS")
    for direction in (-1,1):
        box("EW_SIDEWALK",(0,direction*7.3,0.17),(166,2.45,0.23),"curb","01_TERRAIN_ROADS")
        box("NS_SIDEWALK",(direction*7.3,0,0.17),(2.45,166,0.23),"curb","01_TERRAIN_ROADS")
    # Crosswalks before central plaza.
    for s in (-1,1):
        for stripe in range(-4,5):
            box("CROSSING_HORIZONTAL",(s*18, stripe*0.9,0.222),
                (0.8,0.53,0.029),"white","01_TERRAIN_ROADS")
            box("CROSSING_VERTICAL",(stripe*0.9,s*18,0.222),
                (0.53,0.8,0.029),"white","01_TERRAIN_ROADS")
    # Access walkways follow each mission's coordinates when repositioned.
    for z in ZONES:
        cx,cy = ZONES[z]["center"]
        w,d = ZONES[z]["size"]
        facing = 1 if cy>0 else -1
        doorway_y = cy - facing * d/2
        floor_path("MISSION_WALK_"+z.upper(),cx,doorway_y)
    # Fine road-edge separators, kept thin so they don't feel like obstructions.
    for s in (-1,1):
        box("ROAD_EDGE",(0,s*5.82,0.224),(168,0.13,0.035),"walk","01_TERRAIN_ROADS")
        box("ROAD_EDGE",(s*5.82,0,0.224),(0.13,168,0.035),"walk","01_TERRAIN_ROADS")


def build_plaza():
    # Central readable hub; player spawns south of the monument with clear walking space.
    cyl("PLAZA_CIRCLE",(0,0,0.24),12.0,0.24,"plaza","02_PLAZA",verts=28)
    ring("PLAZA_RING",(0,0,0.39),10.7,"yellow","02_PLAZA")
    cyl("MONUMENT_PEDESTAL",(0,4.0,0.87),2.1,1.3,"ink","02_PLAZA",verts=8)
    cyl("MONUMENT_CORE",(0,4.0,2.25),1.0,1.8,"future_dark","02_PLAZA",verts=7)
    cone("MONUMENT_BEACON",(0,4.0,3.60),1.0,0.2,1.5,"cyan","02_PLAZA")
    # Horizontal monument title displayed to players approaching from south.
    text_mesh("WORLD_TITLE","NATHAN.EXE",(0,1.75,1.55),0.53,"white","south","02_PLAZA")
    text_mesh("WORLD_SUBTITLE","CHOOSE YOUR CHAPTER",(0,1.73,1.12),0.22,"yellow","south","02_PLAZA")
    # Four split-color direction posts.
    for label,x,y,clr in [("01",-10,7,"fitness"),("02",10,7,"blue"),
                          ("03",-10,-8,"cyan"),("04",10,-8,"future")]:
        cyl("WAYFIND_POLE",(x,y,1.1),0.15,2.2,"ink","02_PLAZA",verts=8)
        box("WAYFIND_FLAG",(x,y,2.4),(2.2,0.25,0.95),clr,"02_PLAZA",bevel=0.1)
        text_mesh("WAYFIND_TEXT",label,(x,y-0.16,2.39),0.55,"ink","south","02_PLAZA")
    # Small seating area beyond immediate route.
    bench(-11,-13)
    bench(11,13)
    register_collider("center_monument",0,4.0,3.3,3.3)


def build_gym():
    c = ZONES["fitness"]
    x,y = c["center"]; w,d=c["size"]; h=c["height"]
    g="03_FITNESS"
    box("GYM_SHADOW",(x,y,0.35),(w+4,d+4,0.6),"stone",g,bevel=0.6)
    base=box("GYM_MAIN_BODY",(x,y,h/2),(w,d,h),"fitness_dark",g,bevel=0.40)
    base["zone_id"]="fitness"
    box("GYM_UPPER_FACADE",(x,y-d/2-0.15,h-1.8),
        (w+0.5,0.40,2.5),"fitness",g,bevel=0.15)
    box("GYM_FLAT_ROOF",(x,y,h+0.55),(w+1.2,d+1.2,1.10),"roof",g,bevel=0.40)
    box("GYM_OVERHANG",(x,y-d/2-1.35,6.2),(w-4,2.9,0.38),"ink",g,bevel=0.15)
    # Door and mirrored floor-level panes.
    box("GYM_DOOR_FRAME",(x,y-d/2-0.20,2.6),(6.4,0.48,5.0),"ink",g)
    box("GYM_DOOR_GLASS",(x,y-d/2-0.48,2.5),(5.75,0.12,4.65),"glass_dark",g)
    box("GYM_DOOR_SEAM",(x,y-d/2-0.58,2.5),(0.09,0.08,4.5),"white",g)
    for dx in (-11.0,-7.7,7.7,11.0):
        box("GYM_STREET_WINDOWS",(x+dx,y-d/2-0.17,3.15),(2.65,0.30,3.25),"glass",g)
        box("GYM_WINDOW_HEADER",(x+dx,y-d/2-0.38,5.0),(2.75,0.30,0.15),"ink",g)
    signplate("GYM_SIGN",x,y,w,d,h,"south","THE GRIND","fitness",g,z=h-1.35)
    # Exterior training space with iconic visual weights, safely off main walkway.
    box("WORKOUT_DECK",(x-10,y-d/2-11,0.22),(12.0,8.2,0.15),"ink",g,bevel=0.30)
    for xx in (-13,-8):
        cyl("BARBELL_L",(x+xx,y-d/2-11,0.87),0.80,0.18,"metal",g,verts=12)
        cyl("BARBELL_R",(x+xx+2.0,y-d/2-11,0.87),0.80,0.18,"metal",g,verts=12)
        box("BARBELL_BAR",(x+xx+1.0,y-d/2-11,0.87),(2.7,0.12,0.12),"white",g)
    # Flat, readable gym accent props.
    for xx in (-12,-8,8,12):
        box("GYM_ROOF_FIN",(x+xx,y+d/2-0.8,h+1.55),(0.50,1.6,0.95),"fitness",g)
    register_collider("fitness_building",x,y,w,d)
    add_interaction("fitness","THE GRIND","CHAPTER 01 / DISCIPLINE",
                    "My fitness story, persistence, and building a stronger version of myself.",
                    ["The beginning of my transformation","Routines, habits and resilience",
                     "Progress is earned one day at a time"],"fitness")


def build_russia():
    c=ZONES["russia"]
    x,y=c["center"];w,d=c["size"];h=c["height"]
    g="04_RUSSIA"
    box("CAMPUS_FOUNDATION",(x,y,0.40),(w+5,d+4,0.72),"stone",g,bevel=0.35)
    body=box("CAMPUS_MAIN_BODY",(x,y,h/2),(w,d,h),"campus",g,bevel=0.16)
    body["zone_id"]="russia"
    # Institution-like banding, gabled roof and central stone columns.
    box("CAMPUS_BASE_BAND",(x,y,1.15),(w+0.55,d+0.55,0.42),"brick",g)
    box("CAMPUS_UPPER_BAND",(x,y,9.4),(w+0.55,d+0.55,0.50),"brick",g)
    roof_gable("CAMPUS_SNOW_GABLE",x,y,w+2.6,d+2.1,h+0.15,h+3.10,"roof",g)
    box("CAMPUS_SNOW_RIDGE",(x,y,h+3.2),(w+2.9,0.7,0.32),"snow",g)
    facade_windows(x,y,w,d,h,g,"south",rows=2,count=7,color="glass_dark")
    box("CAMPUS_ENTRY_PORTAL",(x,y-d/2-0.70,3.45),(8.3,1.0,6.65),"brick",g)
    box("CAMPUS_ENTRY_GAP",(x,y-d/2-1.35,2.7),(5.75,0.36,4.80),"glass_dark",g)
    for xx in (-3.7,3.7):
        cyl("CAMPUS_COLUMN",(x+xx,y-d/2-2.0,3.8),0.36,7.55,"wall",g,verts=10)
    box("CAMPUS_ENTRY_CANOPY",(x,y-d/2-2.25,7.6),(10.4,3.1,0.56),"wall",g,bevel=0.1)
    # Short flat ground-level steps are decorative, not actual climbable geometry.
    for i in range(3):
        box("CAMPUS_STAIRS",(x,y-d/2-2.4-i*1.2,0.15+i*0.02),
            (10.5+i*0.75,1.2,0.22),"snow_shadow",g)
    signplate("CAMPUS_SIGN",x,y,w,d,h,"south","THE DETOUR","blue",g,z=10.9)
    # Clock tower gives the zone a recognisable silhouette.
    tx,ty=x+12.8,y+2.0
    box("CLOCK_TOWER",(tx,ty,h+3.0),(5.8,6.1,6.8),"brick",g,bevel=0.18)
    cyl("CLOCK_DIAL",(tx,ty-3.25,h+4.4),1.65,0.20,"white",g,verts=16)
    box("CLOCK_HAND_H",(tx,ty-3.42,h+4.43),(1.2,0.1,0.12),"ink",g)
    box("CLOCK_HAND_V",(tx,ty-3.44,h+4.43),(0.12,0.1,1.2),"ink",g)
    roof_gable("CLOCK_TOWER_ROOF",tx,ty,7.0,7.0,h+6.5,h+8.35,"roof",g)
    # Snow clusters & sparse pines around campus, away from main entrance.
    for dx,dy in [(-27,-4),(-27,10),(27,4),(28,12),(-17,22),(18,22)]:
        tree(x+dx,y+dy,0.65+_rng.random()*0.2,pine=True,snow=True)
    register_collider("russia_building",x,y,w,d)
    add_interaction("russia","THE DETOUR","CHAPTER 02 / RESTART",
                    "From studying in Russia to rebuilding my path back in India.",
                    ["An unfamiliar country and a bold first step","A sudden change of plans",
                     "Continuing forward with a new perspective"],"blue")


def build_projects():
    c=ZONES["projects"]
    x,y=c["center"];w,d=c["size"];h=c["height"]
    g="05_PROJECTS"
    box("LAB_RAISED_PAD",(x,y,0.31),(w+4,d+4,0.55),"stone",g,bevel=0.32)
    base=box("LAB_MAIN_HALL",(x,y,h/2),(w,d,h),"metal",g,bevel=0.30)
    base["zone_id"]="projects"
    box("LAB_ACCENT_PANEL",(x,y+d/2+0.21,h-1.75),(w+0.5,0.42,2.6),"ink",g)
    box("LAB_FLAT_ROOF",(x,y,h+0.52),(w+1.5,d+1.4,1.05),"roof",g,bevel=0.40)
    # Labs below the east/west road face north (+Blender Y).
    door_y=y+d/2+0.25
    box("LAB_ROLLUP_DOOR",(x,door_y,3.55),(10.0,0.28,6.8),"ink",g)
    for t in range(5):
        box("LAB_DOOR_SLATS",(x,door_y+0.19,1.10+t*1.18),
            (9.25,0.12,0.84),"wall_dark" if t%2 else "metal",g)
    for dx in (-13,13):
        box("LAB_GLOW_PANELS",(x+dx,door_y,3.7),(2.1,0.32,5.7),"glass_dark",g)
        box("LAB_GLOW_EDGE",(x+dx,door_y+0.24,3.7),(0.16,0.1,5.7),"cyan",g)
    signplate("LAB_SIGN",x,y,w,d,h,"north","BUILD LAB","cyan",g,z=h-1.4)
    # Readable project pods outside, not blocking interaction path.
    for k,(dx,title,clr) in enumerate([(-15.4,"PQC","cyan"),(15.4,"BCI","blue")]):
        xx=x+dx; yy=y+d/2+5
        cyl("TECH_POD_BASE",(xx,yy,0.6),1.45,1.05,"ink",g,verts=8)
        box("TECH_POD_SCREEN",(xx,yy,2.15),(2.2,0.40,2.5),"glass_dark",g,bevel=0.16)
        text_mesh("TECH_POD_TEXT",title,(xx,yy-0.26,2.13),0.38,"white","south",g)
    # Roof server and small satellite receiver (symbolic technology landmarks).
    for xx in (-11,-5,7):
        box("LAB_ROOF_HVAC",(x+xx,y-2,h+1.48),(3.6,3.4,1.55),"wall_dark",g,bevel=0.2)
    cyl("LAB_ANTENNA_STEM",(x+12,y-5,h+3.1),0.12,4.3,"ink",g)
    cone("LAB_ANTENNA_DISH",(x+12,y-5,h+5.2),1.7,0.3,1.0,"cyan",g)
    register_collider("projects_building",x,y,w,d)
    add_interaction("projects","BUILD LAB","CHAPTER 03 / MAKE THINGS",
                    "Projects across cybersecurity, AI, embedded systems and full-stack engineering.",
                    ["Post-quantum hybrid secure messaging","EEG-based smart-home interfaces",
                     "AgriGuard AI and agentic systems","Security monitoring and developer tools"],"cyan")


def build_future():
    c=ZONES["future"]
    x,y=c["center"];w,d=c["size"];h=c["height"]
    g="06_FUTURE"
    box("FUTURE_BASE_PLAZA",(x,y,0.35),(w+5,d+5,0.58),"stone",g,bevel=0.35)
    body=box("FUTURE_MAIN_BUILDING",(x,y,h/2),(w,d,h),"future_dark",g,bevel=0.50)
    body["zone_id"]="future"
    # Symmetric glass band, articulated fins, clear first-floor entry.
    for floor in (3.3,7.4,10.6):
        for dx in (-11,-6,6,11):
            box("OBSERVATORY_GLASS",(x+dx,y+d/2+0.22,floor),
                (3.8,0.34,2.5),"glass",g,bevel=0.10)
            box("OBSERVATORY_FRAME",(x+dx,y+d/2+0.44,floor),
                (0.13,0.12,2.7),"ink",g)
    box("FUTURE_ENTRY_PORTAL",(x,y+d/2+0.32,3.1),(7.5,0.72,5.7),"ink",g,bevel=0.18)
    box("FUTURE_ENTRY_GLASS",(x,y+d/2+0.78,3.05),(6.5,0.16,5.0),"glass_dark",g)
    box("FUTURE_LED_STRIP",(x,y+d/2+0.9,5.65),(6.5,0.10,0.11),"future",g)
    # Roof silhouettes: terrace rails and an original angular "signal beacon".
    box("FUTURE_ROOF",(x,y,h+0.55),(w+2,d+2,1.1),"ink",g,bevel=0.40)
    for dx in (-w/2,w/2):
        box("ROOF_RAIL",(x+dx,y,h+2.15),(0.25,d+2,2.0),"metal",g)
    for dy in (-d/2,d/2):
        box("ROOF_RAIL",(x,y+dy,h+2.15),(w+2,0.25,2.0),"metal",g)
    cyl("BEACON_TOWER",(x,y,h+3.5),1.3,4.8,"future",g,verts=6)
    sphere("BEACON_GLOBE",(x,y,h+6.4),1.9,"cyan",g)
    # A real rooftop-access route needs a separate level/collision system.
    # This version uses an accessible ground-floor interaction pad instead.
    signplate("FUTURE_SIGN",x,y,w,d,h,"north","NEXT MISSION","future",g,z=h-1.55)
    register_collider("future_building",x,y,w,d)
    add_interaction("future","NEXT MISSION","CHAPTER 04 / WHAT'S NEXT",
                    "The next level: work, collaborations, learning and what I want to build.",
                    ["Explore my background and resume","Find ways to collaborate",
                     "See what comes after this chapter"],"future")


def build_landscape():
    # Intentional planting positions: roads, paths and spawn remain clear.
    placements = [
      (-76,69),(-69,77),(-30,76),(-20,68),(-78,25),(-28,26),
      (77,73),(76,29),(22,77),(29,69),(19,27),(77,20),
      (-77,-75),(-69,-69),(-24,-76),(-20,-64),(-76,-25),(-29,-26),
      (75,-70),(70,-77),(22,-75),(26,-68),(75,-25),(23,-28),
      (-75,14),(75,-13),(-76,-12),(77,10),(-35,75),(35,-75),
      (-18,-40),(19,42),(-20,40),(20,-42),(-38,-77),(39,75),
    ]
    for idx,(x,y) in enumerate(placements):
        if any(abs(x - ZONES[z]["center"][0]) < ZONES[z]["size"][0]/2+3 and
               abs(y - ZONES[z]["center"][1]) < ZONES[z]["size"][1]/2+3 for z in ZONES):
            continue
        tree(x,y,0.77 + _rng.random()*0.32, pine=(y>14 and x>14),snow=(y>14 and x>14))
    # Lamp pairs border arterial roads but keep crossroads readable.
    for pos in (-63,-34,34,63):
        for s in (-1,1):
            light_post(pos,s*10.6)
            light_post(s*10.6,pos)
    # Stylized perimeter low boundary, with generous gap at main roads.
    for side in (-1,1):
        for u in (-70,-48,-26,26,48,70):
            box("PERIMETER_WALL",(u,side*84,1.0),(18,0.75,2.0),"stone","07_LANDSCAPE",bevel=0.12)
            box("PERIMETER_WALL",(side*84,u,1.0),(0.75,18,2.0),"stone","07_LANDSCAPE",bevel=0.12)
    # Extra framed decorative structures on vacant outdoor lots.
    for xx,yy in [(-72,-35),(72,35),(-73,35),(72,-35)]:
        box("DISTRICT_PLANTER",(xx,yy,0.48),(3.8,2.5,0.82),"ink","07_LANDSCAPE",bevel=0.15)
        box("DISTRICT_SOIL",(xx,yy,0.92),(3.35,2.1,0.16),"grass_dark","07_LANDSCAPE")
        sphere("DISTRICT_BUSH",(xx-0.6,yy,1.7),1.0,"leaf_light")
        sphere("DISTRICT_BUSH",(xx+0.55,yy,1.7),0.9,"leaf")
    # Backdrop buildings outside playable boundary add city-scale depth.
    for x,y,w,d,h in [(-102,13,10,17,22),(-100,-33,9,11,17),
                      (103,20,10,16,28),(100,-39,13,9,19),
                      (22,101,16,12,21),(-25,100,19,9,16),
                      (-22,-104,14,8,25),(28,-101,11,10,18)]:
        box("DISTANT_SKYLINE",(x,y,h/2),(w,d,h),"wall_dark","07_LANDSCAPE",bevel=0.25)
        box("SKYLINE_TOP",(x,y,h+0.4),(w+0.5,d+0.5,0.8),"roof","07_LANDSCAPE")


def build_presentation_camera():
    # Blender preview-only: cameras and lamps are deliberately excluded from GLB.
    bpy.ops.object.camera_add(location=(94,-113,105))
    obj=bpy.context.object
    obj.name="PREVIEW_CAMERA__NOT_EXPORTED"
    target=Vector((0,0,0))
    obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
    obj.data.type="ORTHO"
    obj.data.ortho_scale=212
    put_in(obj,"10_LIGHTS_CAMERAS",False)
    bpy.context.scene.camera=obj
    bpy.ops.object.light_add(type="SUN", location=(20,-30,70))
    light=bpy.context.object
    light.name="PREVIEW_SUN__NOT_EXPORTED"
    light.data.energy=2.5
    light.rotation_euler=(math.radians(31),math.radians(-24),math.radians(-29))
    put_in(light,"10_LIGHTS_CAMERAS",False)
    # Startup viewport showcases the whole map in Material Preview.
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                sp=area.spaces.active
                sp.region_3d.view_perspective="PERSP"
                sp.region_3d.view_distance=175
                sp.region_3d.view_rotation=(Vector((0,0,0))-Vector((100,-120,105))).to_track_quat('-Z','Y')
                sp.shading.type="MATERIAL"


def level_data():
    px,py=PLAYER_SPAWN
    return {
        "version": "1.0.0", "name": "NATHAN.EXE / The Four Chapters",
        "coordinateSystem": "threejs-y-up; Blender(X,Y,Z) -> Web(X,Z,-Y)",
        "worldBounds": {"minX":-WORLD["half_extent"],"maxX":WORLD["half_extent"],
                        "minZ":-WORLD["half_extent"],"maxZ":WORLD["half_extent"]},
        "spawn": {"x":px,"y":0.13,"z":-py,"yaw":0},
        "roads": {"width":WORLD["road_width"],"halfLength":83},
        "buildings": [
            {"id":zid,"x":c["center"][0],"z":-c["center"][1],
             "width":c["size"][0],"depth":c["size"][1],"height":c["height"]}
            for zid,c in ZONES.items()
        ],
        "colliders":colliders, "interactions":interactions,
        "notes": ["Collision is a 2D footprint approximation for a ground-level walking game.",
                  "Building interiors and elevated rooftop traversal are not implemented.",
                  "Rebuild level.json from Blender after moving or resizing districts."],
    }


def validate_map():
    for zid,c in ZONES.items():
        x,y=c["center"];w,d=c["size"]
        if abs(x)+w/2 > WORLD["half_extent"] or abs(y)+d/2 > WORLD["half_extent"]:
            raise ValueError(f"Zone {zid} intersects playable world boundary")
        if abs(x)<WORLD["road_width"]/2+w/2+1 or abs(y)<WORLD["road_width"]/2+d/2+1:
            raise ValueError(f"Zone {zid} overlaps central roads; move it farther away")
    names=list(ZONES)
    for a in range(len(names)):
        for b in range(a+1,len(names)):
            ca,cb=ZONES[names[a]],ZONES[names[b]]
            xa,ya=ca["center"];xb,yb=cb["center"]
            wa,da=ca["size"];wb,db=cb["size"]
            if abs(xa-xb)<(wa+wb)/2+3 and abs(ya-yb)<(da+db)/2+3:
                raise ValueError(f"Zones {names[a]} and {names[b]} overlap")


def save_outputs():
    assets=ROOT/"web"/"public"/"assets"
    data=ROOT/"web"/"public"/"data"
    source=ROOT/"source"
    for p in (assets,data,source):
        p.mkdir(parents=True,exist_ok=True)
    json_file=data/"level.json"
    with json_file.open("w",encoding="utf-8") as fp:
        json.dump(level_data(),fp,ensure_ascii=False,indent=2)
    # The source .blend is saved *before* export so nothing gets destructively joined.
    blend_file=source/"nathan_town.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_file))
    for obj in bpy.context.scene.objects:
        obj.select_set(False)
    for obj in all_export_objects:
        if obj.name in bpy.data.objects:
            obj.select_set(True)
    if all_export_objects:
        bpy.context.view_layer.objects.active=all_export_objects[0]
    glb_file=assets/"nathan_town.glb"
    bpy.ops.export_scene.gltf(filepath=str(glb_file),export_format="GLB",
                              use_selection=True,export_cameras=False,export_lights=False)
    bpy.ops.object.select_all(action="DESELECT")
    print("\n"+"="*65)
    print("NATHAN.EXE — MAP BUILD COMPLETE")
    print(f"Editable Blender file: {blend_file}")
    print(f"Runtime GLB:           {glb_file}")
    print(f"Physics / triggers:    {json_file}")
    print(f"Meshes exported:       {len(all_export_objects)}")
    print("="*65+"\n")


def build():
    validate_map()
    init_scene()
    build_ground_roads()
    build_plaza()
    build_gym()
    build_russia()
    build_projects()
    build_future()
    build_landscape()
    build_presentation_camera()
    save_outputs()


if __name__=="__main__":
    build()
