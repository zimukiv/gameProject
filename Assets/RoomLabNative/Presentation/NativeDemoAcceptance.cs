using System;
using System.IO;
using System.IO.Compression;
using System.Collections.Generic;
using System.Text;
using Newtonsoft.Json.Linq;
using UnityEngine;
namespace RoomLab.Native
{
    // Runs only under the explicit verification flag, using isolated output/save directories.
    public static class NativeDemoAcceptance
    {
        static void Check(bool ok,string message){if(!ok)throw new Exception("P4 acceptance: "+message);}
        static string Zip(NativeProject p,string directory,string name,JObject document=null,Dictionary<string,byte[]> overrides=null){string output=Path.Combine(directory,name+".zip");using(var stream=File.Create(output))using(var zip=new ZipArchive(stream,ZipArchiveMode.Create)){void Add(string path,byte[] bytes){using(var dest=zip.CreateEntry(path).Open())dest.Write(bytes,0,bytes.Length);}Add("project.json",Encoding.UTF8.GetBytes((document??p.OriginalJson).ToString()));foreach(var a in p.Assets)if(overrides==null||!overrides.ContainsKey(a.Path))Add(a.Path,a.Bytes);if(overrides!=null)foreach(var pair in overrides)Add(pair.Key,pair.Value);}return output;}
        public static int Imports(NativePhysicsDemoPlayer app,NativeProject source,string directory){Directory.CreateDirectory(directory);int checks=0;void SameReject(string file){var before=app.Game;var score=before.Score;var saved=before.ExportContinuation().ToString();Check(!app.ImportFile(file),"accepted invalid package "+file);Check(ReferenceEquals(before,app.Game)&&score==app.Game.Score&&saved==app.Game.ExportContinuation().ToString(),"failed import mutated prior motor");checks++;}
            Check(app.ImportFile(Zip(source,directory,"valid")),"ZIP did not commit");Check(app.Game.Rules==NativeGameplayRules.DemoPhysics,"ZIP import did not use the demo rule profile");checks++;
            var bad=(JObject)source.OriginalJson.DeepClone();((JObject)((JArray)bad["assets"])[0])["path"]="assets/missing.png";SameReject(Zip(source,directory,"missing",bad));
            bad=(JObject)source.OriginalJson.DeepClone();bad["blockDefaults"]["physics.jet"]=new JObject{{"assets",new JObject{{"idle","MISSING-ASSET"}}}};foreach(JObject bc in (JArray)bad["courses"]){(bc["artBindings"] as JObject)?.Remove("physics.jet");foreach(JObject br in (JArray)bc["rooms"]){(br["artBindings"] as JObject)?.Remove("physics.jet");foreach(JObject o in (JArray)br["objects"])if((string)o["type"]=="physics.jet")o["assetOverrides"]=new JObject();}}SameReject(Zip(source,directory,"missing-fallback-chain",bad));
            var first=source.Assets[0];bad=(JObject)source.OriginalJson.DeepClone();((JObject)((JArray)bad["assets"])[0])["path"]="assets/broken.png";SameReject(Zip(source,directory,"broken",bad,new Dictionary<string,byte[]>{{"assets/broken.png",new byte[]{1,2,3}}}));
            foreach(string ext in new[]{"webp","gif"}){bad=(JObject)source.OriginalJson.DeepClone();((JObject)((JArray)bad["assets"])[0])["path"]="assets/unsupported."+ext;SameReject(Zip(source,directory,"unsupported-"+ext,bad,new Dictionary<string,byte[]>{{"assets/unsupported."+ext,new byte[]{1,2,3}}}));}
            bad=(JObject)source.OriginalJson.DeepClone();SameReject(Zip(source,directory,"svg-script",bad,new Dictionary<string,byte[]>{{first.Path,Encoding.UTF8.GetBytes("<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>")}}));
            var texture=new Texture2D(4,2,TextureFormat.RGB24,false);texture.SetPixels(new[]{Color.red,Color.red,Color.blue,Color.blue,Color.red,Color.red,Color.blue,Color.blue});texture.Apply();
            try{foreach(bool jpeg in new[]{false,true}){bad=(JObject)source.OriginalJson.DeepClone();var asset=(JObject)((JArray)bad["assets"])[0];string path="assets/custom."+(jpeg?"jpg":"png");asset["path"]=path;asset["mime"]=jpeg?"image/jpeg":"image/png";asset["frameWidth"]=2;asset["frameHeight"]=2;asset["fps"]=10;byte[] bytes=jpeg?texture.EncodeToJPG(100):texture.EncodeToPNG();Check(app.ImportFile(Zip(source,directory,jpeg?"jpeg":"png-sheet",bad,new Dictionary<string,byte[]>{{path,bytes}})),"PNG/JPEG package not accepted");using(var decoded=NativeDemoAssets.Decode(app.Game.Project)){Check(decoded.Frames[first.Id].Length==2,"sheet frames not sliced");Check(decoded.Get(first.Id,0,10)!=decoded.Get(first.Id,.1,10),"animation did not advance");}checks++;}}
            finally{UnityEngine.Object.Destroy(texture);}
            foreach(string file in new[]{"gif-disposal-123.gif","webp-animation.webp"}){bad=(JObject)source.OriginalJson.DeepClone();var a=(JObject)((JArray)bad["assets"])[0];string path="assets/"+file;a["path"]=path;a["frameWidth"]=0;a["frameHeight"]=0;byte[] bytes=File.ReadAllBytes(Path.Combine(Application.streamingAssetsPath,"RoomLabNative/CodecTests/fixtures",file));Check(app.ImportFile(Zip(source,directory,file,bad,new Dictionary<string,byte[]>{{path,bytes}})),"valid animation import "+file);checks++;}
            var c=source.Courses[0];var r=c.Rooms[0];var originalCourse=c.ArtBindings;var originalRoom=r.ArtBindings;
            try{c.ArtBindings=new JObject{{"physics.jet",new JObject{{"idle",first.Id},{"active",source.Assets[1].Id}}}};r.ArtBindings=new JObject{{"physics.jet",new JObject{{"idle",source.Assets[2].Id}}}};Check(NativeDemoAssets.Binding(source,c,r,"physics.jet","idle")==source.Assets[2].Id,"room override wrong");Check(NativeDemoAssets.Binding(source,c,r,"physics.jet","active")== (string)source.NormalizedJson["blockDefaults"]?["physics.jet"]?["assets"]?["active"],"room type override was incorrectly deep merged");var o=new NativeObject{AssetOverrides=new JObject{{"idle",source.Assets[3].Id}}};Check(NativeDemoAssets.Binding(source,c,r,"physics.jet","idle",o)==source.Assets[3].Id,"instance priority wrong");checks++;}finally{c.ArtBindings=originalCourse;r.ArtBindings=originalRoom;}
            return checks;
        }
    }
}
