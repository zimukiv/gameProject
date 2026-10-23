using System;
using UnityEngine;

[Serializable]
public sealed class LevelDataV1
{
    public int formatVersion = 1;
    public string levelId;
    public string coverage = "partial";
    public string sourceSceneGuid;
    public LevelObjectData[] objects = Array.Empty<LevelObjectData>();
}

[Serializable]
public sealed class LevelObjectData
{
    public string id;
    public string name;
    public string kind;
    public string parentId;
    public bool active = true;
    public int layer;
    public Vector3 localPosition;
    public float localRotationZ;
    public Vector3 localScale = Vector3.one;
    public LevelComponentData[] components = Array.Empty<LevelComponentData>();
}

[Serializable]
public sealed class LevelComponentData
{
    public string typeId;
    public int version = 1;
    public bool enabled = true;
    public SpriteFields sprite;
    public ColliderFields collider;
    public AirVentFields airVent;
    public TokenFields token;
}

[Serializable]
public sealed class SpriteFields
{
    public string assetGuid;
    public string localFileId;
    public Color color = Color.white;
    public int sortingOrder;
}

[Serializable]
public sealed class ColliderFields
{
    public Vector2 size = Vector2.one;
    public Vector2 offset;
    public bool isTrigger;
}

[Serializable]
public sealed class AirVentFields
{
    public Vector2 ventDirection = Vector2.up;
    public float upwardForce = 22f;
    public bool isInteractable = true;
    public string guideText;
    public bool isContinuous;
}

[Serializable]
public sealed class TokenFields
{
    public int scoreAmount = 100;
    public int tokenAmount = 1;
}

[Serializable]
public sealed class LevelIdSidecar
{
    public string sourceSceneGuid;
    public LevelIdEntry[] entries = Array.Empty<LevelIdEntry>();
}

[Serializable]
public sealed class LevelIdEntry
{
    public string globalObjectId;
    public string objectId;
}
