// Display relationships are mutable; revision manifests and their source parents remain immutable.
export function planEdit(revisions, metadata, edit, now = Date.now()) {
  const sources = new Map(revisions.map(r => [r.id, r.parent || null]));
  const overrides = new Map(metadata.map(r => [r.id, r]));
  const active = id => sources.has(id) && !overrides.get(id)?.deletedAt;
  const parent = id => overrides.has(id) ? overrides.get(id).parentId : sources.get(id);
  const error = message => { throw Object.assign(new Error(message), {status: 400}); };
  if (!sources.has(edit.id)) error('节点不属于此工作区');
  if (!['move', 'delete', 'restore'].includes(edit.action)) error('节点操作无效');
  if (edit.action !== 'restore' && !active(edit.id)) error('节点已删除，请刷新');
  if (edit.action === 'restore' && active(edit.id)) error('节点未删除');
  const changes = [];
  if (edit.action === 'delete') {
    const target = parent(edit.id);
    for (const id of sources.keys()) if (active(id) && parent(id) === edit.id)
      changes.push({id, parentId: target && active(target) ? target : null, deletedAt: null, updatedAt: now});
    changes.push({id: edit.id, parentId: target || null, deletedAt: now, updatedAt: now});
  } else {
    const target = edit.parentId || null;
    if (target && !active(target)) error('目标父节点不存在或已删除');
    const seen = new Set([edit.id]);
    for (let p = target; p; p = parent(p)) {
      if (seen.has(p)) error('不能关联自身或后代节点');
      seen.add(p);
    }
    changes.push({id: edit.id, parentId: target, deletedAt: null, updatedAt: now});
  }
  return changes;
}
export async function graphState(db, workspace) {
  const [version, rows] = await Promise.all([
    db.prepare('SELECT generation FROM workspace_graph WHERE workspace=?').bind(workspace).first(),
    db.prepare('SELECT revision_id AS id,parent_id AS parentId,deleted_at AS deletedAt,updated_at AS updatedAt FROM node_metadata WHERE workspace=?').bind(workspace).all(),
  ]);
  return {generation: version?.generation || 0, metadata: rows.results};
}
export async function editGraph(db, workspace, edit) {
  if (!Number.isSafeInteger(edit.expectedVersion) || edit.expectedVersion < 0)
    throw Object.assign(new Error('请先刷新节点图'), {status: 400});
  const [revisions, graph] = await Promise.all([
    db.prepare("SELECT id,json_extract(data,'$.parent') AS parent FROM revisions WHERE workspace=?").bind(workspace).all(),
    graphState(db, workspace),
  ]);
  if (graph.generation !== edit.expectedVersion) throw Object.assign(new Error('节点关系已被另一端修改，请刷新后重试'), {status: 409});
  const changes = planEdit(revisions.results, graph.metadata, edit);
  const token = crypto.randomUUID();
  await db.prepare('INSERT OR IGNORE INTO workspace_graph(workspace,generation,operation_id) VALUES(?,0,?)').bind(workspace, '').run();
  const results = await db.batch([
    db.prepare('UPDATE workspace_graph SET generation=generation+1,operation_id=? WHERE workspace=? AND generation=?').bind(token, workspace, edit.expectedVersion),
    ...changes.map(r => db.prepare('INSERT INTO node_metadata(workspace,revision_id,parent_id,deleted_at,updated_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM workspace_graph WHERE workspace=? AND operation_id=?) ON CONFLICT(workspace,revision_id) DO UPDATE SET parent_id=excluded.parent_id,deleted_at=excluded.deleted_at,updated_at=excluded.updated_at').bind(workspace, r.id, r.parentId, r.deletedAt, r.updatedAt, workspace, token)),
  ]);
  if (results[0].meta.changes !== 1) throw Object.assign(new Error('节点关系已被另一端修改，请刷新后重试'), {status: 409});
  return graphState(db, workspace);
}
