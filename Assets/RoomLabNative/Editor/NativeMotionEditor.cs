using System;
using System.IO;
using System.Text;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using Object=UnityEngine.Object;

namespace RoomLab.Native.Editor
{
    public static class NativeMotionEditor
    {
        public const string ScenePath="Assets/RoomLabNative/Scenes/Prototype/NativePrototype.unity";
        [MenuItem("RoomLab Native/Open motion prototype")]
        public static void CreatePrototype()
        {
            if(!Application.isBatchMode&&!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())return;
            Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            var camera=new GameObject("Native Camera");camera.tag="MainCamera";var cam=camera.AddComponent<Camera>();cam.orthographic=true;cam.orthographicSize=11.7f;camera.transform.position=new Vector3(20,11,-10);
            new GameObject("Native CSharp Motion").AddComponent<NativePrototypePlayer>();
            if(!EditorSceneManager.SaveScene(scene,ScenePath))throw new IOException("Prototype scene save failed");AssetDatabase.SaveAssets();Debug.Log("NATIVE_MOTION_SCENE_READY "+ScenePath);
        }
        public static void Build()
        {
            Directory.CreateDirectory("Validation/Native/P2");CompareRigidbody();CreatePrototype();
            string previousProduct=PlayerSettings.productName,previousCompany=PlayerSettings.companyName;int width=PlayerSettings.defaultScreenWidth,height=PlayerSettings.defaultScreenHeight;var mode=PlayerSettings.fullScreenMode;bool native=PlayerSettings.defaultIsNativeResolution;
            try{
                PlayerSettings.productName="RoomLab Native Prototype";PlayerSettings.companyName="RoomLab Native Validation";PlayerSettings.defaultScreenWidth=1280;PlayerSettings.defaultScreenHeight=800;PlayerSettings.defaultIsNativeResolution=false;PlayerSettings.fullScreenMode=FullScreenMode.Windowed;
                Directory.CreateDirectory("Builds/NativePrototype");var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions{scenes=new[]{ScenePath},locationPathName="Builds/NativePrototype/RoomLabNative.exe",target=BuildTarget.StandaloneWindows64,options=BuildOptions.Development});
                if(report.summary.result!=BuildResult.Succeeded)throw new Exception("Native prototype build failed "+report.summary.result);Debug.Log("NATIVE_MOTION_BUILD_PASS "+Path.GetFullPath("Builds/NativePrototype/RoomLabNative.exe"));
            }finally{PlayerSettings.productName=previousProduct;PlayerSettings.companyName=previousCompany;PlayerSettings.defaultScreenWidth=width;PlayerSettings.defaultScreenHeight=height;PlayerSettings.defaultIsNativeResolution=native;PlayerSettings.fullScreenMode=mode;AssetDatabase.SaveAssets();}
        }
        public static void ValidatePlayMode()
        {
            if(!File.Exists(ScenePath))CreatePrototype();else EditorSceneManager.OpenScene(ScenePath);
            if(Environment.GetEnvironmentVariable("ROOMLAB_NATIVE_MOTION_VERIFY")!="1")throw new Exception("Set ROOMLAB_NATIVE_MOTION_VERIFY=1 for bounded PlayMode validation");
            EditorApplication.EnterPlaymode();
        }
        public static void CompareRigidbody()
        {
            var raw=JObject.Parse(File.ReadAllText("Assets/RoomLabNative/Resources/NativePrototype.json"));var r=(JObject)raw["courses"][0]["rooms"][0];r["objects"]=new JArray();
            var data=NativeProjectLoader.LoadBytes(Encoding.UTF8.GetBytes(raw.ToString()),"json");var motor=new NativeMotion(data);motor.Player.x=160;motor.Player.y=300;
            var previousGravity=Physics2D.gravity;var previousMode=Physics2D.simulationMode;var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            GameObject floor=null,actor=null;PhysicsMaterial2D surface=null;
            try{
                Physics2D.simulationMode=SimulationMode2D.Script;Physics2D.gravity=new Vector2(0,(float)(-data.Performance["gravity"]/32));
                surface=new PhysicsMaterial2D("Zero friction reference"){friction=0,bounciness=0};
                floor=new GameObject("Same parameter floor");floor.transform.position=new Vector3(20,1.5f);var floorBox=floor.AddComponent<BoxCollider2D>();floorBox.size=new Vector2(40,1);floorBox.sharedMaterial=surface;
                actor=new GameObject("Same parameter Rigidbody2D");actor.transform.position=new Vector3((160+12)/32f,22-(300+14)/32f);var box=actor.AddComponent<BoxCollider2D>();box.size=new Vector2(24/32f,28/32f);box.sharedMaterial=surface;var rb=actor.AddComponent<Rigidbody2D>();rb.gravityScale=1;rb.freezeRotation=true;rb.collisionDetectionMode=CollisionDetectionMode2D.Continuous;rb.interpolation=RigidbodyInterpolation2D.None;
                Physics2D.SyncTransforms();double v=0,maxXDelta=0,maxYDelta=0;
                for(int i=0;i<240;i++){v=NativeMotion.Accelerate(v,1,data.Performance["speed"],NativeMotion.Step,data.Performance["moveAccelerationTime"]);rb.linearVelocity=new Vector2((float)(v/32),rb.linearVelocity.y);Physics2D.Simulate((float)NativeMotion.Step);motor.Tick(NativeMotion.Step,new MotionInput{right=true});double x=rb.position.x*32-12,y=(22-rb.position.y)*32-14;maxXDelta=Math.Max(maxXDelta,Math.Abs(x-motor.Player.x));maxYDelta=Math.Max(maxYDelta,Math.Abs(y-motor.Player.y));}
                var result=new JObject{{"unity",Application.unityVersion},{"fixedHz",120},{"gravityPx",data.Performance["gravity"]},{"speedPx",data.Performance["speed"]},{"rampSeconds",.1},{"bodyInterpolation","None"},{"bodyDetection","Continuous"},{"ticks",240},{"maxPositionDeltaPx",new JObject{{"x",maxXDelta},{"y",maxYDelta}}},{"selected","native-controlled-AABB"},{"reason","Matches existing pixel AABB ordering and authored trigger rules; Rigidbody requires additional contact/trajectory adaptation. This is a small diagnostic, not a claim that Rigidbody is generally unsuitable."}};
                Directory.CreateDirectory("Validation/Native/P2");File.WriteAllText("Validation/Native/P2/controller-comparison.json",result.ToString());Debug.Log("NATIVE_MOTION_PHYSICS_COMPARISON_PASS "+result.ToString(Newtonsoft.Json.Formatting.None));
            }finally{if(actor!=null)Object.DestroyImmediate(actor);if(floor!=null)Object.DestroyImmediate(floor);if(surface!=null)Object.DestroyImmediate(surface);Physics2D.gravity=previousGravity;Physics2D.simulationMode=previousMode;}
        }
    }
}
