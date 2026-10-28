using System;
using System.IO;
using UnityEngine;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEditor.Build.Reporting;
namespace RoomLab.Native.Editor
{
    public static class NativePhysicsDemoEditor
    {
        public const string Scene="Assets/RoomLabNative/Scenes/PhysicsDemo/NativePhysicsDemo.unity";
        [MenuItem("RoomLab Native/Open pixel physics demo")]
        public static void CreateScene(){Directory.CreateDirectory(Path.GetDirectoryName(Scene));var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);new GameObject("Native Physics Demo").AddComponent<NativePhysicsDemoPlayer>();var c=new GameObject("Native Physics Camera");c.tag="MainCamera";c.AddComponent<Camera>().orthographic=true;EditorSceneManager.SaveScene(scene,Scene);AssetDatabase.SaveAssets();}
        public static void Build(){
            foreach(string file in Directory.GetFiles("Assets/RoomLabNative/Resources/PhysicsPixel","*.png")){var importer=(TextureImporter)AssetImporter.GetAtPath(file);importer.textureType=TextureImporterType.Default;importer.filterMode=FilterMode.Point;importer.mipmapEnabled=false;importer.textureCompression=TextureImporterCompression.Uncompressed;importer.npotScale=TextureImporterNPOTScale.None;importer.isReadable=false;importer.SaveAndReimport();}
            var font=(TrueTypeFontImporter)AssetImporter.GetAtPath("Assets/RoomLabNative/Resources/PhysicsPixelFont/FusionPixel.ttf");font.fontTextureCase=FontTextureCase.Dynamic; font.includeFontData=true;font.fontRenderingMode=FontRenderingMode.HintedRaster;font.SaveAndReimport();
            CreateScene();int w=PlayerSettings.defaultScreenWidth,h=PlayerSettings.defaultScreenHeight;var mode=PlayerSettings.fullScreenMode;bool native=PlayerSettings.defaultIsNativeResolution;
            var graphics=new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/GraphicsSettings.asset")[0]);var shaderList=graphics.FindProperty("m_AlwaysIncludedShaders");var oldShaders=new UnityEngine.Object[shaderList.arraySize];for(int i=0;i<oldShaders.Length;i++)oldShaders[i]=shaderList.GetArrayElementAtIndex(i).objectReferenceValue;
            try{foreach(string name in new[]{"Hidden/VectorGraphics/VectorDemultiply","Hidden/VectorGraphics/VectorExpandEdges","Hidden/VectorGraphics/VectorBlendMax","Sprites/Default","UI/Default"}){var shader=Shader.Find(name);if(shader==null)throw new Exception("Required built-in shader missing: "+name);int n=shaderList.arraySize;shaderList.InsertArrayElementAtIndex(n);shaderList.GetArrayElementAtIndex(n).objectReferenceValue=shader;}graphics.ApplyModifiedPropertiesWithoutUndo();AssetDatabase.SaveAssets();
            PlayerSettings.defaultScreenWidth=1280;PlayerSettings.defaultScreenHeight=720;PlayerSettings.defaultIsNativeResolution=false;PlayerSettings.fullScreenMode=FullScreenMode.Windowed;Directory.CreateDirectory("Builds/NativePhysicsDemo-Final");var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions{scenes=new[]{Scene},locationPathName="Builds/NativePhysicsDemo-Final/RoomLabPhysics.exe",target=BuildTarget.StandaloneWindows64,options=BuildOptions.Development});if(report.summary.result!=BuildResult.Succeeded)throw new Exception("P4构建失败");Debug.Log("NATIVE_PHYSICS_BUILD_PASS");}finally{shaderList.arraySize=oldShaders.Length;for(int i=0;i<oldShaders.Length;i++)shaderList.GetArrayElementAtIndex(i).objectReferenceValue=oldShaders[i];graphics.ApplyModifiedPropertiesWithoutUndo();PlayerSettings.defaultScreenWidth=w;PlayerSettings.defaultScreenHeight=h;PlayerSettings.fullScreenMode=mode;PlayerSettings.defaultIsNativeResolution=native;AssetDatabase.SaveAssets();}
        }
    }
}
