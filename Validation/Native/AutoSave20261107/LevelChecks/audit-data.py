"""Compare authored physics canonical data and the unchanged later-chapter mechanics."""
import copy
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
BASE = ROOT / 'Assets/StreamingAssets/RoomLabNative'
AP = BASE / 'AuthoredPhysics/authored-physics.json'
GP = BASE / 'Campaign/deadline-guided.json'
NP = BASE / 'Campaign/deadline-autosave.json'
a, g, n = [json.loads(p.read_text(encoding='utf-8-sig')) for p in (AP, GP, NP)]
reports = []

def check(label, condition):
    reports.append({'name': label, 'pass': bool(condition)})
    assert condition, label

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def canonical(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')).hexdigest()

author = next(c for c in a['courses'] if c['id'] == 'physics')
check('Raw complete authored physics course is byte-independent canonical identical', n['courses'][0] == author)
check('Author root performance/default settings retained', n['settings'] == a['settings'])
check('Author root block defaults retained', n['blockDefaults'] == a['blockDefaults'])
check('Shared movement performance is identical to guided chapters', a['settings']['performance'] == g['settings']['performance'])
check('All nine author asset declarations preserved', n['assets'] == a['assets'] and len(n['assets']) == 9)
check('Autosave profile and authored course selector', n['nativeCampaign']['saveMode'] == 'contact-auto-v1' and n['nativeCampaign']['authoredCourses'] == ['physics'])
check('Exact three course IDs', [c['id'] for c in n['courses']] == ['physics', 'guided-calculus', 'guided-slacker'])
assets = []
for asset in a['assets']:
    source, copied = AP.parent / asset['path'], NP.parent / asset['path']
    check('Author asset bytes ' + asset['id'], source.read_bytes() == copied.read_bytes())
    assets.append({'id': asset['id'], 'path': asset['path'], 'sha256': sha(source)})
for course in n['courses'][1:]:
    reference = next(c for c in g['courses'] if c['id'] == course['id'])
    restored = copy.deepcopy(course)
    for room, old in zip(restored['rooms'], reference['rooms']):
        check('Dressing disabled ' + room['id'], room['nativeCampaign']['dressing'] == {'enabled': False, 'density': 0})
        if 'dressing' in old['nativeCampaign']:
            room['nativeCampaign']['dressing'] = copy.deepcopy(old['nativeCampaign']['dressing'])
        else:
            del room['nativeCampaign']['dressing']
        if room['id'] in ('network-slacker-01', 'network-slacker-09'):
            room['nativeCampaign']['objective'] = old['nativeCampaign']['objective']
    check('All later-chapter content identical except dressing/save wording ' + course['id'], restored == reference)
    check('No later-chapter ice instances affected by shared author defaults ' + course['id'], not any(o['type'] == 'physics.ice' for r in course['rooms'] for o in r['objects']))
result = {'failures': 0, 'cases': len(reports), 'reports': reports,
          'sourceSha256': {'authored': sha(AP), 'guided': sha(GP), 'autosave': sha(NP)},
          'physicsCanonicalSha256': canonical(author), 'assets': assets,
          'rootDifferences': {'paidStockCap': {'authoredAndAutosave': 3, 'guided': 1, 'DemoPhysicsRuntimeCap': 1},
                              'iceDefaults': {'authorPreserved': a['blockDefaults']['physics.ice'], 'laterChapterIceInstances': 0}},
          'counts': {'rooms': sum(len(c['rooms']) for c in n['courses']),
                     'directedConnections': sum(len(c['connections']) for c in n['courses']),
                     'flags': sum(o['type'] == 'common.checkpoint' for c in n['courses'] for r in c['rooms'] for o in r['objects']),
                     'collectibles': sum(o['type'] == 'common.collectible' for c in n['courses'] for r in c['rooms'] for o in r['objects'])}}
(HERE / 'data-contract.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print('AUTOSAVE_DATA_CONTRACT', len(reports), 'PASS', result['counts'], result['physicsCanonicalSha256'])
