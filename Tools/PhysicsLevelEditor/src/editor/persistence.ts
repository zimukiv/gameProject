import { readFile, writeFile, rename, unlink, stat, link } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { validateLevel } from '../model/validate.ts';
import { assertSchema } from './schema.ts';

export type Opened = { path: string; text: string; fingerprint: string };
const hash = (text: string) => createHash('sha256').update(text).digest('hex');

export class LevelFiles {
  private known = new Map<string, string>();
  knownFingerprint(path: string) { return this.known.get(path) ?? null; }
  async open(path: string): Promise<Opened> {
    const text = await readFile(path, 'utf8');
    const data = JSON.parse(text); assertSchema(data); validateLevel(data);
    const fingerprint = hash(text);
    this.known.set(path, fingerprint);
    return { path, text, fingerprint };
  }
  async save(path: string, text: string, expected: string | null): Promise<Opened> {
    const data = JSON.parse(text); assertSchema(data); validateLevel(data);
    let exists = false, old = '';
    try { old = await readFile(path, 'utf8'); exists = true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (exists && (expected === null || hash(old) !== expected || this.known.get(path) !== expected))
      throw new Error('目标文件已存在或在编辑器外发生变化；请重新打开或另存为。');
    if (!exists && expected !== null) throw new Error('目标文件已被外部删除；请另存为。');
    const temp = join(dirname(path), `.physics-level-${randomUUID()}.tmp`);
    try {
      await writeFile(temp, text, { flag: 'wx' });
      if (exists && hash(await readFile(path, 'utf8')) !== expected) throw new Error('保存时检测到外部文件变化。');
      if (!exists) { try { await stat(path); throw new Error('目标文件刚被创建；请另存为。'); }
        catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; } }
      if (exists) await rename(temp, path);
      else { await link(temp, path); await unlink(temp).catch(() => {}); }
    } catch (error) { await unlink(temp).catch(() => {}); throw error; }
    const fingerprint = hash(text);
    this.known.set(path, fingerprint);
    return { path, text, fingerprint };
  }
}
