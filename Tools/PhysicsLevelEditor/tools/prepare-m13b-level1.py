"""Prepare a complete Level1 V3 rebuild candidate from the audited M1.2 draft.

This promotes Unity source fields into a separate *candidate* input, without
changing the immutable sourceSerialized backup. It does not claim Unity support.
"""
from __future__ import annotations

import copy
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'Levels/Drafts/M1.2/Level1.v3.draft.json'
OUTPUT = ROOT / 'Levels/Drafts/M1.3B/Level1.v3.rebuild-candidate.json'
EDITED = ROOT / 'Levels/Drafts/M1.3B/Level1.v3.rebuild-edited.json'
REPORT = ROOT / 'Levels/Drafts/M1.3B/Level1.coverage.json'
EXPECTED_SHA = '360e9cd725ee6f9c8c9ac48862301fd0190a39ea431cfed4ed507fa71d563a93'
EXPECTED_SCENE_SHA = '208caa5ee0c2edb7fe3140ece317ccd0156957ad0ae89e2a738a3ccb2d396d34'
STRUCTURAL = {'m_ObjectHideFlags', 'm_CorrespondingSourceObject', 'm_PrefabInstance',
              'm_PrefabAsset', 'm_GameObject', 'm_Script', 'm_Enabled',
              'm_EditorClassIdentifier', 'm_EditorHideFlags', 'serializedVersion'}
EVENT_STRING_PATH = re.compile(
    r'^\.m_On(?:Click|ValueChanged)\.m_PersistentCalls\.m_Calls\[\d+\]'
    r'\.m_Arguments\.(?:m_ObjectArgumentAssemblyTypeName|m_StringArgument)$')


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalize_blank_string_scalars(component: dict, fields: dict) -> list[str]:
    """Promote only audited Unity string slots with an actual blank YAML scalar.

    The immutable sourceSerialized fields and rawYaml retain PyYAML's null.
    No conversion is performed for explicit YAML null/~ or object references.
    """
    source = component['sourceSerialized']
    paths: list[str] = []

    def visit(value, path: str):
        if isinstance(value, dict):
            for key, child in value.items():
                visit(child, path + '.' + key)
        elif isinstance(value, list):
            for index, child in enumerate(value):
                visit(child, path + f'[{index}]')
        elif value is None:
            supported = source['classId'] == 114 and (path == '.m_Name' or
                (component['typeId'] in ('unity.Button', 'unity.Slider') and EVENT_STRING_PATH.fullmatch(path)))
            if not supported:
                raise ValueError(f"{component['componentId']}{path}: null has no confirmed Unity string contract")
            key = path.rsplit('.', 1)[-1]
            indent = '  ' if path == '.m_Name' else '          '
            pattern = re.compile(r'(?m)^' + re.escape(indent + key) + r':[ \t]*\r?$')
            if len(pattern.findall(source['rawYaml'])) != 1:
                raise ValueError(f"{component['componentId']}{path}: null lacks a unique blank YAML scalar")
            paths.append(path)

    visit(fields, '')
    for path in paths:
        current = fields
        for segment in re.findall(r'[^.\[\]]+|\[\d+\]', path):
            if segment.startswith('['):
                current = current[int(segment[1:-1])]
            elif segment == path.rsplit('.', 1)[-1]:
                current[segment] = ''
            else:
                current = current[segment]
    return paths


def target(ref: dict, level_id: str, components: dict) -> dict | None:
    kind = ref['kind']
    if kind == 'null':
        return None
    if kind == 'object':
        return {'kind': 'object', 'levelId': level_id, 'objectId': ref['objectId']}
    if kind == 'component':
        component = components.get(ref['componentId'])
        if component is None or component['objectId'] != ref['objectId']:
            raise ValueError(f"Missing component target at {ref['fieldPath']}: {ref['componentId']}")
        return {'kind': 'component', 'levelId': level_id, 'objectId': ref['objectId'],
                'componentId': ref['componentId'], 'componentTypeId': component['typeId']}
    if kind == 'asset':
        return {'kind': 'asset', 'assetId': ref['assetId']}
    raise ValueError(f"Unsupported Level1 source reference {kind} at {ref['fieldPath']}")


def main() -> None:
    if sha(ROOT / 'Assets/Scenes/Level1.unity') != EXPECTED_SCENE_SHA:
        raise ValueError('Formal Level1 Scene SHA-256 changed; candidate generation stopped')
    if sha(SOURCE) != EXPECTED_SHA:
        raise ValueError('M1.2 Level1 draft SHA-256 changed; candidate generation stopped')
    original = json.loads(SOURCE.read_text(encoding='utf-8'))
    candidate = copy.deepcopy(original)
    candidate['coverage'] = 'partial'  # Native Unity replay and runtime templates remain unverified.
    components = {c['componentId']: {'objectId': o['id'], 'typeId': c['typeId']}
                  for o in candidate['objects'] for c in o['components']}
    if len(candidate['objects']) != 71 or len(components) != 254:
        raise ValueError('Level1 source count differs from the M1.2 baseline')
    by_type = Counter()
    reference_count = 0
    native_field_candidates = 0
    preserved_only = []
    normalized_strings = []
    for obj in candidate['objects']:
        for component in obj['components']:
            if component['dataStatus'] != 'sourceOnly' or component['data'] is not None:
                raise ValueError(f"Unexpected edited source component {component['componentId']}")
            refs = component['sourceReferences']
            component['dataStatus'] = 'm13bCandidate'
            component['data'] = {
                'fields': copy.deepcopy(component['sourceSerialized']['fields']),
                'references': [{'fieldPath': ref['fieldPath'],
                                'target': target(ref, candidate['levelId'], components)} for ref in refs],
            }
            normalized_strings.extend({'componentId': component['componentId'], 'fieldPath': path}
                for path in normalize_blank_string_scalars(component, component['data']['fields']))
            reference_count += len(refs)
            by_type[component['typeId']] += 1
            fields = component['data']['fields']
            if component['typeId'] in ('unity.Transform', 'unity.RectTransform'):
                applied = {'m_LocalPosition', 'm_LocalRotation', 'm_LocalScale', 'm_Father',
                           'm_Children', 'm_RootOrder'}
                if component['typeId'] == 'unity.RectTransform':
                    applied |= {'m_AnchorMin', 'm_AnchorMax', 'm_AnchoredPosition', 'm_SizeDelta', 'm_Pivot'}
            else:
                applied = set(fields) - STRUCTURAL
                native_field_candidates += len(applied)
            remaining = sorted(set(fields) - applied - STRUCTURAL)
            if remaining:
                preserved_only.append({'componentId': component['componentId'],
                                       'typeId': component['typeId'], 'fields': remaining})
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(candidate, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    edited = copy.deepcopy(candidate)
    ground = next(o for o in edited['objects'] if o['id'] == '46c11342-6027-593d-87d5-ff1d6cb512b2')
    if ground['localPosition']['x'] != -5:
        raise ValueError('Audited Start ground baseline position changed')
    ground['localPosition']['x'] = -4.5
    vent = next(o for o in edited['objects'] if o['id'] == 'fa949e9b-1ebb-54c1-b252-8ae8a737e2b3')
    vent_component = next(c for c in vent['components'] if c['typeId'] == 'unity.AirVentBlock')
    if vent_component['data']['fields']['upwardForce'] != 19:
        raise ValueError('Audited AirVentBlock force changed')
    vent_component['data']['fields']['upwardForce'] = 20
    EDITED.write_text(json.dumps(edited, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    REPORT.write_text(json.dumps({
        'stage': 'M1.3B-1', 'status': 'structuredCandidateUnityNotVerified',
        'sourceDraftSha256': EXPECTED_SHA,
        'objectCount': len(candidate['objects']), 'componentCount': len(components),
        'referenceCount': reference_count, 'componentTypes': dict(sorted(by_type.items())),
        'nativeTopLevelFieldCandidates': native_field_candidates,
        'normalizedBlankStringCount': len(normalized_strings),
        'normalizedBlankStrings': normalized_strings,
        'preservedOnlyComponentFields': preserved_only,
        'sceneConfig': 'sourceOnly', 'runnerBindings': 'pendingTemplate',
        'editedFixture': {'startGroundId': ground['id'], 'positionX': [-5, -4.5],
                          'airVentId': vent['id'], 'upwardForce': [19, 20]},
        'unityRebuild': 'NOT_RUN', 'unityPlay': 'NOT_RUN',
        'warning': 'Promoted fields are candidate native serialization data; no complete Unity adapter is claimed.'
    }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'M13B_LEVEL1_CANDIDATE_PREPARED objects=71 components=254 references={reference_count}')


if __name__ == '__main__':
    main()
