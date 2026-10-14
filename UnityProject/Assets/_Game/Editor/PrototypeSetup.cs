using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.InputSystem;

namespace Minigame.EditorTools
{
    // Explicit one-time command; never runs automatically on editor startup.
    public static class PrototypeSetup
    {
        private const string Root = "Assets/_Game";
        private const string GameplayScene = Root + "/Scenes/A_GameplayTest.unity";

        [MenuItem("Minigame/T01 Create Initial Test Scenes")]
        public static void CreateInitialProject()
        {
            if (File.Exists(GameplayScene) || File.Exists(Root + "/Prefabs/Player.prefab"))
                throw new InvalidOperationException("Initial assets already exist. Open the scene; setup will not overwrite it.");

            foreach (string folder in new[] { "Scenes", "Prefabs", "Config", "Input", "Art/Placeholders", "Audio", "Scripts/Systems" })
                Directory.CreateDirectory(Root + "/" + folder);
            AssetDatabase.Refresh();
            ConfigureProject();

            var settings = ScriptableObject.CreateInstance<PlayerMovementSettings>();
            AssetDatabase.CreateAsset(settings, Root + "/Config/PlayerMovement_Default.asset");
            var material = new PhysicsMaterial2D("Player_NoFriction") { friction = 0f, bounciness = 0f };
            AssetDatabase.CreateAsset(material, Root + "/Config/Player_NoFriction.physicsMaterial2D");
            Sprite square = CreateSquareSprite();
            InputActionAsset controls = CreateControls();
            AssetDatabase.SaveAssets();
            settings = AssetDatabase.LoadAssetAtPath<PlayerMovementSettings>(Root + "/Config/PlayerMovement_Default.asset");

            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            GameObject player = CreatePlayer(settings, material, square, controls);
            GameObject prefab = PrefabUtility.SaveAsPrefabAsset(player, Root + "/Prefabs/Player.prefab");
            UnityEngine.Object.DestroyImmediate(player);
            player = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
            player.AddComponent<SandboxReset>(); // deliberately absent from the reusable prefab
            CreateCamera(player.transform);

            Block("Ground", new Vector2(3f, -1.5f), new Vector2(30f, 1f), square);
            Block("Step_01", new Vector2(4f, -0.6f), new Vector2(2f, 0.8f), square);
            Block("Step_02", new Vector2(8f, 0f), new Vector2(2f, 0.8f), square);
            Block("Step_03", new Vector2(12f, 0.6f), new Vector2(2f, 0.8f), square);
            Block("Wall", new Vector2(16f, 0.75f), new Vector2(1f, 3.5f), square);
            Block("LowCeiling", new Vector2(-5f, 2.1f), new Vector2(4f, 0.5f), square);
            var spawn = new GameObject("SpawnMarker_TestOnly");
            spawn.transform.position = player.transform.position;
            EditorSceneManager.SaveScene(UnityEngine.SceneManagement.SceneManager.GetActiveScene(), GameplayScene);

            CreateEmptyScene(Root + "/Scenes/B_SystemTest.unity");
            CreateEmptyScene(Root + "/Scenes/Prototype.unity");
            // Only the A sandbox is runnable at this stage; T07 will replace it.
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(GameplayScene, true) };
            AssetDatabase.SaveAssets();
            EditorSceneManager.OpenScene(GameplayScene);
            Debug.Log("T01/T02_SETUP_OK: three scenes, configured player prefab and shared data created.");
        }

        private static void ConfigureProject()
        {
            EditorSettings.serializationMode = SerializationMode.ForceText;
            VersionControlSettings.mode = "Visible Meta Files";
            EditorSettings.defaultBehaviorMode = EditorBehaviorMode.Mode2D;
            PlayerSettings.companyName = "MinigameTeam";
            PlayerSettings.productName = "Minigame Prototype";
            PlayerSettings.defaultScreenWidth = 1280;
            PlayerSettings.defaultScreenHeight = 720;
            PlayerSettings.fullScreenMode = FullScreenMode.Windowed;
            PlayerSettings.runInBackground = true;
            Time.fixedDeltaTime = 0.02f;
            Physics2D.gravity = new Vector2(0f, -9.81f);
            var tags = new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/TagManager.asset")[0]);
            SerializedProperty layers = tags.FindProperty("layers");
            layers.GetArrayElementAtIndex(8).stringValue = "Ground";
            layers.GetArrayElementAtIndex(9).stringValue = "Player";
            tags.ApplyModifiedPropertiesWithoutUndo();
        }

        private static Sprite CreateSquareSprite()
        {
            const string path = Root + "/Art/Placeholders/Square.png";
            var texture = new Texture2D(16, 16);
            var pixels = new Color[256];
            Array.Fill(pixels, Color.white);
            texture.SetPixels(pixels);
            texture.Apply();
            File.WriteAllBytes(path, texture.EncodeToPNG());
            UnityEngine.Object.DestroyImmediate(texture);
            AssetDatabase.ImportAsset(path);
            var importer = (TextureImporter)AssetImporter.GetAtPath(path);
            importer.textureType = TextureImporterType.Sprite;
            importer.spriteImportMode = SpriteImportMode.Single;
            importer.spritePixelsPerUnit = 16;
            importer.filterMode = FilterMode.Point;
            importer.textureCompression = TextureImporterCompression.Uncompressed;
            importer.SaveAndReimport();
            return AssetDatabase.LoadAssetAtPath<Sprite>(path);
        }

        private static InputActionAsset CreateControls()
        {
            const string path = Root + "/Input/PlayerControls.inputactions";
            var asset = ScriptableObject.CreateInstance<InputActionAsset>();
            asset.name = "PlayerControls";
            var map = new InputActionMap("Player");
            asset.AddActionMap(map);
            var move = map.AddAction("Move", InputActionType.Value, expectedControlLayout: "Axis");
            move.AddCompositeBinding("1DAxis").With("Negative", "<Keyboard>/a").With("Positive", "<Keyboard>/d");
            move.AddCompositeBinding("1DAxis").With("Negative", "<Keyboard>/leftArrow").With("Positive", "<Keyboard>/rightArrow");
            var jump = map.AddAction("Jump", InputActionType.Button);
            jump.AddBinding("<Keyboard>/space");
            jump.AddBinding("<Keyboard>/w");
            File.WriteAllText(path, asset.ToJson());
            UnityEngine.Object.DestroyImmediate(asset);
            AssetDatabase.ImportAsset(path);
            return AssetDatabase.LoadAssetAtPath<InputActionAsset>(path);
        }

        private static GameObject CreatePlayer(PlayerMovementSettings settings, PhysicsMaterial2D material,
            Sprite square, InputActionAsset controls)
        {
            var player = new GameObject("Player") { layer = 9, tag = "Player" };
            var body = player.AddComponent<Rigidbody2D>();
            body.gravityScale = settings.gravityScale;
            body.constraints = RigidbodyConstraints2D.FreezeRotation;
            body.interpolation = RigidbodyInterpolation2D.Interpolate;
            body.collisionDetectionMode = CollisionDetectionMode2D.Continuous;
            var collider = player.AddComponent<CapsuleCollider2D>();
            collider.size = new Vector2(0.8f, 1.6f);
            collider.sharedMaterial = material;
            var input = player.AddComponent<PlayerInputReader>();
            SetObject(input, "controls", controls);
            var motor = player.AddComponent<PlayerMotor2D>();
            SetObject(motor, "settings", settings);
            var serialized = new SerializedObject(motor);
            serialized.FindProperty("groundLayers").intValue = 1 << 8;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            var visual = new GameObject("Visual");
            visual.transform.SetParent(player.transform, false);
            visual.transform.localScale = new Vector3(0.8f, 1.6f, 1f);
            var renderer = visual.AddComponent<SpriteRenderer>();
            renderer.sprite = square;
            renderer.color = new Color(0.25f, 0.82f, 0.98f);
            renderer.sortingOrder = 1;
            return player;
        }

        private static void CreateCamera(Transform target)
        {
            var go = new GameObject("Main Camera") { tag = "MainCamera" };
            var camera = go.AddComponent<Camera>();
            camera.orthographic = true;
            camera.orthographicSize = 5f;
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.06f, 0.08f, 0.13f);
            go.transform.position = new Vector3(2f, 1f, -10f);
            go.AddComponent<AudioListener>();
            if (target != null)
                SetObject(go.AddComponent<CameraFollow2D>(), "target", target);
        }

        private static void Block(string name, Vector2 position, Vector2 size, Sprite sprite)
        {
            var go = new GameObject(name) { layer = 8 };
            go.transform.position = position;
            go.transform.localScale = new Vector3(size.x, size.y, 1f);
            var renderer = go.AddComponent<SpriteRenderer>();
            renderer.sprite = sprite;
            renderer.color = new Color(0.42f, 0.48f, 0.59f);
            go.AddComponent<BoxCollider2D>();
        }

        private static void CreateEmptyScene(string path)
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            CreateCamera(null);
            EditorSceneManager.SaveScene(UnityEngine.SceneManagement.SceneManager.GetActiveScene(), path);
        }

        private static void SetObject(UnityEngine.Object component, string field, UnityEngine.Object value)
        {
            if (value == null)
                throw new InvalidOperationException("Missing setup reference: " + field);
            var serialized = new SerializedObject(component);
            serialized.Update();
            serialized.FindProperty(field).objectReferenceValue = value;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(component);
            var verify = new SerializedObject(component);
            if (verify.FindProperty(field).objectReferenceValue != value)
                throw new InvalidOperationException("Setup reference was not applied: " + field);
        }

        public static void ValidateInitialProject()
        {
            var settings = AssetDatabase.LoadAssetAtPath<PlayerMovementSettings>(Root + "/Config/PlayerMovement_Default.asset");
            var controls = AssetDatabase.LoadAssetAtPath<InputActionAsset>(Root + "/Input/PlayerControls.inputactions");
            var player = AssetDatabase.LoadAssetAtPath<GameObject>(Root + "/Prefabs/Player.prefab");
            if (settings == null || controls == null || player == null)
                throw new InvalidOperationException("A required initial asset is missing.");
            if (new SerializedObject(player.GetComponent<PlayerInputReader>()).FindProperty("controls").objectReferenceValue != controls ||
                new SerializedObject(player.GetComponent<PlayerMotor2D>()).FindProperty("settings").objectReferenceValue != settings)
                throw new InvalidOperationException("Player prefab references are missing.");
            if (player.GetComponent<SandboxReset>() != null)
                throw new InvalidOperationException("Sandbox reset must stay out of the reusable prefab.");
            EditorSceneManager.OpenScene(GameplayScene);
            if (UnityEngine.Object.FindAnyObjectByType<SandboxReset>() == null || Camera.main == null)
                throw new InvalidOperationException("A gameplay scene helper is missing.");
            Debug.Log("T01_T02_VALIDATION_OK: persistent references, test-only reset and camera verified.");
        }
    }
}
