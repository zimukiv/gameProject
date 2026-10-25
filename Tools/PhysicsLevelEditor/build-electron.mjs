import ts from 'typescript';
import { readFile, mkdir, writeFile, copyFile, rm, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, extname, basename, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root=dirname(fileURLToPath(import.meta.url));
const sourceRoot=join(root,'src');
const outputRoot=resolve(root,'dist-electron');
if (dirname(outputRoot)!==root || basename(outputRoot)!=='dist-electron')
  throw new Error('Refusing to remove a path outside this project’s generated dist-electron directory.');

const entries=['electron/main.ts','electron/preload.ts'];
const pending=entries.map(name=>resolve(sourceRoot,name));
const visited=new Set();
const sourceFiles=new Map();
const outputPath=(source)=>{
  const name=relative(sourceRoot,source);
  if (name.startsWith('..') || isAbsolute(name)) throw new Error(`Local import escaped src: ${source}`);
  return join(outputRoot,name.replace(/\.ts$/,'.cjs'));
};

while (pending.length) {
  const path=pending.pop();
  if (visited.has(path)) continue;
  visited.add(path);
  const extension=extname(path);
  if (extension!=='.ts' && extension!=='.json') throw new Error(`Unsupported local import: ${path}`);
  const source=await readFile(path,'utf8');
  sourceFiles.set(path,source);
  if (extension==='.json') continue;
  const syntax=ts.createSourceFile(path,source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TS);
  for (const statement of syntax.statements) {
    const specifier=(ts.isImportDeclaration(statement)||ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
      ? statement.moduleSpecifier.text : null;
    if (!specifier?.startsWith('.')) continue;
    if (!specifier.endsWith('.ts') && !specifier.endsWith('.json'))
      throw new Error(`Local imports must use explicit .ts or .json extensions: ${path}: ${specifier}`);
    const target=resolve(dirname(path),specifier);
    outputPath(target);
    pending.push(target);
  }
}

// Only the verified generated directory is removed; source files are never cleaned.
await rm(outputRoot,{recursive:true,force:true});
for (const [sourcePath,source] of sourceFiles) {
  const destination=outputPath(sourcePath);
  await mkdir(dirname(destination),{recursive:true});
  if (sourcePath.endsWith('.json')) {
    await copyFile(sourcePath,join(outputRoot,relative(sourceRoot,sourcePath)));
    continue;
  }
  const result=ts.transpileModule(source,{fileName:sourcePath,reportDiagnostics:true,
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}});
  if (result.diagnostics?.length) throw new Error(`CJS transpile failed for ${sourcePath}: `+
    ts.formatDiagnosticsWithColorAndContext(result.diagnostics,{
      getCanonicalFileName:name=>name,getCurrentDirectory:()=>root,getNewLine:()=>"\n"}));
  const output=result.outputText.replace(/(require\(["'][^"']+)\.ts(["']\))/g,'$1.cjs$2');
  await writeFile(destination,output);
}

// Verify every emitted local require, not only a fixed file list.
const moduleRequire=createRequire(import.meta.url);
for (const [sourcePath] of sourceFiles) {
  if (!sourcePath.endsWith('.ts')) continue;
  const emitted=outputPath(sourcePath);
  const text=await readFile(emitted,'utf8');
  for (const match of text.matchAll(/require\(["']([^"']+)["']\)/g)) {
    const specifier=match[1];
    if (specifier.startsWith('.')) {
      if (specifier.endsWith('.ts')) throw new Error(`Unconverted TypeScript import: ${emitted} -> ${specifier}`);
      const target=resolve(dirname(emitted),specifier);
      await stat(target).catch(()=>{throw new Error(`Missing Electron runtime dependency: ${emitted} -> ${specifier}`);});
    } else moduleRequire.resolve(specifier);
  }
}
console.log('ELECTRON_CJS_INTEGRITY_PASS files='+sourceFiles.size+' entries='+entries.join(','));
