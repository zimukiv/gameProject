"""Read-only Unity YAML to V3 source-preserving drafts. Requires PyYAML.

This is a source exporter, not a Unity scene importer or runtime adapter.
It refuses changed scenes, unresolved references, duplicate YAML keys and
overwriting any different existing output file.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import re
import sys
import uuid
from collections import Counter
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[3]
NAMESPACE = uuid.UUID('47c2845f-91ae-481b-ae07-60ce2033e632')
HEADER = re.compile(rb'^--- !u!([0-9]+) &([0-9]+)(?: [^\r\n]*)?\r?$', re.M)
STRUCTURAL = {'.m_GameObject', '.m_CorrespondingSourceObject',
              '.m_PrefabInstance', '.m_PrefabAsset'}


class StrictUnityLoader(yaml.SafeLoader):
    pass


def unique_mapping(loader, node):
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node)
        if key in result:
            raise ValueError(f'duplicate Unity YAML key {key!r} at line {key_node.start_mark.line + 1}')
        result[key] = loader.construct_object(value_node)
    return result


StrictUnityLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, unique_mapping)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def norm(value):
    if isinstance(value, dict):
        return {str(k): (str(v) if str(k) == 'fileID' else norm(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [norm(v) for v in value]
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    raise ValueError(f'unsupported YAML value {type(value).__name__}')


def parse_documents(scene: bytes):
    matches = list(HEADER.finditer(scene))
    if not matches:
        raise ValueError('Unity scene has no YAML documents')
    header = scene[:matches[0].start()].decode('utf-8')
    result = []
    seen = set()
    for index, match in enumerate(matches):
        raw = scene[match.start():(matches[index + 1].start() if index + 1 < len(matches) else len(scene))]
        file_id = match.group(2).decode('ascii')
        if file_id in seen:
            raise ValueError(f'duplicate Unity YAML document fileID {file_id}')
        seen.add(file_id)
        body = raw[raw.index(b'\n') + 1:]
        loaded = yaml.load(body.decode('utf-8'), Loader=StrictUnityLoader)
        if not isinstance(loaded, dict) or len(loaded) != 1:
            raise ValueError(f'{file_id}: expected one Unity YAML root')
        unity_type, fields = next(iter(loaded.items()))
        if not isinstance(fields, dict):
            raise ValueError(f'{file_id}: Unity YAML root is not a mapping')
        result.append({'sourceFileId': file_id, 'sourceOrder': index, 'classId': int(match.group(1)),
                       'unityType': unity_type, 'sha256': digest(raw),
                       'rawYaml': raw.decode('utf-8'), 'fields': norm(fields)})
    if (header + ''.join(d['rawYaml'] for d in result)).encode('utf-8') != scene:
        raise ValueError('Unity source bytes cannot be reassembled from documents')
    return header, result


def fail(path, message):
    raise ValueError(f'{path}: {message}')


def collect_references(fields, prefix=''):
    result = []

    def walk(value, path):
        if isinstance(value, dict):
            if 'fileID' in value:
                result.append((path, value))
                return
            for name, child in value.items():
                walk(child, path + '.' + str(name))
        elif isinstance(value, list):
            for index, child in enumerate(value):
                walk(child, f'{path}[{index}]')

    walk(fields, prefix)
    return result


def leaf_count(value):
    if isinstance(value, dict):
        return sum(leaf_count(child) for child in value.values()) if value else 1
    if isinstance(value, list):
        return sum(leaf_count(child) for child in value) if value else 1
    return 1


def refs_for(doc, room, object_by_file, component_by_file, scene_doc_by_file, assets):
    refs = []
    for path, payload in collect_references(doc['fields']):
        file_id = payload['fileID']
        guid = str(payload.get('guid', '')).lower()
        if file_id == '0':
            ref = {'fieldPath': path, 'kind': 'null'}
        elif guid and guid != '0' * 32:
            asset_id = f'unity:{guid}:{file_id}'
            if asset_id not in assets:
                fail(f"{room}/{doc['sourceFileId']}{path}", f'asset {asset_id} missing from resource manifest')
            ref = {'fieldPath': path, 'kind': 'asset', 'assetId': asset_id,
                   'unityGuid': guid, 'localFileId': file_id}
        elif file_id in component_by_file:
            obj, component = component_by_file[file_id]
            ref = {'fieldPath': path, 'kind': 'component', 'objectId': obj['objectId'],
                   'componentId': component['componentId'], 'sourceFileId': file_id}
        elif file_id in object_by_file:
            ref = {'fieldPath': path, 'kind': 'object',
                   'objectId': object_by_file[file_id]['objectId'], 'sourceFileId': file_id}
        elif file_id in scene_doc_by_file:
            ref = {'fieldPath': path, 'kind': 'sceneSetting', 'sourceFileId': file_id}
        else:
            fail(f"{room}/{doc['sourceFileId']}{path}", f'unresolved fileID {file_id}')
        refs.append(ref)
    return refs


def point(fields, key, dimensions):
    value = fields.get(key)
    if not isinstance(value, dict) or any(k not in value for k in dimensions):
        fail(key, 'missing vector component')
    out = {k: value[k] for k in dimensions}
    if any(not isinstance(n, (int, float)) or isinstance(n, bool) for n in out.values()):
        fail(key, 'non-numeric vector component')
    return out


def rect_data(fields):
    anchor_min = point(fields, 'm_AnchorMin', 'xy')
    anchor_max = point(fields, 'm_AnchorMax', 'xy')
    anchored = point(fields, 'm_AnchoredPosition', 'xy')
    size = point(fields, 'm_SizeDelta', 'xy')
    pivot = point(fields, 'm_Pivot', 'xy')
    return {'anchorMin': anchor_min, 'anchorMax': anchor_max, 'anchoredPosition': anchored,
            'sizeDelta': size, 'pivot': pivot,
            'offsetMin': {k: anchored[k] - size[k] * pivot[k] for k in 'xy'},
            'offsetMax': {k: anchored[k] + size[k] * (1 - pivot[k]) for k in 'xy'}}


def source_event(call, source, target, level_id):
    action_id = str(uuid.uuid5(NAMESPACE, 'eventAction:' + call['eventId']))
    return {'id': call['eventId'], 'sourcePersistentCallId': call['eventId'],
            'trigger': {'typeId': 'source.unityPersistentEvent', 'source':
                        {'kind': 'component', 'levelId': level_id,
                         'objectId': call['sourceObjectId'], 'componentId': call['sourceComponentId'],
                         'componentTypeId': 'unity.' + source['unityType']}},
            'conditions': [], 'orderedActions': [{
                'id': action_id, 'typeId': 'source.unityPersistentCall',
                'target': {'kind': 'component', 'levelId': level_id,
                           'objectId': call['targetObjectId'], 'componentId': call['targetComponentId'],
                           'componentTypeId': 'unity.' + target['unityType']},
                'delaySeconds': None,
                'parameters': {'methodName': call['methodName'], 'mode': call['mode'],
                               'callState': call['callState']}}]}


def export_room(room, inventory, resources):
    scene_path = ROOT / room['sourceScene']['path']
    source = scene_path.read_bytes()
    if digest(source) != room['sourceScene']['sha256'] or digest(source) != inventory['sourceScene']['sha256']:
        fail(room['roomId'], 'official Scene SHA-256 differs from manifest/source map; stop')
    header, docs = parse_documents(source)
    docs_by_file = {d['sourceFileId']: d for d in docs}
    object_by_file = {o['sourceFileId']: o for o in inventory['objects']}
    component_by_file = {c['sourceFileId']: (o, c) for o in inventory['objects'] for c in o['components']}
    if len(object_by_file) != len(inventory['objects']) or len(component_by_file) != sum(len(o['components']) for o in inventory['objects']):
        fail(room['roomId'], 'duplicate source object/component fileID')
    go_files = {d['sourceFileId'] for d in docs if d['classId'] == 1}
    if go_files != set(object_by_file):
        fail(room['roomId'], f'GameObject source coverage mismatch missing={sorted(go_files-set(object_by_file))} extra={sorted(set(object_by_file)-go_files)}')
    component_files = {d['sourceFileId'] for d in docs if d['classId'] != 1 and
                       d['fields'].get('m_GameObject', {}).get('fileID', '0') != '0'}
    if component_files != set(component_by_file):
        fail(room['roomId'], f'component source coverage mismatch missing={sorted(component_files-set(component_by_file))} extra={sorted(set(component_by_file)-component_files)}')
    scene_files = set(docs_by_file) - go_files - component_files
    scene_docs = [d for d in docs if d['sourceFileId'] in scene_files]
    scene_doc_by_file = {d['sourceFileId']: d for d in scene_docs}
    asset_by_id = {a['assetId']: a for a in resources['resources'] if room['roomId'] in a['usedByRooms']}
    transform_by_object = {}
    for obj in inventory['objects']:
        go_doc = docs_by_file[obj['sourceFileId']]
        if go_doc['sha256'] != obj['sourceGameObjectSha256'] or go_doc['unityType'] != 'GameObject':
            fail(f"{room['roomId']}/{obj['sourceFileId']}", 'GameObject document changed')
        transforms = [c for c in obj['components'] if c['unityType'] in ('Transform', 'RectTransform')]
        if len(transforms) != 1:
            fail(f"{room['roomId']}/{obj['sourceFileId']}", 'expected one Transform/RectTransform')
        transform_by_object[obj['objectId']] = docs_by_file[transforms[0]['sourceFileId']]

    roots = [d for d in scene_docs if d['unityType'] == 'SceneRoots']
    if len(roots) != 1:
        fail(room['roomId'], 'expected exactly one SceneRoots document')
    root_order = [str(v['fileID']) for v in roots[0]['fields']['m_Roots']]
    output_objects = []
    all_ref_count = 0
    for obj in inventory['objects']:
        at = f"{room['roomId']}/{obj['sourceFileId']}"
        go = docs_by_file[obj['sourceFileId']]
        fields = go['fields']
        actual_components = [str(entry['component']['fileID']) for entry in fields['m_Component']]
        mapped_components = [c['sourceFileId'] for c in obj['components']]
        if actual_components != mapped_components:
            fail(at, 'component order differs from source map')
        transform = transform_by_object[obj['objectId']]
        tf = transform['fields']
        parent_file = str(tf['m_Father']['fileID'])
        if parent_file == '0':
            if obj['parentObjectId'] is not None:
                fail(at, 'root has non-null mapped parent')
            siblings = root_order
        else:
            if parent_file not in component_by_file:
                fail(at + '/m_Father', f'unknown Transform {parent_file}')
            parent_obj, parent_comp = component_by_file[parent_file]
            if parent_comp['unityType'] not in ('Transform', 'RectTransform') or obj['parentObjectId'] != parent_obj['objectId']:
                fail(at + '/m_Father', 'parent object/type mismatch')
            siblings = [str(v['fileID']) for v in docs_by_file[parent_file]['fields']['m_Children']]
        tf_file = transform['sourceFileId']
        if tf_file not in siblings:
            fail(at, f'Transform {tf_file} missing from parent/root order')
        object_refs = refs_for(go, room['roomId'], object_by_file, component_by_file, scene_doc_by_file, asset_by_id)
        components = []
        for comp in obj['components']:
            cf = comp['sourceFileId']
            doc = docs_by_file[cf]
            if doc['sha256'] != comp['sourceDocumentSha256'] or doc['classId'] != comp['classId']:
                fail(at + '/' + cf, 'component document hash/type differs from source map')
            if doc['fields']['m_GameObject']['fileID'] != obj['sourceFileId']:
                fail(at + '/' + cf, 'component points to a different GameObject')
            raw_refs = refs_for(doc, room['roomId'], object_by_file, component_by_file, scene_doc_by_file, asset_by_id)
            logical_refs = [r for r in raw_refs if r['fieldPath'] not in STRUCTURAL]
            if logical_refs != comp['references']:
                expected = {r['fieldPath']: r for r in comp['references']}
                actual = {r['fieldPath']: r for r in logical_refs}
                fail(at + '/' + cf, f'logical references differ: missing={sorted(expected.keys()-actual.keys())} extra={sorted(actual.keys()-expected.keys())} differing={sorted(k for k in expected.keys()&actual.keys() if expected[k]!=actual[k])}')
            all_ref_count += len(raw_refs)
            components.append({'componentId': comp['componentId'], 'sourceFileId': cf,
                               'typeId': 'unity.' + comp['unityType'], 'version': 1,
                               'enabled': bool(doc['fields'].get('m_Enabled', 1)),
                               'dataStatus': 'sourceOnly', 'data': None,
                               'sourceDocumentSha256': doc['sha256'],
                               'sourceSerialized': doc, 'sourceReferences': logical_refs})
        rect = rect_data(tf) if transform['unityType'] == 'RectTransform' else None
        output_objects.append({'id': obj['objectId'], 'sourceFileId': obj['sourceFileId'],
                               'ownership': obj['ownership'], 'name': fields['m_Name'],
                               'parentId': obj['parentObjectId'], 'active': bool(fields['m_IsActive']),
                               'layer': fields['m_Layer'], 'tag': fields['m_TagString'],
                               'localPosition': point(tf, 'm_LocalPosition', 'xyz'),
                               'localRotation': point(tf, 'm_LocalRotation', 'xyzw'),
                               'localScale': point(tf, 'm_LocalScale', 'xyz'),
                               'rectTransform': rect, 'responsibility': copy.deepcopy(obj['responsibility']),
                               'components': components, 'siblingIndex': siblings.index(tf_file),
                               'sourceSerialized': go, 'sourceReferences': object_refs})
        all_ref_count += len(object_refs)

    scene_refs = []
    for doc in scene_docs:
        scene_refs.extend(refs_for(doc, room['roomId'], object_by_file, component_by_file,
                                   scene_doc_by_file, asset_by_id))
    all_ref_count += len(scene_refs)
    component_by_id = {c['componentId']: c for o in inventory['objects'] for c in o['components']}
    events = []
    for call in inventory['persistentCalls']:
        source_comp = component_by_id[call['sourceComponentId']]
        target_comp = component_by_id[call['targetComponentId']]
        if call['classification'] == 'levelDesign':
            events.append(source_event(call, source_comp, target_comp, room['levelId']))
    used_assets = {r['assetId'] for o in output_objects for r in
                   (o['sourceReferences'] + [r for c in o['components'] for r in c['sourceReferences']])
                   if r['kind'] == 'asset'}
    used_assets.update(r['assetId'] for r in scene_refs if r['kind'] == 'asset')
    output = {'formatVersion': 3, 'levelId': room['levelId'], 'roomId': room['roomId'],
              'coverage': 'exportedUnverified', 'sourceScene': copy.deepcopy(room['sourceScene']),
              'sceneConfig': {'dataStatus': 'sourceOnly', 'sourceSceneSha256': digest(source),
                              'data': None, 'sourceHeader': header,
                              'sourceDocuments': scene_docs, 'sourceReferences': scene_refs},
              'objects': output_objects, 'events': events,
              'sourceCalls': copy.deepcopy(inventory['persistentCalls']),
              'resourceIds': sorted(used_assets)}
    order_by_file = {d['sourceFileId']: index for index, d in enumerate(docs)}
    reconstructed = (header + ''.join(d['rawYaml'] for d in sorted(
        [o['sourceSerialized'] for o in output_objects] +
        [c['sourceSerialized'] for o in output_objects for c in o['components']] + scene_docs,
        key=lambda d: order_by_file[d['sourceFileId']]))).encode('utf-8')
    if reconstructed != source:
        fail(room['roomId'], 'full source-document reassembly differs from original Scene bytes')
    report = {'roomId': room['roomId'], 'sourceSha256': digest(source),
              'objects': len(output_objects), 'components': sum(len(o['components']) for o in output_objects),
              'sourceYamlBytes': len(source), 'sourceDocuments': len(docs),
              'preservedSerializedLeaves': sum(leaf_count(d['fields']) for d in docs),
              'sourceBytesReassembledExactly': True,
              'sceneDocuments': len(scene_docs), 'sourceReferencesIncludingStructural': all_ref_count,
              'persistentCalls': len(inventory['persistentCalls']), 'designEventSources': len(events),
              'runnerUiCalls': sum(c['classification']=='runnerUi' for c in inventory['persistentCalls']),
              'mappedTransforms': sum(1 for o in output_objects if o['rectTransform'] is None),
              'mappedRectTransforms': sum(1 for o in output_objects if o['rectTransform'] is not None),
              'resourceReferences': len(used_assets), 'unexplainedOmissions': 0,
              'sourceDifferencePaths': [],
              'restorationStatus': 'notVerifiedByUnity'}
    return output, report


def write_new_or_identical(path: Path, content: bytes, update_generated: bool):
    if path.exists():
        if path.read_bytes() != content and not update_generated:
            fail(str(path), 'existing candidate differs; refusing to overwrite')
        if path.read_bytes() == content:
            return
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name('.' + path.name + '.m12-writing')
    if temp.exists():
        fail(str(temp), 'temporary output already exists')
    try:
        temp.write_bytes(content)
        os.replace(temp, path)
    finally:
        if temp.exists():
            temp.unlink()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default='Levels/Drafts/M1.2')
    parser.add_argument('--update-generated', action='store_true',
                        help='replace only a prior M1.2 draft for the same immutable Scene source')
    args = parser.parse_args()
    output_dir = (ROOT / args.output).resolve()
    if not output_dir.is_relative_to(ROOT / 'Levels' / 'Drafts'):
        fail(str(output_dir), 'output must stay inside Levels/Drafts')
    manifest = json.loads((ROOT / 'Levels/ProjectManifest.json').read_text(encoding='utf-8'))
    resources = json.loads((ROOT / 'Levels/Resources/ResourceSources.json').read_text(encoding='utf-8'))
    candidates = []
    reports = []
    for room in manifest['rooms']:
        if room['migrationState'] != 'sourceOnly' or room['levelDataPath'] is not None:
            fail(room['roomId'], 'manifest is no longer sourceOnly')
        inventory = json.loads((ROOT / 'Levels' / room['sourceMapPath']).read_text(encoding='utf-8'))
        candidate, report = export_room(room, inventory, resources)
        reports.append(report)
        candidates.append((output_dir / (Path(room['sourceScene']['path']).stem + '.v3.draft.json'),
                           (json.dumps(candidate, ensure_ascii=False, indent=2) + '\n').encode('utf-8')))
    report_data = {'stage': 'M1.2', 'status': 'exportedUnverified', 'rooms': reports,
                   'unityRebuild': 'NOT_RUN', 'unityRuntime': 'NOT_RUN'}
    candidates.append((output_dir / 'export-report.json',
                       (json.dumps(report_data, ensure_ascii=False, indent=2) + '\n').encode('utf-8')))
    # Preflight all target paths before writing the first file.
    for path, content in candidates:
        if path.exists() and path.read_bytes() != content:
            if not args.update_generated:
                fail(str(path), 'existing candidate differs; refusing all writes')
            old = json.loads(path.read_text(encoding='utf-8'))
            new = json.loads(content)
            if path.name == 'export-report.json':
                old_ids = [(r['roomId'], r['sourceSha256']) for r in old.get('rooms', [])]
                new_ids = [(r['roomId'], r['sourceSha256']) for r in new['rooms']]
                safe = old.get('stage') == 'M1.2' and old.get('status') == 'exportedUnverified' and old_ids == new_ids
            else:
                safe = (old.get('formatVersion') == 3 and old.get('coverage') == 'exportedUnverified'
                        and old.get('sourceScene') == new.get('sourceScene')
                        and old.get('roomId') == new.get('roomId'))
            if not safe:
                fail(str(path), 'existing output is not this M1.2 source draft')
    for path, content in candidates:
        write_new_or_identical(path, content, args.update_generated)
    print(json.dumps(report_data, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, yaml.YAMLError) as exc:
        print('M1.2_EXPORT_FAIL ' + str(exc), file=sys.stderr)
        sys.exit(1)
