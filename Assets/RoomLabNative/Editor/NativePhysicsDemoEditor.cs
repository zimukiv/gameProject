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
            string buildDirectory=Environment.GetEnvironmentVariable("ROOMLAB_NATIVE_BUILD_DIR");if(string.IsNullOrWhiteSpace(buildDirectory))buildDirectory="Builds/NativePhysicsDemo-Final";
            bool release=Environment.GetEnvironmentVariable("ROOMLAB_NATIVE_RELEASE")=="1";
            var version=PlayerSettings.bundleVersion;
            foreach(string kind in new[]{"physics","calculus","slacker"})for(int index=0;index<7;index++){string path="Assets/RoomLabNative/Resources/PhysicsPixel/rework-"+kind+"-tile-"+index+".png";if(!File.Exists(path)){var tile=NativeReworkPresentation.CreateTile(kind,index);File.WriteAllBytes(path,tile.EncodeToPNG());UnityEngine.Object.DestroyImmediate(tile);}}
            AssetDatabase.Refresh();
            foreach(string file in Directory.GetFiles("Assets/RoomLabNative/Resources/PhysicsPixel","*.png")){var importer=(TextureImporter)AssetImporter.GetAtPath(file);importer.textureType=TextureImporterType.Default;importer.filterMode=FilterMode.Point;importer.mipmapEnabled=false;importer.textureCompression=TextureImporterCompression.Uncompressed;importer.npotScale=TextureImporterNPOTScale.None;importer.isReadable=false;importer.SaveAndReimport();}
            var font=(TrueTypeFontImporter)AssetImporter.GetAtPath("Assets/RoomLabNative/Resources/PhysicsPixelFont/FusionPixel.ttf");font.fontTextureCase=FontTextureCase.Dynamic; font.includeFontData=true;font.fontRenderingMode=FontRenderingMode.HintedRaster;font.SaveAndReimport();
            var note=(TrueTypeFontImporter)AssetImporter.GetAtPath("Assets/RoomLabNative/Resources/DiegeticFont/LXGWWenKai-Regular.ttf");if(note!=null){note.fontTextureCase=FontTextureCase.Dynamic;note.includeFontData=true;note.fontRenderingMode=FontRenderingMode.Smooth;note.SaveAndReimport();}CreateScene();int w=PlayerSettings.defaultScreenWidth,h=PlayerSettings.defaultScreenHeight;var mode=PlayerSettings.fullScreenMode;bool native=PlayerSettings.defaultIsNativeResolution;
            var graphics=new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/GraphicsSettings.asset")[0]);var shaderList=graphics.FindProperty("m_AlwaysIncludedShaders");var oldShaders=new UnityEngine.Object[shaderList.arraySize];for(int i=0;i<oldShaders.Length;i++)oldShaders[i]=shaderList.GetArrayElementAtIndex(i).objectReferenceValue;
            try{foreach(string name in new[]{"Hidden/VectorGraphics/VectorDemultiply","Hidden/VectorGraphics/VectorExpandEdges","Hidden/VectorGraphics/VectorBlendMax","Sprites/Default","UI/Default"}){var shader=Shader.Find(name);if(shader==null)throw new Exception("Required built-in shader missing: "+name);int n=shaderList.arraySize;shaderList.InsertArrayElementAtIndex(n);shaderList.GetArrayElementAtIndex(n).objectReferenceValue=shader;}graphics.ApplyModifiedPropertiesWithoutUndo();AssetDatabase.SaveAssets();
            if(release)PlayerSettings.bundleVersion="1.0.0";
            PlayerSettings.defaultScreenWidth=1280;PlayerSettings.defaultScreenHeight=720;PlayerSettings.defaultIsNativeResolution=false;PlayerSettings.fullScreenMode=FullScreenMode.Windowed;Directory.CreateDirectory(buildDirectory);var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions{scenes=new[]{Scene},locationPathName=Path.Combine(buildDirectory,"RoomLabPhysics.exe"),target=BuildTarget.StandaloneWindows64,options=release?BuildOptions.None:BuildOptions.Development});if(report.summary.result!=BuildResult.Succeeded)throw new Exception("P4构建失败");Debug.Log("NATIVE_PHYSICS_BUILD_PASS");}finally{PlayerSettings.bundleVersion=version;shaderList.arraySize=oldShaders.Length;for(int i=0;i<oldShaders.Length;i++)shaderList.GetArrayElementAtIndex(i).objectReferenceValue=oldShaders[i];graphics.ApplyModifiedPropertiesWithoutUndo();PlayerSettings.defaultScreenWidth=w;PlayerSettings.defaultScreenHeight=h;PlayerSettings.fullScreenMode=mode;PlayerSettings.defaultIsNativeResolution=native;AssetDatabase.SaveAssets();}
        }

        public static void BuildWebGL(){
            string dir=Environment.GetEnvironmentVariable("ROOMLAB_NATIVE_WEBGL_DIR");
            if(string.IsNullOrWhiteSpace(dir))dir="Builds/WebGL-v1.0.0";
            string version=PlayerSettings.bundleVersion;
            try{
                PlayerSettings.bundleVersion="1.0.0";
                try{PlayerSettings.SetIl2CppCompilerConfiguration(UnityEditor.Build.NamedBuildTarget.WebGL,Il2CppCompilerConfiguration.Release);Debug.Log("WEBGL_IL2CPP_RELEASE_APPLIED");}catch(Exception speedError){Debug.LogWarning("WEBGL_IL2CPP_SPEED_FAILED "+speedError.Message);}
                PlayerSettings.WebGL.compressionFormat=WebGLCompressionFormat.Gzip;
                PlayerSettings.WebGL.decompressionFallback=true;
                PlayerSettings.WebGL.memorySize=1024;
                PlayerSettings.WebGL.template="APPLICATION:Default";
                PlayerSettings.runInBackground=true;
                PlayerSettings.defaultScreenWidth=1280;PlayerSettings.defaultScreenHeight=720;
                CreateScene();
                AssetDatabase.Refresh();   // 关键：让新加入的 Resources 资源被导入
                AssetDatabase.SaveAssets();
                var graphics=new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/GraphicsSettings.asset")[0]);
                var shaderList=graphics.FindProperty("m_AlwaysIncludedShaders");
                var oldShaders=new UnityEngine.Object[shaderList.arraySize];
                for(int i=0;i<oldShaders.Length;i++)oldShaders[i]=shaderList.GetArrayElementAtIndex(i).objectReferenceValue;
                try{
                    foreach(string sn in new[]{"Hidden/VectorDemultiply","Hidden/VectorExpandEdges","Hidden/VectorBlendMax","Hidden/VectorGraphics/VectorDemultiply","Hidden/VectorGraphics/VectorExpandEdges","Hidden/VectorGraphics/VectorBlendMax","Sprites/Default","UI/Default"}){
                        var sh=Shader.Find(sn); if(sh==null)continue;
                        int n=shaderList.arraySize; shaderList.InsertArrayElementAtIndex(n); shaderList.GetArrayElementAtIndex(n).objectReferenceValue=sh;
                    }
                    graphics.ApplyModifiedPropertiesWithoutUndo(); AssetDatabase.SaveAssets();
                Directory.CreateDirectory(dir);
                var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions{scenes=new[]{Scene},locationPathName=dir,target=BuildTarget.WebGL,options=BuildOptions.None});
                if(report.summary.result!=BuildResult.Succeeded)throw new Exception("WebGL build failed");
                try{string html=Path.Combine(dir,"index.html");if(File.Exists(html)){string body=File.ReadAllText(html);if(body.Contains("// config.devicePixelRatio = 1;")){body=body.Replace("// config.devicePixelRatio = 1;","config.devicePixelRatio = 1;");
                    string hint="<script>(function(){try{var c=document.createElement('canvas');var gl=c.getContext('webgl')||c.getContext('experimental-webgl');if(!gl)return;var ext=gl.getExtension('WEBGL_debug_renderer_info');var r=String((ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER))||'');if(/swiftshader|software|llvmpipe|basic render|mesa offscreen/i.test(r)){var d=document.createElement('div');d.style.cssText='position:fixed;left:0;right:0;top:0;z-index:2147483647;background:#c62828;color:#fff;font:14px/1.6 system-ui,Segoe UI,sans-serif;padding:10px 14px;text-align:center;';d.innerHTML='检测到浏览器正在用 <b>CPU 软件渲染</b>（'+r+'），游戏会明显卡顿。<br>请开启硬件加速：设置 → 系统 → “使用硬件加速（可用时）” → 完全重启浏览器；若仍不行，在 chrome://flags 中把 “Override software rendering list” 设为 Enabled。';document.body.appendChild(d);}}catch(e){}})();</script>";
                    if(body.Contains("</body>"))body=body.Replace("</body>",hint+"</body>");else body=body+hint;
                    Debug.Log("WEBGL_HWACCEL_HINT_ADDED");File.WriteAllText(html,body);Debug.Log("WEBGL_DPR1_APPLIED");}else Debug.LogWarning("WEBGL_DPR1_ANCHOR_MISSING");}}catch(Exception dprError){Debug.LogWarning("WEBGL_DPR1_FAILED "+dprError.Message);}
                Debug.Log("NATIVE_PHYSICS_WEBGL_BUILD_PASS");
                }finally{
                    shaderList.arraySize=oldShaders.Length;
                    for(int i=0;i<oldShaders.Length;i++)shaderList.GetArrayElementAtIndex(i).objectReferenceValue=oldShaders[i];
                    graphics.ApplyModifiedPropertiesWithoutUndo(); AssetDatabase.SaveAssets();
                }
            }finally{PlayerSettings.bundleVersion=version;AssetDatabase.SaveAssets();}
        }


        public static void ProbeWebglLevel(){
            string path="Assets/Resources/mainline-webgl.bytes";
            Debug.Log("PROBE exists="+File.Exists(path));
            var imp=AssetImporter.GetAtPath(path);
            Debug.Log("PROBE importer="+(imp==null?"NULL":imp.GetType().Name));
            var asset=AssetDatabase.LoadAssetAtPath<TextAsset>(path);
            Debug.Log("PROBE asset="+(asset==null?"NULL":asset.bytes.Length.ToString()));
            var fromRes=Resources.Load<TextAsset>("mainline-webgl");
            Debug.Log("PROBE resources="+(fromRes==null?"NULL":fromRes.bytes.Length.ToString()));
            var all=Resources.LoadAll("",typeof(TextAsset));
            Debug.Log("PROBE resourcesCount="+all.Length);
        }

    }
}
