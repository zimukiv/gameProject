"""Read-only YAML extraction to seed Phase 1 data while Unity batch licensing is unavailable.

This does not replace the Unity exporter/importer roundtrip test.
"""
from pathlib import Path
import json
import re
import uuid

ROOT = Path(__file__).resolve().parents[3]
SCENE = ROOT / 'Assets/Scenes/Level1.unity'
GUID = re.search(r'^guid: ([0-9a-f]+)$', (SCENE.with_suffix('.unity.meta')).read_text(), re.M)[1]
raw = SCENE.read_text(encoding='utf-8-sig')
parts = re.split(r'(?m)^--- !u!(\d+) &(\d+)\n', raw)
docs = {int(parts[i+1]): (int(parts[i]), parts[i+2]) for i in range(1, len(parts), 3)}

def field(body, key):
    match = re.search(rf'^  {re.escape(key)}: (.*)$', body, re.M)
    if not match:
        raise ValueError(f'missing {key}')
    value = match[1]
    return json.loads(value) if value.startswith('"') else value

def vector(body, key):
    return {k: float(v) if '.' in v else int(v)
            for k, v in re.findall(r'([xyzrgba]): (-?[\d.]+)', field(body, key))}

def component(go, kind=None, script=None):
    ids = [int(x) for x in re.findall(r'^  - component: \{fileID: (\d+)\}', docs[go][1], re.M)]
    matches = [(i, docs[i][1]) for i in ids if (kind is None or docs[i][0] == kind)
               and (script is None or f'Assembly-CSharp::{script}\n' in docs[i][1])]
    if len(matches) != 1:
        raise ValueError(f'expected one component {kind}/{script} on {go}, got {len(matches)}')
    return matches[0][1]

selection = [(1702347767, 'platform', 'physics.platform'),
             (1314457683, 'airVent', 'physics.airVent'),
             (131926431, 'token', 'item.token')]
objects = []
entries = []
for go, kind, type_id in selection:
    body = docs[go][1]
    name = field(body, 'm_Name')
    layer = int(field(body, 'm_Layer'))
    transform = component(go, 4)
    sprite = component(go, 212)
    collider = component(go, 61)
    sprite_ref = re.search(r'^  m_Sprite: \{fileID: (\d+), guid: ([0-9a-f]+), type: \d+\}', sprite, re.M)
    if not sprite_ref:
        raise ValueError('missing Sprite asset reference')
    object_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f'unity:{GUID}:{go}'))
    entries.append({'globalObjectId': f'GlobalObjectId_V1-2-{GUID}-{go}-0', 'objectId': object_id})
    obj = {
        'id': object_id, 'name': name, 'kind': kind, 'parentId': None,
        'active': field(body, 'm_IsActive') == '1', 'layer': layer,
        'localPosition': vector(transform, 'm_LocalPosition'),
        'localRotationZ': vector(transform, 'm_LocalEulerAnglesHint')['z'],
        'localScale': vector(transform, 'm_LocalScale'),
        'components': [
            {'typeId': 'visual.sprite', 'version': 1, 'enabled': field(sprite, 'm_Enabled') == '1',
             'sprite': {'assetGuid': sprite_ref[2], 'localFileId': sprite_ref[1],
                        'color': vector(sprite, 'm_Color'),
                        'sortingOrder': int(field(sprite, 'm_SortingOrder'))}},
            {'typeId': 'physics.boxCollider2d', 'version': 1, 'enabled': field(collider, 'm_Enabled') == '1',
             'collider': {'size': vector(collider, 'm_Size'), 'offset': vector(collider, 'm_Offset'),
                          'isTrigger': field(collider, 'm_IsTrigger') == '1'}}
        ]
    }
    if kind == 'platform':
        impl = component(go, script='BaseBlock')
        obj['components'].append({'typeId': type_id, 'version': 1,
                                  'enabled': field(impl, 'm_Enabled') == '1'})
    elif kind == 'airVent':
        impl = component(go, script='AirVentBlock')
        obj['components'].append({'typeId': type_id, 'version': 1,
                                  'enabled': field(impl, 'm_Enabled') == '1',
                                  'airVent': {
                                      'ventDirection': vector(impl, 'ventDirection'),
                                      'upwardForce': float(field(impl, 'upwardForce')),
                                      'isInteractable': field(impl, 'isInteractable') == '1',
                                      'guideText': field(impl, 'guideText'),
                                      'isContinuous': field(impl, 'isContinuous') == '1'}})
    else:
        impl = component(go, script='TokenItem')
        obj['components'].append({'typeId': type_id, 'version': 1,
                                  'enabled': field(impl, 'm_Enabled') == '1',
                                  'token': {'scoreAmount': int(field(impl, 'scoreAmount')),
                                            'tokenAmount': int(field(impl, 'tokenAmount'))}})
    objects.append(obj)

target = ROOT / 'Levels/Physics'
target.mkdir(parents=True, exist_ok=True)
document = {'formatVersion': 1, 'levelId': f'unity:{GUID}', 'coverage': 'partial',
            'sourceSceneGuid': GUID, 'objects': sorted(objects, key=lambda o: o['id'])}
(target / 'Level1.phase1.json').write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
(target / 'Level1.ids.json').write_text(json.dumps({'sourceSceneGuid': GUID, 'entries': entries}, indent=2) + '\n', encoding='utf-8')
print('Seeded partial three-object fixture from scene YAML; Unity exporter not yet executed.')
