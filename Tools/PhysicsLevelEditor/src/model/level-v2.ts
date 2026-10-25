import type { Color, LevelDataV1, Vec2, Vec3 } from './level.ts';
import { validateLevel } from './validate.ts';

export type SceneObjectRef = { kind: 'sceneObject'; objectId: string };
export type SceneComponentRef = { kind: 'sceneComponent'; objectId: string; componentTypeId: string; instanceId: string | null };
export type TransformRef = { kind: 'transform'; objectId: string };
export type AssetRef = { kind: 'asset'; assetGuid: string; localFileId: string };
export type V2Component = {
  typeId: string;
  version: number;
  enabled: boolean;
  sprite?: { assetGuid: string; localFileId: string; color: Color; sortingOrder: number };
  collider?: { size: Vec2; offset: Vec2; isTrigger: boolean };
  rigidbody?: { bodyType: 'Dynamic' | 'Kinematic' | 'Static'; gravityScale: number; freezeRotation: boolean };
  airVent?: { ventDirection: Vec2; upwardForce: number; isInteractable: boolean; guideText: string; isContinuous: boolean };
  token?: { scoreAmount: number; tokenAmount: number };
  vanishing?: { mode: 'PeriodicBlink' | 'TriggerOnStep'; visibleDuration: number; invisibleDuration: number;
    stepVanishDelay: number; respawnDelay: number; visibleColor: Color; vanishColor: Color;
    showGuide: boolean; warningDuration: number; optionalCollectible: SceneComponentRef | null };
  ice?: { isMelted: boolean; solidColor: Color; meltedColor: Color };
  thermal?: { currentState: 'Cold' | 'Hot'; linkedController: SceneComponentRef | null;
    controlledIce: SceneComponentRef[]; terminalName: string; interactionRadius: number; controlRadius: number;
    roomFilterOverlay: SceneComponentRef | null; coldFilterColor: Color; hotFilterColor: Color };
  railgun?: { launchEndPoint: TransformRef | null; acceleration: number; launchExitSpeed: number; launchDirection: Vec2 };
  bigToken?: { scoreAmount: number; tokenAmount: number; collectVfxAsset: AssetRef | null; collectSfxAsset: AssetRef | null };
  collectible?: { scoreAmount: number; collectibleName: string; requiresAINearby: boolean; requiredAIDistance: number;
    collectVfxAsset: AssetRef | null; collectSfxAsset: AssetRef | null };
  checkpoint?: { respawnPoint: TransformRef | null; isActivated: boolean; useFlagVisual: boolean;
    flagRenderer: SceneComponentRef | null; activeColor: Color; inactiveColor: Color };
  goal?: { nextLevelIndex: number; autoLoadNextLevel: boolean; requiresAIActivation: boolean;
    delayBeforeNextLevel: number; goalRenderer: SceneComponentRef | null; completedColor: Color };
  activator?: { isActivated: boolean; interactKey: string; autoActivateOnContact: boolean;
    showInteractionGuide: boolean; baseDifficulty: number; difficultyPerToken: number;
    activeVfx: SceneObjectRef | null; activationAudio: SceneComponentRef | null;
    deviceRenderer: SceneComponentRef | null; activeColor: Color };
  enemy?: { isHunting: boolean; baseChaseSpeed: number; currentSpeed: number; difficultyMultiplier: number;
    skillType: 'BurstDash' | 'CalculusDrift' | 'DeadlinePressure'; skillTriggerDistance: number;
    skillCooldown: number; burstSpeed: number; burstDuration: number;
    teleportNodes: TransformRef[]; maxAllowedPlayerLagDistance: number };
  triggerButton?: { isOneShot: boolean; isPressed: boolean; buttonRenderer: SceneComponentRef | null;
    unpressedColor: Color; pressedColor: Color; pressOffset: Vec3 };
};

export type EventTrigger = 'playerEnter' | 'playerExit' | 'interact' | 'buttonPressed';
export type EventCondition = { type: 'always' | 'once' | 'objectActive' | 'mechanismState';
  target: SceneObjectRef | SceneComponentRef | null; expectedBool: boolean; expectedState: string };
export type EventAction = { id: string; type: 'setObjectActive' | 'setComponentEnabled' | 'setMechanismState' | 'setParameter' | 'delay';
  target: SceneObjectRef | SceneComponentRef | null; componentTypeId: string; parameterPath: string; boolValue: boolean;
  numberValue: number; stateValue: string; delaySeconds: number };
export type EventRule = { id: string; enabled: boolean; trigger: EventTrigger; condition: EventCondition;
  repeat: 'ignoreWhileRunning' | 'restart'; actions: EventAction[] };
export type LevelObjectV2 = { id: string; name: string; parentId: string | null; active: boolean; layer: number;
  localPosition: Vec3; localRotationZ: number; localScale: Vec3; components: V2Component[]; rules: EventRule[] };
export type LevelDataV2 = { formatVersion: 2; levelId: string; coverage: 'partial' | 'full';
  sourceSceneGuid: string; objects: LevelObjectV2[] };

// Explicit migration retains Phase 1 IDs and fields. It never mutates the source document.
export function migrateV1ToV2(source: LevelDataV1): LevelDataV2 {
  validateLevel(source);
  return { formatVersion: 2, levelId: source.levelId, coverage: source.coverage,
    sourceSceneGuid: source.sourceSceneGuid,
    objects: source.objects.map(o => ({ id:o.id,name:o.name,parentId:o.parentId,active:o.active,layer:o.layer,
      localPosition:structuredClone(o.localPosition),localRotationZ:o.localRotationZ,
      localScale:structuredClone(o.localScale),components:structuredClone(o.components),rules:[] })) };
}
