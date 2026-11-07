"""Combine the unchanged authored physics course with the guided later chapters."""
import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUTHORED = ROOT / 'Assets/StreamingAssets/RoomLabNative/AuthoredPhysics/authored-physics.json'
GUIDED = ROOT / 'Assets/StreamingAssets/RoomLabNative/Campaign/deadline-guided.json'
OUT = GUIDED.with_name('deadline-autosave.json')


def build_autosave(authored, guided):
    # Authored defaults, resources and course data remain the source of truth.
    if authored['settings']['performance'] != guided['settings']['performance']:
        raise ValueError('Shared performance differs; a per-course runtime contract is needed before combining.')
    p = copy.deepcopy(authored)
    physics = next(c for c in p['courses'] if c['kind'] == 'physics')
    later = copy.deepcopy([c for c in guided['courses'] if c['kind'] in ('calculus', 'slacker')])
    if len(later) != 2:
        raise ValueError('Expected both guided later chapters.')
    p['id'] = 'deadline-autosave-v1'
    p['name'] = 'DDL · 截止之前'
    p['notes'] = '原作者物理关与引导版后两章；触碰旗子自动保存，旧版本独立保留。'
    p['nativeCampaign'] = copy.deepcopy(guided['nativeCampaign'])
    p['nativeCampaign'].update(edition='local-autosave-20261107', saveMode='contact-auto-v1',
                               authoredCourses=[physics['id']], dressing={'enabled': False, 'density': 0})
    p['courses'] = [physics] + later
    for key, value in guided.get('pluginManifest', {}).items():
        existing = p.setdefault('pluginManifest', {}).get(key)
        if existing is not None and existing != value:
            raise ValueError('Module version conflict: ' + key)
        p['pluginManifest'][key] = value
    for key, value in guided.get('blockDefaults', {}).items():
        existing = p.setdefault('blockDefaults', {}).get(key)
        if existing is not None and existing != value:
            raise ValueError('Shared default conflict: ' + key)
        p['blockDefaults'][key] = copy.deepcopy(value)
    assets = {a['id']: a for a in p['assets']}
    for asset in guided.get('assets', []):
        if asset['id'] in assets and assets[asset['id']] != asset:
            raise ValueError('Asset identity conflict: ' + asset['id'])
        if asset['id'] not in assets:
            p['assets'].append(copy.deepcopy(asset))
    for course in later:
        for room in course['rooms']:
            meta = room['nativeCampaign']
            meta['dressing'] = {'enabled': False, 'density': 0}
            # Update only obsolete save wording; mechanics and stage gates are untouched.
            if room['id'] == 'network-slacker-01':
                meta['objective'] = '咖啡和讲义都只够用一次。先去黑板那边看清第一份记录；碰到旗子会自动保存。'
            elif room['id'] == 'network-slacker-09':
                meta['objective'] = '三份记录齐了就上讲台。进去前碰一下旗子，后面快下课了。'
    return p


def main():
    authored = json.loads(AUTHORED.read_text(encoding='utf-8-sig'))
    guided = json.loads(GUIDED.read_text(encoding='utf-8-sig'))
    project = build_autosave(authored, guided)
    # Keep the exact authored asset entries and safe assets/* paths. Only create missing copies;
    # an unexpected existing file is a conflict, never something this generator overwrites.
    copies = []
    for asset in authored['assets']:
        relative = Path(asset['path'])
        if relative.is_absolute() or '..' in relative.parts or relative.parts[0] != 'assets':
            raise ValueError('Unsafe authored asset path: ' + asset['path'])
        source = AUTHORED.parent / relative
        destination = OUT.parent / relative
        content = source.read_bytes()
        if destination.exists() and destination.read_bytes() != content:
            raise ValueError('Existing campaign asset differs: ' + str(destination))
        copies.append((destination, content))
    for destination, content in copies:
        if not destination.exists():
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(content)
    OUT.write_text(json.dumps(project, ensure_ascii=False, indent=2), encoding='utf-8')
    print('AUTOSAVE_AUTHORED', [(c['id'], len(c['rooms']), len(c['connections'])) for c in project['courses']],
          'assets', len(project['assets']), 'flags', sum(o['type'] == 'common.checkpoint' for c in project['courses'] for r in c['rooms'] for o in r['objects']))


if __name__ == '__main__':
    main()
