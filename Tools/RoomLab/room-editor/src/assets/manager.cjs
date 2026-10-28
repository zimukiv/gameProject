'use strict';
const { uid } = require('../shared/utils.cjs');
const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};
async function hash(bytes) {
  if (globalThis.crypto?.subtle) {
    const result = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(result), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  let v = 2166136261;
  for (const b of bytes) v = Math.imul(v ^ b, 16777619);
  return (v >>> 0).toString(16) + '-' + bytes.length;
}
async function importAsset(
  store,
  {
    name,
    bytes,
    width = 64,
    height = 64,
    courseId = 'physics',
    replaceId = null,
    category = 'unsorted',
    subcategory = 'unsorted',
  },
) {
  const ext = name.split('.').at(-1).toLowerCase();
  if (!MIME[ext]) throw new Error('支持 PNG/JPG/WebP/GIF/SVG 图片。');
  if (bytes.length > 20 * 1024 * 1024) throw new Error('单个素材不能超过 20 MiB。');
  const digest = await hash(bytes),
    old = replaceId && store.project.assets.find((a) => a.id === replaceId),
    id = old?.id || uid('asset'),
    path = 'assets/' + id + '-' + digest.slice(0, 12) + '.' + ext;
  const meta = {
    id,
    name: old?.name || name.replace(/\.[^.]+$/, ''),
    path,
    mime: MIME[ext],
    width,
    height,
    courseId: old?.courseId || courseId,
    category: old ? require('./catalog.cjs').classification(store.project, old).category : category,
    subcategory: old
      ? require('./catalog.cjs').classification(store.project, old).subcategory
      : subcategory,
    frameWidth: old?.frameWidth || 0,
    frameHeight: old?.frameHeight || 0,
    fps: old?.fps || 6,
    hash: digest,
  };
  store.assetFiles.set(path, new Uint8Array(bytes));
  store.change((p) => {
    if (old) p.assets = p.assets.map((a) => (a.id === id ? meta : a));
    else p.assets.push(meta);
  });
  await putBlob(path, bytes);
  return meta;
}
function usage(project, id) {
  const result = [];
  for (const c of project.courses) {
    for (const [type, slots] of Object.entries(c.artBindings || {})) {
      if (slots === id || Object.values(slots || {}).includes(id))
        result.push(c.name + ' / ' + type);
    }
    for (const r of c.rooms) {
      for (const slots of Object.values(r.artBindings || {}))
        if (slots === id || Object.values(slots || {}).includes(id))
          result.push(c.name + ' / ' + r.name + ' / 房间美术');
      for (const o of r.objects)
        if (Object.values(o.assetOverrides || {}).includes(id))
          result.push(c.name + ' / ' + r.name + ' / ' + (o.name || o.id));
    }
  }
  for (const [type, config] of Object.entries(project.blockDefaults || {}))
    if (Object.values(config.assets || {}).includes(id)) result.push('默认定义 / ' + type);
  return result;
}
function database() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const request = indexedDB.open('room-lab-assets-v2', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function putBlob(path, bytes) {
  try {
    const db = await database();
    if (!db) return;
    await new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put(new Uint8Array(bytes), path);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {}
}
async function hydrate(store) {
  try {
    const db = await database();
    if (!db) return;
    for (const a of store.project.assets) {
      const bytes = await new Promise((resolve) => {
        const req = db.transaction('files').objectStore('files').get(a.path);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      if (bytes) store.assetFiles.set(a.path, new Uint8Array(bytes));
    }
    db.close();
  } catch (e) {}
}
async function dimensions(bytes, mime) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([bytes], { type: mime })),
      img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 64, height: 64 });
    };
    img.src = url;
  });
}
module.exports = { hash, importAsset, usage, putBlob, hydrate, dimensions, MIME };
