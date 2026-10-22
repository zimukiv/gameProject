using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

public static class MiniGameWindowsBuild
{
    [MenuItem("MiniGame/Build Windows PC")]
    public static void BuildWindows()
    {
        MiniGamePlayabilityAudit.ValidateAllScenes();
        string[] scenes =
        {
            "Assets/Scenes/MainMenu.unity",
            "Assets/Scenes/Level1.unity",
            "Assets/Scenes/Level2.unity",
            "Assets/Scenes/Level3.unity"
        };
        foreach (string scene in scenes)
            if (!File.Exists(scene)) throw new FileNotFoundException("Build scene missing", scene);

        PlayerSettings.companyName = "MiniGame Team";
        PlayerSettings.productName = "AI 大人，拜托了";
        PlayerSettings.defaultScreenWidth = 1280;
        PlayerSettings.defaultScreenHeight = 720;
        Directory.CreateDirectory("Builds/Windows");
        var options = new BuildPlayerOptions
        {
            scenes = scenes,
            locationPathName = "Builds/Windows/MiniGame.exe",
            target = BuildTarget.StandaloneWindows64,
            options = BuildOptions.None
        };
        BuildReport report = BuildPipeline.BuildPlayer(options);
        if (report.summary.result != BuildResult.Succeeded)
            throw new Exception("Windows build failed: " + report.summary.result);
        string handoffPath = "Handoff/队友交接说明.md";
        if (!File.Exists(handoffPath) && Directory.Exists("Handoff"))
        {
            var mdFiles = Directory.GetFiles("Handoff", "*.md");
            if (mdFiles.Length > 0) handoffPath = mdFiles[0];
        }
        if (File.Exists(handoffPath))
            File.Copy(handoffPath, "Builds/Windows/队友交接说明.md", true);
        Debug.Log("Windows build ready: " + Path.GetFullPath(options.locationPathName));
    }
}
