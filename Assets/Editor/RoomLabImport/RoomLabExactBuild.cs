using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class RoomLabExactBuild
{
    // Rebuild the connected scene without recreating scenes or changing PlayerSettings.
    public static void RebuildConnected()
    {
        RoomLabKeyBindingsCheck.Run();
        string output=Environment.GetEnvironmentVariable("ROOMLAB_EXACT_OUTPUT");
        if(string.IsNullOrEmpty(output))throw new IOException("Output path required");
        var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions{
            scenes=new[]{"Assets/RoomLabExactConnected/RoomLabExact.unity"},
            locationPathName=output,target=BuildTarget.StandaloneWindows64,options=BuildOptions.None});
        if(report.summary.result!=BuildResult.Succeeded)throw new Exception("Connected runtime Unity build failed");
        Debug.Log("ROOMLAB_CONNECTED_REBUILD_PASS "+output);
    }

    public static void Run()
    {
        string runtime=Environment.GetEnvironmentVariable("ROOMLAB_EXACT_RUNTIME");
        string output=Environment.GetEnvironmentVariable("ROOMLAB_EXACT_OUTPUT");
        if(!File.Exists(Path.Combine(runtime,"RoomLabCore.exe"))||string.IsNullOrEmpty(output)||(File.Exists(output)&&Environment.GetEnvironmentVariable("ROOMLAB_EXACT_REBUILD")!="1"))throw new IOException("New output path and packaged runtime required");
        var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
        var camera=new GameObject("Main Camera").AddComponent<Camera>();camera.clearFlags=CameraClearFlags.SolidColor;camera.backgroundColor=new Color(.04f,.07f,.1f);
        new GameObject("RoomLab 2.5.2 exact runtime").AddComponent<RoomLabExactPlayer>().editorRuntimeDirectory=runtime;
        Directory.CreateDirectory("Assets/RoomLabExact");
        string scenePath="Assets/RoomLabExact/RoomLabExact.unity";
        EditorSceneManager.SaveScene(scene,scenePath);
        PlayerSettings.companyName="RoomLab Exact Integration";PlayerSettings.productName="RoomLab 2.5.2 Unity";
        PlayerSettings.fullScreenMode=FullScreenMode.Windowed;PlayerSettings.defaultScreenWidth=1280;PlayerSettings.defaultScreenHeight=720;
        PlayerSettings.defaultIsNativeResolution=false;AssetDatabase.SaveAssets();
        Directory.CreateDirectory(Path.GetDirectoryName(output));
        var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions{scenes=new[]{scenePath},locationPathName=output,target=BuildTarget.StandaloneWindows64,options=BuildOptions.None});
        if(report.summary.result!=BuildResult.Succeeded)throw new Exception("Exact runtime Unity build failed");
        Debug.Log("ROOMLAB_EXACT_BUILD_PASS "+output);
    }
}
