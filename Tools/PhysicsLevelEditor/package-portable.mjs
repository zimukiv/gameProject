import {cp,copyFile,mkdir,readFile,readdir,rename,stat,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const project=dirname(fileURLToPath(import.meta.url));
const repo=resolve(project,'../..');
const release=join(project,'release');
const name='PhysicsLevelEditor-win32-x64-beta-r5-playtest';
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
const instructions=`Physics Level Editor Beta (Windows x64)\r\n\r\nDouble-click PhysicsLevelEditor.exe. No Node.js or Unity Editor installation is needed.\r\nThe three rooms contain complete source inventories from the original Unity Scenes.\r\nSelect a room, browse objects and registered source components, and edit supported\r\nlocalPosition fields. Click Save work copy; files and backups are stored under\r\n%APPDATA%\\Physics Level Editor Beta\\room-work-copies. Playtest logs are stored\r\nunder %APPDATA%\\Physics Level Editor Beta\\playtest-sessions.\r\n\r\nThe canvas outlines Box/Circle Collider geometry. Sprite assets are not bundled, so\r\nvisuals use labelled placeholders. Component fields remain read-only. In Room 1,\r\nSave then click Playtest to run the included Unity game inside the workbench playtest\r\narea using that saved work copy. Click the game area once to give it keyboard focus;\r\nA/D moves, Space jumps. Press Stop playtest to close the game and return to editing.\r\nThe original Unity Scenes and V3 drafts remain unchanged.\r\n\r\nKeep the full extracted folder together. Do not run the EXE from inside the ZIP.\r\n`;
await writeFile(join(folder,'README.txt'),instructions,'utf8');
for(const required of ['PhysicsLevelEditor.exe','resources/app/dist/index.html',
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
  !entries.stdout.includes('Level3.v3.draft.json')||
  !entries.stdout.includes('PhysicsLevelPlaytest.exe')||
  !entries.stdout.includes('PlaytestHost.exe'))throw Error('ZIP content verification failed');
const count=(await readdir(join(app,'node_modules'))).length;
console.log(`PORTABLE_RELEASE_PASS folder=${folder} archive=${archive} runtimePackages=${count}`);
