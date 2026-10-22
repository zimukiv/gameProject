using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEditor.Events;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

/// <summary>Generates the complete playable prototype from code and registers its scenes.</summary>
public static class MiniGameAutoSetup
{
    private static Sprite sprite;
    private static readonly Color physics = new Color(.12f, .18f, .28f);
    private static readonly Color maths = new Color(.92f, .92f, .87f);
    private static readonly Color slacker = new Color(.32f, .23f, .34f);

    [InitializeOnLoadMethod]
    private static void BuildWhenImported()
    {
        EditorApplication.delayCall += () =>
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode) return;
            string[] paths = { "MainMenu", "Level1", "Level2", "Level3" };
            int existing = 0;
            foreach (string name in paths)
                if (File.Exists("Assets/Scenes/" + name + ".unity")) existing++;
            if (existing == 0) BuildAllScenes();
            else if (existing < paths.Length)
                Debug.LogWarning("MiniGame: some generated scenes are missing; use MiniGame/Rebuild generated scenes after saving any scene edits.");
        };
    }

    [MenuItem("MiniGame/Rebuild generated scenes")]
    public static void ManualBuild()
    {
        if (File.Exists("Assets/Scenes/MainMenu.unity") &&
            !EditorUtility.DisplayDialog("Rebuild generated scenes",
                "This replaces MainMenu and all three generated level scenes. Continue?", "Rebuild", "Cancel")) return;
        BuildAllScenes();
    }

    public static void BuildAllScenes()
    {
        Directory.CreateDirectory("Assets/Scenes");
        if (LayerMask.NameToLayer("Ground") != 8)
            throw new System.InvalidOperationException("Ground must be layer 8 in ProjectSettings/TagManager.asset.");
        sprite = WhiteSprite();
        BuildMenu();
        for (int i = 1; i <= 3; i++) BuildLevel(i);
        var scenes = new List<EditorBuildSettingsScene> { new EditorBuildSettingsScene("Assets/Scenes/MainMenu.unity", true) };
        for (int i = 1; i <= 3; i++) scenes.Add(new EditorBuildSettingsScene("Assets/Scenes/Level" + i + ".unity", true));
        EditorBuildSettings.scenes = scenes.ToArray();
        EditorSceneManager.OpenScene("Assets/Scenes/MainMenu.unity");
        AssetDatabase.SaveAssets();
        Debug.Log("MiniGame: MainMenu and all three levels are ready.");
    }

    private static Sprite WhiteSprite()
    {
        const string path = "Assets/WhiteSquare.png";
        if (!File.Exists(path))
        {
            var texture = new Texture2D(16, 16);
            var pixels = new Color[256];
            for (int i = 0; i < pixels.Length; i++) pixels[i] = Color.white;
            texture.SetPixels(pixels);
            texture.Apply();
            File.WriteAllBytes(path, texture.EncodeToPNG());
            AssetDatabase.ImportAsset(path);
        }
        var importer = (TextureImporter)AssetImporter.GetAtPath(path);
        importer.textureType = TextureImporterType.Sprite;
        importer.spritePixelsPerUnit = 16;
        importer.SaveAndReimport();
        return AssetDatabase.LoadAssetAtPath<Sprite>(path);
    }

    private static GameObject Square(string name, Vector2 pos, Vector2 size, Color color, bool solid = false)
    {
        var go = new GameObject(name);
        go.transform.position = pos;
        go.transform.localScale = new Vector3(size.x, size.y, 1);
        var renderer = go.AddComponent<SpriteRenderer>();
        renderer.sprite = sprite;
        renderer.color = color;
        if (solid)
        {
            go.layer = 8;
            go.AddComponent<BoxCollider2D>();
            go.AddComponent<BaseBlock>();
        }
        return go;
    }

    private static GameObject Trigger(string name, Vector2 pos, Vector2 size, Color color)
    {
        var go = Square(name, pos, size, color);
        go.AddComponent<BoxCollider2D>().isTrigger = true;
        return go;
    }

    private static void Managers(int level)
    {
        new GameObject("Scene Bootstrap").AddComponent<SceneBootstrap>().levelIndex = level;
    }

    private static void BuildMenu()
    {
        var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
        Camera.main.backgroundColor = physics;
        Camera.main.orthographic = true;
        Camera.main.orthographicSize = 6;
        Managers(0);
        var actions = new GameObject("Menu Actions").AddComponent<MenuActions>();
        var canvas = Canvas("Menu Canvas");
        TextLabel(canvas.transform, "AI 大人，拜托了", new Vector2(0, 260), 52, Color.white, 700, TextAnchor.MiddleCenter);
        TextLabel(canvas.transform, "收集 Token · 启动 AI · 逃离三门课程", new Vector2(0, 205), 22, Color.cyan, 700, TextAnchor.MiddleCenter);
        var newGame = Button(canvas.transform, "新游戏", new Vector2(0, 105), new Color(.16f, .7f, .75f));
        UnityEventTools.AddPersistentListener(newGame.onClick, actions.NewGame);
        var continueGame = Button(canvas.transform, "继续游戏", new Vector2(0, 40), new Color(.25f, .62f, .4f));
        UnityEventTools.AddPersistentListener(continueGame.onClick, actions.ContinueGame);
        var menuUI = new GameObject("Menu UI").AddComponent<UIManager>();
        menuUI.continueGameButton = continueGame;
        menuUI.newGameButton = newGame;
        menuUI.bestScoreText = TextLabel(canvas.transform, "最高得分  0", new Vector2(0, 155), 20, Color.white, 500, TextAnchor.MiddleCenter);
        menuUI.levelCards = new Image[3];
        string[] names = { "1 物理", "2 高数", "3 水课" };
        for (int i = 0; i < 3; i++)
        {
            int index = i + 1;
            var card = Button(canvas.transform, names[i], new Vector2((i - 1) * 210, -85), Color.gray);
            if (index == 1) UnityEventTools.AddPersistentListener(card.onClick, actions.LoadLevel1);
            else if (index == 2) UnityEventTools.AddPersistentListener(card.onClick, actions.LoadLevel2);
            else UnityEventTools.AddPersistentListener(card.onClick, actions.LoadLevel3);
            menuUI.levelCards[i] = card.GetComponent<Image>();
        }
        UnityEventTools.AddPersistentListener(Button(canvas.transform, "切换全屏", new Vector2(0, -175), Color.gray).onClick, actions.ToggleFullscreen);
        VolumeSlider(canvas.transform, new Vector2(0, -240), actions);
        TextLabel(canvas.transform, "音量", new Vector2(-165, -240), 18, Color.white, 90, TextAnchor.MiddleCenter);
        TextLabel(canvas.transform, "A/D 移动    W/空格 跳跃    Shift 冲刺    S 下蹲    Esc 暂停", new Vector2(0, -315), 19, Color.white, 950, TextAnchor.MiddleCenter);
        EditorSceneManager.SaveScene(scene, "Assets/Scenes/MainMenu.unity");
    }

    private static void BuildLevel(int level)
    {
        var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
        Color bg = level == 1 ? physics : level == 2 ? maths : slacker;
        Camera.main.orthographic = true;
        Camera.main.orthographicSize = 6;
        Camera.main.backgroundColor = bg;
        Camera.main.transform.position = new Vector3(-8, 0, -10);
        Managers(level);
        var player = Square("Player", new Vector2(-8, -2.3f), new Vector2(.8f, 1.3f), Color.cyan);
        player.tag = "Player";
        var body = player.AddComponent<Rigidbody2D>();
        body.gravityScale = 3;
        body.freezeRotation = true;
        body.collisionDetectionMode = CollisionDetectionMode2D.Continuous;
        player.AddComponent<BoxCollider2D>();
        var controller = player.AddComponent<PlayerController>();
        controller.groundLayer = 1 << 8;
        controller.moveSpeed = 8;
        controller.jumpVelocity = 15;
        controller.normalColliderSize = Vector2.one;
        controller.crouchColliderSize = new Vector2(1, .55f);
        controller.crouchColliderOffset = new Vector2(0, -.22f);
        var foot = new GameObject("Ground Check");
        foot.transform.SetParent(player.transform);
        foot.transform.localPosition = new Vector3(0, -.55f);
        controller.groundCheck = foot.transform;
        player.AddComponent<PlayerHealthRespawn>();
        Camera.main.gameObject.AddComponent<CameraFollow>().target = player.transform;

        Color platform = level == 1 ? new Color(.35f, .65f, .86f) : level == 2 ? new Color(.12f, .16f, .2f) : new Color(.8f, .59f, .4f);
        Square("Start ground", new Vector2(-5, -3.5f), new Vector2(14, 1), platform, true);
        Square("Middle ground", new Vector2(9, -3.5f), new Vector2(11, 1), platform, true);
        Square("Finish ground", new Vector2(25, -3.5f), new Vector2(18, 1), platform, true);
        Square("Jump platform A", new Vector2(0, -.6f), new Vector2(3, .5f), platform, true);
        Square("Jump platform B", new Vector2(5, .9f), new Vector2(3, .5f), platform, true);
        Square("Chase platform", new Vector2(18, -.4f), new Vector2(3, .5f), platform, true);
        Square("Secret shelf", new Vector2(26, 1.6f), new Vector2(3, .5f), platform, true);
        var moving = Square("Moving platform", new Vector2(15, -1.4f), new Vector2(2, .4f), Color.magenta, true).AddComponent<MovingBlock>();
        moving.waypoints = new[] { Point("Moving start", new Vector2(15, -1.4f)), Point("Moving end", new Vector2(17, -.8f)) };
        var vanishing = Square("Timed platform", new Vector2(29, 0), new Vector2(2, .4f), platform, true).AddComponent<VanishingBlock>();
        vanishing.mode = VanishingBlock.VanishMode.PeriodicBlink;

        for (int i = 0; i < 7; i++)
        {
            var tokenColor = level == 2 ? new Color(.84f, .38f, .04f) : Color.yellow;
            var token = Trigger("Token " + i, new Vector2(-6 + i * 2.5f, i % 2 == 0 ? -2.3f : -.9f), Vector2.one * .45f, tokenColor);
            token.AddComponent<TokenItem>();
        }
        Trigger("Big token", new Vector2(19, 1.2f), Vector2.one * .8f, new Color(1, .7f, .1f)).AddComponent<BigTokenItem>();
        Trigger("Room 2 checkpoint", new Vector2(4.5f, -2), new Vector2(.7f, 2), Color.green).AddComponent<Checkpoint>();
        var activator = Trigger("AI activation device", new Vector2(11, -2), new Vector2(1, 2), Color.cyan).AddComponent<AIActivatorDevice>();
        activator.autoActivateOnContact = true;
        activator.deviceRenderer = activator.GetComponent<SpriteRenderer>();
        Trigger("Room 3 checkpoint", new Vector2(16.8f, -2), new Vector2(.7f, 2), Color.green).AddComponent<Checkpoint>();
        var collectible = Trigger("AI locked collectible", new Vector2(26, 2.3f), Vector2.one * .7f, Color.magenta).AddComponent<CollectibleItem>();
        collectible.requiresAINearby = true;
        var goal = Trigger("Exit", new Vector2(32, -2), new Vector2(1.2f, 2.5f), Color.green).AddComponent<LevelGoal>();
        goal.nextLevelIndex = level + 1;
        goal.autoLoadNextLevel = false;
        goal.goalRenderer = goal.GetComponent<SpriteRenderer>();
        var death = Trigger("Fall death", new Vector2(10, -10), new Vector2(70, 1), Color.clear);
        death.tag = "DeadZone";

        var enemy = Square("AI pursuer", new Vector2(8, -2), new Vector2(.9f, 1.3f), Color.red);
        enemy.tag = "Enemy";
        var enemyBody = enemy.AddComponent<Rigidbody2D>();
        enemyBody.gravityScale = 0;
        enemyBody.freezeRotation = true;
        enemy.AddComponent<BoxCollider2D>().isTrigger = true;
        var ai = enemy.AddComponent<EnemyAI>();
        ai.skillType = level == 1 ? EnemyAI.AISkillType.BurstDash : level == 2 ? EnemyAI.AISkillType.CalculusDrift : EnemyAI.AISkillType.DeadlinePressure;
        ai.teleportNodes = new[] { Point("AI teleport 1", new Vector2(13, -2)), Point("AI teleport 2", new Vector2(23, -2)) };

        if (level == 1) PhysicsFeatures(platform);
        if (level == 2) MathFeatures(platform);
        if (level == 3) SlackerFeatures(platform);
        if (level == 1) IntroBoard();
        BuildHud(level);
        EditorSceneManager.SaveScene(scene, "Assets/Scenes/Level" + level + ".unity");
    }

    private static Transform Point(string name, Vector2 position)
    {
        var go = new GameObject(name);
        go.transform.position = position;
        return go.transform;
    }

    private static void PhysicsFeatures(Color platform)
    {
        var ice = Square("Ice", new Vector2(8, -2.8f), new Vector2(2.5f, .4f), Color.cyan, true);
        ice.AddComponent<IceBlock>();
        Square("Thermal controller", new Vector2(4, -2.8f), new Vector2(1.2f, .4f), Color.blue, true).AddComponent<ThermalControllerBlock>();
        var vent = Trigger("Air vent", new Vector2(16, -2.9f), new Vector2(1.3f, .4f), Color.yellow);
        vent.AddComponent<AirVentBlock>().isContinuous = true;
        var rail = Square("Railgun", new Vector2(21, -2.8f), new Vector2(2, .4f), platform, true);
        var gun = rail.AddComponent<RailgunBlock>();
        gun.launchEndPoint = Point("Railgun end", new Vector2(24, -2.5f));
    }

    private static void MathFeatures(Color platform)
    {
        var a = Square("Function segment 1", new Vector2(19, -1.5f), new Vector2(1, .4f), platform, true);
        var b = Square("Function segment 2", new Vector2(22, .3f), new Vector2(1, .4f), platform, true);
        var control = Square("Integral derivative", new Vector2(7, -2.8f), new Vector2(1.5f, .4f), Color.magenta, true).AddComponent<IntegralDerivativeBlock>();
        control.currentMode = IntegralDerivativeBlock.MathMode.Derivative;
        control.targetBlocks.Add(a.transform);
        control.targetBlocks.Add(b.transform);
        control.assembledOffsets.Add(new Vector3(11, 2));
        control.assembledOffsets.Add(new Vector3(12.2f, 2));
        var hazard = Square("Rotating hazard", new Vector2(22, -2), new Vector2(1.2f, .3f), Color.red);
        hazard.AddComponent<BoxCollider2D>();
        hazard.AddComponent<RotatingHazardBlock>();
    }

    private static void SlackerFeatures(Color platform)
    {
        var attendance = new List<AttendanceBlock>();
        for (int i = 0; i < 5; i++)
            attendance.Add(Square("Attendance " + (i + 1), new Vector2(-2 + i * 3.2f, -2.8f), new Vector2(1, .35f), platform, true).AddComponent<AttendanceBlock>());
        var attendanceDoor = Square("Attendance door", new Vector2(13.5f, -2), new Vector2(.7f, 3), Color.yellow, true).AddComponent<DoorMechanism>();
        foreach (var block in attendance) UnityEventTools.AddPersistentListener(block.onAllAttendanceCompleted, attendanceDoor.OpenDoor);

        var teacher = Trigger("Patrol teacher", new Vector2(20, -2), new Vector2(.9f, 1.3f), Color.red);
        teacher.tag = "Teacher";
        var teacherBody = teacher.AddComponent<Rigidbody2D>();
        teacherBody.bodyType = RigidbodyType2D.Kinematic;
        teacherBody.gravityScale = 0f;
        teacherBody.freezeRotation = true;
        var patrol = teacher.AddComponent<PatrolTeacherAI>();
        patrol.patrolWaypoints = new[] { Point("Patrol start", new Vector2(18, -2)), Point("Patrol end", new Vector2(25, -2)) };

        var awake = Square("Awake block", new Vector2(23, -2.8f), new Vector2(1.5f, .4f), Color.gray, true);
        awake.AddComponent<AwakeBlock>();
        var mechanism = Trigger("AI proximity switch", new Vector2(27, -1.5f), new Vector2(1, 2), Color.magenta).AddComponent<DistanceTriggerMechanism>();
        var door = Square("AI door", new Vector2(30, -2), new Vector2(.7f, 3), Color.red, true).AddComponent<DoorMechanism>();
        UnityEventTools.AddPersistentListener(mechanism.onMechanismActivated, door.OpenDoor);
    }

    private static void IntroBoard()
    {
        var board = Trigger("Controls board", new Vector2(-8, -1.3f), new Vector2(1, 2), new Color(1, .7f, .2f)).AddComponent<BulletinBoard>();
        var canvas = Canvas("Guide Canvas");
        var popup = TextLabel(canvas.transform, "A/D 移动  ·  W/空格 跳跃  ·  Shift 冲刺  ·  S 下蹲\n收集 Token，触碰蓝色装置启动 AI。引它靠近紫色收藏品。", new Vector2(0, -220), 20, Color.white, 1000, TextAnchor.MiddleCenter);
        board.popupPanel = popup.gameObject;
    }

    private static Canvas Canvas(string name)
    {
        var go = new GameObject(name);
        var canvas = go.AddComponent<Canvas>();
        canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        go.AddComponent<UIFontBootstrap>();
        var scaler = go.AddComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1280, 720);
        scaler.matchWidthOrHeight = .5f;
        go.AddComponent<GraphicRaycaster>();
        if (Object.FindObjectOfType<UnityEngine.EventSystems.EventSystem>() == null)
        {
            var events = new GameObject("Event System");
            events.AddComponent<UnityEngine.EventSystems.EventSystem>();
#if ENABLE_INPUT_SYSTEM
            events.AddComponent<UnityEngine.InputSystem.UI.InputSystemUIInputModule>();
#else
            events.AddComponent<UnityEngine.EventSystems.StandaloneInputModule>();
#endif
        }
        return canvas;
    }

    private static Text TextLabel(Transform parent, string text, Vector2 pos, int size, Color color, float width, TextAnchor align)
    {
        var go = new GameObject("Text " + text.Substring(0, Mathf.Min(8, text.Length)));
        go.transform.SetParent(parent, false);
        var rect = go.AddComponent<RectTransform>();
        rect.sizeDelta = new Vector2(width, 70);
        rect.anchoredPosition = pos;
        var label = go.AddComponent<Text>();
        label.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        label.text = text;
        label.fontSize = size;
        label.color = color;
        label.alignment = align;
        return label;
    }

    private static Button Button(Transform parent, string text, Vector2 pos, Color color)
    {
        var go = new GameObject("Button " + text);
        go.transform.SetParent(parent, false);
        var rect = go.AddComponent<RectTransform>();
        rect.sizeDelta = new Vector2(190, 50);
        rect.anchoredPosition = pos;
        go.AddComponent<Image>().color = color;
        var button = go.AddComponent<Button>();
        var label = TextLabel(go.transform, text, Vector2.zero, 22, Color.white, 180, TextAnchor.MiddleCenter);
        label.raycastTarget = false;
        return button;
    }

    private static Slider VolumeSlider(Transform parent, Vector2 pos, MenuActions actions)
    {
        var root = new GameObject("Volume Slider");
        root.transform.SetParent(parent, false);
        var rect = root.AddComponent<RectTransform>();
        rect.sizeDelta = new Vector2(220, 24);
        rect.anchoredPosition = pos;
        root.AddComponent<Image>().color = new Color(.18f, .24f, .30f);
        var slider = root.AddComponent<Slider>();

        var fill = new GameObject("Fill");
        fill.transform.SetParent(root.transform, false);
        var fillRect = fill.AddComponent<RectTransform>();
        fillRect.anchorMin = new Vector2(0, 0);
        fillRect.anchorMax = new Vector2(1, 1);
        fillRect.offsetMin = new Vector2(4, 4);
        fillRect.offsetMax = new Vector2(-4, -4);
        fill.AddComponent<Image>().color = Color.cyan;
        slider.fillRect = fillRect;

        var handle = new GameObject("Handle");
        handle.transform.SetParent(root.transform, false);
        var handleRect = handle.AddComponent<RectTransform>();
        handleRect.sizeDelta = new Vector2(18, 30);
        var handleImage = handle.AddComponent<Image>();
        handleImage.color = Color.white;
        slider.handleRect = handleRect;
        slider.targetGraphic = handleImage;
        slider.value = 1;
        UnityEventTools.AddPersistentListener(slider.onValueChanged, actions.SetVolume);
        return slider;
    }

    private static void BuildHud(int level)
    {
        var canvas = Canvas("HUD Canvas");
        var ui = new GameObject("HUD UI").AddComponent<UIManager>();
        Color hudInk = level == 2 ? new Color(.10f, .15f, .22f) : Color.white;
        ui.totalScoreText = TextLabel(canvas.transform, "SCORE: 0", new Vector2(-450, 310), 24, hudInk, 300, TextAnchor.MiddleLeft);
        ui.tokenCountText = TextLabel(canvas.transform, "TOKENS: 0", new Vector2(-450, 270), 22, level == 2 ? new Color(.65f, .28f, .03f) : Color.yellow, 300, TextAnchor.MiddleLeft);
        ui.dashChargeSlots = new Image[3];
        for (int i = 0; i < 3; i++)
        {
            var slot = new GameObject("Dash " + i);
            slot.transform.SetParent(canvas.transform, false);
            var rect = slot.AddComponent<RectTransform>();
            rect.sizeDelta = new Vector2(35, 12);
            rect.anchoredPosition = new Vector2(-580 + i * 44, 235);
            ui.dashChargeSlots[i] = slot.AddComponent<Image>();
        }
        TextLabel(canvas.transform, level == 1 ? "物理" : level == 2 ? "高数" : "水课", new Vector2(0, 310), 28, hudInk, 250, TextAnchor.MiddleCenter);
        ui.phaseText = TextLabel(canvas.transform, "探索 · 收集 Token", new Vector2(380, 310), 20, level == 2 ? new Color(.1f, .4f, .55f) : Color.cyan, 330, TextAnchor.MiddleRight);
        var actions = new GameObject("Level Actions").AddComponent<MenuActions>();
        var pause = new GameObject("Pause Panel");
        pause.transform.SetParent(canvas.transform, false);
        var pauseRect = pause.AddComponent<RectTransform>();
        pauseRect.anchorMin = Vector2.zero;
        pauseRect.anchorMax = Vector2.one;
        pauseRect.sizeDelta = Vector2.zero;
        pause.AddComponent<Image>().color = new Color(0, 0, 0, .85f);
        TextLabel(pause.transform, "游戏暂停", new Vector2(0, 120), 40, Color.white, 500, TextAnchor.MiddleCenter);
        UnityEventTools.AddPersistentListener(Button(pause.transform, "继续", new Vector2(0, 35), Color.cyan).onClick, actions.Resume);
        UnityEventTools.AddPersistentListener(Button(pause.transform, "主菜单", new Vector2(0, -35), Color.gray).onClick, actions.MainMenu);
        VolumeSlider(pause.transform, new Vector2(0, -115), actions);
        TextLabel(pause.transform, "音量", new Vector2(-165, -115), 18, Color.white, 90, TextAnchor.MiddleCenter);
        UnityEventTools.AddPersistentListener(Button(pause.transform, "切换全屏", new Vector2(0, -175), Color.gray).onClick, actions.ToggleFullscreen);
        ui.pauseMenuPanel = pause;
        pause.SetActive(false);

        var complete = new GameObject("Level Complete Panel");
        complete.transform.SetParent(canvas.transform, false);
        var completeRect = complete.AddComponent<RectTransform>();
        completeRect.anchorMin = Vector2.zero;
        completeRect.anchorMax = Vector2.one;
        completeRect.sizeDelta = Vector2.zero;
        complete.AddComponent<Image>().color = new Color(.04f, .08f, .14f, .93f);
        TextLabel(complete.transform, level == 3 ? "全部课程完成" : "关卡完成", new Vector2(0, 105), 46, Color.cyan, 650, TextAnchor.MiddleCenter);
        ui.completionScoreText = TextLabel(complete.transform, "累计得分", new Vector2(0, 35), 27, Color.white, 650, TextAnchor.MiddleCenter);
        UnityEventTools.AddPersistentListener(Button(complete.transform, level == 3 ? "返回主菜单" : "下一关", new Vector2(0, -65), Color.cyan).onClick, actions.NextLevel);
        ui.levelCompletePanel = complete;
        complete.SetActive(false);
    }
}
