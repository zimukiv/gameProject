using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;

/// <summary>Checks generated scene wiring and safe checkpoint placement in the editor.</summary>
public static class MiniGamePlayabilityAudit
{
    [MenuItem("MiniGame/Validate generated scenes")]
    public static void ValidateAllScenes()
    {
        if (SceneManager.GetActiveScene().isDirty)
            throw new Exception("Save the current scene before running the playability audit.");
        var failures = new List<string>();
        string previous = SceneManager.GetActiveScene().path;
        try
        {
            ValidateMenu(failures);
            for (int level = 1; level <= 3; level++) ValidateLevel(level, failures);
        }
        finally
        {
            if (!string.IsNullOrEmpty(previous)) EditorSceneManager.OpenScene(previous);
        }

        if (failures.Count > 0)
        {
            foreach (string failure in failures) Debug.LogError("[Playability Audit] " + failure);
            throw new Exception("Playability audit failed with " + failures.Count + " issue(s).");
        }
        Debug.Log("[Playability Audit] Main menu and all three generated scenes passed structural checks.");
    }

    private static void ValidateMenu(List<string> failures)
    {
        Open("MainMenu", failures);
        var ui = UnityEngine.Object.FindObjectOfType<UIManager>();
        Require(ui != null, "MainMenu: UIManager missing", failures);
        if (ui == null) return;
        Require(ui.newGameButton != null && ui.newGameButton.onClick.GetPersistentEventCount() > 0,
            "MainMenu: New Game button is not wired", failures);
        Require(ui.continueGameButton != null && ui.continueGameButton.onClick.GetPersistentEventCount() > 0,
            "MainMenu: Continue button is not wired", failures);
        Require(ui.levelCards != null && ui.levelCards.Length == 3,
            "MainMenu: expected three level cards", failures);
        Require(UnityEngine.Object.FindObjectOfType<Slider>() != null,
            "MainMenu: volume slider missing", failures);
    }

    private static void ValidateLevel(int level, List<string> failures)
    {
        Open("Level" + level, failures);
        var bootstrap = UnityEngine.Object.FindObjectOfType<SceneBootstrap>();
        var player = UnityEngine.Object.FindObjectOfType<PlayerController>();
        var enemy = UnityEngine.Object.FindObjectOfType<EnemyAI>();
        var activator = UnityEngine.Object.FindObjectOfType<AIActivatorDevice>();
        var goal = UnityEngine.Object.FindObjectOfType<LevelGoal>();
        var ui = UnityEngine.Object.FindObjectOfType<UIManager>();
        Require(bootstrap != null && bootstrap.levelIndex == level, "Level" + level + ": bootstrap mismatch", failures);
        Require(player != null && player.groundLayer.value != 0, "Level" + level + ": player or ground layer missing", failures);
        Require(enemy != null && enemy.teleportNodes != null && enemy.teleportNodes.Length > 0,
            "Level" + level + ": AI or teleport path missing", failures);
        Require(activator != null && goal != null && activator.transform.position.x < goal.transform.position.x,
            "Level" + level + ": activation must precede exit", failures);
        Require(goal != null && goal.requiresAIActivation, "Level" + level + ": exit bypasses AI phase", failures);
        Require(ui != null && ui.levelCompletePanel != null && ui.pauseMenuPanel != null,
            "Level" + level + ": pause or completion UI missing", failures);

        var checkpoints = UnityEngine.Object.FindObjectsOfType<Checkpoint>();
        Require(level == 1 ? checkpoints.Length == 1 : checkpoints.Length >= 2,
            "Level" + level + ": expected " + (level == 1 ? "one pre-vent checkpoint" : "room checkpoints"), failures);
        foreach (var checkpoint in checkpoints)
            Require(HasGroundUnder(checkpoint.transform.position),
                "Level" + level + ": checkpoint " + checkpoint.name + " respawns over a gap", failures);

        if (level == 1)
            Require(UnityEngine.Object.FindObjectOfType<IceBlock>() != null &&
                    UnityEngine.Object.FindObjectOfType<RailgunBlock>() != null &&
                    UnityEngine.Object.FindObjectOfType<AirVentBlock>() != null,
                    "Level1: physics mechanics missing", failures);
        if (level == 2)
            Require(UnityEngine.Object.FindObjectOfType<IntegralDerivativeBlock>() != null &&
                    UnityEngine.Object.FindObjectOfType<RotatingHazardBlock>() != null,
                    "Level2: math mechanics missing", failures);
        if (level == 3)
            Require(UnityEngine.Object.FindObjectsOfType<AttendanceBlock>().Length >= 5 &&
                    UnityEngine.Object.FindObjectOfType<DistanceTriggerMechanism>() != null,
                    "Level3: attendance or AI switch missing", failures);
    }

    private static bool HasGroundUnder(Vector3 point)
    {
        foreach (var block in UnityEngine.Object.FindObjectsOfType<BaseBlock>())
        {
            var col = block.GetComponent<BoxCollider2D>();
            if (col == null || col.isTrigger || !col.enabled) continue;
            Bounds bounds = col.bounds;
            if (point.x > bounds.min.x + .25f && point.x < bounds.max.x - .25f &&
                point.y >= bounds.max.y && point.y - bounds.max.y < 2f) return true;
        }
        return false;
    }

    private static void Open(string name, List<string> failures)
    {
        string path = "Assets/Scenes/" + name + ".unity";
        if (AssetDatabase.LoadAssetAtPath<SceneAsset>(path) == null)
        {
            failures.Add(name + ": scene file missing");
            return;
        }
        EditorSceneManager.OpenScene(path);
    }

    private static void Require(bool condition, string message, List<string> failures)
    {
        if (!condition) failures.Add(message);
    }
}
