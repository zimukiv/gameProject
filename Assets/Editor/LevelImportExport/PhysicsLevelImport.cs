using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

public static class PhysicsLevelImport
{
    public const string TestScenePath = "Assets/Scenes/LevelEditorRoundTrip_Phase1.unity";

    [MenuItem("Physics Level Editor/Phase 1/Import sample as NEW test scene")]
    public static void ImportPhase1Sample()
    {
        ImportNewScene(PhysicsLevelExport.SamplePath, TestScenePath);
    }

    public static void ImportNewScene(string jsonPath, string scenePath)
    {
        if (File.Exists(scenePath)) throw new InvalidOperationException("Target scene already exists: " + scenePath);
        if (!scenePath.StartsWith("Assets/Scenes/LevelEditorRoundTrip_", StringComparison.Ordinal) ||
            !scenePath.EndsWith(".unity", StringComparison.Ordinal))
            throw new InvalidOperationException("Phase 1 can create only isolated roundtrip scenes.");
        if (!File.Exists(jsonPath)) throw new FileNotFoundException("Level data missing", jsonPath);
        if (SceneManager.GetActiveScene().isDirty)
            throw new InvalidOperationException("Save or discard current scene edits before creating the test scene.");
        LevelDataV1 data = JsonUtility.FromJson<LevelDataV1>(File.ReadAllText(jsonPath));
        Validate(data);
        foreach (var item in data.objects)
            ResolveSprite(item.components.Single(c => c.typeId == "visual.sprite").sprite);
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        var objects = new Dictionary<string, GameObject>();
        foreach (var item in data.objects)
        {
            var go = new GameObject(item.name);
            go.SetActive(false);
            go.layer = item.layer;
            go.AddComponent<LevelObjectId>().SetId(item.id);
            objects.Add(item.id, go);
        }
        foreach (var item in data.objects)
        {
            var go = objects[item.id];
            if (!string.IsNullOrEmpty(item.parentId)) go.transform.SetParent(objects[item.parentId].transform, false);
            go.transform.localPosition = item.localPosition;
            go.transform.localEulerAngles = new Vector3(0f, 0f, item.localRotationZ);
            go.transform.localScale = item.localScale;
            foreach (var component in item.components)
            {
                switch (component.typeId)
                {
                    case "visual.sprite":
                        var sprite = go.AddComponent<SpriteRenderer>();
                        sprite.sprite = ResolveSprite(component.sprite);
                        sprite.color = component.sprite.color;
                        sprite.sortingOrder = component.sprite.sortingOrder;
                        sprite.enabled = component.enabled;
                        break;
                    case "physics.boxCollider2d":
                        var collider = go.AddComponent<BoxCollider2D>();
                        collider.size = component.collider.size;
                        collider.offset = component.collider.offset;
                        collider.isTrigger = component.collider.isTrigger;
                        collider.enabled = component.enabled;
                        break;
                    case "physics.platform":
                        go.AddComponent<BaseBlock>().enabled = component.enabled;
                        break;
                    case "physics.airVent":
                        var vent = go.AddComponent<AirVentBlock>();
                        vent.ventDirection = component.airVent.ventDirection;
                        vent.upwardForce = component.airVent.upwardForce;
                        vent.isInteractable = component.airVent.isInteractable;
                        vent.guideText = component.airVent.guideText;
                        vent.isContinuous = component.airVent.isContinuous;
                        vent.enabled = component.enabled;
                        break;
                    case "item.token":
                        var token = go.AddComponent<TokenItem>();
                        token.scoreAmount = component.token.scoreAmount;
                        token.tokenAmount = component.token.tokenAmount;
                        token.enabled = component.enabled;
                        break;
                }
            }
            go.SetActive(item.active);
        }
        EditorSceneManager.SaveScene(scene, scenePath);
        AssetDatabase.Refresh();
    }

    private static Sprite ResolveSprite(SpriteFields fields)
    {
        string path = AssetDatabase.GUIDToAssetPath(fields.assetGuid);
        if (string.IsNullOrEmpty(path)) throw new InvalidDataException("Missing sprite GUID: " + fields.assetGuid);
        foreach (var asset in AssetDatabase.LoadAllAssetsAtPath(path))
            if (asset is Sprite sprite && AssetDatabase.TryGetGUIDAndLocalFileIdentifier(
                    sprite, out string guid, out long localId) &&
                guid == fields.assetGuid &&
                localId.ToString(System.Globalization.CultureInfo.InvariantCulture) == fields.localFileId)
                return sprite;
        throw new InvalidDataException("Sprite local file ID not found: " + fields.localFileId);
    }

    public static void Validate(LevelDataV1 data)
    {
        if (data == null || data.formatVersion != 1 || data.coverage != "partial" ||
            string.IsNullOrWhiteSpace(data.levelId) || string.IsNullOrWhiteSpace(data.sourceSceneGuid) ||
            data.objects == null || data.objects.Length == 0)
            throw new InvalidDataException("Invalid Phase 1 level header.");
        var ids = new HashSet<string>();
        foreach (var item in data.objects)
        {
            if (item == null || !Guid.TryParse(item.id, out _) || !ids.Add(item.id) ||
                string.IsNullOrWhiteSpace(item.name) || item.layer < 0 || item.layer > 31 ||
                item.components == null ||
                !Finite(item.localPosition.x) || !Finite(item.localPosition.y) || !Finite(item.localPosition.z) ||
                !Finite(item.localRotationZ) || !Finite(item.localScale.x) || !Finite(item.localScale.y) ||
                !Finite(item.localScale.z) || item.localScale.x == 0f || item.localScale.y == 0f)
                throw new InvalidDataException("Invalid object identity, transform or layer.");
            string expected = item.kind == "platform" ? "physics.platform" :
                item.kind == "airVent" ? "physics.airVent" : item.kind == "token" ? "item.token" : null;
            if (expected == null) throw new InvalidDataException("Unsupported object kind: " + item.kind);
            var types = new HashSet<string>();
            foreach (var component in item.components)
            {
                if (component == null || component.version != 1 || !types.Add(component.typeId) ||
                    !new[] { "visual.sprite", "physics.boxCollider2d", expected }.Contains(component.typeId))
                    throw new InvalidDataException("Unknown, duplicate or incompatible component on " + item.id);
                if (component.typeId == "visual.sprite" && (component.sprite == null ||
                    string.IsNullOrWhiteSpace(component.sprite.assetGuid) ||
                    !long.TryParse(component.sprite.localFileId, out long spriteId) || spriteId <= 0))
                    throw new InvalidDataException("Missing sprite reference on " + item.id);
                if (component.typeId == "physics.boxCollider2d" && (component.collider == null ||
                    !Finite(component.collider.size.x) || !Finite(component.collider.size.y) ||
                    !Finite(component.collider.offset.x) || !Finite(component.collider.offset.y) ||
                    component.collider.size.x <= 0f || component.collider.size.y <= 0f))
                    throw new InvalidDataException("Invalid collider on " + item.id);
                if (component.typeId == "physics.airVent" && (component.airVent == null ||
                    !Finite(component.airVent.upwardForce) || component.airVent.upwardForce <= 0f ||
                    !Finite(component.airVent.ventDirection.x) || !Finite(component.airVent.ventDirection.y) ||
                    component.airVent.ventDirection.sqrMagnitude == 0f))
                    throw new InvalidDataException("Invalid vent on " + item.id);
                if (component.typeId == "item.token" && (component.token == null ||
                    component.token.scoreAmount < 0 || component.token.tokenAmount < 0))
                    throw new InvalidDataException("Invalid token on " + item.id);
            }
            if (types.Count != 3 || !types.Contains("visual.sprite") ||
                !types.Contains("physics.boxCollider2d") || !types.Contains(expected))
                throw new InvalidDataException("Required components missing on " + item.id);
            var colliderData = item.components.Single(c => c.typeId == "physics.boxCollider2d").collider;
            if (colliderData.isTrigger == (item.kind == "platform"))
                throw new InvalidDataException("Platform must be solid; vent and token must be triggers.");
            if (item.kind == "platform" && item.layer != LayerMask.NameToLayer("Ground"))
                throw new InvalidDataException("Platform must use Ground layer.");
        }
        foreach (var item in data.objects)
            if (!string.IsNullOrEmpty(item.parentId) && (!ids.Contains(item.parentId) || item.parentId == item.id))
                throw new InvalidDataException("Missing or self-referential parent on " + item.id);
        foreach (var item in data.objects)
        {
            var seen = new HashSet<string>();
            var current = item;
            while (!string.IsNullOrEmpty(current.parentId))
            {
                if (!seen.Add(current.id)) throw new InvalidDataException("Parent cycle on " + item.id);
                current = data.objects.Single(o => o.id == current.parentId);
            }
        }
    }

    private static bool Finite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);
}
