import {registryV2} from './registry-v2.ts';

// These are co-located *Unity component instances* found in the three source scenes.
// Inheritance alone does not add a second serialized BaseBlock component.
export const observedBaseBlockPartners=new Set([
  'mechanism.ice','mechanism.vanishing','mechanism.thermalController','mechanism.railgun',
  'mechanism.moving','mechanism.integralDerivative','mechanism.attendance',
  'mechanism.door','mechanism.awake'
]);

export const sourceOnlyUnityTypes=new Set([
  'Transform','RectTransform','Canvas','CanvasRenderer','CanvasScaler','GraphicRaycaster',
  'Text','Image','Button','Slider','EventSystem','StandaloneInputModule','Camera',
  'CameraFollow','AudioListener','Light','SceneBootstrap','MenuActions','UIManager',
  'UIFontBootstrap','PlayerController','PlayerHealthRespawn','BulletinBoard',
  'MovingBlock','IntegralDerivativeBlock','RotatingHazardBlock','AttendanceBlock',
  'AwakeBlock','DoorMechanism','DistanceTriggerMechanism','PatrolTeacherAI'
]);

export function registeredV3Type(typeId:string):boolean {
  return Object.hasOwn(registryV2,typeId);
}
