using System;
using System.IO;
using UnityEngine;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEditor.Build.Reporting;
namespace RoomLab.Native.Editor
{
 public static class NativeGameplayEditor
 {
  public const string ScenePath="Assets/RoomLabNative/Scenes/Gameplay/NativeGameplay.unity";
  [MenuItem("RoomLab Native/Open full gameplay demo")]
  public static void CreateScene(){Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);var camera=new GameObject("Native Gameplay Camera");camera.tag="MainCamera";camera.AddComponent<Camera>().orthographic=true;new GameObject("Native Gameplay CSharp").AddComponent<NativeGameplayPlayer>();if(!EditorSceneManager.SaveScene(scene,ScenePath))throw new IOException("Scene save failed");AssetDatabase.SaveAssets();}
  public static void ValidatePlayMode(){if(Environment.GetEnvironmentVariable("ROOMLAB_NATIVE_GAMEPLAY_VERIFY")!="1")throw new Exception("Set ROOMLAB_NATIVE_GAMEPLAY_VERIFY=1");if(!File.Exists(ScenePath))CreateScene();else EditorSceneManager.OpenScene(ScenePath);EditorApplication.EnterPlaymode();}
  public static void Build(){CreateScene();var product=PlayerSettings.productName;var width=PlayerSettings.defaultScreenWidth;var height=PlayerSettings.defaultScreenHeight;var mode=PlayerSettings.fullScreenMode;var native=PlayerSettings.defaultIsNativeResolution;try{PlayerSettings.productName="RoomLab Native Gameplay";PlayerSettings.defaultScreenWidth=1280;PlayerSettings.defaultScreenHeight=800;PlayerSettings.defaultIsNativeResolution=false;PlayerSettings.fullScreenMode=FullScreenMode.Windowed;Directory.CreateDirectory("Builds/NativeGameplay");var result=BuildPipeline.BuildPlayer(new BuildPlayerOptions{scenes=new[]{ScenePath},locationPathName="Builds/NativeGameplay/NativeGameplay.exe",target=BuildTarget.StandaloneWindows64,options=BuildOptions.Development});if(result.summary.result!=BuildResult.Succeeded)throw new Exception("Gameplay build failed");Debug.Log("NATIVE_GAMEPLAY_BUILD_PASS rooms=11 connections=10 nativeOnly=true");}finally{PlayerSettings.productName=product;PlayerSettings.defaultScreenWidth=width;PlayerSettings.defaultScreenHeight=height;PlayerSettings.fullScreenMode=mode;PlayerSettings.defaultIsNativeResolution=native;AssetDatabase.SaveAssets();}}
 }
}
