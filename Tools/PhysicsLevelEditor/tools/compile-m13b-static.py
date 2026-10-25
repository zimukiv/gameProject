"""Compile the M1.3B-1 Editor candidate against cached Unity assemblies only."""
from __future__ import annotations

import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[3]
UNITY = pathlib.Path(r'C:\Program Files\Unity\Hub\Editor\6000.6.4f1\Editor\Data\Managed')
SDK = pathlib.Path(r'C:\Program Files\dotnet\sdk\9.0.312\Roslyn\bincore\csc.dll')
REF = pathlib.Path(r'C:\Program Files\dotnet\packs\Microsoft.NETCore.App.Ref\9.0.14\ref\net9.0')
GAME = ROOT / 'Temp/Phase4AIsolatedProject/Library/ScriptAssemblies'


def main() -> None:
    required = [SDK, UNITY, GAME / 'Assembly-CSharp.dll']
    if any(not p.exists() for p in required):
        raise SystemExit('M13B1_CSHARP_STATIC_NOT_RUN: Unity assembly cache missing')
    refs = list(REF.glob('*.dll')) + list(UNITY.rglob('UnityEngine*.dll')) + list(UNITY.rglob('UnityEditor*.dll'))
    refs += list(GAME.glob('Unity*.dll')) + [GAME / 'Assembly-CSharp.dll']
    refs = list(dict.fromkeys(refs))
    with tempfile.TemporaryDirectory(prefix='m13b-static-') as temporary:
        out = pathlib.Path(temporary)
        runtime_refs = []
        if b'LevelRunnerBindingV3' not in (GAME / 'Assembly-CSharp.dll').read_bytes():
            runtime_response = out / 'runtime.rsp'
            runtime_args = ['/nostdlib+', '/target:library',
                            '/out:"' + str(out / 'M13BRuntime.dll') + '"']
            runtime_args += ['/reference:"' + str(ref) + '"' for ref in refs]
            runtime_args.append(str(ROOT / 'Assets/Scripts/LevelRuntime/LevelRunnerBindingV3.cs'))
            runtime_response.write_text('\n'.join(runtime_args) + '\n', encoding='utf-8')
            result = subprocess.run(['dotnet', str(SDK), '@' + str(runtime_response)], cwd=ROOT, check=False)
            if result.returncode:
                raise SystemExit(result.returncode)
            runtime_refs.append(out / 'M13BRuntime.dll')
        response = out / 'compile.rsp'
        args = ['/nostdlib+', '/target:library', '/out:"' + str(out / 'M13BEditor.dll') + '"']
        args += ['/reference:"' + str(ref) + '"' for ref in refs + runtime_refs]
        args += [str(ROOT / p) for p in (
            'Assets/Editor/LevelImportExport/PhysicsLevelV2Json.cs',
            'Assets/Editor/LevelImportExport/PhysicsLevelV3Level1Candidate.cs',
        )]
        response.write_text('\n'.join(args) + '\n', encoding='utf-8')
        result = subprocess.run(['dotnet', str(SDK), '@' + str(response)], cwd=ROOT, check=False)
        if result.returncode:
            raise SystemExit(result.returncode)
    print('M13B1_CSHARP_STATIC_COMPILE_PASS; Unity Editor/Play Mode NOT_RUN')


if __name__ == '__main__':
    main()
