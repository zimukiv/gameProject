using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

// One-time isolated build. It copies the real source Scene and bakes audited IDs only into the copy.
public static class PhysicsLevelPlaytestBuild
{
    const string SourceScene = "Assets/Scenes/Level1.unity";
    const string SourceMap = "Levels/SourceMaps/Level1.source.json";
    const string SourceSha = "208caa5ee0c2edb7fe3140ece317ccd0156957ad0ae89e2a738a3ccb2d396d34";
    const string MapSha = "e04f956b585c2725688e1fc61d3e7175656e54ad547fb3dc86cf68cffa62f624";
    const string LevelId = "unity:8012e3d1cdce7da499fa92e045ffd865";
    const string Marker = "PHYSICS_LEVEL_EDITOR_PHASE4A_ISOLATED";

    [Serializable] sealed class SceneSource { public string guid, sha256; }
    [Serializable] sealed class ObjectSource { public string objectId, sourceFileId, ownership; }
    [Serializable] sealed class Inventory
    {
        public int inventoryVersion;
        public string roomId;
        public SceneSource sourceScene;
        public ObjectSource[] objects;
    }
    [Serializable] sealed class RunnerManifest
    {
        public int runnerVersion = 1;
        public string roomId = "room1", levelId = LevelId, sourceSceneSha256 = SourceSha;
        public string[] allowedObjectIds;
        public string playerExe = "PhysicsLevelPlaytest.exe";
    }

    static string Root => Path.GetFullPath(Path.Combine(Application.dataPath, ".."));
    static string Absolute(string relative) => Path.Combine(Root, relative.Replace('/', Path.DirectorySeparatorChar));
    static string Sha(string path)
    {
        using (var stream = File.OpenRead(path))
        using (var sha = SHA256.Create())
            return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
    }
    static void Require(bool okay, string message)
    {
        if (!okay) throw new InvalidDataException(message);
    }
    static void CheckIsolation()
    {
        // Location is configurable for a clean checkout; the marker and separate
        // Company/Product below still prove this is the isolated project.
        string expected = Environment.GetEnvironmentVariable("PLE_ISOLATED_PROJECT");
        if (!string.IsNullOrWhiteSpace(expected))
            Require(string.Equals(Root.TrimEnd(Path.DirectorySeparatorChar),
                Path.GetFullPath(expected).TrimEnd(Path.DirectorySeparatorChar),
                StringComparison.OrdinalIgnoreCase),
                "PLE_ISOLATED_PROJECT does not match the open project");
        else
            Require(string.Equals(Path.GetFileName(Root.TrimEnd(Path.DirectorySeparatorChar)),
                "Phase4AIsolatedProject", StringComparison.OrdinalIgnoreCase),
                "Build requires an isolated Phase4AIsolatedProject directory or PLE_ISOLATED_PROJECT");
        string marker = Absolute("Phase4A.IsolatedProject.marker");
        Require(File.Exists(marker) && File.ReadAllText(marker).Trim() == Marker,
            "Isolated project marker is missing or wrong");
        Require(PlayerSettings.companyName == "MiniGame Team Phase4A Test" &&
            PlayerSettings.productName == "Physics Level Editor Phase4A Isolated",
            "Playtest must use a separate persistentDataPath");
        Require(!EditorApplication.isPlayingOrWillChangePlaymode && !SceneManager.GetActiveScene().isDirty,
            "Build requires Edit Mode and no unsaved active Scene changes");
        Require(Sha(Absolute(SourceScene)) == SourceSha, "Original isolated Level1 hash changed");
        Require(Sha(Absolute(SourceMap)) == MapSha, "Level1 SourceMap hash changed");
        Require(AssetDatabase.AssetPathToGUID(SourceScene) == "8012e3d1cdce7da499fa92e045ffd865",
            "Original isolated Scene GUID changed");
    }

    static IEnumerable<GameObject> Traverse(GameObject root)
    {
        yield return root;
        foreach (Transform child in root.transform)
            foreach (GameObject item in Traverse(child.gameObject)) yield return item;
    }

    [MenuItem("Physics Level Editor/Release First/Build isolated Room 1 playtest Player")]
    public static void BuildRoom1()
    {
        CheckIsolation();
        Inventory inventory = JsonUtility.FromJson<Inventory>(File.ReadAllText(Absolute(SourceMap)));
        Require(inventory != null && inventory.inventoryVersion == 1 && inventory.roomId == "room1" &&
            inventory.sourceScene != null && inventory.sourceScene.guid ==
            "8012e3d1cdce7da499fa92e045ffd865" && inventory.sourceScene.sha256 == SourceSha &&
            inventory.objects != null && inventory.objects.Length == 71,
            "Level1 SourceMap identity or object count is wrong");
        var byFileId = new Dictionary<string, ObjectSource>(StringComparer.Ordinal);
        var objectIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (ObjectSource item in inventory.objects)
            Require(item != null && !string.IsNullOrEmpty(item.objectId) &&
                !string.IsNullOrEmpty(item.sourceFileId) && byFileId.TryAdd(item.sourceFileId, item) &&
                objectIds.Add(item.objectId), "SourceMap duplicate or empty object identity");

        string stamp = DateTime.UtcNow.ToString("yyyyMMddTHHmmss", CultureInfo.InvariantCulture) + "_" +
            Guid.NewGuid().ToString("N").Substring(0, 8);
        string folder = "Assets/LevelEditorPlaytest/" + stamp;
        string copyPath = folder + "/Level1.unity";
        string buildDir = Absolute("Builds/LevelEditorPlaytest/" + stamp);
        string previous = SceneManager.GetActiveScene().path;
        bool copied = false;
        try
        {
            Directory.CreateDirectory(Absolute(folder));
            AssetDatabase.Refresh();
            Require(!File.Exists(Absolute(copyPath)) && AssetDatabase.CopyAsset(SourceScene, copyPath),
                "Unable to make a new test-only Level1 Scene copy");
            copied = true;
            Scene copy = EditorSceneManager.OpenScene(copyPath, OpenSceneMode.Single);
            var objects = copy.GetRootGameObjects().SelectMany(Traverse).ToArray();
            Require(objects.Length == 71, "Copied Scene object count differs from SourceMap");
            var found = new HashSet<string>(StringComparer.Ordinal);
            var allowed = new List<string>();
            foreach (GameObject go in objects)
            {
                string fileId = GlobalObjectId.GetGlobalObjectIdSlow(go).targetObjectId
                    .ToString(CultureInfo.InvariantCulture);
                Require(byFileId.TryGetValue(fileId, out ObjectSource source),
                    "Copied Scene has unknown fileID " + fileId + " (" + go.name + ")");
                Require(found.Add(fileId), "Copied Scene has duplicate fileID " + fileId);
                if (source.ownership != "A") continue;
                LevelObjectId marker = go.GetComponent<LevelObjectId>();
                Require(marker == null || marker.ObjectId == source.objectId,
                    "Conflicting existing LevelObjectId for " + fileId);
                if (marker == null) marker = go.AddComponent<LevelObjectId>();
                marker.SetId(source.objectId);
                allowed.Add(source.objectId);
            }
            Require(found.Count == byFileId.Count && allowed.Count == 33,
                "Not every source object or editable object was mapped");
            var bootstrap = new GameObject("Level Editor Playtest Bootstrap")
                .AddComponent<LevelEditorPlaytestBootstrap>();
            bootstrap.Configure(LevelId, SourceSha, allowed.OrderBy(x => x, StringComparer.Ordinal).ToArray());
            Require(EditorSceneManager.SaveScene(copy), "Could not save test-only Scene copy");
            Directory.CreateDirectory(buildDir);
            string exe = Path.Combine(buildDir, "PhysicsLevelPlaytest.exe");
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions {
                scenes = new[] { copyPath, "Assets/Scenes/MainMenu.unity",
                    "Assets/Scenes/Level2.unity", "Assets/Scenes/Level3.unity" },
                locationPathName = exe, target = BuildTarget.StandaloneWindows64,
                options = BuildOptions.None
            });
            Require(report != null && report.summary.result == BuildResult.Succeeded && File.Exists(exe),
                "Unity Player build failed; see Editor.log and BuildReport");
            File.WriteAllText(Path.Combine(buildDir, "runner-manifest.json"),
                JsonUtility.ToJson(new RunnerManifest {
                    allowedObjectIds = allowed.OrderBy(x => x, StringComparer.Ordinal).ToArray()
                }, true));
            Require(Sha(Absolute(SourceScene)) == SourceSha && Sha(Absolute(SourceMap)) == MapSha,
                "Source files changed during isolated build");
            Debug.Log("PLE_PLAYER_BUILD_PASS path=" + exe + " copy=" + copyPath +
                " ids=" + allowed.Count + " source=" + SourceSha);
        }
        catch (Exception error)
        {
            Debug.LogError("PLE_PLAYER_BUILD_FAIL copy=" + (copied ? copyPath : "none") +
                " buildDir=" + buildDir + " reason=" + error);
            throw;
        }
        finally
        {
            if (!string.IsNullOrEmpty(previous) && File.Exists(Absolute(previous)))
                EditorSceneManager.OpenScene(previous, OpenSceneMode.Single);
            else EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        }
    }
}
