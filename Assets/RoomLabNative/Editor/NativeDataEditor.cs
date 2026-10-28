using System;
using System.IO;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace RoomLab.Native.Editor
{
    public static class NativeDataEditor
    {
        [MenuItem("RoomLab Native/Import data project")]
        public static void Import() { ImportWithProfile(ImportProfile.EditorAuto); }
        [MenuItem("RoomLab Native/Import DDL1.3 preserving reference rules")]
        public static void ImportReference() { ImportWithProfile(ImportProfile.CustomDdl13Preserve); }
        static void ImportWithProfile(ImportProfile profile)
        {
            string source=EditorUtility.OpenFilePanel("导入RoomLab原生数据","","json,zip");if(string.IsNullOrEmpty(source))return;
            // All input/asset validation precedes creating any generated output.
            var candidate=NativeProjectLoader.LoadFile(source,new ImportOptions {Profile=profile,RequireAssets=true});
            string root="Assets/RoomLabNative/Imports/"+profile+"-import-"+candidate.SourceSha256.Substring(0,12);
            if(Directory.Exists(root))throw new IOException("导入目录已存在，保留原数据："+root);
            Directory.CreateDirectory(root);File.WriteAllBytes(Path.Combine(root,"source."+candidate.SourceKind),candidate.SourceBytes);
            File.WriteAllText(Path.Combine(root,"normalized.json"),candidate.NormalizedJson.ToString());
            File.WriteAllText(Path.Combine(root,"report.json"),Report(candidate).ToString());
            foreach(var asset in candidate.Assets){var destination=Path.Combine(root,asset.Path);Directory.CreateDirectory(Path.GetDirectoryName(destination));File.WriteAllBytes(destination,asset.Bytes);}
            AssetDatabase.Refresh();Debug.Log("NATIVE_DATA_IMPORT_PASS "+root);
        }
        public static JObject Report(NativeProject p) {return new JObject { ["sourceSha256"]=p.SourceSha256,["profile"]=p.Profile.ToString(),["rooms"]=p.RoomCount,["objects"]=p.ObjectCount,["tiles"]=p.TileCount,["connections"]=p.ConnectionCount,["assets"]=p.Assets.Count,["dataValid"]=p.DataValid,["assetsResolved"]=p.AssetsResolved,["graphicsReady"]=p.GraphicsReady,["nativeGameplayValidated"]=false };}
        public static void Validate()
        {
            string root=Path.GetFullPath(Path.Combine(Application.dataPath,".."));string fixtures=Path.Combine(root,"Validation/Native/Fixtures");
            var p=NativeProjectLoader.LoadFile(Path.Combine(fixtures,"ddl13-custom-original.json"),new ImportOptions {Profile=ImportProfile.CustomDdl13Preserve,RequireAssets=true});
            if(p.RoomCount!=11||p.ObjectCount!=695||p.TileCount!=1311||p.ConnectionCount!=10||p.Assets.Count!=9||!p.AssetsResolved)throw new Exception("Default project mismatch");
            var zip=NativeProjectLoader.LoadFile(Path.Combine(fixtures,"editor255-export.zip"));if(zip.RoomCount<1)throw new Exception("Editor ZIP mismatch");
            foreach(var file in new[]{"corrupt.zip","truncated.zip","oversized-declared.zip","unknown-major.json"}) {bool refused=false;try{NativeProjectLoader.LoadFile(Path.Combine(fixtures,file));}catch(NativeDataException){refused=true;}if(!refused)throw new Exception("Did not refuse "+file);}
            int repairChecks=RoomLab.Native.Validation.NativeDataRepairCases.Run(JObject.Parse(File.ReadAllText(Path.Combine(fixtures,"editor255-export.json"))));
            Debug.Log("NATIVE_DATA_UNITY_REPAIR_PASS checks="+repairChecks+" strictGrammar=true normalizedModules=true");
            string output=Path.Combine(root,"Validation/Native/P1/unity-data-result.json");Directory.CreateDirectory(Path.GetDirectoryName(output));File.WriteAllText(output,Report(p).ToString());
            Debug.Log("NATIVE_DATA_UNITY_PASS rooms=11 objects=695 tiles=1311 connections=10 assets=9 badFixtures=4");
        }
    }
}
