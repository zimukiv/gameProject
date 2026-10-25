import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile,mkdtemp,writeFile,rm,access} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=resolve(root,'../../Levels/Physics');
const require=createRequire(import.meta.url);

test('Electron CJS build closes transitive dependency graph and opens V1/V2 files',async()=>{
  const result=spawnSync(process.execPath,['build-electron.mjs'],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
  assert.match(result.stdout,/ELECTRON_CJS_INTEGRITY_PASS/);
  for(const name of ['editor/persistence.cjs','model/validate-v2.cjs','model/registry-v2.cjs',
    'model/level-v2.cjs','model/level-v2.schema.json','model/validate.cjs','model/level.schema.json'])
    await access(resolve(root,'dist-electron',name));
  const {LevelFiles}=require(resolve(root,'dist-electron/editor/persistence.cjs'));
  const files=new LevelFiles();
  const v1=await files.open(resolve(source,'Level1.phase1.json'));
  assert.equal(JSON.parse(v1.text).objects.length,3);
  const v2=await files.open(resolve(source,'Level1.phase4b.json'));
  assert.equal(JSON.parse(v2.text).objects.length,9);
  const directory=await mkdtemp(resolve(tmpdir(),'physics-electron-build-'));
  try {
    const path=resolve(directory,'edited.json');
    await writeFile(path,v2.text);
    const opened=await files.open(path);
    const edited=JSON.parse(opened.text);
    const rail=edited.objects.flatMap((o:{components:{typeId:string;railgun?:{acceleration:number}}[]})=>o.components)
      .find((c:{typeId:string})=>c.typeId==='mechanism.railgun');
    rail.railgun.acceleration=37;
    await files.save(path,JSON.stringify(edited,null,2),opened.fingerprint);
    const reopened=await files.open(path);
    assert.equal(JSON.parse(reopened.text).objects.flatMap((o:{components:unknown[]})=>o.components)
      .find((c:{typeId:string})=>c.typeId==='mechanism.railgun').railgun.acceleration,37);
    assert.equal(JSON.parse(await readFile(resolve(source,'Level1.phase4b.json'),'utf8'))
      .objects.length,9);
  }finally{await rm(directory,{recursive:true,force:true});}
});
