export type FieldSpec = { path:string; type:'number'|'integer'|'boolean'|'text'|'enum'|'vec2'|'vec3'|'color'|'sceneObjectRef'|'sceneComponentRef'|'transformRef'|'assetRef'|'refArray';
  defaultValue:unknown; minimum?:number; maximum?:number; choices?:string[]; targetType?:string; requiredSelection?:boolean };
type BaseSpec = { version: 1; unity: string; requires: string[]; collider?: 'solid'|'trigger';
  status: 'v1AdapterOnly'|'modelOnly'|'v2AdapterReady'; payload?: string; exclusiveGroup?: 'behaviour';
  objectRefs?: { path: string; target: string; nullable?: boolean }[] };
export type ComponentSpec = BaseSpec & { typeId:string; fields:FieldSpec[]; allowMultiple:boolean;
  combination:'base'|'primary'|'marker'; runtimeState:'none'|'local'|'manager';
  checkpoint:'none'|'ICheckpointState'|'SaveManagerPickup'|'GameManager';
  assetRefs:{path:string;assetType:'Sprite'|'AudioClip'|'GameObject'}[] };

// modelOnly entries are defined for V2 documents but must be rejected by Unity import until an adapter is verified.
const baseRegistryV2: Record<string, BaseSpec> = {
  'core.marker': { version:1, unity:'Transform', requires:[], status:'modelOnly' },
  'visual.sprite': { version:1, unity:'SpriteRenderer', requires:[], status:'v1AdapterOnly', payload:'sprite' },
  'physics.boxCollider2d': { version:1, unity:'BoxCollider2D', requires:[], status:'v1AdapterOnly', payload:'collider' },
  'physics.rigidbody2d': { version:1, unity:'Rigidbody2D', requires:[], status:'modelOnly', payload:'rigidbody' },
  'physics.platform': { version:1, unity:'BaseBlock', requires:['physics.boxCollider2d'], collider:'solid', status:'v1AdapterOnly', exclusiveGroup:'behaviour' },
  'physics.airVent': { version:1, unity:'AirVentBlock', requires:['physics.boxCollider2d'], collider:'trigger', status:'v1AdapterOnly', payload:'airVent', exclusiveGroup:'behaviour' },
  'item.token': { version:1, unity:'TokenItem', requires:['physics.boxCollider2d'], collider:'trigger', status:'v1AdapterOnly', payload:'token', exclusiveGroup:'behaviour' },
  'mechanism.vanishing': { version:1, unity:'VanishingBlock', requires:['physics.boxCollider2d'], collider:'solid', status:'modelOnly', payload:'vanishing', exclusiveGroup:'behaviour', objectRefs:[{path:'vanishing.optionalCollectible',target:'item.collectible',nullable:true}] },
  'mechanism.ice': { version:1, unity:'IceBlock', requires:['physics.boxCollider2d'], collider:'solid', status:'modelOnly', payload:'ice', exclusiveGroup:'behaviour' },
  'mechanism.thermalController': { version:1, unity:'ThermalControllerBlock', requires:['physics.boxCollider2d'], status:'modelOnly', payload:'thermal', exclusiveGroup:'behaviour', objectRefs:[
    {path:'thermal.linkedController',target:'mechanism.thermalController',nullable:true},
    {path:'thermal.controlledIce',target:'mechanism.ice'},
    {path:'thermal.roomFilterOverlay',target:'visual.sprite',nullable:true}] },
  'mechanism.railgun': { version:1, unity:'RailgunBlock', requires:['physics.boxCollider2d'], collider:'trigger', status:'modelOnly', payload:'railgun', exclusiveGroup:'behaviour', objectRefs:[{path:'railgun.launchEndPoint',target:'transform',nullable:true}] },
  'item.bigToken': { version:1, unity:'BigTokenItem', requires:['physics.boxCollider2d'], collider:'trigger', status:'modelOnly', payload:'bigToken', exclusiveGroup:'behaviour' },
  'item.collectible': { version:1, unity:'CollectibleItem', requires:['physics.boxCollider2d'], collider:'trigger', status:'modelOnly', payload:'collectible', exclusiveGroup:'behaviour' },
  'progress.checkpoint': { version:1, unity:'Checkpoint', requires:['physics.boxCollider2d'], collider:'trigger', status:'modelOnly', payload:'checkpoint', exclusiveGroup:'behaviour', objectRefs:[
    {path:'checkpoint.respawnPoint',target:'transform',nullable:true}, {path:'checkpoint.flagRenderer',target:'visual.sprite',nullable:true}] },
  'progress.goal': { version:1, unity:'LevelGoal', requires:['physics.boxCollider2d'], collider:'trigger', status:'modelOnly', payload:'goal', exclusiveGroup:'behaviour', objectRefs:[{path:'goal.goalRenderer',target:'visual.sprite',nullable:true}] },
  'progress.aiActivator': { version:1, unity:'AIActivatorDevice', requires:['physics.boxCollider2d'], collider:'trigger', status:'modelOnly', payload:'activator', exclusiveGroup:'behaviour', objectRefs:[
    {path:'activator.activeVfx',target:'sceneObject',nullable:true}, {path:'activator.activationAudio',target:'audio.source',nullable:true},
    {path:'activator.deviceRenderer',target:'visual.sprite',nullable:true}] },
  'actor.enemy': { version:1, unity:'EnemyAI', requires:['physics.boxCollider2d','physics.rigidbody2d'], status:'modelOnly', payload:'enemy', exclusiveGroup:'behaviour', objectRefs:[{path:'enemy.teleportNodes',target:'transform'}] },
  'logic.triggerButton': { version:1, unity:'TriggerButton', requires:['physics.boxCollider2d'], collider:'trigger', status:'modelOnly', payload:'triggerButton', exclusiveGroup:'behaviour', objectRefs:[{path:'triggerButton.buttonRenderer',target:'visual.sprite',nullable:true}] }
};

const f=(path:string,type:FieldSpec['type'],defaultValue:unknown,minimum?:number,targetType?:string):FieldSpec=>
  ({path,type,defaultValue,...(minimum===undefined?{}:{minimum}),...(targetType?{targetType}:{})});
const fields:Record<string,FieldSpec[]>={
  'core.marker':[],
  'visual.sprite':[f('sprite.assetGuid','text',''),f('sprite.localFileId','text',''),f('sprite.color','color',{r:1,g:1,b:1,a:1}),f('sprite.sortingOrder','integer',0)],
  'physics.boxCollider2d':[f('collider.size','vec2',{x:1,y:1},0.0001),f('collider.offset','vec2',{x:0,y:0}),f('collider.isTrigger','boolean',false)],
  'physics.rigidbody2d':[f('rigidbody.bodyType','enum','Dynamic'),f('rigidbody.gravityScale','number',1),f('rigidbody.freezeRotation','boolean',false)],
  'physics.platform':[],
  'physics.airVent':[f('airVent.ventDirection','vec2',{x:0,y:1}),f('airVent.upwardForce','number',22,0.0001),f('airVent.isInteractable','boolean',true),f('airVent.guideText','text',''),f('airVent.isContinuous','boolean',false)],
  'item.token':[f('token.scoreAmount','integer',100,0),f('token.tokenAmount','integer',1,0)],
  'mechanism.vanishing':[f('vanishing.mode','enum','PeriodicBlink'),f('vanishing.visibleDuration','number',2,0.0001),f('vanishing.invisibleDuration','number',2,0.0001),f('vanishing.stepVanishDelay','number',0.8,0.0001),f('vanishing.respawnDelay','number',3,0.0001),f('vanishing.visibleColor','color',{r:1,g:1,b:1,a:1}),f('vanishing.vanishColor','color',{r:1,g:1,b:1,a:0.1}),f('vanishing.showGuide','boolean',false),f('vanishing.warningDuration','number',0.6,0),f('vanishing.optionalCollectible','sceneComponentRef',null,undefined,'item.collectible')],
  'mechanism.ice':[f('ice.isMelted','boolean',false),f('ice.solidColor','color',{r:0.45,g:0.85,b:1,a:1}),f('ice.meltedColor','color',{r:0.45,g:0.85,b:1,a:0})],
  'mechanism.thermalController':[f('thermal.currentState','enum','Hot'),f('thermal.linkedController','sceneComponentRef',null,undefined,'mechanism.thermalController'),f('thermal.controlledIce','refArray',[],undefined,'mechanism.ice'),f('thermal.terminalName','text','A'),f('thermal.interactionRadius','number',1.8,0.0001),f('thermal.controlRadius','number',20,0.0001),f('thermal.roomFilterOverlay','sceneComponentRef',null,undefined,'visual.sprite'),f('thermal.coldFilterColor','color',{r:0.2,g:0.5,b:1,a:0.12}),f('thermal.hotFilterColor','color',{r:1,g:0.45,b:0.1,a:0.12})],
  'mechanism.railgun':[f('railgun.launchEndPoint','transformRef',null),f('railgun.acceleration','number',30,0.0001),f('railgun.launchExitSpeed','number',32,0),f('railgun.launchDirection','vec2',{x:1,y:0})],
  'item.bigToken':[f('bigToken.scoreAmount','integer',1000,0),f('bigToken.tokenAmount','integer',5,0),f('bigToken.collectVfxAsset','assetRef',null,undefined,'GameObject'),f('bigToken.collectSfxAsset','assetRef',null,undefined,'AudioClip')],
  'item.collectible':[f('collectible.scoreAmount','integer',10000,0),f('collectible.collectibleName','text',''),f('collectible.requiresAINearby','boolean',false),f('collectible.requiredAIDistance','number',5,0.0001),f('collectible.collectVfxAsset','assetRef',null,undefined,'GameObject'),f('collectible.collectSfxAsset','assetRef',null,undefined,'AudioClip')],
  'progress.checkpoint':[f('checkpoint.respawnPoint','transformRef',null),f('checkpoint.isActivated','boolean',false),f('checkpoint.useFlagVisual','boolean',false),f('checkpoint.flagRenderer','sceneComponentRef',null,undefined,'visual.sprite'),f('checkpoint.activeColor','color',{r:0,g:1,b:0,a:1}),f('checkpoint.inactiveColor','color',{r:0.5,g:0.5,b:0.5,a:1})],
  'progress.goal':[f('goal.nextLevelIndex','integer',2,1),f('goal.autoLoadNextLevel','boolean',false),f('goal.requiresAIActivation','boolean',true),f('goal.delayBeforeNextLevel','number',2,0),f('goal.goalRenderer','sceneComponentRef',null,undefined,'visual.sprite'),f('goal.completedColor','color',{r:0,g:1,b:0,a:1})],
  'progress.aiActivator':[f('activator.isActivated','boolean',false),f('activator.interactKey','enum','E'),f('activator.autoActivateOnContact','boolean',false),f('activator.showInteractionGuide','boolean',false),f('activator.baseDifficulty','number',1,0),f('activator.difficultyPerToken','number',0.1,0),f('activator.activeVfx','sceneObjectRef',null),f('activator.activationAudio','sceneComponentRef',null,undefined,'audio.source'),f('activator.deviceRenderer','sceneComponentRef',null,undefined,'visual.sprite'),f('activator.activeColor','color',{r:0,g:1,b:1,a:1})],
  'actor.enemy':[f('enemy.isHunting','boolean',false),f('enemy.baseChaseSpeed','number',5.5,0),f('enemy.currentSpeed','number',5.5,0),f('enemy.difficultyMultiplier','number',1,0),f('enemy.skillType','enum','BurstDash'),f('enemy.skillTriggerDistance','number',5,0),f('enemy.skillCooldown','number',6,0),f('enemy.burstSpeed','number',16,0),f('enemy.burstDuration','number',0.35,0),f('enemy.teleportNodes','refArray',[],undefined,'transform'),f('enemy.maxAllowedPlayerLagDistance','number',30,0.0001)],
  'logic.triggerButton':[f('triggerButton.isOneShot','boolean',true),f('triggerButton.isPressed','boolean',false),f('triggerButton.buttonRenderer','sceneComponentRef',null,undefined,'visual.sprite'),f('triggerButton.unpressedColor','color',{r:1,g:0,b:0,a:1}),f('triggerButton.pressedColor','color',{r:0,g:1,b:0,a:1}),f('triggerButton.pressOffset','vec3',{x:0,y:-0.1,z:0})]
};
const enumChoices:Record<string,string[]>={
  'vanishing.mode':['PeriodicBlink','TriggerOnStep'],
  'thermal.currentState':['Cold','Hot'],
  'rigidbody.bodyType':['Dynamic','Kinematic','Static'],
  'enemy.skillType':['BurstDash','CalculusDrift','DeadlinePressure'],
  'activator.interactKey':['E']
};
for(const list of Object.values(fields)) for(const field of list) {
  if(enumChoices[field.path]) field.choices=enumChoices[field.path];
  if(field.path==='sprite.assetGuid' || field.path==='sprite.localFileId') {
    field.defaultValue=null;
    field.requiredSelection=true;
  }
}
const checkpoint:Record<string,ComponentSpec['checkpoint']>={
  'mechanism.vanishing':'ICheckpointState','mechanism.ice':'ICheckpointState',
  'mechanism.thermalController':'ICheckpointState','progress.checkpoint':'ICheckpointState',
  'progress.aiActivator':'ICheckpointState','logic.triggerButton':'ICheckpointState',
  'item.token':'SaveManagerPickup','item.bigToken':'SaveManagerPickup','item.collectible':'SaveManagerPickup',
  'actor.enemy':'GameManager'
};
const liveWithoutCheckpoint=new Set(['physics.airVent','mechanism.railgun','progress.goal']);
export const registryV2:Record<string,ComponentSpec>=Object.fromEntries(Object.entries(baseRegistryV2).map(([typeId,spec])=>[
  typeId,{...spec,typeId,fields:fields[typeId],allowMultiple:false,
    combination:typeId==='core.marker'?'marker':spec.exclusiveGroup==='behaviour'?'primary':'base',
    runtimeState:typeId==='actor.enemy'?'manager':checkpoint[typeId]||liveWithoutCheckpoint.has(typeId)?'local':'none',
    checkpoint:checkpoint[typeId]??'none',
    assetRefs:typeId==='visual.sprite'?[{path:'sprite',assetType:'Sprite'}]:
      typeId==='item.bigToken'?[{path:'bigToken.collectVfxAsset',assetType:'GameObject'},{path:'bigToken.collectSfxAsset',assetType:'AudioClip'}]:
      typeId==='item.collectible'?[{path:'collectible.collectVfxAsset',assetType:'GameObject'},{path:'collectible.collectSfxAsset',assetType:'AudioClip'}]:[]}
]));
