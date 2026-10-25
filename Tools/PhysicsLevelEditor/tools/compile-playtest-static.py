"""Compile only the new playtest bridge against installed Unity 6000.6.4f1 assemblies.

This is syntax/API verification, not a Unity Editor build or game test.
"""
from __future__ import annotations

import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[3]
UNITY = pathlib.Path(r'C:\Program Files\Unity\Hub\Editor\6000.6.4f1\Editor\Data\Managed')
SDK = pathlib.Path(r'C:\Program Files\dotnet\sdk\9.0.312\Roslyn\bincore\csc.dll')
REF = pathlib.Path(r'C:\Program Files\dotnet\packs\Microsoft.NETCore.App.Ref\9.0.14\ref\net9.0')
GAME = ROOT / 'Temp/Phase4AIsolatedProject/Library/ScriptAssemblies/Assembly-CSharp.dll'


def compile_one(output: pathlib.Path, source: pathlib.Path, refs: list[pathlib.Path]) -> None:
    response = output.with_suffix('.rsp')
    args = ['/nostdlib+', '/target:library', '/out:"' + str(output) + '"']
    args.extend('/reference:"' + str(path) + '"' for path in refs)
    args.append(str(source))
    response.write_text('\n'.join(args) + '\n', encoding='utf-8')
    result = subprocess.run(['dotnet', str(SDK), '@' + str(response)], cwd=ROOT, check=False)
    if result.returncode:
        raise SystemExit(result.returncode)


def main() -> None:
    if any(not item.exists() for item in [SDK, REF, UNITY, GAME]):
        raise SystemExit('PLE_CSHARP_STATIC_NOT_RUN: Unity assembly cache missing')
    refs = list(REF.glob('*.dll')) + list(UNITY.rglob('UnityEngine*.dll'))
    refs += list(UNITY.rglob('UnityEditor*.dll')) + [GAME]
    refs = list(dict.fromkeys(refs))
    with tempfile.TemporaryDirectory(prefix='ple-static-') as temp:
        out = pathlib.Path(temp)
        runtime = out / 'PlaytestRuntime.dll'
        compile_one(runtime, ROOT / 'Assets/Scripts/LevelRuntime/LevelEditorPlaytestBootstrap.cs', refs)
        compile_one(out / 'PlaytestEditor.dll',
                    ROOT / 'Assets/Editor/LevelImportExport/PhysicsLevelPlaytestBuild.cs',
                    refs + [runtime])
    print('PLE_CSHARP_STATIC_COMPILE_PASS; Unity build/Player behavior NOT_RUN')


if __name__ == '__main__':
    main()
