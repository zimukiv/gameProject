"""Derive the M1.3A seven-object fixtures from the verified Level1 V3 draft.

Never selects by GameObject name and never writes the source draft or Scene.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'Levels/Drafts/M1.2/Level1.v3.draft.json'
OUTPUT = ROOT / 'Levels/Drafts/M1.3A'
IDS = {
    'controllerA': '0c53c967-c623-50f2-9d5d-98de4129232d',
    'controllerB': '0c00697d-0470-5e5d-940b-b0645f0c858e',
    'ice1': '670b32aa-3139-55f7-b655-ef0bebf7776c',
    'ice2': '1263c26b-67be-5071-8ada-a79b35fdc71c',
    'ice3': 'e520f104-d5ae-5663-b6c5-3eea07634b76',
    'wall': '9336ae16-b68e-5747-a5cd-113149e3870a',
    'backdrop': '4a942db3-88db-5728-b2db-f49f66c969ee',
}
EXPECTED_NAMES = {'controllerA': 'Thermal controller A', 'controllerB': 'Thermal controller B',
                  'ice1': 'Ice step 1', 'ice2': 'Ice step 2', 'ice3': 'Ice step 3',
                  'wall': 'Ice wall', 'backdrop': 'Temperature backdrop'}
APPLIED = {
    'Transform': {'m_LocalPosition','m_LocalRotation','m_LocalScale','m_Father'},
    'SpriteRenderer': {'m_Enabled','m_Sprite','m_Materials','m_Color','m_SortingLayerID',
                       'm_SortingOrder','m_DrawMode','m_Size','m_FlipX','m_FlipY'},
    'BoxCollider2D': {'m_Enabled','m_Size','m_Offset','m_IsTrigger','m_Density',
                      'm_EdgeRadius','m_Material'},
    'BaseBlock': {'m_Enabled','m_Script'},
    'IceBlock': {'m_Enabled','m_Script','isInteractable','isMelted','solidColor','meltedColor'},
    'ThermalControllerBlock': {'m_Enabled','m_Script','isInteractable','currentState',
        'linkedController','controlledIce','terminalName','interactionRadius','controlRadius',
        'roomFilterOverlay','coldFilterColor','hotFilterColor'},
}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def field(fields, key, at):
    if key not in fields:
        raise ValueError(f'{at}.{key}: required Unity source field absent')
    return fields[key]


def at_ref(component, path, target_type, level_id):
    refs = [r for r in component['sourceReferences'] if r['fieldPath'] == path]
    if len(refs) != 1:
        raise ValueError(f"{component['componentId']}{path}: expected one source reference")
    ref = refs[0]
    if ref['kind'] == 'null':
        return None
    if ref['kind'] != 'component':
        raise ValueError(f"{component['componentId']}{path}: wrong source reference kind")
    return {'kind': 'component', 'levelId': level_id, 'objectId': ref['objectId'],
            'componentId': ref['componentId'], 'componentTypeId': 'unity.' + target_type}


def asset_ref(component, path):
    refs = [r for r in component['sourceReferences'] if r['fieldPath'] == path]
    if len(refs) != 1 or refs[0]['kind'] != 'asset':
        raise ValueError(f"{component['componentId']}{path}: expected one asset reference")
    return {'kind': 'asset', 'assetId': refs[0]['assetId']}


def map_component(component, level_id):
    kind = component['typeId'].removeprefix('unity.')
    if kind not in APPLIED:
        raise ValueError(f"{component['componentId']}: unsupported component {kind}")
    fields = component['sourceSerialized']['fields']
    component['dataStatus'] = 'm13aMapped'
    if kind in ('Transform','BaseBlock'):
        data = {}
    elif kind == 'SpriteRenderer':
        materials = field(fields,'m_Materials',kind)
        if not isinstance(materials,list) or len(materials) != 1:
            raise ValueError(f"{component['componentId']}: only one SpriteRenderer material is supported")
        material = materials[0]
        if str(material.get('fileID')) != '10754' or material.get('guid') != '0000000000000000f000000000000000':
            raise ValueError(f"{component['componentId']}: unsupported non-default SpriteRenderer material")
        data = {'sprite': asset_ref(component,'.m_Sprite'),
                'material': asset_ref(component,'.m_Materials[0]'),
                'color': field(fields,'m_Color',kind),
                'sortingLayerId': field(fields,'m_SortingLayerID',kind),
                'sortingOrder': field(fields,'m_SortingOrder',kind),
                'drawMode': field(fields,'m_DrawMode',kind),
                'size': field(fields,'m_Size',kind),
                'flipX': bool(field(fields,'m_FlipX',kind)),
                'flipY': bool(field(fields,'m_FlipY',kind))}
    elif kind == 'BoxCollider2D':
        material = field(fields,'m_Material',kind)
        if str(material.get('fileID')) != '0':
            raise ValueError(f"{component['componentId']}: physics material is not mapped")
        data = {'size': field(fields,'m_Size',kind), 'offset': field(fields,'m_Offset',kind),
                'isTrigger': bool(field(fields,'m_IsTrigger',kind)),
                'density': field(fields,'m_Density',kind),
                'edgeRadius': field(fields,'m_EdgeRadius',kind), 'material': None}
    elif kind == 'IceBlock':
        data = {key: field(fields,key,kind) for key in
                ('solidColor','meltedColor')}
        data.update(isInteractable=bool(field(fields,'isInteractable',kind)),
                    isMelted=bool(field(fields,'isMelted',kind)))
    else:
        controlled = field(fields,'controlledIce',kind)
        if not isinstance(controlled,list) or len(controlled) != 4:
            raise ValueError(f"{component['componentId']}: controlledIce must have four source entries")
        data = {'isInteractable': bool(field(fields,'isInteractable',kind)),
                'currentState': field(fields,'currentState',kind),
                'linkedController': at_ref(component,'.linkedController','ThermalControllerBlock',level_id),
                'controlledIce': [at_ref(component,f'.controlledIce[{i}]','IceBlock',level_id)
                                  for i in range(len(controlled))],
                'roomFilterOverlay': at_ref(component,'.roomFilterOverlay','SpriteRenderer',level_id),
                'terminalName': field(fields,'terminalName',kind),
                'interactionRadius': field(fields,'interactionRadius',kind),
                'controlRadius': field(fields,'controlRadius',kind),
                'coldFilterColor': field(fields,'coldFilterColor',kind),
                'hotFilterColor': field(fields,'hotFilterColor',kind)}
    # Typed design config must never alias the parsed source-preservation fields.
    component['data'] = copy.deepcopy(data)
    source_keys = set(fields)
    applied = APPLIED[kind]
    if not applied.issubset(source_keys):
        raise ValueError(f"{component['componentId']}: mapped source keys absent: {sorted(applied-source_keys)}")
    return {'componentId': component['componentId'], 'typeId': component['typeId'],
            'appliedTopLevelFields': sorted(applied),
            'preservedOnlyTopLevelFields': sorted(source_keys-applied)}


def prepare():
    source_bytes = SOURCE.read_bytes()
    original = json.loads(source_bytes)
    if original['formatVersion'] != 3 or original['coverage'] != 'exportedUnverified' or original['roomId'] != 'room1':
        raise ValueError('Level1 V3 source draft identity/status changed')
    by_id = {o['id']: o for o in original['objects']}
    if len(by_id) != len(original['objects']):
        raise ValueError('duplicate object ID in source draft')
    for role, identity in IDS.items():
        if identity not in by_id or by_id[identity]['name'] != EXPECTED_NAMES[role]:
            raise ValueError(f'{role}: audited ID/name mismatch; do not guess by name')
    selected = set(IDS.values())
    baseline = copy.deepcopy(original)
    baseline['coverage'] = 'partial'
    baseline['objects'] = [o for o in baseline['objects'] if o['id'] in selected]
    baseline['events'] = []
    baseline['sourceCalls'] = []
    coverage = []
    for obj in baseline['objects']:
        for component in obj['components']:
            coverage.append(map_component(component,baseline['levelId']))
        raw = obj['sourceSerialized']['fields']
        coverage.append({'objectId': obj['id'], 'typeId': 'unity.GameObject',
                         'appliedTopLevelFields': ['m_Name','m_IsActive','m_Layer','m_TagString','m_Component'],
                         'preservedOnlyTopLevelFields': sorted(set(raw)-
                             {'m_Name','m_IsActive','m_Layer','m_TagString','m_Component'})})
    used_assets = sorted({r['assetId'] for obj in baseline['objects'] for component in obj['components']
                          for r in component['sourceReferences'] if r['kind'] == 'asset'})
    baseline['resourceIds'] = used_assets
    edited = copy.deepcopy(baseline)
    target = next(o for o in edited['objects'] if o['id'] == IDS['ice2'])
    before = copy.deepcopy(target['localPosition'])
    target['localPosition']['x'] += 0.75
    collider = next(c for c in target['components'] if c['typeId'] == 'unity.BoxCollider2D')
    size_before = copy.deepcopy(collider['data']['size'])
    collider['data']['size']['y'] += 0.25
    report = {'stage':'M1.3A','status':'dataPreparedPlayNotRun',
              'sourceDraftSha256':sha(source_bytes),'sourceSceneSha256':original['sourceScene']['sha256'],
              'selectedObjectIds':IDS,'componentCount':sum(len(o['components']) for o in baseline['objects']),
              'sourceFieldCoverage':coverage,
              'editedObjectId':IDS['ice2'],'positionBefore':before,
              'positionAfter':target['localPosition'],'colliderSizeBefore':size_before,
              'colliderSizeAfter':collider['data']['size'],
              'authority':'typed V3 position/collider/refs drive rebuild; sourceSerialized is immutable audit backup',
              'playMode':'NOT_RUN'}
    return baseline, edited, report


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--update-generated',action='store_true')
    args=parser.parse_args()
    baseline,edited,report=prepare()
    entries=[('thermal-baseline.v3.test.json',baseline),('thermal-edited.v3.test.json',edited),
             ('field-coverage.json',report)]
    payloads=[(OUTPUT/name,(json.dumps(data,ensure_ascii=False,indent=2)+'\n').encode('utf8'))
              for name,data in entries]
    for path,body in payloads:
        if path.exists() and path.read_bytes()!=body and not args.update_generated:
            raise ValueError(f'{path}: existing generated test data differs; refusing overwrite')
        if path.exists() and path.read_bytes()!=body and args.update_generated:
            old=json.loads(path.read_text(encoding='utf8'))
            if path.name=='field-coverage.json':
                safe=old.get('stage')=='M1.3A' and old.get('sourceDraftSha256')==report['sourceDraftSha256']
            else:
                safe=(old.get('sourceScene')==baseline['sourceScene'] and old.get('coverage')=='partial' and
                      {o['id'] for o in old.get('objects',[])}==set(IDS.values()))
            if not safe: raise ValueError(f'{path}: not a matching M1.3A test fixture')
    OUTPUT.mkdir(parents=True,exist_ok=True)
    for path,body in payloads:
        if not path.exists() or path.read_bytes()!=body:
            path.write_bytes(body)
    print(json.dumps({'baseline':str(payloads[0][0]),'edited':str(payloads[1][0]),
                      'objects':len(baseline['objects']),'components':report['componentCount'],
                      'position':report['positionBefore'],'editedPosition':report['positionAfter'],
                      'collider':report['colliderSizeBefore'],'editedCollider':report['colliderSizeAfter']}))


if __name__=='__main__':
    main()
