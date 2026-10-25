using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using N = PhysicsLevelV2Json.Node;

// M1.3A only: seven audited Level1 objects. No raw YAML is applied to created objects.
public static class PhysicsLevelV3ThermalRebuild
{
    const string BaselinePath = "Levels/Drafts/M1.3A/thermal-baseline.v3.test.json";
    const string EditedPath = "Levels/Drafts/M1.3A/thermal-edited.v3.test.json";
    const string SourceMapPath = "Levels/SourceMaps/Level1.source.json";
    const string Ice2Id = "1263c26b-67be-5071-8ada-a79b35fdc71c";
    const string ControllerAId = "0c53c967-c623-50f2-9d5d-98de4129232d";
    const string ControllerBId = "0c00697d-0470-5e5d-940b-b0645f0c858e";
    const string BackdropId = "4a942db3-88db-5728-b2db-f49f66c969ee";
    const string OriginalSceneSha = "208caa5ee0c2edb7fe3140ece317ccd0156957ad0ae89e2a738a3ccb2d396d34";
    const string ScenePrefix = "Assets/Scenes/LevelEditorM13A_Thermal_";
    static readonly HashSet<string> ExpectedIds = new HashSet<string>(StringComparer.Ordinal) {
        ControllerAId, ControllerBId, BackdropId, Ice2Id,
        "670b32aa-3139-55f7-b655-ef0bebf7776c",
        "e520f104-d5ae-5663-b6c5-3eea07634b76",
        "9336ae16-b68e-5747-a5cd-113149e3870a"
    };

    static string ProjectFile(string relative) => Path.Combine(
        Path.GetFullPath(Path.Combine(Application.dataPath, "..")), relative);
    static void CheckIsolation()
    {
        string root = Path.GetFullPath(Path.Combine(Application.dataPath, ".."));
        string marker = Path.Combine(root, "Phase4A.IsolatedProject.marker");
        Require(File.Exists(marker) && File.ReadAllText(marker).Trim() ==
            "PHYSICS_LEVEL_EDITOR_PHASE4A_ISOLATED" &&
            Application.companyName == "MiniGame Team Phase4A Test" &&
            Application.productName == "Physics Level Editor Phase4A Isolated",
            "M1.3A requires the marked Phase4A isolated project with separate Company/Product.");
        string dev = Path.GetFullPath(@"C:\Users\Kayla\Desktop\gameProject-physics-phase4");
        string formal = Path.GetFullPath(@"C:\Users\Kayla\Desktop\gameProject-physics");
        Require(!string.Equals(root.TrimEnd(Path.DirectorySeparatorChar),dev,StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(root.TrimEnd(Path.DirectorySeparatorChar),formal,StringComparison.OrdinalIgnoreCase),
            "M1.3A cannot run in a development or formal worktree.");
        Debug.Log("M13A_ISOLATION_PASS project="+root+"; Company="+Application.companyName+
            "; Product="+Application.productName);
    }
    static string Sha(byte[] bytes)
    {
        using (var hasher = SHA256.Create())
            return BitConverter.ToString(hasher.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
    }
    static string Sha(string text) => Sha(Encoding.UTF8.GetBytes(text));
    static N Field(N node, string key, string at)
    {
        if (node?.Object == null || !node.Object.TryGetValue(key, out N value))
            throw new InvalidDataException(at + "." + key + ": required field missing");
        return value;
    }
    static string Text(N node, string at)
    {
        if (!(node?.Value is string value)) throw new InvalidDataException(at + ": expected text");
        return value;
    }
    static double Number(N node, string at)
    {
        if (!(node?.Value is double value) || double.IsNaN(value) || double.IsInfinity(value))
            throw new InvalidDataException(at + ": expected finite number");
        return value;
    }
    static int Int(N node, string at)
    {
        double value = Number(node, at);
        if (value != Math.Truncate(value) || value < int.MinValue || value > int.MaxValue)
            throw new InvalidDataException(at + ": expected int32");
        return (int)value;
    }
    static bool Bool(N node, string at)
    {
        if (!(node?.Value is bool value)) throw new InvalidDataException(at + ": expected boolean");
        return value;
    }
    static List<N> Array(N node, string at)
    {
        if (node?.Array == null) throw new InvalidDataException(at + ": expected array");
        return node.Array;
    }
    static void Keys(N node, string at, params string[] expected)
    {
        if (node?.Object == null || node.Object.Count != expected.Length ||
            expected.Any(key => !node.Object.ContainsKey(key)))
            throw new InvalidDataException(at + ": unsupported/missing field; expected " + string.Join(",", expected));
    }
    static Vector2 Vec2(N node, string at)
    {
        Keys(node, at, "x", "y");
        return new Vector2((float)Number(Field(node, "x", at), at + ".x"),
            (float)Number(Field(node, "y", at), at + ".y"));
    }
    static Vector3 Vec3(N node, string at)
    {
        Keys(node, at, "x", "y", "z");
        return new Vector3((float)Number(Field(node, "x", at), at + ".x"),
            (float)Number(Field(node, "y", at), at + ".y"),
            (float)Number(Field(node, "z", at), at + ".z"));
    }
    static Quaternion Quat(N node, string at)
    {
        Keys(node, at, "x", "y", "z", "w");
        return new Quaternion((float)Number(Field(node, "x", at), at + ".x"),
            (float)Number(Field(node, "y", at), at + ".y"),
            (float)Number(Field(node, "z", at), at + ".z"),
            (float)Number(Field(node, "w", at), at + ".w"));
    }
    static Color Color(N node, string at)
    {
        Keys(node, at, "r", "g", "b", "a");
        return new Color((float)Number(Field(node, "r", at), at + ".r"),
            (float)Number(Field(node, "g", at), at + ".g"),
            (float)Number(Field(node, "b", at), at + ".b"),
            (float)Number(Field(node, "a", at), at + ".a"));
    }
    static void Require(bool condition, string message)
    {
        if (!condition) throw new InvalidDataException(message);
    }
    static N FindComponent(N item, string type)
    {
        var matches = Array(Field(item, "components", "object"), "components").Where(c =>
            Text(Field(c, "typeId", "component"), "component.typeId") == type).ToArray();
        if (matches.Length != 1) throw new InvalidDataException(
            Text(Field(item, "id", "object"), "id") + ": expected one " + type + "; found " + matches.Length);
        return matches[0];
    }
    static string AssetId(N node, string at)
    {
        Keys(node, at, "kind", "assetId");
        Require(Text(Field(node, "kind", at), at + ".kind") == "asset", at + ": not an asset reference");
        return Text(Field(node, "assetId", at), at + ".assetId");
    }
    static Sprite ResolveSprite(N node, string at)
    {
        string assetId = AssetId(node, at);
        string[] parts = assetId.Split(':');
        Require(parts.Length == 3 && parts[0] == "unity", at + ": invalid Unity asset ID");
        string path = AssetDatabase.GUIDToAssetPath(parts[1]);
        Require(!string.IsNullOrEmpty(path), at + ": Sprite GUID has no Unity path " + parts[1]);
        foreach (var candidate in AssetDatabase.LoadAllAssetsAtPath(path))
        {
            if (!(candidate is Sprite sprite)) continue;
            if (AssetDatabase.TryGetGUIDAndLocalFileIdentifier(sprite, out string guid, out long fileId) &&
                guid == parts[1] && fileId.ToString(CultureInfo.InvariantCulture) == parts[2]) return sprite;
        }
        throw new InvalidDataException(at + ": Sprite GUID/localFileId cannot be resolved " + assetId);
    }

    [MenuItem("Physics Level Editor/M1.3A/Prepare isolated V3 thermal data rebuild")]
    public static void PrepareData() => Prepare(false);

    [MenuItem("Physics Level Editor/M1.3A/Prepare and play isolated V3 thermal mechanics")]
    public static void PreparePlay() => Prepare(true);

    static void Prepare(bool play)
    {
        string createdPath = null;
        Scene scene = default(Scene);
        try
        {
            CheckIsolation();
            Require(!EditorApplication.isPlayingOrWillChangePlaymode, "Exit Play Mode before M1.3A rebuild.");
            Require(!SceneManager.GetActiveScene().isDirty, "Save/discard active scene changes first.");
            N baseline = PhysicsLevelV2Json.Parse(File.ReadAllText(ProjectFile(BaselinePath)));
            N edited = PhysicsLevelV2Json.Parse(File.ReadAllText(ProjectFile(EditedPath)));
            N source = PhysicsLevelV2Json.Parse(File.ReadAllText(ProjectFile(SourceMapPath)));
            Preflight(baseline, edited, source);
            createdPath = ScenePrefix + Guid.NewGuid().ToString("N") + ".unity";
            Require(!File.Exists(ProjectFile(createdPath)), "Generated scene path already exists.");
            scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Additive);
            var byId = new Dictionary<string, GameObject>(StringComparer.Ordinal);
            var byComponent = new Dictionary<string, Component>(StringComparer.Ordinal);
            var types = new Dictionary<string, string>(StringComparer.Ordinal);
            var items = Array(Field(edited, "objects", "level"), "level.objects")
                .OrderBy(o => Int(Field(o, "siblingIndex", "object"), "siblingIndex")).ToList();
            foreach (var item in items)
            {
                string id = Text(Field(item, "id", "object"), "object.id");
                var go = new GameObject(Text(Field(item, "name", id), id + ".name"));
                go.SetActive(false);
                SceneManager.MoveGameObjectToScene(go, scene);
                go.tag = Text(Field(item, "tag", id), id + ".tag");
                go.layer = Int(Field(item, "layer", id), id + ".layer");
                go.AddComponent<LevelObjectId>().SetId(id);
                go.AddComponent<LevelComponentIdMap>();
                byId.Add(id, go);
            }
            foreach (var item in items)
            {
                string id = Text(Field(item, "id", "object"), "object.id");
                var go = byId[id];
                go.transform.localPosition = Vec3(Field(item, "localPosition", id), id + ".localPosition");
                go.transform.localRotation = Quat(Field(item, "localRotation", id), id + ".localRotation");
                go.transform.localScale = Vec3(Field(item, "localScale", id), id + ".localScale");
                foreach (var part in Array(Field(item, "components", id), id + ".components"))
                {
                    string componentId = Text(Field(part, "componentId", id), id + ".componentId");
                    string type = Text(Field(part, "typeId", componentId), componentId + ".typeId");
                    Component created = AddMappedComponent(go, part, type, componentId);
                    Require(!byComponent.ContainsKey(componentId), "Duplicate component ID " + componentId);
                    byComponent.Add(componentId, created); types.Add(componentId, type);
                    go.GetComponent<LevelComponentIdMap>().Add(componentId, type, created);
                }
            }
            // All GameObjects and exact component instances now exist. Typed references are authoritative.
            foreach (var item in items)
            foreach (var part in Array(Field(item, "components", "object"), "components"))
            {
                string type = Text(Field(part, "typeId", "component"), "component.typeId");
                if (type != "unity.ThermalControllerBlock") continue;
                string componentId = Text(Field(part, "componentId", "component"), "component.componentId");
                var thermal = (ThermalControllerBlock)byComponent[componentId];
                N data = Field(part, "data", componentId);
                N linked = Field(data, "linkedController", componentId);
                thermal.linkedController = linked.IsNull ? null :
                    Resolve<ThermalControllerBlock>(linked, "unity.ThermalControllerBlock", byId, byComponent, types, componentId + ".linkedController");
                var ice = Array(Field(data, "controlledIce", componentId), componentId + ".controlledIce");
                thermal.controlledIce = ice.Select((reference, index) => Resolve<IceBlock>(reference,
                    "unity.IceBlock", byId, byComponent, types, componentId + ".controlledIce[" + index + "]")).ToArray();
                thermal.roomFilterOverlay = Resolve<SpriteRenderer>(Field(data, "roomFilterOverlay", componentId),
                    "unity.SpriteRenderer", byId, byComponent, types, componentId + ".roomFilterOverlay");
            }
            foreach (var item in items)
            {
                string id = Text(Field(item, "id", "object"), "id");
                byId[id].SetActive(Bool(Field(item, "active", id), id + ".active"));
            }
            if (play)
            {
                var probe = new GameObject("M1.3A isolated Play probe");
                SceneManager.MoveGameObjectToScene(probe, scene);
                probe.AddComponent<M13AThermalPlayProbe>();
            }
            AssertScene(scene, edited);
            if (!EditorSceneManager.SaveScene(scene, createdPath, false))
                throw new IOException("Unity did not save the M1.3A test scene.");
            EditorSceneManager.CloseScene(scene, true);
            scene = default(Scene);
            EditorSceneManager.OpenScene(createdPath, OpenSceneMode.Single);
            AssertScene(SceneManager.GetActiveScene(), edited);
            Debug.Log("M13A_DATA_STATUS=PASS; scene=" + createdPath +
                "; objects=7; sourceComponents=32; editedIce2X=0.75; editedColliderY=1.25; refs=PASS");
            Debug.Log("M13A_FIELD_COVERAGE=PARTIAL; details=Levels/Drafts/M1.3A/field-coverage.json; source YAML retained");
            if (play)
            {
                Debug.Log("M13A_PLAY_STATUS=NOT_RUN; entering Play Mode; wait for M13A_PLAY_STATUS=PASS/FAIL from probe");
                EditorApplication.EnterPlaymode();
            }
            else Debug.Log("M13A_PLAY_STATUS=NOT_RUN");
        }
        catch (Exception ex)
        {
            if (scene.IsValid() && scene.isLoaded) EditorSceneManager.CloseScene(scene, true);
            Debug.LogError("M13A_DATA_STATUS=FAIL; M13A_PLAY_STATUS=NOT_RUN; generatedScene="+
                (createdPath ?? "none") + "; " + ex);
        }
    }

    static Component AddMappedComponent(GameObject go, N part, string type, string at)
    {
        N data = Field(part, "data", at);
        Require(Text(Field(part, "dataStatus", at), at + ".dataStatus") == "m13aMapped",
            at + ": unsupported component is not importable");
        Require(Int(Field(part, "version", at), at + ".version") == 1, at + ": unsupported component version");
        bool enabled = Bool(Field(part, "enabled", at), at + ".enabled");
        Component created;
        switch (type)
        {
            case "unity.Transform": Keys(data, at); created = go.transform; break;
            case "unity.SpriteRenderer":
                Keys(data, at, "sprite", "material", "color", "sortingLayerId", "sortingOrder",
                    "drawMode", "size", "flipX", "flipY");
                Require(AssetId(Field(data, "material", at), at + ".material") ==
                    "unity:0000000000000000f000000000000000:10754",
                    at + ": only the audited Unity built-in sprite material is supported");
                var sprite = go.AddComponent<SpriteRenderer>();
                Require(sprite.sharedMaterial != null, at + ": Unity default Sprite material unavailable");
                sprite.sprite = ResolveSprite(Field(data, "sprite", at), at + ".sprite");
                sprite.color = Color(Field(data, "color", at), at + ".color");
                sprite.sortingLayerID = Int(Field(data, "sortingLayerId", at), at + ".sortingLayerId");
                sprite.sortingOrder = Int(Field(data, "sortingOrder", at), at + ".sortingOrder");
                sprite.drawMode = (SpriteDrawMode)Int(Field(data, "drawMode", at), at + ".drawMode");
                sprite.size = Vec2(Field(data, "size", at), at + ".size");
                sprite.flipX = Bool(Field(data, "flipX", at), at + ".flipX");
                sprite.flipY = Bool(Field(data, "flipY", at), at + ".flipY");
                created = sprite; break;
            case "unity.BoxCollider2D":
                Keys(data, at, "size", "offset", "isTrigger", "density", "edgeRadius", "material");
                Require(Field(data, "material", at).IsNull, at + ": physics material not supported");
                var collider = go.AddComponent<BoxCollider2D>();
                collider.size = Vec2(Field(data, "size", at), at + ".size");
                collider.offset = Vec2(Field(data, "offset", at), at + ".offset");
                collider.isTrigger = Bool(Field(data, "isTrigger", at), at + ".isTrigger");
                float density = (float)Number(Field(data, "density", at), at + ".density");
                var body = go.GetComponent<Rigidbody2D>();
                // Unity 6 rejects writes to density on a static collider. These audited
                // ice colliders have no dynamic auto-mass body; their source value is 1.
                if (body != null && body.bodyType == RigidbodyType2D.Dynamic && body.useAutoMass)
                    collider.density = density;
                else Require(Mathf.Abs(collider.density - density) < .0001f,
                    at + ": density cannot be applied without a dynamic auto-mass Rigidbody2D");
                collider.edgeRadius = (float)Number(Field(data, "edgeRadius", at), at + ".edgeRadius");
                created = collider; break;
            case "unity.BaseBlock": Keys(data, at); created = go.AddComponent<BaseBlock>(); break;
            case "unity.IceBlock":
                Keys(data, at, "isInteractable", "isMelted", "solidColor", "meltedColor");
                var ice = go.AddComponent<IceBlock>();
                ice.isInteractable = Bool(Field(data, "isInteractable", at), at + ".isInteractable");
                ice.solidColor = Color(Field(data, "solidColor", at), at + ".solidColor");
                ice.meltedColor = Color(Field(data, "meltedColor", at), at + ".meltedColor");
                ice.SetTemperature(Bool(Field(data, "isMelted", at), at + ".isMelted"));
                created = ice; break;
            case "unity.ThermalControllerBlock":
                Keys(data, at, "isInteractable", "currentState", "linkedController", "controlledIce",
                    "roomFilterOverlay", "terminalName", "interactionRadius", "controlRadius",
                    "coldFilterColor", "hotFilterColor");
                var thermal = go.AddComponent<ThermalControllerBlock>();
                thermal.isInteractable = Bool(Field(data, "isInteractable", at), at + ".isInteractable");
                int state = Int(Field(data, "currentState", at), at + ".currentState");
                Require(state == 0 || state == 1, at + ": invalid temperature state");
                thermal.currentState = (ThermalControllerBlock.TemperatureState)state;
                thermal.terminalName = Text(Field(data, "terminalName", at), at + ".terminalName");
                thermal.interactionRadius = (float)Number(Field(data, "interactionRadius", at), at + ".interactionRadius");
                thermal.controlRadius = (float)Number(Field(data, "controlRadius", at), at + ".controlRadius");
                thermal.coldFilterColor = Color(Field(data, "coldFilterColor", at), at + ".coldFilterColor");
                thermal.hotFilterColor = Color(Field(data, "hotFilterColor", at), at + ".hotFilterColor");
                created = thermal; break;
            default: throw new InvalidDataException(at + ": unsupported V3 component " + type);
        }
        if (created is Behaviour behaviour) behaviour.enabled = enabled;
        return created;
    }

    static T Resolve<T>(N reference, string expectedType, Dictionary<string,GameObject> byId,
        Dictionary<string,Component> components, Dictionary<string,string> types, string at) where T:Component
    {
        Keys(reference, at, "kind", "levelId", "objectId", "componentId", "componentTypeId");
        string id = Text(Field(reference, "componentId", at), at + ".componentId");
        string objectId = Text(Field(reference, "objectId", at), at + ".objectId");
        Require(Text(Field(reference, "kind", at), at + ".kind") == "component" &&
            Text(Field(reference, "componentTypeId", at), at + ".componentTypeId") == expectedType &&
            Text(Field(reference, "levelId", at), at + ".levelId") ==
                "unity:8012e3d1cdce7da499fa92e045ffd865" &&
            byId.TryGetValue(objectId, out GameObject target) &&
            components.TryGetValue(id, out Component component) && types[id] == expectedType &&
            component.gameObject == target && component is T,
            at + ": missing or wrong stable component reference " + id);
        return (T)components[id];
    }

    static void Preflight(N baseline, N edited, N source)
    {
        string scenePath = ProjectFile("Assets/Scenes/Level1.unity");
        Require(File.Exists(scenePath) && Sha(File.ReadAllBytes(scenePath)) == OriginalSceneSha,
            "Isolated Level1 source Scene differs from the audited SHA-256.");
        Require(Int(Field(edited, "formatVersion", "level"), "formatVersion") == 3 &&
            Text(Field(edited, "roomId", "level"), "roomId") == "room1" &&
            Text(Field(edited, "coverage", "level"), "coverage") == "partial",
            "Expected an isolated partial V3 Level1 document.");
        Require(Text(Field(Field(edited, "sourceScene", "level"), "sha256", "sourceScene"), "sourceScene.sha256") == OriginalSceneSha,
            "V3 source Scene hash differs.");
        Require(Text(Field(Field(source, "sourceScene", "sourceMap"), "sha256", "sourceScene"), "sourceScene.sha256") == OriginalSceneSha,
            "M1.1 source map hash differs.");
        var sourceById = Array(Field(source, "objects", "sourceMap"), "sourceMap.objects")
            .ToDictionary(o => Text(Field(o, "objectId", "source object"), "objectId"), StringComparer.Ordinal);
        var items = Array(Field(edited, "objects", "level"), "level.objects");
        Require(items.Count == 7, "M1.3A requires exactly seven source objects.");
        var actualIds = new HashSet<string>(StringComparer.Ordinal);
        var componentIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in items)
        {
            string id = Text(Field(item, "id", "object"), "object.id");
            Require(ExpectedIds.Contains(id) && actualIds.Add(id), "Unexpected or duplicate source object ID " + id);
            Require(sourceById.TryGetValue(id, out N original), "Source map lacks object " + id);
            Require(Text(Field(item, "sourceFileId", id), id + ".sourceFileId") ==
                Text(Field(original, "sourceFileId", id), id + ".sourceFileId"), id + ": source fileID changed");
            CheckRaw(Field(item, "sourceSerialized", id),
                Text(Field(original, "sourceGameObjectSha256", id), id + ".sourceGameObjectSha256"), id);
            Require(Field(item, "parentId", id).IsNull && Field(item, "rectTransform", id).IsNull,
                id + ": M1.3A handles only root world objects");
            var parts = Array(Field(item, "components", id), id + ".components");
            var sourceParts = Array(Field(original, "components", id), id + ".source.components");
            Require(parts.Count == sourceParts.Count, id + ": source component count changed");
            for (int index = 0; index < parts.Count; index++)
            {
                var part = parts[index]; var sourcePart = sourceParts[index];
                string cid = Text(Field(part, "componentId", id), id + ".componentId");
                Require(componentIds.Add(cid) && cid == Text(Field(sourcePart, "componentId", id), id + ".source.componentId"),
                    id + ": source component ID/order changed");
                Require(Text(Field(part, "sourceFileId", cid), cid + ".sourceFileId") ==
                    Text(Field(sourcePart, "sourceFileId", cid), cid + ".source.sourceFileId") &&
                    Text(Field(part, "typeId", cid), cid + ".typeId") ==
                        "unity." + Text(Field(sourcePart, "unityType", cid), cid + ".source.unityType"),
                    cid + ": source component fileID/type changed");
                CheckRaw(Field(part, "sourceSerialized", cid),
                    Text(Field(sourcePart, "sourceDocumentSha256", cid), cid + ".source.sha256"), cid);
                Require(Text(Field(part, "dataStatus", cid), cid + ".dataStatus") == "m13aMapped" &&
                    Int(Field(part, "version", cid), cid + ".version") == 1,
                    cid + ": unsupported component status/version");
            }
        }
        Require(actualIds.SetEquals(ExpectedIds) && componentIds.Count == 32,
            "M1.3A source identity coverage differs.");
        AssertOnlyPlannedEdit(baseline, edited);
    }

    static void CheckRaw(N sourceSerialized, string sha, string at)
    {
        Require(Text(Field(sourceSerialized, "sha256", at), at + ".sha256") == sha &&
            Sha(Text(Field(sourceSerialized, "rawYaml", at), at + ".rawYaml")) == sha,
            at + ": source YAML backup hash differs; refusing lossy import");
    }

    static void Diff(N before, N after, string path, List<string> differences)
    {
        if (before.Object != null || after.Object != null)
        {
            if (before.Object == null || after.Object == null ||
                !before.Object.Keys.OrderBy(x=>x).SequenceEqual(after.Object.Keys.OrderBy(x=>x)))
            { differences.Add(path); return; }
            foreach (var key in before.Object.Keys) Diff(before.Object[key], after.Object[key], path + "." + key, differences);
        }
        else if (before.Array != null || after.Array != null)
        {
            if (before.Array == null || after.Array == null || before.Array.Count != after.Array.Count)
            { differences.Add(path); return; }
            for (int i=0; i<before.Array.Count; i++) Diff(before.Array[i],after.Array[i],path+"["+i+"]",differences);
        }
        else if (!Equals(before.Value, after.Value)) differences.Add(path);
    }

    static void AssertOnlyPlannedEdit(N baseline, N edited)
    {
        var before = Array(Field(baseline, "objects", "baseline"), "baseline.objects");
        var after = Array(Field(edited, "objects", "edited"), "edited.objects");
        Require(before.Count == after.Count, "Baseline/edited object count changed.");
        int targetIndex = after.FindIndex(o => Text(Field(o,"id","object"),"id") == Ice2Id);
        Require(targetIndex >= 0 && Text(Field(before[targetIndex],"id","object"),"id") == Ice2Id,
            "Edited Ice step 2 is not the same source object.");
        var all = new List<string>();Diff(baseline, edited, "$", all);
        var targetBefore = before[targetIndex]; var targetAfter = after[targetIndex];
        var oldBox = FindComponent(targetBefore, "unity.BoxCollider2D");
        var newBox = FindComponent(targetAfter, "unity.BoxCollider2D");
        int boxIndex = Array(Field(targetAfter,"components","object"),"components").IndexOf(newBox);
        string positionPath = "$.objects["+targetIndex+"].localPosition.x";
        string sizePath = "$.objects["+targetIndex+"].components["+boxIndex+"].data.size.y";
        Require(all.Count == 2 && all.Contains(positionPath) && all.Contains(sizePath),
            "Unexpected baseline-to-edited difference: " + string.Join(";", all));
        float x0=Vec3(Field(targetBefore,"localPosition","before"),"before.localPosition").x;
        float x1=Vec3(Field(targetAfter,"localPosition","after"),"after.localPosition").x;
        float y0=Vec2(Field(Field(oldBox,"data","oldBox"),"size","oldBox"),"oldBox.size").y;
        float y1=Vec2(Field(Field(newBox,"data","newBox"),"size","newBox"),"newBox.size").y;
        Require(Mathf.Abs(x1-x0-.75f)<.0001f && Mathf.Abs(y1-y0-.25f)<.0001f,
            "Typed V3 edit magnitude differs from the planned test.");
    }

    static void AssertScene(Scene scene, N data)
    {
        var ids = scene.GetRootGameObjects().SelectMany(root=>root.GetComponentsInChildren<LevelObjectId>(true))
            .ToDictionary(x=>x.ObjectId,x=>x.gameObject,StringComparer.Ordinal);
        Require(ids.Count==7 && ExpectedIds.All(ids.ContainsKey), "Rebuilt Scene has missing/duplicate source object IDs.");
        foreach (var item in Array(Field(data,"objects","level"),"objects"))
        {
            string id=Text(Field(item,"id","object"),"id");
            var go=ids[id];
            Require((go.transform.localPosition-Vec3(Field(item,"localPosition",id),id+".localPosition")).sqrMagnitude<1e-8f,
                id+": typed V3 position was not applied");
            Require((go.transform.localScale-Vec3(Field(item,"localScale",id),id+".localScale")).sqrMagnitude<1e-8f &&
                Quaternion.Angle(go.transform.localRotation,Quat(Field(item,"localRotation",id),id+".localRotation"))<.001f,
                id+": typed V3 scale/rotation was not applied");
            var partEntries=go.GetComponent<LevelComponentIdMap>()?.Entries;
            var parts=Array(Field(item,"components",id),id+".components");
            Require(partEntries!=null && partEntries.Count==parts.Count, id+": component identity map incomplete");
            foreach (var part in parts)
            {
                string cid=Text(Field(part,"componentId",id),id+".componentId");
                string type=Text(Field(part,"typeId",cid),cid+".typeId");
                Require(partEntries.Count(entry=>entry.componentId==cid && entry.typeId==type && entry.target!=null)==1,
                    cid+": stable component identity missing");
                AssertMappedComponent(partEntries.Single(entry=>entry.componentId==cid).target,part,cid);
            }
        }
        var edited=ids[Ice2Id];
        Require(Mathf.Abs(edited.transform.localPosition.x-.75f)<.0001f &&
            Mathf.Abs(edited.GetComponent<BoxCollider2D>().size.y-1.25f)<.0001f,
            "Edited Ice step 2 position/Collider size did not reach Unity.");
        var a=ids[ControllerAId].GetComponent<ThermalControllerBlock>();
        var b=ids[ControllerBId].GetComponent<ThermalControllerBlock>();
        var backdrop=ids[BackdropId].GetComponent<SpriteRenderer>();
        Require(a!=null && b!=null && a.linkedController==null && b.linkedController==a,
            "Thermal controller stable linkedController reference mismatch.");
        foreach(var terminal in new[]{a,b})
        {
            Require(terminal.controlledIce!=null && terminal.controlledIce.Length==4 &&
                terminal.controlledIce.Distinct().Count()==4 && terminal.roomFilterOverlay==backdrop,
                "Thermal controlledIce/roomFilterOverlay reference mismatch.");
            foreach(var ice in terminal.controlledIce)
                Require(ice!=null && ids.ContainsValue(ice.gameObject),"Thermal references an outside IceBlock.");
        }
    }

    static void AssertMappedComponent(Component actual, N part, string at)
    {
        string type=Text(Field(part,"typeId",at),at+".typeId");
        N data=Field(part,"data",at);
        if(actual is Behaviour behaviour)
            Require(behaviour.enabled==Bool(Field(part,"enabled",at),at+".enabled") ||
                (type=="unity.BoxCollider2D" && actual.GetComponent<IceBlock>()?.isMelted==true &&
                 !behaviour.enabled),at+": component enabled value differs from typed data/runtime Ice state");
        switch(type)
        {
            case "unity.SpriteRenderer":
                var sprite=(SpriteRenderer)actual;
                Require(sprite.sprite==ResolveSprite(Field(data,"sprite",at),at+".sprite") &&
                    sprite.sortingLayerID==Int(Field(data,"sortingLayerId",at),at+".sortingLayerId") &&
                    sprite.sortingOrder==Int(Field(data,"sortingOrder",at),at+".sortingOrder") &&
                    sprite.drawMode==(SpriteDrawMode)Int(Field(data,"drawMode",at),at+".drawMode") &&
                    (sprite.size-Vec2(Field(data,"size",at),at+".size")).sqrMagnitude<1e-8f &&
                    sprite.flipX==Bool(Field(data,"flipX",at),at+".flipX") &&
                    sprite.flipY==Bool(Field(data,"flipY",at),at+".flipY"),
                    at+": SpriteRenderer typed visual fields differ");
                // IceBlock owns the effective color while melted; its design color remains in V3.
                if(actual.GetComponent<IceBlock>()==null)
                    Require(Approximately(sprite.color,Color(Field(data,"color",at),at+".color")),
                        at+": SpriteRenderer color differs");
                break;
            case "unity.BoxCollider2D":
                var box=(BoxCollider2D)actual;
                Require((box.size-Vec2(Field(data,"size",at),at+".size")).sqrMagnitude<1e-8f &&
                    (box.offset-Vec2(Field(data,"offset",at),at+".offset")).sqrMagnitude<1e-8f &&
                    box.isTrigger==Bool(Field(data,"isTrigger",at),at+".isTrigger") &&
                    Mathf.Abs(box.density-(float)Number(Field(data,"density",at),at+".density"))<.0001f &&
                    Mathf.Abs(box.edgeRadius-(float)Number(Field(data,"edgeRadius",at),at+".edgeRadius"))<.0001f,
                    at+": BoxCollider2D typed physics fields differ");
                break;
            case "unity.IceBlock":
                var ice=(IceBlock)actual;
                Require(ice.isInteractable==Bool(Field(data,"isInteractable",at),at+".isInteractable") &&
                    ice.isMelted==Bool(Field(data,"isMelted",at),at+".isMelted") &&
                    Approximately(ice.solidColor,Color(Field(data,"solidColor",at),at+".solidColor")) &&
                    Approximately(ice.meltedColor,Color(Field(data,"meltedColor",at),at+".meltedColor")),
                    at+": IceBlock typed fields differ");
                break;
            case "unity.ThermalControllerBlock":
                var thermal=(ThermalControllerBlock)actual;
                Require(thermal.isInteractable==Bool(Field(data,"isInteractable",at),at+".isInteractable") &&
                    (int)thermal.currentState==Int(Field(data,"currentState",at),at+".currentState") &&
                    thermal.terminalName==Text(Field(data,"terminalName",at),at+".terminalName") &&
                    Mathf.Abs(thermal.interactionRadius-(float)Number(Field(data,"interactionRadius",at),at+".interactionRadius"))<.0001f &&
                    Mathf.Abs(thermal.controlRadius-(float)Number(Field(data,"controlRadius",at),at+".controlRadius"))<.0001f &&
                    Approximately(thermal.coldFilterColor,Color(Field(data,"coldFilterColor",at),at+".coldFilterColor")) &&
                    Approximately(thermal.hotFilterColor,Color(Field(data,"hotFilterColor",at),at+".hotFilterColor")),
                    at+": ThermalControllerBlock typed fields differ");
                break;
        }
    }

    static bool Approximately(Color a,Color b) =>
        Mathf.Abs(a.r-b.r)<.0001f && Mathf.Abs(a.g-b.g)<.0001f &&
        Mathf.Abs(a.b-b.b)<.0001f && Mathf.Abs(a.a-b.a)<.0001f;
}
