import type {LevelDataV1, Vec3} from './level.ts';
import type {LevelDataV2} from './level-v2.ts';

export type RoomId = 'room1' | 'room2' | 'room3';
export type Ownership = 'A' | 'B' | 'C' | 'D';
export type SourceScene = {path:string; guid:string; sha256:string};
export type RoomManifest = {roomId:RoomId; displayName:string; levelId:string; sourceScene:SourceScene;
  sourceMapPath:string; levelDataPath:string|null; migrationState:'sourceOnly'|'partial'|'full';
  sourceObjectCount:number; sourceComponentCount:number; sourceEventCount:number};
export type ProjectManifestV1 = {manifestVersion:1; projectId:string; levelFormatVersion:3;
  resourceManifestVersion:1; resourceManifestPath:string; rooms:RoomManifest[]};

export type SourceReference =
  | {fieldPath:string;kind:'null'}
  | {fieldPath:string;kind:'object';objectId:string;sourceFileId:string}
  | {fieldPath:string;kind:'component';objectId:string;componentId:string;sourceFileId:string}
  | {fieldPath:string;kind:'sceneSetting';sourceFileId:string}
  | {fieldPath:string;kind:'asset';assetId:string;unityGuid:string;localFileId:string};
export type SourceComponent = {componentId:string;sourceFileId:string;classId:number;unityType:string;
  sourceScriptGuid:string|null;sourceOrder:number;sourceDocumentSha256:string;
  restoration:'levelObject'|'referenceMarker'|'runnerBinding'|'sceneConfigVisual';
  readiness:'pendingAdapter'|'pendingTemplate';references:SourceReference[]};
export type SourceObject = {objectId:string;sourceFileId:string;sourceOrder:number;nameAtSource:string;
  hierarchyAtSource:string;parentObjectId:string|null;ownership:Ownership;
  responsibility:{kind:SourceComponent['restoration'];configPath:string;readiness:SourceComponent['readiness'];templateSlot?:string};
  sourceGameObjectSha256:string;components:SourceComponent[]};
export type SourcePersistentCall = {eventId:string;classification:'runnerUi'|'levelDesign';
  sourceObjectId:string;sourceComponentId:string;sourceComponentFileId:string;fieldPath:string;callIndex:number;
  targetObjectId:string;targetComponentId:string;targetComponentFileId:string;targetUnityType:string;
  methodName:string;mode:string;callState:string;arguments:Record<string,unknown>;
  persistentCall:Record<string,unknown>;reviewFlag:'nameMethodMismatch'|null};
export type SourceInventoryV1 = {inventoryVersion:1;roomId:RoomId;sourceScene:SourceScene;
  migrationState:'sourceOnly';objects:SourceObject[];persistentCalls:SourcePersistentCall[]};

export type ResourceSource = {assetId:string;sourceKind:'projectAsset'|'codeDependency'|'unityBuiltin'|'unityPackage';
  assetType:string;unityGuid:string;localFileId:string;sourcePath:string|null;sourceSha256:string|null;
  packagePath:string|null;readiness:'sourceOnly';usedByRooms:RoomId[]};
export type ResourceManifestV1 = {resourceManifestVersion:1;migrationState:'sourceOnly';resources:ResourceSource[]};

export type ObjectRefV3 = {kind:'object';levelId:string;objectId:string};
export type ComponentRefV3 = {kind:'component';levelId:string;objectId:string;componentId:string;componentTypeId:string};
export type TransformRefV3 = {kind:'transform';levelId:string;objectId:string};
export type AssetRefV3 = {kind:'asset';assetId:string};
export type RuntimeServiceRefV3 = {kind:'runtimeService';serviceId:string};
export type RefV3 = ObjectRefV3|ComponentRefV3|TransformRefV3|AssetRefV3|RuntimeServiceRefV3;
export type Quaternion = {x:number;y:number;z:number;w:number};
export type Vec2 = {x:number;y:number};
export type RectTransformV3 = {anchorMin:Vec2;anchorMax:Vec2;anchoredPosition:Vec2;
  sizeDelta:Vec2;pivot:Vec2;offsetMin?:Vec2;offsetMax?:Vec2};
// Full original Unity YAML is retained because no V3 Unity rebuilder has verified these fields.
export type UnitySourceDocumentV3 = {sourceFileId:string;sourceOrder:number;classId:number;unityType:string;
  sha256:string;rawYaml:string;fields:Record<string,unknown>};
export type ComponentV3 = {componentId:string;sourceFileId:string|null;typeId:string;version:number;enabled:boolean;
  dataStatus:'registered'|'sourceOnly'|'m13aMapped'|'m13bCandidate';data:Record<string,unknown>|null;
  sourceDocumentSha256:string|null;sourceSerialized?:UnitySourceDocumentV3;
  sourceReferences?:SourceReference[]};
export type ObjectV3 = {id:string;sourceFileId:string|null;ownership:Ownership;name:string;parentId:string|null;
  active:boolean;layer:number;tag:string;localPosition:Vec3;localRotation:Quaternion;localScale:Vec3;
  rectTransform:RectTransformV3|null;responsibility:SourceObject['responsibility'];components:ComponentV3[];
  siblingIndex?:number;sourceSerialized?:UnitySourceDocumentV3;sourceReferences?:SourceReference[]};
export type EventDesignV3 = {id:string;sourcePersistentCallId:string|null;trigger:{typeId:string;source:RefV3|null};
  conditions:{typeId:string;target:RefV3|null;expected:boolean|number|string|null}[];
  orderedActions:{id:string;typeId:string;target:RefV3|null;delaySeconds:number|null;
    parameters:Record<string,boolean|number|string|null>}[]};
export type LevelDataV3 = {formatVersion:3;levelId:string;roomId:RoomId;coverage:'partial'|'exportedUnverified'|'full';
  sourceScene:SourceScene;
  sceneConfig:{dataStatus:'sourceOnly';sourceSceneSha256:string;data:null;
    sourceHeader?:string;sourceDocuments?:UnitySourceDocumentV3[];
    sourceReferences?:SourceReference[]};
  objects:ObjectV3[];events:EventDesignV3[];sourceCalls?:SourcePersistentCall[];resourceIds:string[]};

// Version opening never migrates or writes the source document.
export type KnownLevel = LevelDataV1|LevelDataV2|LevelDataV3;
