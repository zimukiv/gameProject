export const registry = {
  'visual.sprite': { version: 1, unity: 'SpriteRenderer', requires: [], reference: 'Unity Sprite GUID + local file ID' },
  'physics.boxCollider2d': { version: 1, unity: 'BoxCollider2D', requires: [], reference: null },
  'physics.platform': { version: 1, unity: 'BaseBlock', requires: ['physics.boxCollider2d'], reference: null },
  'physics.airVent': { version: 1, unity: 'AirVentBlock', requires: ['physics.boxCollider2d'], reference: null },
  'item.token': { version: 1, unity: 'TokenItem', requires: ['physics.boxCollider2d'], reference: null },
} as const;

export const kindComponent = {
  platform: 'physics.platform',
  airVent: 'physics.airVent',
  token: 'item.token',
} as const;
