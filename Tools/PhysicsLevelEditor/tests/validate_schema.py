from pathlib import Path
import json
from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[3]
schema = json.loads((ROOT / 'Tools/PhysicsLevelEditor/src/model/level.schema.json').read_text(encoding='utf-8'))
Draft202012Validator.check_schema(schema)
validator = Draft202012Validator(schema, format_checker=FormatChecker())
source = ROOT / 'Levels/Physics/Level1.phase1.json'
paths = [source]
reexport = ROOT / 'Tools/PhysicsLevelEditor/tests/fixtures/roundtrip.json'
if reexport.exists():
    paths.append(reexport)
for path in paths:
    data = json.loads(path.read_text(encoding='utf-8'))
    errors = sorted(validator.iter_errors(data), key=lambda error: list(map(str, error.path)))
    if errors:
        raise AssertionError(f'{path}: {errors[0].message}')
print(f'JSON Schema Draft 2020-12: {len(paths)} document(s) valid; '
      f'Unity re-export {"present" if reexport.exists() else "not yet available"}.')
