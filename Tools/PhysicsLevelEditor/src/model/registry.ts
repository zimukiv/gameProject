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

// UI metadata for fields already supported by the Phase 1 Unity adapter.
export const editorFields = {
  'visual.sprite': [
    ['sprite.assetGuid', 'Sprite GUID', 'text'], ['sprite.localFileId', 'Local file ID', 'text'],
    ['sprite.color.r', 'Red', 'number'], ['sprite.color.g', 'Green', 'number'],
    ['sprite.color.b', 'Blue', 'number'], ['sprite.color.a', 'Alpha', 'number'],
    ['sprite.sortingOrder', 'Sorting order', 'integer']
  ],
  'physics.boxCollider2d': [
    ['collider.size.x', 'Size X', 'number'], ['collider.size.y', 'Size Y', 'number'],
    ['collider.offset.x', 'Offset X', 'number'], ['collider.offset.y', 'Offset Y', 'number'],
    ['collider.isTrigger', 'Trigger', 'boolean']
  ],
  'physics.platform': [],
  'physics.airVent': [
    ['airVent.ventDirection.x', 'Direction X', 'number'], ['airVent.ventDirection.y', 'Direction Y', 'number'],
    ['airVent.upwardForce', 'Force', 'number'], ['airVent.isInteractable', 'Interactable', 'boolean'],
    ['airVent.guideText', 'Guide text', 'text'], ['airVent.isContinuous', 'Continuous', 'boolean']
  ],
  'item.token': [['token.scoreAmount', 'Score', 'integer'], ['token.tokenAmount', 'Tokens', 'integer']]
} as const;
