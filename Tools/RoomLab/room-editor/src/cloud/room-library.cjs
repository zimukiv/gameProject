'use strict';
const C = require('./codec.cjs');
async function action(service, name, p) {
  const connection = service.vault.load();
  if (!connection) throw Error('请先在云同步设置中导入连接密钥');
  const remote = service.remote(connection);
  if (name === 'roomLibraryList')
    return remote.request('rooms' + (p.cursor ? '?cursor=' + encodeURIComponent(p.cursor) : ''));
  if (name === 'roomLibraryUpload') {
    const project = require('../project/room-export.cjs').standalone(
      p.project,
      p.courseId,
      p.roomId,
    );
    const errors = require('../project/model.cjs').validate(project).errors;
    if (errors.length) throw Error(errors[0]);
    const snapshot = C.encode(project, p.files),
      revision = C.revision(snapshot, service.repo.data.device, '上传房间', null);
    await remote.uploadChunks(snapshot);
    return remote.request('rooms', { revision });
  }
  if (!/^[a-f0-9]{64}$/.test(p.id || '')) throw Error('云端房间编号无效');
  const record = await remote.request('rooms/' + p.id);
  if (record.info?.id !== p.id || record.revision?.id !== p.id) throw Error('云端房间编号不匹配');
  const data = await remote.downloadManifest(record.revision, p.id);
  const result = C.decode(data.snapshot.bytes);
  if (result.project.courses.length !== 1 || result.project.courses[0].rooms.length !== 1)
    throw Error('云端内容不是单个房间');
  return result;
}
module.exports = { action };
