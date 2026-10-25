import {cp,copyFile,mkdir,readFile,readdir,rename,stat,writeFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const project=dirname(fileURLToPath(import.meta.url));
const repo=resolve(project,'../..');
const release=join(project,'release');
const name=process.env.PLE_RELEASE_NAME??'PhysicsLevelEditor-win32-x64-beta-r5-playtest';
const folder=join(release,name);
const archive=join(release,`${name}.zip`);
for(const output of [folder,archive]){
  try{await stat(output);throw Error(`Refusing to overwrite existing release: ${output}`);}
  catch(error){if(error.code!=='ENOENT')throw error;}
}
const manifest=JSON.parse(await readFile(join(repo,'Levels','ProjectManifest.json'),'utf8'));
if(manifest.rooms.length!==3||manifest.rooms.some(room=>room.migrationState!=='sourceOnly'))
  throw Error('Unexpected room manifest or migration claim');
const sourceMap=JSON.parse(await readFile(join(repo,'Levels','SourceMaps','Level1.source.json'),'utf8'));
const expectedIds=sourceMap.objects.filter(object=>object.ownership==='A').map(object=>object.objectId);
const builds=join(repo,'Temp','Phase4AIsolatedProject','Builds','LevelEditorPlaytest');
const candidates=(await readdir(builds,{withFileTypes:true}).catch(()=>[]))
  .filter(entry=>entry.isDirectory()).map(entry=>entry.name).sort().reverse();
let runnerSource;
for(const candidate of candidates){
  const dir=join(builds,candidate);
  try{
    const runner=JSON.parse(await readFile(join(dir,'runner-manifest.json'),'utf8'));
    if(runner.runnerVersion!==1||runner.roomId!=='room1'||
      runner.levelId!==manifest.rooms[0].levelId||
      runner.sourceSceneSha256!==manifest.rooms[0].sourceScene.sha256||
      runner.playerExe!=='PhysicsLevelPlaytest.exe'||
      !Array.isArray(runner.allowedObjectIds)||runner.allowedObjectIds.length!==expectedIds.length||
      new Set(runner.allowedObjectIds).size!==expectedIds.length||
      expectedIds.some(id=>!runner.allowedObjectIds.includes(id)))continue;
    await stat(join(dir,'PhysicsLevelPlaytest.exe'));
    await stat(join(dir,'PhysicsLevelPlaytest_Data'));
    runnerSource=dir;break;
  }catch{/* Incomplete attempts are retained but never shipped. */}
}
if(!runnerSource)throw Error('No verified isolated Unity Player build exists; refusing to package a fake Playtest button');
await stat(join(project,'dist','index.html'));
await stat(join(project,'dist-electron','electron','main.cjs'));
// Build the native playtest host from its checked-in source so the shipped
// helper always matches this tree instead of a stale binary.
const nativeSource=join(project,'native','PlaytestHost.cs');
const nativeExe=join(project,'native','bin','PlaytestHost.exe');
const csc=join(process.env.WINDIR??'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
await stat(nativeSource);
const nativeBuild=spawnSync(csc,['-nologo','-target:winexe',`-out:${nativeExe}`,
  '-r:System.Windows.Forms.dll','-r:System.Drawing.dll',nativeSource],{encoding:'utf8'});
if(nativeBuild.status!==0)throw Error(`PlaytestHost build failed: ${nativeBuild.stderr||nativeBuild.stdout}`);
await stat(nativeExe);
await mkdir(release,{recursive:true});
await cp(join(project,'node_modules','electron','dist'),folder,{recursive:true});
await rename(join(folder,'electron.exe'),join(folder,'PhysicsLevelEditor.exe'));
await cp(runnerSource,join(folder,'game-runner'),{recursive:true});
await copyFile(nativeExe,join(folder,'game-runner','PlaytestHost.exe'));
const app=join(folder,'resources','app');
await mkdir(app,{recursive:true});
await cp(join(project,'dist'),join(app,'dist'),{recursive:true});
await cp(join(project,'dist-electron'),join(app,'dist-electron'),{recursive:true});
await writeFile(join(app,'package.json'),JSON.stringify({name:'physics-level-editor-beta',
  productName:'Physics Level Editor Beta',version:'0.3.0',private:true,
  main:'dist-electron/electron/main.cjs'},null,2)+'\n');
const levels=join(repo,'Levels'),bundle=join(app,'bundled-levels');
await mkdir(join(bundle,'Drafts','M1.2'),{recursive:true});
await mkdir(join(bundle,'SourceMaps'),{recursive:true});
await mkdir(join(bundle,'Resources'),{recursive:true});
for(const relative of ['ProjectManifest.json','Resources/ResourceSources.json',
  'SourceMaps/Level1.source.json','SourceMaps/Level2.source.json','SourceMaps/Level3.source.json',
  'Drafts/M1.2/Level1.v3.draft.json','Drafts/M1.2/Level2.v3.draft.json',
  'Drafts/M1.2/Level3.v3.draft.json','Physics/Level1.phase1.json']){
  await copyFile(join(levels,relative),join(bundle,relative==='Physics/Level1.phase1.json'?
    'Level1.phase1.json':relative));
}
const runtime=['ajv','ajv-formats','fast-deep-equal','fast-uri','json-schema-traverse'];
await mkdir(join(app,'node_modules'),{recursive:true});
for(const module of runtime)await cp(join(project,'node_modules',module),
  join(app,'node_modules',module),{recursive:true});
const instructions=[
  'Physics Level Editor r5 (Windows x64)',
  '',
  '启动：完整解压后双击 PhysicsLevelEditor.exe。不要直接在 ZIP 内运行。',
  '无需安装 Node.js 或 Unity Editor；请保持整个文件夹结构不变。',
  '',
  'Room 1（Physics）',
  '  1. 在左侧选择对象（例如 Start ground），在右侧 Inspector 修改 X/Y/Z。',
  '  2. 只有非 UI、归属 A 且未锁定对象的 localPosition 可写；其他字段只读。',
  '  3. 点击“保存工作副本”，再点击“试玩 Room 1”。',
  '  4. 等待页脚出现“已确认应用 ... 项位置修改”。',
  '  5. 点击游戏画面一次获得键盘焦点：A/D 移动，空格跳跃，Shift 冲刺，E 互动。',
  '  6. 点击“停止试玩”返回编辑；再次试玩会读取最新工作副本。',
  '',
  'Room 2（Calculus）/ Room 3（Slacker）',
  '  当前可浏览来源对象和 Collider 几何，但没有真实试玩运行器。',
  '',
  '数据位置：',
  '  %APPDATA%\\Physics Level Editor Beta\\room-work-copies\\room1.overlay.json',
  '  %APPDATA%\\Physics Level Editor Beta\\playtest-sessions\\<session>\\Player.log',
  '  %APPDATA%\\Physics Level Editor Beta\\playtest-sessions\\<session>\\receipt.json',
  '',
  '限制：',
  '  - 仅 Room 1 支持真实 Unity 试玩。',
  '  - 仅支持位置（localPosition）修改；Collider/组件字段只读。',
  '  - 试玩窗口是无边框 owned 窗口，视觉上嵌入工作台，但不是真正子窗口。',
  '  - 详细说明见 PLAYTEST_GUIDE.md。',
  '',
  '原始 Unity Scene 不会被修改。',
  ''
].join('\r\n');
await writeFile(join(folder,'README.txt'),instructions,'utf8');
await copyFile(join(project,'PLAYTEST_GUIDE.md'),join(folder,'PLAYTEST_GUIDE.md'));
for(const required of ['PhysicsLevelEditor.exe','README.txt','PLAYTEST_GUIDE.md',
  'resources/app/dist/index.html',
  'resources/app/dist-electron/electron/main.cjs',
  'resources/app/bundled-levels/Drafts/M1.2/Level3.v3.draft.json',
  'game-runner/runner-manifest.json','game-runner/PhysicsLevelPlaytest.exe',
  'game-runner/PhysicsLevelPlaytest_Data','game-runner/PlaytestHost.exe'])
  await stat(join(folder,required));
// bsdtar treats an absolute "C:\..." -f path as a remote host; run from the
// release directory and pass bare names so ZIP creation is drive-letter safe.
const archiveName=`${name}.zip`;
const result=spawnSync('tar.exe',['-a','-c','-f',archiveName,name],{cwd:release,encoding:'utf8'});
if(result.status!==0)throw Error(`ZIP creation failed: ${result.stderr||result.stdout}`);
const entries=spawnSync('tar.exe',['-tf',archiveName],{cwd:release,encoding:'utf8'});
if(entries.status!==0||!entries.stdout.includes('PhysicsLevelEditor.exe')||
  !entries.stdout.includes('README.txt')||!entries.stdout.includes('PLAYTEST_GUIDE.md')||
  !entries.stdout.includes('Level3.v3.draft.json')||
  !entries.stdout.includes('PhysicsLevelPlaytest.exe')||
  !entries.stdout.includes('PlaytestHost.exe'))throw Error('ZIP content verification failed');
const count=(await readdir(join(app,'node_modules'))).length;
const hash=createHash('sha256');
await new Promise((accept,reject)=>createReadStream(archive)
  .on('data',chunk=>hash.update(chunk)).on('end',accept).on('error',reject));
const archiveStat=await stat(archive);
console.log(`PORTABLE_RELEASE_PASS folder=${folder} archive=${archive} `+
  `bytes=${archiveStat.size} sha256=${hash.digest('hex')} runtimePackages=${count}`);
