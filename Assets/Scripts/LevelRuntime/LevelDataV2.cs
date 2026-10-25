using System;
using UnityEngine;

// Data transfer classes only. JsonUtility ignores unknown fields, so Phase 4 Unity import MUST
// run a strict JSON preflight before calling JsonUtility.FromJson<LevelDataV2>().
[Serializable]
public sealed class LevelDataV2
{
    public int formatVersion = 2;
    public string levelId;
    public string coverage;
    public string sourceSceneGuid;
    public LevelObjectV2[] objects = Array.Empty<LevelObjectV2>();
}

[Serializable]
public sealed class LevelObjectV2
{
    public string id;
    public string name;
    public string parentId;
    public bool active;
    public int layer;
    public Vector3 localPosition;
    public float localRotationZ;
    public Vector3 localScale;
    public LevelComponentV2[] components = Array.Empty<LevelComponentV2>();
    public EventRuleV2[] rules = Array.Empty<EventRuleV2>();
}

[Serializable]
public sealed class SceneObjectRefV2 { public string kind; public string objectId; }
[Serializable]
public sealed class TransformRefV2 { public string kind; public string objectId; }
[Serializable]
public sealed class SceneComponentRefV2
{
    public string kind;
    public string objectId;
    public string componentTypeId;
    public string instanceId;
}
[Serializable]
public sealed class AssetRefV2 { public string kind; public string assetGuid; public string localFileId; }

[Serializable]
public sealed class LevelComponentV2
{
    public string typeId;
    public int version;
    public bool enabled;
    public SpriteFields sprite;
    public ColliderFields collider;
    public RigidbodyFieldsV2 rigidbody;
    public AirVentFields airVent;
    public TokenFields token;
    public VanishingFieldsV2 vanishing;
    public IceFieldsV2 ice;
    public ThermalFieldsV2 thermal;
    public RailgunFieldsV2 railgun;
    public BigTokenFieldsV2 bigToken;
    public CollectibleFieldsV2 collectible;
    public CheckpointFieldsV2 checkpoint;
    public GoalFieldsV2 goal;
    public ActivatorFieldsV2 activator;
    public EnemyFieldsV2 enemy;
    public TriggerButtonFieldsV2 triggerButton;
}

[Serializable]
public sealed class RigidbodyFieldsV2
{
    public string bodyType;
    public float gravityScale;
    public bool freezeRotation;
}

[Serializable]
public sealed class VanishingFieldsV2
{
    public string mode;
    public float visibleDuration, invisibleDuration, stepVanishDelay, respawnDelay;
    public Color visibleColor, vanishColor;
    public bool showGuide;
    public float warningDuration;
    public SceneComponentRefV2 optionalCollectible;
}
[Serializable]
public sealed class IceFieldsV2 { public bool isMelted; public Color solidColor, meltedColor; }
[Serializable]
public sealed class ThermalFieldsV2
{
    public string currentState;
    public SceneComponentRefV2 linkedController;
    public SceneComponentRefV2[] controlledIce = Array.Empty<SceneComponentRefV2>();
    public string terminalName;
    public float interactionRadius, controlRadius;
    public SceneComponentRefV2 roomFilterOverlay;
    public Color coldFilterColor, hotFilterColor;
}
[Serializable]
public sealed class RailgunFieldsV2
{
    public TransformRefV2 launchEndPoint;
    public float acceleration, launchExitSpeed;
    public Vector2 launchDirection;
}
[Serializable]
public sealed class BigTokenFieldsV2
{
    public int scoreAmount, tokenAmount;
    public AssetRefV2 collectVfxAsset, collectSfxAsset;
}
[Serializable]
public sealed class CollectibleFieldsV2
{
    public int scoreAmount;
    public string collectibleName;
    public bool requiresAINearby;
    public float requiredAIDistance;
    public AssetRefV2 collectVfxAsset, collectSfxAsset;
}
[Serializable]
public sealed class CheckpointFieldsV2
{
    public TransformRefV2 respawnPoint;
    public bool isActivated, useFlagVisual;
    public SceneComponentRefV2 flagRenderer;
    public Color activeColor, inactiveColor;
}
[Serializable]
public sealed class GoalFieldsV2
{
    public int nextLevelIndex;
    public bool autoLoadNextLevel, requiresAIActivation;
    public float delayBeforeNextLevel;
    public SceneComponentRefV2 goalRenderer;
    public Color completedColor;
}
[Serializable]
public sealed class ActivatorFieldsV2
{
    public bool isActivated;
    public string interactKey;
    public bool autoActivateOnContact, showInteractionGuide;
    public float baseDifficulty, difficultyPerToken;
    public SceneObjectRefV2 activeVfx;
    public SceneComponentRefV2 activationAudio, deviceRenderer;
    public Color activeColor;
}
[Serializable]
public sealed class EnemyFieldsV2
{
    public bool isHunting;
    public float baseChaseSpeed, currentSpeed, difficultyMultiplier;
    public string skillType;
    public float skillTriggerDistance, skillCooldown, burstSpeed, burstDuration;
    public TransformRefV2[] teleportNodes = Array.Empty<TransformRefV2>();
    public float maxAllowedPlayerLagDistance;
}
[Serializable]
public sealed class TriggerButtonFieldsV2
{
    public bool isOneShot, isPressed;
    public SceneComponentRefV2 buttonRenderer;
    public Color unpressedColor, pressedColor;
    public Vector3 pressOffset;
}

// Event design is separate from runtime execution/snapshot state.
[Serializable]
public sealed class EventTargetRefV2
{
    public string kind;
    public string objectId;
    public string componentTypeId;
    public string instanceId;
}
[Serializable]
public sealed class EventConditionV2
{
    public string type;
    public EventTargetRefV2 target;
    public bool expectedBool;
    public string expectedState;
}
[Serializable]
public sealed class EventActionV2
{
    public string id, type;
    public EventTargetRefV2 target;
    public string componentTypeId, parameterPath;
    public bool boolValue;
    public float numberValue;
    public string stateValue;
    public float delaySeconds;
}
[Serializable]
public sealed class EventRuleV2
{
    public string id;
    public bool enabled;
    public string trigger;
    public EventConditionV2 condition;
    public string repeat;
    public EventActionV2[] actions = Array.Empty<EventActionV2>();
}
