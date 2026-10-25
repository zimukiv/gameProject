"""Compile only new M1.3A C# sources against cached Unity assemblies.

This checks C# APIs and syntax. It does not launch Unity or prove Editor/Play Mode.
"""
from __future__ import annotations

import os
import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[3]
UNITY = pathlib.Path(r'C:\Program Files\Unity\Hub\Editor\6000.6.4f1\Editor\Data\Managed')
SDK = pathlib.Path(r'C:\Program Files\dotnet\sdk\9.0.312\Roslyn\bincore\csc.dll')
REF = pathlib.Path(r'C:\Program Files\dotnet\packs\Microsoft.NETCore.App.Ref\9.0.14\ref\net9.0')
GAME = ROOT / 'Temp/Phase4AIsolatedProject/Library/ScriptAssemblies'


def quote(path):
    return '/reference:"' + str(path) + '"'


def compile_to(out, sources, references):
    args = ['/nostdlib+', '/target:library', '/out:"' + str(out) + '"']
    args += [quote(path) for path in references]
    args += [str(ROOT / path) for path in sources]
    response = out.with_suffix('.rsp')
    response.write_text('\n'.join(args)+'\n',encoding='utf-8')
    result = subprocess.run(['dotnet', str(SDK), '@'+str(response)],cwd=ROOT,check=False)
    if result.returncode:
        raise SystemExit(result.returncode)


def main():
    required=[SDK,REF,UNITY/'UnityEngine'/'UnityEditor.CoreModule.dll',GAME/'Assembly-CSharp.dll']
    if any(not p.exists() for p in required):
        raise SystemExit('M13A_STATIC_COMPILE_NOT_RUN required Unity/.NET cache missing')
    references=list(REF.glob('*.dll'))+list((UNITY/'UnityEngine').glob('*.dll'))
    with tempfile.TemporaryDirectory(prefix='m13a-static-compile-') as temp:
        out=pathlib.Path(temp)
        game_bytes=(GAME/'Assembly-CSharp.dll').read_bytes()
        has_new_types=(b'LevelComponentIdMap' in game_bytes and
                       b'M13AThermalPlayProbe' in game_bytes)
        runtime_refs=[]
        if not has_new_types:
            runtime=out/'M13ARuntime.dll'
            compile_to(runtime,['Assets/Scripts/LevelRuntime/LevelComponentIdMap.cs',
                                'Assets/Scripts/LevelRuntime/M13AThermalPlayProbe.cs'],
                       references+[GAME/'Assembly-CSharp.dll'])
            runtime_refs.append(runtime)
        compile_to(out/'M13AEditor.dll',
                   ['Assets/Editor/LevelImportExport/PhysicsLevelV2Json.cs',
                    'Assets/Editor/LevelImportExport/PhysicsLevelV3ThermalRebuild.cs'],
                   references+[GAME/'Assembly-CSharp.dll']+runtime_refs)
    print('M13A_CSHARP_STATIC_COMPILE_PASS; Unity Editor/Play Mode NOT_RUN')


if __name__=='__main__':
    main()
