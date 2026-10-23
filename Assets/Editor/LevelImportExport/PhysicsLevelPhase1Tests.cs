using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

public static class PhysicsLevelPhase1Tests
{
    private const string SourceScene = "Assets/Scenes/Level1.unity";
    private const string MarkerPath = "Tools/PhysicsLevelEditor/tests/phase1-isolation.json";
    private const float FloatTolerance = 0.00001f;

    [Serializable]
    private sealed class IsolationMarker
    {
        public int markerVersion = 0;
        public string sourceRoot = string.Empty;
        public string isolatedRoot = string.Empty;
        public string level1Sha256 = string.Empty;
    }

    private static string ProjectRoot => Path.GetFullPath(Path.Combine(Application.dataPath, ".."))
        .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
    private static string SessionKey => "PhysicsLevelPhase1." + ProjectRoot.ToLowerInvariant();

    [MenuItem("Physics Level Editor/Phase 1/Run isolated data roundtrip")]
    public static void Run()
    {
        SessionState.SetBool(SessionKey + ".dataPassed", false);
        SessionState.EraseString(SessionKey + ".scene");
        try
        {
            AssertIsolated();
            AssertAllScenesClean();
        }
        catch (Exception preflightError)
        {
            Debug.LogError("PHASE1_DATA_STATUS=FAIL; PHASE1_PLAY_STATUS=NOT_RUN; preflight=" + preflightError.Message);
            return;
        }
        Debug.Log("PHASE1_DATA_STATUS=RUNNING; PHASE1_PLAY_STATUS=NOT_RUN");

        string runId = DateTime.UtcNow.ToString("yyyyMMddTHHmmssfff") + "_" + Guid.NewGuid().ToString("N");
        string runRoot = "Tools/PhysicsLevelEditor/tests/runs/" + runId;
        string copiedScenePath = "Assets/Scenes/LevelEditorRoundTrip_Phase1_Copy_" + runId + ".unity";
        string importedScenePath = "Assets/Scenes/LevelEditorRoundTrip_Phase1_" + runId + ".unity";
        string originalHash = null;
        Exception failure = null;
        string successDetails = null;
        try
        {
            if (Directory.Exists(runRoot) || File.Exists(copiedScenePath) || File.Exists(importedScenePath))
                throw new IOException("Unique Phase 1 output path unexpectedly exists; nothing was overwritten.");
            originalHash = Sha256(SourceScene);
            Directory.CreateDirectory(runRoot);
            string sidecarPath = runRoot + "/source.ids.json";
            File.Copy(PhysicsLevelExport.SidecarPath, sidecarPath);

            Scene source = EditorSceneManager.OpenScene(SourceScene, OpenSceneMode.Single);
            var sourceObjects = new[] { UniqueRoot(source, "Start ground"), UniqueRoot(source, "Air vent"),
                UniqueRoot(source, "Token 3") };
            string firstPath = runRoot + "/source.json";
            var first = PhysicsLevelExport.ExportObjects(source, sourceObjects, firstPath, sidecarPath, null);
            PhysicsLevelImport.Validate(first);
            var repeated = PhysicsLevelExport.ExportObjects(source, sourceObjects,
                runRoot + "/repeated.json", sidecarPath, first.levelId);
            AssertSemantics(first, repeated, "repeated source export");

            if (File.Exists(copiedScenePath) || !AssetDatabase.CopyAsset(SourceScene, copiedScenePath))
                throw new IOException("Could not create a new uniquely named copied scene.");
            AssetDatabase.Refresh();
            Scene copied = EditorSceneManager.OpenScene(copiedScenePath, OpenSceneMode.Single);
            var copyVent = UniqueRoot(copied, "Air vent");
            bool rejected = false;
            try
            {
                PhysicsLevelExport.ExportObjects(copied, new[] { copyVent },
                    runRoot + "/rejected-copy.json", sidecarPath, null);
            }
            catch (InvalidDataException) { rejected = true; }
            if (!rejected) throw new Exception("A copied scene accepted the original scene's ID sidecar.");

            string copyIds = runRoot + "/copy.ids.json";
            var beforeRename = PhysicsLevelExport.ExportObjects(copied, new[] { copyVent },
                runRoot + "/before-rename.json", copyIds, null);
            string originalName = copyVent.name;
            try
            {
                copyVent.name = "Renamed vent for identity test";
                var afterRename = PhysicsLevelExport.ExportObjects(copied, new[] { copyVent },
                    runRoot + "/after-rename.json", copyIds, null);
                if (afterRename.objects[0].id != beforeRename.objects[0].id)
                    throw new Exception("Renaming changed a copied object's stable ID.");
            }
            finally
            {
                copyVent.name = originalName;
                if (!EditorSceneManager.SaveScene(copied))
                    throw new IOException("Could not save the restored copied scene.");
            }

            var copyToken = UniqueRoot(copied, "Token 3");
            var duplicate = UnityEngine.Object.Instantiate(copyToken);
            duplicate.name = "Copied token for identity test";
            if (!EditorSceneManager.SaveScene(copied))
                throw new IOException("Could not save the copied-object test scene.");
            var copyData = PhysicsLevelExport.ExportObjects(copied, new[] { copyToken, duplicate },
                runRoot + "/copied-objects.json", copyIds, null);
            var sourceIds = new HashSet<string>(first.objects.Select(o => o.id));
            if (copyData.objects.Length != 2 || copyData.objects.Select(o => o.id).Distinct().Count() != 2 ||
                copyData.objects.Any(o => sourceIds.Contains(o.id)))
                throw new Exception("A copied scene or copied object reused a source object ID.");

            PhysicsLevelImport.ImportNewScene(firstPath, importedScenePath);
            Scene imported = SceneManager.GetActiveScene();
            var created = imported.GetRootGameObjects();
            if (created.Length != 3 || created.Any(go => go.GetComponent<LevelObjectId>() == null))
                throw new Exception("Importer did not create exactly three identified Unity objects.");
            var reexported = PhysicsLevelExport.ExportObjects(imported, created,
                runRoot + "/roundtrip.json", runRoot + "/imported.ids.json", first.levelId);
            PhysicsLevelImport.Validate(reexported);
            AssertSemantics(first, reexported, "Unity import and re-export");
            AddPlaytestFixture(imported, created, first);
            if (!EditorSceneManager.SaveScene(imported))
                throw new IOException("Could not save the isolated playtest scene.");

            successDetails = "objects=3; source=" + firstPath + "; roundtrip=" +
                runRoot + "/roundtrip.json; scene=" + importedScenePath;
        }
        catch (Exception error) { failure = error; }
        finally
        {
            Scene active = SceneManager.GetActiveScene();
            if (active.IsValid() && active.isDirty &&
                (active.path == copiedScenePath || active.path == importedScenePath || string.IsNullOrEmpty(active.path)))
            {
                try
                {
                    string safePath = string.IsNullOrEmpty(active.path)
                        ? "Assets/Scenes/LevelEditorRoundTrip_Phase1_Failed_" + runId + ".unity"
                        : active.path;
                    if (File.Exists(safePath) && safePath != active.path)
                        throw new IOException("Failure-scene output path already exists.");
                    if (!EditorSceneManager.SaveScene(active, safePath)) throw new IOException("SaveScene returned false.");
                    if (safePath != copiedScenePath && safePath != importedScenePath)
                        Debug.LogWarning("PHASE1_DATA_RECOVERY_SCENE=" + safePath);
                }
                catch (Exception cleanupError)
                {
                    failure = failure == null ? cleanupError : new AggregateException(failure, cleanupError);
                }
            }
            if (originalHash != null)
            {
                try
                {
                    if (Sha256(SourceScene) != originalHash)
                        throw new IOException("Source Level1 changed during the test.");
                }
                catch (Exception hashError)
                {
                    failure = failure == null ? hashError : new AggregateException(failure, hashError);
                }
            }
        }
        if (failure != null)
        {
            SessionState.SetBool(SessionKey + ".dataPassed", false);
            Debug.LogError("PHASE1_DATA_STATUS=FAIL; PHASE1_PLAY_STATUS=NOT_RUN; " +
                "run=" + runRoot + "; reason=" + failure);
        }
        else
        {
            SessionState.SetString(SessionKey + ".scene", importedScenePath);
            SessionState.SetBool(SessionKey + ".dataPassed", true);
            Debug.Log("PHASE1_DATA_STATUS=PASS; PHASE1_PLAY_STATUS=NOT_RUN; " + successDetails);
        }
    }

    [MenuItem("Physics Level Editor/Phase 1/Play isolated test scene")]
    public static void PlayIsolatedTestScene()
    {
        try
        {
            AssertIsolated();
            AssertAllScenesClean();
            string scenePath = SessionState.GetString(SessionKey + ".scene", "");
            if (!SessionState.GetBool(SessionKey + ".dataPassed", false) ||
                !scenePath.StartsWith("Assets/Scenes/LevelEditorRoundTrip_Phase1_", StringComparison.Ordinal) ||
                !File.Exists(scenePath))
                throw new InvalidOperationException("Run the isolated data roundtrip successfully in this Editor session first.");
            EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
            Debug.Log("PHASE1_DATA_STATUS=PASS; PHASE1_PLAY_STATUS=RUNNING; scene=" + scenePath);
            EditorApplication.isPlaying = true;
        }
        catch (Exception error)
        {
            Debug.LogError("PHASE1_PLAY_STATUS=NOT_RUN; reason=" + error.Message);
        }
    }

    private static void AssertIsolated()
    {
        string root = ProjectRoot;
        string workingDirectory = Path.GetFullPath(Directory.GetCurrentDirectory())
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        if (!string.Equals(root, workingDirectory, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Unity working directory is not the isolated project root.");
        if (Directory.Exists(Path.Combine(root, ".git")) || File.Exists(Path.Combine(root, ".git")))
            throw new InvalidOperationException("Phase 1 tests refuse to run in a Git working tree.");
        string markerFile = Path.Combine(root, MarkerPath);
        if (!File.Exists(markerFile)) throw new InvalidOperationException("Isolation marker missing. Use the preparation script.");
        var marker = JsonUtility.FromJson<IsolationMarker>(File.ReadAllText(markerFile));
        if (marker == null || marker.markerVersion != 1 || string.IsNullOrWhiteSpace(marker.sourceRoot) ||
            string.IsNullOrWhiteSpace(marker.isolatedRoot) || string.IsNullOrWhiteSpace(marker.level1Sha256))
            throw new InvalidDataException("Isolation marker is incomplete.");
        string source = Path.GetFullPath(marker.sourceRoot).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        string markedRoot = Path.GetFullPath(marker.isolatedRoot).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        if (!string.Equals(root, markedRoot, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(root, source, StringComparison.OrdinalIgnoreCase) ||
            !Directory.Exists(Path.Combine(source, ".git")) && !File.Exists(Path.Combine(source, ".git")) ||
            !string.Equals(Sha256(Path.Combine(source, SourceScene)), marker.level1Sha256, StringComparison.OrdinalIgnoreCase) ||
            !string.Equals(Sha256(Path.Combine(root, SourceScene)), marker.level1Sha256, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Isolation path or Level1 copy no longer matches the source manifest.");
    }

    private static void AssertAllScenesClean()
    {
        if (EditorApplication.isPlayingOrWillChangePlaymode)
            throw new InvalidOperationException("Leave Play Mode before running the data test.");
        for (int index = 0; index < SceneManager.sceneCount; index++)
            if (SceneManager.GetSceneAt(index).isDirty)
                throw new InvalidOperationException("Save or discard current scene edits before running Phase 1 tests.");
    }

    private static GameObject UniqueRoot(Scene scene, string name)
    {
        var matches = scene.GetRootGameObjects().Where(go => go.name == name).ToArray();
        if (matches.Length != 1) throw new InvalidDataException("Expected exactly one source object: " + name);
        return matches[0];
    }

    private static string Sha256(string path)
    {
        using (var sha = SHA256.Create())
        using (var stream = File.OpenRead(path))
            return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
    }

    private static void AssertSemantics(LevelDataV1 expected, LevelDataV1 actual, string label)
    {
        var differences = new List<string>();
        Check(differences, "formatVersion", expected.formatVersion, actual.formatVersion);
        Check(differences, "coverage", expected.coverage, actual.coverage);
        Check(differences, "levelId", expected.levelId, actual.levelId);
        Check(differences, "object count", expected.objects.Length, actual.objects.Length);
        var byId = actual.objects.ToDictionary(o => o.id);
        foreach (var left in expected.objects)
        {
            if (!byId.TryGetValue(left.id, out var right))
            {
                differences.Add("missing object ID " + left.id);
                continue;
            }
            string path = left.id;
            Check(differences, path + ".name", left.name, right.name);
            Check(differences, path + ".kind", left.kind, right.kind);
            Check(differences, path + ".parentId", left.parentId, right.parentId);
            Check(differences, path + ".active", left.active, right.active);
            Check(differences, path + ".layer", left.layer, right.layer);
            CheckVector3(differences, path + ".localPosition", left.localPosition, right.localPosition);
            CheckFloat(differences, path + ".localRotationZ", left.localRotationZ, right.localRotationZ);
            CheckVector3(differences, path + ".localScale", left.localScale, right.localScale);
            Check(differences, path + ".component count", left.components.Length, right.components.Length);
            var components = right.components.ToDictionary(c => c.typeId);
            foreach (var a in left.components)
            {
                string componentPath = path + "." + a.typeId;
                if (!components.TryGetValue(a.typeId, out var b))
                {
                    differences.Add("missing component " + componentPath);
                    continue;
                }
                Check(differences, componentPath + ".version", a.version, b.version);
                Check(differences, componentPath + ".enabled", a.enabled, b.enabled);
                if (a.typeId == "visual.sprite")
                {
                    Check(differences, componentPath + ".assetGuid", a.sprite.assetGuid, b.sprite.assetGuid);
                    Check(differences, componentPath + ".localFileId", a.sprite.localFileId, b.sprite.localFileId);
                    Check(differences, componentPath + ".sortingOrder", a.sprite.sortingOrder, b.sprite.sortingOrder);
                    CheckFloat(differences, componentPath + ".color.r", a.sprite.color.r, b.sprite.color.r);
                    CheckFloat(differences, componentPath + ".color.g", a.sprite.color.g, b.sprite.color.g);
                    CheckFloat(differences, componentPath + ".color.b", a.sprite.color.b, b.sprite.color.b);
                    CheckFloat(differences, componentPath + ".color.a", a.sprite.color.a, b.sprite.color.a);
                }
                if (a.typeId == "physics.boxCollider2d")
                {
                    CheckVector2(differences, componentPath + ".size", a.collider.size, b.collider.size);
                    CheckVector2(differences, componentPath + ".offset", a.collider.offset, b.collider.offset);
                    Check(differences, componentPath + ".isTrigger", a.collider.isTrigger, b.collider.isTrigger);
                }
                if (a.typeId == "physics.airVent")
                {
                    CheckVector2(differences, componentPath + ".ventDirection", a.airVent.ventDirection, b.airVent.ventDirection);
                    CheckFloat(differences, componentPath + ".upwardForce", a.airVent.upwardForce, b.airVent.upwardForce);
                    Check(differences, componentPath + ".isInteractable", a.airVent.isInteractable, b.airVent.isInteractable);
                    Check(differences, componentPath + ".guideText", a.airVent.guideText, b.airVent.guideText);
                    Check(differences, componentPath + ".isContinuous", a.airVent.isContinuous, b.airVent.isContinuous);
                }
                if (a.typeId == "item.token")
                {
                    Check(differences, componentPath + ".scoreAmount", a.token.scoreAmount, b.token.scoreAmount);
                    Check(differences, componentPath + ".tokenAmount", a.token.tokenAmount, b.token.tokenAmount);
                }
            }
        }
        foreach (var extra in actual.objects.Where(o => expected.objects.All(e => e.id != o.id)))
            differences.Add("unexpected object ID " + extra.id);
        if (differences.Count != 0)
            throw new InvalidDataException(label + " differs (float tolerance " + FloatTolerance + "):\n" +
                string.Join("\n", differences.Take(60)) +
                (differences.Count > 60 ? "\n... " + (differences.Count - 60) + " more differences" : ""));
        Debug.Log("PHASE1_SEMANTIC_PASS: " + label + "; objects=" + expected.objects.Length +
            "; floatTolerance=" + FloatTolerance);
    }

    private static void Check<T>(List<string> differences, string path, T expected, T actual)
    {
        if (!EqualityComparer<T>.Default.Equals(expected, actual))
            differences.Add(path + ": expected=" + expected + ", actual=" + actual);
    }

    private static void CheckFloat(List<string> differences, string path, float expected, float actual)
    {
        if (!float.IsNaN(expected) && !float.IsNaN(actual) && Mathf.Abs(expected - actual) <= FloatTolerance) return;
        differences.Add(path + ": expected=" + expected + ", actual=" + actual);
    }

    private static void CheckVector2(List<string> differences, string path, Vector2 expected, Vector2 actual)
    {
        CheckFloat(differences, path + ".x", expected.x, actual.x);
        CheckFloat(differences, path + ".y", expected.y, actual.y);
    }

    private static void CheckVector3(List<string> differences, string path, Vector3 expected, Vector3 actual)
    {
        CheckFloat(differences, path + ".x", expected.x, actual.x);
        CheckFloat(differences, path + ".y", expected.y, actual.y);
        CheckFloat(differences, path + ".z", expected.z, actual.z);
    }

    private static GameObject FindImportedObject(LevelDataV1 data, GameObject[] created,
        string kind, Type exactComponentType)
    {
        var records = data.objects.Where(item => item.kind == kind).ToArray();
        if (records.Length != 1)
            throw new InvalidDataException("Expected exactly one " + kind + " data record; found " +
                records.Length + ". Records: " + string.Join("; ", data.objects.Select(item =>
                    item.name + " [id=" + item.id + ", kind=" + item.kind + "]")) +
                ". Imported objects: " + DescribeImportedObjects(created));

        string expectedId = records[0].id;
        var matches = created.Where(go => go != null &&
            go.GetComponent<LevelObjectId>()?.ObjectId == expectedId).ToArray();
        int exactComponentMatches = matches.Length == 1
            ? matches[0].GetComponents<Component>().Count(component =>
                component != null && component.GetType() == exactComponentType) : 0;
        if (matches.Length != 1 || exactComponentMatches != 1)
            throw new InvalidDataException("Expected exactly one imported " + kind + " object with ID " +
                expectedId + " and exact component " + exactComponentType.Name + "; objectMatches=" +
                matches.Length + ", exactComponentMatches=" + exactComponentMatches +
                ". Imported objects: " + DescribeImportedObjects(created));
        return matches[0];
    }

    private static string DescribeImportedObjects(GameObject[] created)
    {
        return string.Join("; ", created.Select(go => go == null ? "<null object>" :
            go.name + " [id=" + (go.GetComponent<LevelObjectId>()?.ObjectId ?? "<missing>") +
            ", components=" + string.Join(",", go.GetComponents<Component>().Select(component =>
                component == null ? "<missing script>" : component.GetType().Name)) + "]"));
    }

    private static void AddPlaytestFixture(Scene scene, GameObject[] created, LevelDataV1 importedData)
    {
        var platform = FindImportedObject(importedData, created, "platform", typeof(BaseBlock));
        var vent = FindImportedObject(importedData, created, "airVent", typeof(AirVentBlock));
        var token = FindImportedObject(importedData, created, "token", typeof(TokenItem));
        var player = new GameObject("Phase 1 test player");
        player.tag = "Player";
        player.transform.position = new Vector3(-5f, -1f, 0f);
        player.transform.localScale = new Vector3(.8f, 1.3f, 1f);
        player.AddComponent<SpriteRenderer>().sprite = AssetDatabase.LoadAssetAtPath<Sprite>("Assets/WhiteSquare.png");
        var body = player.AddComponent<Rigidbody2D>();
        body.gravityScale = 3f;
        body.freezeRotation = true;
        body.collisionDetectionMode = CollisionDetectionMode2D.Continuous;
        player.AddComponent<BoxCollider2D>();
        var controller = player.AddComponent<PlayerController>();
        controller.groundLayer = 1 << 8;
        controller.normalColliderSize = Vector2.one;
        controller.crouchColliderSize = new Vector2(1f, .55f);
        controller.crouchColliderOffset = new Vector2(0f, -.22f);
        var foot = new GameObject("Ground Check");
        foot.transform.SetParent(player.transform, false);
        foot.transform.localPosition = new Vector3(0f, -.55f, 0f);
        controller.groundCheck = foot.transform;
        var bootstrap = new GameObject("Phase 1 test bootstrap").AddComponent<SceneBootstrap>();
        bootstrap.levelIndex = 1;
        bootstrap.spawnPosition = player.transform.position;
        var probe = new GameObject("Phase 1 playtest probe").AddComponent<Phase1PlaytestProbe>();
        probe.player = controller;
        probe.platform = platform.GetComponent<BoxCollider2D>();
        probe.vent = vent.GetComponent<AirVentBlock>();
        probe.token = token.GetComponent<TokenItem>();
    }
}
