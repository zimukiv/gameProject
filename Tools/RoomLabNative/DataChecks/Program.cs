using System;
using System.IO;
using System.Linq;
using System.IO.Compression;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RoomLab.Native;
class Program
{
 static int checks;
 static string Root=Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,"../../../../../../"));
 static string Fixtures=>Path.Combine(Root,"Validation/Native/Fixtures");
 static void Check(bool condition,string label){checks++;if(!condition)throw new Exception(label);}
 static void Reject(Action action,string label){try{action();}catch(Exception e)when(e is NativeDataException||e is InvalidDataException){checks++;return;}throw new Exception("Did not reject "+label);}
 static byte[] Json(JObject root)=>Encoding.UTF8.GetBytes(root.ToString(Formatting.None));
 static byte[] Zip(params (string,byte[])[] files){using(var ms=new MemoryStream()){using(var z=new ZipArchive(ms,ZipArchiveMode.Create,true))foreach(var f in files){using(var s=z.CreateEntry(f.Item1).Open())s.Write(f.Item2,0,f.Item2.Length);}return ms.ToArray();}}
 static NativeProject Load(string name,ImportProfile profile=ImportProfile.EditorAuto,bool assets=false)=>NativeProjectLoader.LoadFile(Path.Combine(Fixtures,name),new ImportOptions{Profile=profile,RequireAssets=assets});
 static JObject Example()=>JObject.Parse(File.ReadAllText(Path.Combine(Fixtures,"editor255-export.json")));
 static void Main(string[] args){try{Root=Environment.GetEnvironmentVariable("ROOMLAB_NATIVE_ROOT")??Directory.GetCurrentDirectory();if(args.Length>0&&args[0]=="--inspect"){var prof=args.Contains("CustomDdl13Preserve")?ImportProfile.CustomDdl13Preserve:ImportProfile.EditorAuto;var p=NativeProjectLoader.LoadFile(args[1],new ImportOptions{Profile=prof});Console.WriteLine(new JObject{{"sourceSha256",p.SourceSha256},{"rooms",p.RoomCount},{"objects",p.ObjectCount},{"tiles",p.TileCount},{"connections",p.ConnectionCount},{"assetsResolved",p.AssetsResolved},{"normalized",p.NormalizedJson},{"resolvedObjects",new JArray(p.Courses.SelectMany(c=>c.Rooms).SelectMany(r=>r.Objects).Select(o=>new JObject{{"id",o.Id},{"type",o.Type},{"params",o.Parameters},{"collision",o.Collision},{"trigger",o.Trigger}}))}}.ToString(Formatting.None));return;}Run();Console.WriteLine("NATIVE_DATA_PASS checks="+checks+" framework="+Environment.Version);}
 catch(Exception e){Console.Error.WriteLine(e);Environment.ExitCode=1;}}
 static void Run(){
 var raw=File.ReadAllBytes(Path.Combine(Fixtures,"ddl13-custom-original.json"));var p=Load("ddl13-custom-original.json",ImportProfile.CustomDdl13Preserve,true);
 Check(p.RoomCount==11&&p.ObjectCount==695&&p.TileCount==1311&&p.ConnectionCount==10,"Default counts");Check(p.Assets.Count==9&&p.AssetsResolved&&!p.GraphicsReady,"Asset/data separation");Check(p.SourceSha256=="404098abcf1e3ccf2f856482d95b558f2d62d2e008b08d32bf8d10ba4fbc6c8f","Source hash");Check(p.SourceBytes.SequenceEqual(raw),"Raw bytes");
 Check(p.Performance["jump"]==400&&p.Performance["speed"]==220&&p.Performance["moveAccelerationTime"]==.1,"Performance override");
 foreach(var a in p.Assets)Check(a.Bytes.SequenceEqual(File.ReadAllBytes(Path.Combine(Fixtures,a.Path))),"Asset exact bytes "+a.Id);
 Check(p.Courses.SelectMany(c=>c.Rooms).SelectMany(r=>r.Objects).Count(o=>o.Type=="common.checkpoint")==7,"Checkpoints");Check(p.Courses.SelectMany(c=>c.Rooms).SelectMany(r=>r.Objects).Count(o=>o.Type=="common.spike")==214,"Spikes");
 Check(File.ReadAllBytes(Path.Combine(Fixtures,"ddl13-custom-original.json")).SequenceEqual(raw),"Source not written");
 foreach(var file in new[]{"editor255-export.json","editor255-export.zip","legacy252-project.json","friend252-project.json"})Check(Load(file).RoomCount>0,file);
 var unresolved=NativeProjectLoader.LoadBytes(raw,"json",new ImportOptions{Profile=ImportProfile.CustomDdl13Preserve});Check(!unresolved.AssetsResolved&&unresolved.DataValid,"Unresolved distinct");Reject(()=>NativeProjectLoader.LoadBytes(raw,"json",new ImportOptions{Profile=ImportProfile.CustomDdl13Preserve,RequireAssets=true}),"missing asset root");
 var norm=NativeProjectLoader.LoadBytes(Json(p.NormalizedJson),"json",new ImportOptions{Profile=ImportProfile.CustomDdl13Preserve});Check(JToken.DeepEquals(norm.NormalizedJson,p.NormalizedJson),"Preserve idempotent");
 var friend=Load("friend252-project.json");Check((string)friend.NormalizedJson["compatibility"]["importedProfile"]=="friend-2.5.2","Friend profile");var again=NativeProjectLoader.LoadBytes(Json(friend.NormalizedJson),"json");Check(JToken.DeepEquals(again.NormalizedJson,friend.NormalizedJson),"Auto idempotent");
 var editor=Load("editor255-export.json");Check(editor.Courses.SelectMany(c=>c.Rooms).SelectMany(r=>r.Objects).Any(o=>o.Type=="physics.jet"&&o.Number("launchX")==-700),"Direction force");Check(editor.Courses.SelectMany(c=>c.Rooms).SelectMany(r=>r.Objects).Any(o=>o.Type=="physics.rail"&&o.Flag("sideTrigger")),"Rail side");
 foreach(var file in new[]{"corrupt.zip","truncated.zip","oversized-declared.zip","unknown-major.json"})Reject(()=>Load(file),file);
 var session=new NativeDataSession();session.LoadBytes(Json(Example()),"json");var old=session.Current;Reject(()=>session.LoadBytes(File.ReadAllBytes(Path.Combine(Fixtures,"corrupt.zip")),"zip"),"Atomic failure");Check(object.ReferenceEquals(old,session.Current),"Old current retained");
 var custom=Example();custom["futureExtension"]=new JObject{{"nested",new JArray(1,2,3)}};var customP=NativeProjectLoader.LoadBytes(Json(custom),"json");Check(JToken.DeepEquals(custom["futureExtension"],customP.OriginalJson["futureExtension"])&&JToken.DeepEquals(custom["futureExtension"],customP.NormalizedJson["futureExtension"]),"Unknown preserved");
 var room=(JObject)custom["courses"][0]["rooms"][0];var objects=(JArray)room["objects"];var jet=(JObject)objects.First(o=>(string)o["type"]=="physics.jet");jet["params"] =new JObject{{"launchX",123},{"launchY",-456}};var loaded=NativeProjectLoader.LoadBytes(Json(custom),"json");var actual=loaded.FindRoom((string)room["id"]).Objects.First(o=>o.Id==(string)jet["id"]);Check(actual.Text("direction")=="custom"&&actual.Number("launchX")==123&&actual.Number("launchY")==-456,"Legacy vector");
 var thermal=(JObject)custom["courses"][0]["rooms"][1]["objects"].FirstOrDefault(o=>(string)o["type"]=="physics.thermal");
 var invalid=Example();invalid["courses"][0]["rooms"][0]["objects"][0]["x"]=-1;Reject(()=>NativeProjectLoader.LoadBytes(Json(invalid),"json"),"bounds");invalid=Example();invalid["courses"][0]["rooms"][0]["tiles"]=new JObject();Reject(()=>NativeProjectLoader.LoadBytes(Json(invalid),"json"),"shape");
 invalid=Example();invalid["courses"][0]["rooms"][0]["objects"][0]["id"]=(string)invalid["courses"][0]["rooms"][0]["id"];Reject(()=>NativeProjectLoader.LoadBytes(Json(invalid),"json"),"duplicate ID");
 invalid=Example();invalid["settings"]["performance"]=new JObject{{"speed","12"}};Reject(()=>NativeProjectLoader.LoadBytes(Json(invalid),"json"),"numeric string");
 Reject(()=>NativeProjectLoader.LoadBytes(Encoding.UTF8.GetBytes("{\"version\":2,\"version\":2}"),"json"),"duplicate JSON key");Reject(()=>NativeProjectLoader.LoadBytes(Encoding.UTF8.GetBytes("{\"x\":NaN}"),"json"),"NaN");
 invalid=Example();invalid["courses"][0]["connections"][0]["to"]["entryId"]="absent";Reject(()=>NativeProjectLoader.LoadBytes(Json(invalid),"json"),"broken connection");
 var valid=Json(Example());Reject(()=>NativeProjectLoader.LoadBytes(Zip(("project.json",valid),("project.json",valid)),"zip"),"duplicate ZIP");Reject(()=>NativeProjectLoader.LoadBytes(Zip(("project.json",valid),("../bad",new byte[]{1})),"zip"),"ZIP traversal");
 invalid=Example();var pathRail=(JObject)invalid["courses"].SelectMany(c=>c["rooms"]).SelectMany(r=>r["objects"]).First(o=>(string)o["type"]=="physics.rail");pathRail["params"]["path"][0]["x"]=-10;Reject(()=>NativeProjectLoader.LoadBytes(Json(invalid),"json"),"rail node bounds match editor model play:true");
 invalid=Example();invalid["courses"][0]["rooms"][0]["objects"][0]["assetOverrides"]=new JObject{{"idle","absent-asset"}};Reject(()=>NativeProjectLoader.LoadBytes(Json(invalid),"json"),"asset reference");
 invalid=Example();invalid["pluginManifest"]=new JArray();Reject(()=>NativeProjectLoader.LoadBytes(Json(invalid),"json"),"manifest shape");
 invalid=Example();invalid["compatibility"]["runtime"]="";var extremeJet=(JObject)invalid["courses"][0]["rooms"][0]["objects"].First(o=>(string)o["type"]=="physics.jet");extremeJet["params"]["force"]=4200;extremeJet["params"]["direction"]="up";var extremes=NativeProjectLoader.LoadBytes(Json(invalid),"json");Check((string)extremes.NormalizedJson["compatibility"]["runtime"]=="2.5.5","Empty runtime migrates once");Check(extremes.Courses.SelectMany(c=>c.Rooms).SelectMany(r=>r.Objects).Any(o=>o.Type=="physics.jet"&&o.Number("force")==4200),"Schema ranges are advisory");
 var preserve=Load("friend252-project.json",ImportProfile.CustomDdl13Preserve);Check(preserve.Courses.SelectMany(c=>c.Rooms).SelectMany(r=>r.Objects).Where(o=>o.Type=="physics.rail").All(o=>!o.Flag("sideTrigger")),"Preserve profile does not friend-migrate rails");
 var incompleteAssets=Example();incompleteAssets["assets"]=new JArray(new JObject{{"id","missing"},{"path","assets/missing.svg"},{"mime","image/svg+xml"}});Reject(()=>session.LoadBytes(Json(incompleteAssets),"json",new ImportOptions{RequireAssets=true}),"Atomic asset failure");Check(object.ReferenceEquals(old,session.Current),"Missing asset preserves current");
 Check(NativeCoordinates.EditorY(NativeCoordinates.UnityY(80,17),17)==80&&NativeCoordinates.EditorX(NativeCoordinates.UnityX(120))==120,"Coordinate roundtrip");
 int repairChecks=RoomLab.Native.Validation.NativeDataRepairCases.Run(Example());checks+=repairChecks;Console.WriteLine("NATIVE_DATA_REPAIR_PASS checks="+repairChecks+" strictGrammar=true normalizedModules=true");
 }
}
