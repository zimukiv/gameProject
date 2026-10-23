export type Vec2 = { x: number; y: number };
export type Vec3 = Vec2 & { z: number };
export type Color = { r: number; g: number; b: number; a: number };

export type LevelComponent = {
  typeId: string;
  version: number;
  enabled: boolean;
  sprite?: { assetGuid: string; localFileId: string; color: Color; sortingOrder: number };
  collider?: { size: Vec2; offset: Vec2; isTrigger: boolean };
  airVent?: { ventDirection: Vec2; upwardForce: number; isInteractable: boolean; guideText: string; isContinuous: boolean };
  token?: { scoreAmount: number; tokenAmount: number };
};

export type LevelObject = {
  id: string;
  name: string;
  kind: 'platform' | 'airVent' | 'token';
  parentId: string | null;
  active: boolean;
  layer: number;
  localPosition: Vec3;
  localRotationZ: number;
  localScale: Vec3;
  components: LevelComponent[];
};

export type LevelDataV1 = {
  formatVersion: 1;
  levelId: string;
  coverage: 'partial';
  sourceSceneGuid: string;
  objects: LevelObject[];
};

export type LevelIdSidecar = {
  sourceSceneGuid: string;
  entries: { globalObjectId: string; objectId: string }[];
};
