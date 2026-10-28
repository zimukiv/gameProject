using System;
using System.IO;
using System.Reflection;
using UnityEngine;
using Newtonsoft.Json.Linq;
namespace RoomLab.Native.Editor
{
    public static class NativeP4RepairEditor
    {
        public static void ValidateAll(){ValidateReferences();ValidateKeys();ValidateCodec();NativeCodecChecks.Run("Assets/StreamingAssets/RoomLabNative/CodecTests");}
        public static void ValidateCodec(){var p=new NativeProject();p.Assets.Add(new NativeAsset{Id="gif",Path="assets/test.gif",Bytes=File.ReadAllBytes("Assets/StreamingAssets/RoomLabNative/CodecTests/fixtures/gif-disposal-123.gif")});using(var decoded=NativeDemoAssets.Decode(p))if(decoded.Frames["gif"].Length!=4)throw new Exception("CODEC_RED: native GIF frames not available");Debug.Log("CODEC_GREEN native GIF frames decoded");}
        public static void RecordRed(){foreach(var check in new Action[]{ValidateReferences,ValidateKeys,ValidateCodec}){bool failed=false;try{check();}catch(Exception e){failed=true;Debug.Log("EXPECTED_RED "+e.GetBaseException().Message);}if(!failed)throw new Exception("Negative control unexpectedly passed");}}
        public static void ValidateReferences(){var p=NativeProjectLoader.LoadFile("Assets/StreamingAssets/RoomLabNative/default.json",new ImportOptions{RequireAssets=true});p.Assets.Clear();p.NormalizedJson["blockDefaults"]["physics.jet"]=new JObject{{"assets",new JObject{{"idle","MISSING-ASSET"}}}};bool rejected=false;try{using(var a=NativeDemoAssets.Decode(p)){} }catch(NativeDataException){rejected=true;}if(!rejected)throw new Exception("I2_RED: missing blockDefaults asset was accepted");Debug.Log("I2_GREEN missing-default-binding-rejected");}
        public static void ValidateKeys(){var profile=new RoomLabKeyBindings();string reason;profile.TryBind(RoomLabKeyBindings.ActionId.Left,0,KeyCode.E,out reason);profile.TryBind(RoomLabKeyBindings.ActionId.Left,1,KeyCode.I,out reason);profile.TryBind(RoomLabKeyBindings.ActionId.Left,2,KeyCode.F,out reason);profile.TryBind(RoomLabKeyBindings.ActionId.Right,0,KeyCode.T,out reason);profile.TryBind(RoomLabKeyBindings.ActionId.Right,1,KeyCode.Y,out reason);var go=new GameObject("isolated key regression");try{var app=go.AddComponent<NativePhysicsDemoPlayer>();var flags=BindingFlags.Instance|BindingFlags.NonPublic;typeof(NativePhysicsDemoPlayer).GetField("legacy",flags).SetValue(app,profile);typeof(NativePhysicsDemoPlayer).GetMethod("BindKeys",flags).Invoke(app,null);var keys=(NativeKeyboardEvents)typeof(NativePhysicsDemoPlayer).GetField("keys",flags).GetValue(app);keys.Apply((int)KeyCode.E,true);if(!keys.Held.left||keys.PendingEdges!=0)throw new Exception("M1_RED: interaction overwrote migrated movement E");Debug.Log("M1_GREEN legacy-movement-preserved-free-interact-key");}finally{UnityEngine.Object.DestroyImmediate(go);}}
    }
}
