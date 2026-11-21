'use strict';
// Room organisation metadata (favourites + user-named groups). This is an
// additive, optional project field:
//
//   project.roomOrganization = {
//     version: 1,
//     favorites: [roomId, ...],
//     groups: [{ id, name, roomIds: [roomId, ...] }],
//   }
//
// Organisation is independent of course ownership: a group may contain rooms of
// different courses. Unknown root fields of a project are preserved because
// nothing here rewrites the project object. Every function is pure: it returns a
// new organisation value and never mutates its input, so it can be used directly
// from store.change()/undo snapshots. Stale or duplicate room IDs are dropped
// instead of raising, and deleting a group never deletes rooms.
const VERSION = 1;
const MAX_GROUPS = 200;
const MAX_FAVORITES = 512;
const MAX_NAME = 60;
const MAX_ROOM_IDS = 512;
function validId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 100;
}
function uniqueIds(values, allowed) {
  const list = [];
  for (const value of Array.isArray(values) ? values : [])
    if (validId(value) && (!allowed || allowed.has(value)) && !list.includes(value))
      list.push(value);
  return list;
}
// Structural normalisation without any knowledge of the project: drops invalid
// shapes and duplicate IDs, keeps the stored order.
function shape(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const org = {
    version: VERSION,
    favorites: uniqueIds(source.favorites).slice(0, MAX_FAVORITES),
    groups: [],
  };
  const used = new Set();
  for (const group of Array.isArray(source.groups) ? source.groups : []) {
    if (!group || typeof group !== 'object' || !validId(group.id) || used.has(group.id)) continue;
    const name = typeof group.name === 'string' ? group.name.trim().slice(0, MAX_NAME) : '';
    if (!name) continue;
    used.add(group.id);
    org.groups.push({
      id: group.id,
      name,
      roomIds: uniqueIds(group.roomIds).slice(0, MAX_ROOM_IDS),
      // Optional user-configurable accent. Legacy groups have no colour and get
      // a deterministic palette entry, so old projects keep working.
      ...(typeof group.color === 'string' && /^#[0-9a-f]{6}$/i.test(group.color)
        ? { color: group.color.toLowerCase() }
        : {}),
    });
    if (org.groups.length >= MAX_GROUPS) break;
  }
  return org;
}
function roomIdList(project) {
  const ids = [];
  for (const course of project?.courses || [])
    for (const room of course.rooms || []) if (validId(room.id)) ids.push(room.id);
  return ids;
}
// Sanitize an arbitrary stored value against the room IDs that still exist.
function sanitize(value, roomIds) {
  const allowed = roomIds instanceof Set ? roomIds : new Set(roomIds || []),
    org = shape(value);
  org.favorites = org.favorites.filter((id) => allowed.has(id));
  for (const group of org.groups) group.roomIds = group.roomIds.filter((id) => allowed.has(id));
  return org;
}
function empty() {
  return { version: VERSION, favorites: [], groups: [] };
}
function nextGroupId(groups) {
  const used = new Set((groups || []).map((group) => group.id));
  let index = 1;
  while (used.has('group-' + index)) index++;
  return 'group-' + index;
}
// Effective organisation of a project: sanitized against the current rooms.
// Read-only callers never create the field on the project, so the project does
// not become dirty just by rendering.
function ensure(project) {
  return sanitize(
    project?.roomOrganization === undefined ? empty() : project.roomOrganization,
    roomIdList(project),
  );
}
function favorites(org) {
  return shape(org).favorites;
}
function isFavorite(org, roomId) {
  return !!roomId && shape(org).favorites.includes(roomId);
}
function setFavorite(org, roomId, value) {
  const next = shape(org);
  if (!validId(roomId)) return next;
  const has = next.favorites.includes(roomId);
  if (value && !has) next.favorites.push(roomId);
  if (!value && has) next.favorites = next.favorites.filter((id) => id !== roomId);
  return next;
}
function toggleFavorite(org, roomId) {
  return setFavorite(org, roomId, !isFavorite(org, roomId));
}
function groupOf(org, groupId) {
  return shape(org).groups.find((group) => group.id === groupId) || null;
}
function groupsContaining(org, roomId) {
  return shape(org).groups.filter((group) => group.roomIds.includes(roomId));
}
// Accent colours for the new room-first UI come from user groups (configurable)
// rather than the legacy course themes. Legacy groups without a colour get a
// deterministic palette entry.
const COLORS = ['#70d9dd', '#e7b867', '#c78bd9', '#8fd77f', '#e48b8b', '#7fb2e4'];
function groupColor(group, index = 0) {
  return typeof group?.color === 'string' && /^#[0-9a-f]{6}$/i.test(group.color)
    ? group.color
    : COLORS[Math.max(0, index) % COLORS.length];
}
function groupIndex(org, groupId) {
  return shape(org).groups.findIndex((group) => group.id === groupId);
}
function colorFor(org, roomId) {
  const groups = shape(org).groups,
    index = groups.findIndex((group) => group.roomIds.includes(roomId));
  return index < 0 ? null : groupColor(groups[index], index);
}
function setGroupColor(org, groupId, color) {
  const next = shape(org),
    group = next.groups.find((candidate) => candidate.id === groupId);
  if (group && typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))
    group.color = color.toLowerCase();
  return next;
}
function createGroup(org, name, roomIds = []) {
  const next = shape(org),
    clean = String(name || '')
      .trim()
      .slice(0, MAX_NAME);
  if (!clean || next.groups.length >= MAX_GROUPS) return next;
  next.groups.push({ id: nextGroupId(next.groups), name: clean, roomIds: uniqueIds(roomIds) });
  return next;
}
function renameGroup(org, groupId, name) {
  const next = shape(org),
    clean = String(name || '')
      .trim()
      .slice(0, MAX_NAME),
    group = next.groups.find((candidate) => candidate.id === groupId);
  if (group && clean) group.name = clean;
  return next;
}
function deleteGroup(org, groupId) {
  const next = shape(org);
  next.groups = next.groups.filter((group) => group.id !== groupId);
  return next;
}
function assign(org, groupId, roomIds) {
  const next = shape(org),
    group = next.groups.find((candidate) => candidate.id === groupId);
  if (!group) return next;
  for (const id of uniqueIds(roomIds)) if (!group.roomIds.includes(id)) group.roomIds.push(id);
  return next;
}
function unassign(org, groupId, roomIds) {
  const next = shape(org),
    group = next.groups.find((candidate) => candidate.id === groupId),
    drop = new Set(uniqueIds(roomIds));
  if (group) group.roomIds = group.roomIds.filter((id) => !drop.has(id));
  return next;
}
function toggleRoom(org, groupId, roomId) {
  if (!groupOf(org, groupId)) return shape(org);
  return groupOf(org, groupId).roomIds.includes(roomId)
    ? unassign(org, groupId, [roomId])
    : assign(org, groupId, [roomId]);
}
// Keeps a room out of every group after it is deleted; rooms themselves are
// never touched by this module.
function forgetRoom(org, roomId) {
  const next = shape(org);
  next.favorites = next.favorites.filter((id) => id !== roomId);
  for (const group of next.groups) group.roomIds = group.roomIds.filter((id) => id !== roomId);
  return next;
}
// Moves a room inside one user group without touching project order. The group
// keeps its own ordered roomIds, so two groups (or a group and the project room
// arrays) can show completely different orders. Pure and undo-friendly; invalid
// targets/rooms leave the value unchanged instead of raising.
function moveWithinGroup(org, groupId, roomId, targetId, after = false) {
  const next = shape(org),
    group = next.groups.find((candidate) => candidate.id === groupId);
  if (!group || roomId === targetId) return next;
  const from = group.roomIds.indexOf(roomId),
    target = group.roomIds.indexOf(targetId);
  if (from < 0 || target < 0) return next;
  group.roomIds.splice(from, 1);
  const at = group.roomIds.indexOf(targetId) + (after ? 1 : 0);
  group.roomIds.splice(at, 0, roomId);
  return next;
}
// `all` -> project order (favourites are never reordered); `favorites` keeps
// project order; `group:<id>` follows the group's own roomIds order, which is
// independent of (and can differ from) project order.
function filterRoomIds(project, filter = 'all') {
  const all = roomIdList(project),
    existing = new Set(all),
    org = ensure(project);
  if (filter === 'favorites') return all.filter((id) => org.favorites.includes(id));
  if (typeof filter === 'string' && filter.startsWith('group:')) {
    const group = groupOf(org, filter.slice(6));
    return group ? group.roomIds.filter((id) => existing.has(id)) : [];
  }
  return all;
}
function summary(org) {
  return {
    favorites: favorites(org).length,
    groups: shape(org).groups.length,
    rooms: new Set(shape(org).groups.flatMap((group) => group.roomIds)).size,
  };
}
module.exports = {
  VERSION,
  empty,
  shape,
  sanitize,
  ensure,
  roomIdList,
  favorites,
  isFavorite,
  setFavorite,
  toggleFavorite,
  groupOf,
  groupsContaining,
  createGroup,
  renameGroup,
  deleteGroup,
  assign,
  unassign,
  toggleRoom,
  forgetRoom,
  moveWithinGroup,
  filterRoomIds,
  summary,
  nextGroupId,
  COLORS,
  groupColor,
  groupIndex,
  colorFor,
  setGroupColor,
};
