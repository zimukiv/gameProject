using System;
using System.IO;
using System.Linq;
using System.Text;
using Newtonsoft.Json.Linq;
using RoomLab.Native;
class Program {
static int checks;static void Check(bool yes,string label){if(!yes)throw new Exception(label);checks++;}
static NativeProject Load(JObject p,string id=null)=>NativeProjectLoader.LoadBytes(Encoding.UTF8.GetBytes(p.ToString()),"json",new ImportOptions{PlayableCoursesOnly=true,CourseId=id});
static void Reject(Action call,string label){try{call();}catch(NativeDataException){checks++;return;}throw new Exception(label);}
static void Main(string[] args){
var fixture=args.Length>0?args[0]:"Tools/RoomLabNative/Editor3Checks/editor3-three-themes.zip";
var bytes=File.ReadAllBytes(fixture);string[] ids;
try{NativeProjectLoader.LoadBytes(bytes,"zip",new ImportOptions{PlayableCoursesOnly=true});throw new Exception("selection missing");}catch(NativeCourseSelectionException e){Check(e.Courses.Length==3,"three choices");ids=e.Courses.Select(c=>(string)c["id"]).ToArray();}
foreach(var id in ids){var theme=NativeProjectLoader.LoadBytes(bytes,"zip",new ImportOptions{PlayableCoursesOnly=true,CourseId=id,RequireAssets=true});Check(theme.Courses.Count==1&&theme.Courses[0].Id==id,"select theme");Check(theme.SourceBytes.SequenceEqual(bytes)&&theme.SourceSha256==NativeProjectLoader.Sha(bytes),"source preserved");}
var p=NativeProjectLoader.LoadBytes(bytes,"zip",new ImportOptions{PlayableCoursesOnly=true,CourseId=ids[0]});
Check(((JArray)p.OriginalJson["courses"]).Count==3,"retain original courses");
var raw=(JObject)p.OriginalJson.DeepClone();var courses=(JArray)raw["courses"];var first=courses[0];first.Remove();courses.Add(first);Check(Load(raw,ids[0]).Courses[0].Id==ids[0],"order independent");
Reject(()=>Load(raw,"missing"),"missing selected id");
var obj=(JObject)((JArray)first["rooms"])[0]["objects"][0];var old=(string)obj["type"];obj["type"]="unknown.test";Reject(()=>Load(raw,ids[0]),"unknown selected module");Check(Load(raw,ids[1]).Courses[0].Id==ids[1],"unknown elsewhere isolated");obj["type"]=old;
var course=(JObject)first;course["blockDefaults"]=new JObject{{"physics.jet",new JObject{{"params",new JObject{{"cooldown",111}}}}}};
var jets=((JArray)course["rooms"]).SelectMany(r=>(JArray)r["objects"]).OfType<JObject>().Where(o=>(string)o["type"]=="physics.jet").ToArray();
var jet=jets[0];jet["params"]["cooldown"]=777;var loaded=Load(raw,ids[0]);Check(loaded.Courses[0].Rooms.SelectMany(r=>r.Objects).First(o=>o.Id==(string)jet["id"]).Number("cooldown")==777,"instance wins over future defaults");
var selectedOnly=(JObject)raw.DeepClone();selectedOnly["courses"]=new JArray(first.DeepClone());var oldPath=NativeProjectLoader.LoadBytes(Encoding.UTF8.GetBytes(selectedOnly.ToString()),"json");Check(oldPath.Courses[0].Id==Load(selectedOnly).Courses[0].Id,"old single course path");
selectedOnly["courses"][0]["kind"]="unknown";Reject(()=>Load(selectedOnly),"no supported theme");
string customFile=Path.Combine(Path.GetDirectoryName(fixture),"editor3-custom-seed-id.zip");
if(File.Exists(customFile)){
 var custom=NativeProjectLoader.LoadFile(customFile,new ImportOptions{RequireAssets=true});
 var art=custom.Assets.First(a=>a.Id=="seed-calculus-integral");Check(NativeProjectLoader.Sha(art.Bytes)=="4f7197592a0cfd1a9c92fc2c3c499db0a2be7eea653c86dca9c2169a4e8efbf4","custom same-id bytes retained");
 Check((string)custom.Courses.First(c=>c.Kind=="calculus").ArtBindings["calculus.integral"]["idle"]==art.Id,"custom course binding retained");
 Check((string)art.Raw["hash"]=="custom-same-id-different-hash","custom identity retained");
}
Console.WriteLine("EDITOR3_CHECKS_PASS checks="+checks);
}}
