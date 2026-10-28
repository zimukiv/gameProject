import test from 'node:test';
import assert from 'node:assert/strict';
import {planEdit} from '../lib/graph-management.mjs';
import {buildGraph} from '../lib/library.mjs';
const revisions = [{id:'a'}, {id:'b',parent:'a'}, {id:'c',parent:'b'}];
test('relations reject cycles and foreign nodes without altering manifests', () => {
  assert.throws(()=>planEdit(revisions, [], {action:'move',id:'a',parentId:'c'}), /后代/);
  assert.throws(()=>planEdit(revisions, [], {action:'move',id:'b',parentId:'foreign'}), /不存在/);
  assert.equal(planEdit(revisions, [], {action:'move',id:'c',parentId:'a'})[0].parentId,'a');
  assert.equal(revisions[2].parent,'b');
});
test('deletion lifts children, hides aliases, and permits restoration', () => {
  const metadata=planEdit(revisions, [], {action:'delete',id:'b'}, 42);
  assert.equal(metadata.find(r=>r.id==='c').parentId,'a');
  const g=buildGraph({revisions, branches:[{name:'b',head:'b'}], graph:{metadata}});
  assert.deepEqual(g.nodes.map(n=>n.id).sort(),['a','c']);
  assert.equal(g.nodes.find(n=>n.id==='c').parent,'a');
  assert.equal(planEdit(revisions, metadata, {action:'restore',id:'b',parentId:'a'})[0].deletedAt,null);
});
