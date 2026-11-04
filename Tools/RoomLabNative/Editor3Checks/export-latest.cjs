'use strict';
// Run from repository root; NODE_PATH may point to a local editor's node_modules.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),editor=path.join(root,'Tools/RoomLab/room-editor');
const Archive=require(path.join(editor,'src/project/archive.cjs'));
const {seeds,restoreBuiltIns}=require(path.join(editor,'src/assets/seeds.cjs'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const baseline=Archive.unpack(fs.readFileSync(path.join(editor,'examples/three-themes-project.zip')));
const project=baseline.project,pristine=JSON.stringify(project);
const output=Archive.pack(project,new Map()); // build5/6 recovery path, deliberately no bytes supplied
assert.equal(JSON.stringify(project),pristine,'export must not mutate project');
const restored=Archive.unpack(output);assert.equal(restored.project.courses.length,3);
const originals=seeds({allThemes:true});for(const asset of project.assets)assert.deepEqual(restored.files.get(asset.path),originals.files.get(asset.path),'restored seed exact bytes');
fs.writeFileSync(path.join(__dirname,'editor3-three-themes.zip'),output);
fs.writeFileSync(path.join(root,'Assets/StreamingAssets/RoomLabNative/Editor3/editor3-three-themes.zip'),output);
const custom=structuredClone(project),asset=custom.assets.find(a=>a.id==='seed-calculus-integral');asset.hash='custom-same-id-different-hash';
const customSvg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#61317d"/></svg>');
assert.equal(restoreBuiltIns(custom.assets,new Map()).has(asset.path),false,'custom same ID must not silently become seed');
assert.throws(()=>Archive.pack(custom,new Map()),/缺少素材文件/);
const customPack=Archive.pack(custom,new Map([[asset.path,customSvg]])),customRoundtrip=Archive.unpack(customPack);
assert.deepEqual(Buffer.from(customRoundtrip.files.get(asset.path)),customSvg,'custom bytes preserved');assert.equal(customRoundtrip.project.assets.find(a=>a.id===asset.id).hash,asset.hash);
assert.equal(customRoundtrip.project.courses.find(c=>c.kind==='calculus').artBindings['calculus.integral'].idle,asset.id,'binding preserved');
fs.writeFileSync(path.join(__dirname,'editor3-custom-seed-id.zip'),customPack);
const verification=path.join(root,'Assets/StreamingAssets/RoomLabNative/Editor3/Verification');fs.mkdirSync(verification,{recursive:true});fs.writeFileSync(path.join(verification,'custom-seed-id.zip'),customPack);
const report={editorSource:'Tools/RoomLab/room-editor',baselineCommit:'6cd56e1',editorBuild:6,restoredAssets:project.assets.length,exportSha256:sha(output),customSha256:sha(customPack),customAssetId:asset.id,customAssetSha256:sha(customSvg),sourceProjectUnchanged:true,customMissingRejected:true};
fs.writeFileSync(path.join(__dirname,'latest-export-evidence.json'),JSON.stringify(report,null,2)+'\n');console.log('LATEST_EXPORT_PASS '+JSON.stringify(report));
