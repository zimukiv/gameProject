using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

public static class PhysicsLevelExport
{
    public const string SamplePath = "Levels/Physics/Level1.phase1.json";
    public const string SidecarPath = "Levels/Physics/Level1.ids.json";

    [MenuItem("Physics Level Editor/Phase 1/Export Level1 sample")]
    public static void ExportLevel1Sample()
    {
        if (SceneManager.GetActiveScene().isDirty)
            throw new InvalidOperationException("Save or discard current scene edits before opening Level1.");
        Scene scene = EditorSceneManager.OpenScene("Assets/Scenes/Level1.unity", OpenSceneMode.Single);
        string[] names = { "Start ground", "Air vent", "Token 3" };
        var roots = scene.GetRootGameObjects();
        var selected = names.Select(name =>
        {
            var matches = roots.Where(go => go.name == name).ToArray();
            if (matches.Length != 1) throw new InvalidDataException("Sample selection is ambiguous: " + name);
            return matches[0];
        }).ToArray();
        ExportObjects(scene, selected, SamplePath, SidecarPath, null);
    }

    [MenuItem("Physics Level Editor/Phase 1/Export selected Level1 objects")]
    public static void ExportSelectedLevel1Objects()
    {
        Scene scene = SceneManager.GetActiveScene();
        if (scene.path != "Assets/Scenes/Level1.unity")
            throw new InvalidOperationException("Open Level1 and explicitly select supported objects first.");
        ExportObjects(scene, Selection.gameObjects, SamplePath, SidecarPath, null);
    }

    public static LevelDataV1 ExportObjects(Scene scene, GameObject[] selected, string outputPath,
        string sidecarPath, string levelId)
    {
        if (!scene.IsValid() || string.IsNullOrEmpty(scene.path) || selected == null || selected.Length == 0)
            throw new InvalidDataException("A saved scene and explicit object selection are required.");
        string sceneGuid = AssetDatabase.AssetPathToGUID(scene.path);
        if (string.IsNullOrEmpty(sceneGuid)) throw new InvalidDataException("Scene has no asset GUID.");
        var sidecar = File.Exists(sidecarPath)
            ? JsonUtility.FromJson<LevelIdSidecar>(File.ReadAllText(sidecarPath)) : new LevelIdSidecar();
        if (sidecar == null) throw new InvalidDataException("Invalid ID sidecar.");
        if (!string.IsNullOrEmpty(sidecar.sourceSceneGuid) && sidecar.sourceSceneGuid != sceneGuid)
            throw new InvalidDataException("ID sidecar belongs to a different scene. Refusing name-based matching.");
        sidecar.sourceSceneGuid = sceneGuid;
        var byGlobal = new Dictionary<string, string>();
        var usedIds = new HashSet<string>();
        foreach (var entry in sidecar.entries ?? Array.Empty<LevelIdEntry>())
        {
            if (entry == null || string.IsNullOrEmpty(entry.globalObjectId) ||
                !entry.globalObjectId.StartsWith("GlobalObjectId_V1-2-" + sceneGuid + "-", StringComparison.Ordinal) ||
                !Guid.TryParse(entry.objectId, out _) || !byGlobal.TryAdd(entry.globalObjectId, entry.objectId) ||
                !usedIds.Add(entry.objectId))
                throw new InvalidDataException("Duplicate or invalid ID sidecar entry.");
        }
        var selectedSet = new HashSet<GameObject>(selected);
        if (selectedSet.Count != selected.Length) throw new InvalidDataException("Duplicate selected object.");
        var result = new List<LevelObjectData>();
        var exportedIds = new HashSet<string>();
        foreach (var go in selected)
        {
            if (go == null || go.scene != scene) throw new InvalidDataException("Selection is outside source scene.");
            if (go.transform.parent != null && !selectedSet.Contains(go.transform.parent.gameObject))
                throw new InvalidDataException("Parent was not selected: " + go.name);
            var globalId = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString();
            var identity = go.GetComponent<LevelObjectId>();
            string id;
            if (identity != null)
            {
                id = identity.ObjectId;
                if (!Guid.TryParse(id, out _)) throw new InvalidDataException("Invalid LevelObjectId on " + go.name);
                if (byGlobal.TryGetValue(globalId, out string mapped) && mapped != id)
                    throw new InvalidDataException("Sidecar and LevelObjectId disagree on " + go.name);
                if (!byGlobal.ContainsKey(globalId) && usedIds.Contains(id))
                    throw new InvalidDataException("LevelObjectId collides with a sidecar ID: " + id);
            }
            else if (!byGlobal.TryGetValue(globalId, out id))
            {
                id = Guid.NewGuid().ToString("D");
                if (!usedIds.Add(id)) throw new InvalidDataException("Generated ID collision.");
                byGlobal.Add(globalId, id);
            }
            if (!exportedIds.Add(id)) throw new InvalidDataException("Duplicate object ID: " + id);
            result.Add(ReadObject(go, id));
        }
        var idsByObject = selected.Zip(result, (go, data) => new { go, data })
            .ToDictionary(x => x.go, x => x.data.id);
        foreach (var pair in selected.Zip(result, (go, data) => new { go, data }))
            pair.data.parentId = pair.go.transform.parent == null ? null : idsByObject[pair.go.transform.parent.gameObject];
        var document = new LevelDataV1
        {
            levelId = levelId ?? "unity:" + sceneGuid,
            coverage = "partial",
            sourceSceneGuid = sceneGuid,
            objects = result.OrderBy(o => o.id, StringComparer.Ordinal).ToArray()
        };
        Directory.CreateDirectory(Path.GetDirectoryName(outputPath));
        Directory.CreateDirectory(Path.GetDirectoryName(sidecarPath));
        File.WriteAllText(outputPath, JsonUtility.ToJson(document, true));
        sidecar.entries = byGlobal.OrderBy(p => p.Key, StringComparer.Ordinal)
            .Select(p => new LevelIdEntry { globalObjectId = p.Key, objectId = p.Value }).ToArray();
        File.WriteAllText(sidecarPath, JsonUtility.ToJson(sidecar, true));
        return document;
    }

    private static LevelObjectData ReadObject(GameObject go, string id)
    {
        bool platform = go.GetComponent<BaseBlock>() != null && go.GetComponent<AirVentBlock>() == null;
        bool vent = go.GetComponent<AirVentBlock>() != null;
        bool token = go.GetComponent<TokenItem>() != null;
        if ((platform ? 1 : 0) + (vent ? 1 : 0) + (token ? 1 : 0) != 1)
            throw new InvalidDataException("Unsupported or ambiguous object kind: " + go.name);
        var allowed = new HashSet<Type> { typeof(Transform), typeof(SpriteRenderer), typeof(BoxCollider2D),
            typeof(BaseBlock), typeof(AirVentBlock), typeof(TokenItem), typeof(LevelObjectId) };
        foreach (var component in go.GetComponents<Component>())
            if (component == null || !allowed.Contains(component.GetType()))
                throw new InvalidDataException("Unsupported component on " + go.name + ": " + component);
        var sprite = go.GetComponent<SpriteRenderer>();
        var collider = go.GetComponent<BoxCollider2D>();
        if (sprite == null || collider == null)
            throw new InvalidDataException("SpriteRenderer and BoxCollider2D required on " + go.name);
        if (sprite.sprite == null ||
            !AssetDatabase.TryGetGUIDAndLocalFileIdentifier(sprite.sprite, out string assetGuid, out long localId))
            throw new InvalidDataException("Sprite asset cannot be exported on " + go.name);
        var components = new List<LevelComponentData>
        {
            new LevelComponentData { typeId = "visual.sprite", enabled = sprite.enabled,
                sprite = new SpriteFields { assetGuid = assetGuid, localFileId = localId.ToString(System.Globalization.CultureInfo.InvariantCulture),
                    color = sprite.color, sortingOrder = sprite.sortingOrder } },
            new LevelComponentData { typeId = "physics.boxCollider2d", enabled = collider.enabled,
                collider = new ColliderFields { size = collider.size, offset = collider.offset,
                    isTrigger = collider.isTrigger } }
        };
        string kind;
        if (platform)
        {
            kind = "platform";
            components.Add(new LevelComponentData { typeId = "physics.platform",
                enabled = go.GetComponent<BaseBlock>().enabled });
        }
        else if (vent)
        {
            kind = "airVent";
            var source = go.GetComponent<AirVentBlock>();
            if (source.ventParticles != null) throw new InvalidDataException("Vent particles are not supported yet.");
            components.Add(new LevelComponentData { typeId = "physics.airVent", enabled = source.enabled,
                airVent = new AirVentFields { ventDirection = source.ventDirection,
                    upwardForce = source.upwardForce, isInteractable = source.isInteractable,
                    guideText = source.guideText, isContinuous = source.isContinuous } });
        }
        else
        {
            kind = "token";
            var source = go.GetComponent<TokenItem>();
            if (source.collectVFX != null || source.collectSFX != null)
                throw new InvalidDataException("Token VFX/SFX references are not supported yet.");
            components.Add(new LevelComponentData { typeId = "item.token", enabled = source.enabled,
                token = new TokenFields { scoreAmount = source.scoreAmount, tokenAmount = source.tokenAmount } });
        }
        return new LevelObjectData { id = id, name = go.name, kind = kind, active = go.activeSelf,
            layer = go.layer, localPosition = go.transform.localPosition,
            localRotationZ = go.transform.localEulerAngles.z, localScale = go.transform.localScale,
            components = components.ToArray() };
    }
}
