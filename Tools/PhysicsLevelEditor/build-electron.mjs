import ts from 'typescript';
import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
for (const name of ['electron/main', 'electron/preload', 'editor/persistence', 'editor/schema', 'model/validate', 'model/registry']) {
  const source = await readFile(join(root, 'src', `${name}.ts`), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText.replaceAll('.ts"', '.cjs"');
  const path = join(root, 'dist-electron', `${name}.cjs`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, output);
}
await copyFile(join(root,'src/model/level.schema.json'),join(root,'dist-electron/model/level.schema.json'));
