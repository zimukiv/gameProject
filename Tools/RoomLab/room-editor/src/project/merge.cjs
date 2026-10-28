'use strict';
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b),
  copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
function merge(base, local, remote, path = '$', conflicts = []) {
  if (equal(local, remote) || equal(remote, base)) return { value: copy(local), conflicts };
  if (equal(local, base)) return { value: copy(remote), conflicts };
  if (
    local &&
    remote &&
    base &&
    typeof local === 'object' &&
    typeof remote === 'object' &&
    typeof base === 'object'
  ) {
    if (Array.isArray(local) && Array.isArray(remote) && Array.isArray(base)) {
      const all = [...base, ...local, ...remote];
      const key = all.every((v) => v && typeof v === 'object' && typeof v.id === 'string')
        ? (v) => 'id:' + v.id
        : all.every(
              (v) =>
                v &&
                Number.isFinite(v.x) &&
                Number.isFinite(v.y) &&
                Object.keys(v).every((k) => ['x', 'y', 'collision'].includes(k)),
            )
          ? (v) => v.x + ',' + v.y
          : null;
      if (key) {
        const bm = new Map(base.map((v) => [key(v), v])),
          lm = new Map(local.map((v) => [key(v), v])),
          rm = new Map(remote.map((v) => [key(v), v]));
        const old = base.map(key),
          lo = local.map(key),
          ro = remote.map(key),
          defaultOrder = equal(ro, old)
            ? [...lo, ...ro.filter((k) => !lm.has(k))]
            : [...ro, ...lo.filter((k) => !rm.has(k))];
        let order = defaultOrder;
        if (path.endsWith('.rooms')) {
          const common = new Set(old.filter((k) => lm.has(k) && rm.has(k))),
            original = old.filter((k) => common.has(k)),
            left = lo.filter((k) => common.has(k)),
            right = ro.filter((k) => common.has(k));
          if (equal(right, original)) order = [...lo, ...ro.filter((k) => !lm.has(k))];
          else if (!equal(left, original) && !equal(left, right)) {
            conflicts.push(path + '.@order');
            order = [...lo, ...ro.filter((k) => !lm.has(k))];
          }
        }
        const value = [];
        for (const k of new Set(order)) {
          const r = merge(bm.get(k), lm.get(k), rm.get(k), path + '[' + k + ']', conflicts);
          if (r.value !== undefined) value.push(r.value);
        }
        return { value, conflicts };
      }
    } else if (!Array.isArray(local) && !Array.isArray(remote) && !Array.isArray(base)) {
      const value = {};
      for (const key of new Set([
        ...Object.keys(base),
        ...Object.keys(local),
        ...Object.keys(remote),
      ])) {
        const r = merge(base[key], local[key], remote[key], path + '.' + key, conflicts);
        if (r.value !== undefined) value[key] = r.value;
      }
      return { value, conflicts };
    }
  }
  conflicts.push(path);
  return { value: copy(local), conflicts };
}
module.exports = { merge };
