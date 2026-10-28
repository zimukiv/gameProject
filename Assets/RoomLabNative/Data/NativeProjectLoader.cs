using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace RoomLab.Native
{
    public static class NativeProjectLoader
    {
        public const int EntryLimit=25*1024*1024, TotalLimit=128*1024*1024;
        static readonly Dictionary<string,double> DefaultPerformance=new Dictionary<string,double> {
            {"speed",220},{"moveAccelerationTime",.1},{"gravity",1500},{"jump",560},{"maxFall",900},
            {"dashSpeed",850},{"dashDeceleration",2100},{"dashTime",.22},{"coyote",.1},{"buffer",.12} };
        public static NativeProject LoadFile(string file,ImportOptions options=null)
        {
            if(string.IsNullOrWhiteSpace(file))throw Bad("未指定项目路径");
            var info=new FileInfo(file);if(!info.Exists||info.Length>TotalLimit)throw Bad("项目不存在或容量超过限制");
            var opts=options??new ImportOptions();
            // A file's own directory is the natural root; LoadBytes deliberately has no implicit root.
            var actual=new ImportOptions { Profile=opts.Profile,RequireAssets=opts.RequireAssets,AssetRoot=opts.AssetRoot??info.DirectoryName };
            var project=LoadBytes(File.ReadAllBytes(file),info.Extension,actual);project.SourcePath=info.FullName;return project;
        }
        public static NativeProject LoadBytes(byte[] bytes,string kind,ImportOptions options=null)
        {
            if(bytes==null||bytes.Length==0||bytes.Length>TotalLimit)throw Bad("项目容量无效");
            var opts=options??new ImportOptions();var format=(kind??"").TrimStart('.').ToLowerInvariant();
            Dictionary<string,byte[]> archive=null;byte[] jsonBytes;
            if(format=="zip") { archive=NativeZip.Read(bytes);if(!archive.TryGetValue("project.json",out jsonBytes))throw Bad("ZIP缺少project.json"); }
            else if(format=="json") { if(bytes.Length>EntryLimit)throw Bad("JSON容量超过限制");jsonBytes=bytes; }
            else throw Bad("只支持JSON或ZIP项目");
            JObject source=Parse(jsonBytes),normalized=(JObject)source.DeepClone();
            if(Number(normalized,"version",-1)!=2)throw Bad("不支持的项目版本，仅支持RoomLab v2");
            foreach(var key in new[]{"blockDefaults","pluginManifest","compatibility"})if(normalized[key]!=null)Object(normalized[key],key);
            // Check the original used module names before alias normalization can hide a declaration.
            foreach(var ct in Array(normalized,"courses"))foreach(var rt in Array(Object(ct,"course"),"rooms"))
                foreach(var ot in Array(Object(rt,"room"),"objects"))CheckModule(normalized,Object(ot,"object"));
            Normalize(normalized,opts.Profile);
            // Migration changes aliases and can introduce required module declarations.
            // Validate the actual used names too; never erase unknown target declarations.
            foreach(var ct in Array(normalized,"courses"))foreach(var rt in Array(Object(ct,"course"),"rooms"))
                foreach(var ot in Array(Object(rt,"room"),"objects"))CheckModule(normalized,Object(ot,"object"));
            var p=new NativeProject { sourceBytes=(byte[])bytes.Clone(),SourceSha256=Sha(bytes),OriginalJson=source,
                NormalizedJson=normalized,Profile=opts.Profile,SourceKind=format,Id=Text(normalized,"id",""),Name=Text(normalized,"name","") };
            Build(p);ResolveAssets(p,archive,opts);return p;
        }
        public static string Sha(byte[] bytes) { using(var s=SHA256.Create())return BitConverter.ToString(s.ComputeHash(bytes)).Replace("-","").ToLowerInvariant(); }
        public static JObject Parse(byte[] bytes)
        {
            try {
                var text=new UTF8Encoding(false,true).GetString(bytes);if(text.Length>0&&text[0]=='\ufeff')text=text.Substring(1);
                StrictJsonSyntax.Validate(text);
                using(var check=new JsonTextReader(new StringReader(text)) { DateParseHandling=DateParseHandling.None,MaxDepth=128 })
                    while(check.Read())if(check.TokenType==JsonToken.Comment||check.TokenType==JsonToken.Undefined)throw Bad("JSON不允许注释或undefined");
                using(var reader=new JsonTextReader(new StringReader(text)) { DateParseHandling=DateParseHandling.None,MaxDepth=128 }) {
                    var root=JObject.Load(reader,new JsonLoadSettings { DuplicatePropertyNameHandling=DuplicatePropertyNameHandling.Error });
                    if(reader.Read())throw Bad("JSON存在多个根值");ValidateNumbers(root);return root;
                }
            } catch(NativeDataException){throw;} catch(Exception e) when(e is JsonException||e is DecoderFallbackException||e is OverflowException) { throw Bad("JSON解析失败："+e.Message); }
        }
        static void ValidateNumbers(JToken token) {
            if(token.Type==JTokenType.Float) { double n=token.Value<double>();if(double.IsNaN(n)||double.IsInfinity(n))throw Bad("数值必须有限"); }
            foreach(var child in token.Children())ValidateNumbers(child);
        }
        static void CheckModule(JObject root,JObject obj)
        {
            var type=Text(obj,"type","");if(!NativeModuleCatalog.Definitions.TryGetValue(type,out var definition))throw Bad("缺少功能模块："+type);
            var expected=(root["pluginManifest"] as JObject)?[type];
            if(expected!=null) { if(expected.Type!=JTokenType.String)throw Bad("模块版本必须为字符串");var major=expected.Value<string>().Split('.')[0];
                if(major!=Text(definition,"version","").Split('.')[0]&&!((JArray)definition["compatibleMajors"]).Any(v=>(string)v==major))throw Bad(type+"模块主版本不匹配："+(string)expected); }
        }
        static void Normalize(JObject p,ImportProfile profile)
        {
            var all=new List<JObject>();
            foreach(var ct in Array(p,"courses")) {
                var c=Object(ct,"course");foreach(var rt in Array(c,"rooms"))foreach(var ot in Array(Object(rt,"room"),"objects")) {
                    var o=Object(ot,"object");all.Add(o);var type=Text(o,"type","");var values=Object(o["params"],"params");
                    if(type=="physics.jet") {
                        var explicitValues=Explicit(p,o);var direction=Text(explicitValues,"direction","");
                        if(new[]{"up","down","left","right"}.Contains(direction)) {
                            var force=Number(explicitValues,"force",900);values["launchX"]=direction=="right"?force:direction=="left"?-force:0;
                            values["launchY"]=direction=="down"?force:direction=="up"?-force:0;
                        }
                    }
                    if(type=="physics.ice")values.Remove("zoneId");
                    if(type=="common.aiStartHollow") {
                        o["type"]="common.aiStart";o["collision"]=false;
                        var merged=new JObject();var old=(c["artBindings"] as JObject)?["common.aiStartHollow"] as JObject;
                        if(old!=null)Merge(merged,old);if(o["assetOverrides"] is JObject overrides)Merge(merged,overrides);o["assetOverrides"]=merged;
                    }
                    if(type=="physics.rail"&&values["path"] is JArray nodes)for(int i=0;i<nodes.Count;i++) {
                        var n=Object(nodes[i],"rail node");if(n["id"]==null)n["id"]=Text(o,"id","")+":node:"+i;n["parentId"]=Text(o,"id","");
                    }
                }
            }
            var compatibility=p["compatibility"] as JObject??new JObject();
            bool friend=profile==ImportProfile.EditorAuto&&string.IsNullOrEmpty(Text(compatibility,"runtime",""))&&all.Any(o=>Text(o,"type","")=="common.checkpoint");
            if(friend)foreach(var o in all) {
                var type=Text(o,"type","");var par=(JObject)o["params"];
                if(type=="physics.jet"&&new[]{"left","right"}.Contains(Text(par,"direction",""))) { o["collision"]=false;var trigger=o["trigger"] as JObject??new JObject();trigger["mode"]="region";o["trigger"]=trigger; }
                if(type=="physics.rail")par["sideTrigger"]=true;
            }
            var manifest=p["pluginManifest"] as JObject??new JObject();
            if(all.Any(o=>Text(o,"type","")=="common.checkpoint")&&manifest["common.checkpoint"]==null)manifest["common.checkpoint"]="1.0.0";
            if(all.Any(o=>Text(o,"type","")=="physics.rail"&&Bool((JObject)o["params"],"sideTrigger",false))&&
               (manifest["physics.rail"]==null||Text(manifest,"physics.rail","").Split('.')[0]=="1"))manifest["physics.rail"]="2.0.0";
            if(string.IsNullOrEmpty(Text(compatibility,"runtime","")))compatibility["runtime"]="2.5.5";
            if(friend)compatibility["importedProfile"]="friend-2.5.2";
            if(profile==ImportProfile.CustomDdl13Preserve)compatibility["nativeImportProfile"]="CustomDdl13Preserve";
            p["compatibility"]=compatibility;p["pluginManifest"]=manifest;
        }
        static JObject Explicit(JObject p,JObject o) { var result=new JObject();var d=((p["blockDefaults"] as JObject)?[Text(o,"type","")] as JObject)?["params"] as JObject;if(d!=null)Merge(result,d);Merge(result,Object(o["params"],"params"));return result; }
        static JObject Resolved(JObject p,JObject o)
        {
            var type=Text(o,"type","");var d=NativeModuleCatalog.Definitions[type];var explicitValues=Explicit(p,o);
            var values=(JObject)((JObject)d["defaults"]).DeepClone();Merge(values,explicitValues);
            if(type=="physics.thermal"&&explicitValues["initialState"]==null&&new[]{"cold","hot"}.Contains(Text(explicitValues,"initial","")))values["initialState"]=explicitValues["initial"].DeepClone();
            if(type=="physics.jet") {
                string direction=Text(explicitValues,"direction","");if(direction=="")direction=explicitValues["launchX"]!=null||explicitValues["launchY"]!=null?"custom":Text(values,"direction","up");values["direction"]=direction;
                if(new[]{"up","down","left","right"}.Contains(direction)) {var force=Number(values,"force",900);values["launchX"]=direction=="right"?force:direction=="left"?-force:0;values["launchY"]=direction=="down"?force:direction=="up"?-force:0;}
                else if(direction=="custom")values["force"]=Math.Sqrt(Math.Pow(Number(values,"launchX",0),2)+Math.Pow(Number(values,"launchY",0),2));
            }
            foreach(JObject schema in (JArray)d["schema"]) {
                var key=Text(schema,"key","");var kind=Text(schema,"kind","");var v=values[key];
                if(kind=="number")Number(values,key,double.NaN,true);
                else if(kind=="boolean")Bool(values,key,false,true);
                else if(kind=="text"||kind=="zone")Text(values,key,"",true);
                else if(kind=="select"&&(v==null||v.Type!=JTokenType.String||!((JArray)schema["values"]).Any(x=>JToken.DeepEquals(x,v))))throw Bad(type+"参数选项无效："+key);
                else if(kind=="path") {var nodes=v as JArray;if(nodes==null||nodes.Count>64)throw Bad("轨道节点无效");foreach(var n in nodes){var no=Object(n,"rail node");Number(no,"x",0,true);Number(no,"y",0,true);} }
            }
            return values;
        }
        static void Build(NativeProject p)
        {
            var root=p.NormalizedJson;var settings=Object(root["settings"],"settings");if(Number(settings,"tileSize",0)!=32)throw Bad("世界格子尺寸必须为32");
            foreach(var kv in DefaultPerformance)p.Performance[kv.Key]=Number(settings["performance"] as JObject??new JObject(),kv.Key,kv.Value);
            if(p.Performance["moveAccelerationTime"]<=0)throw Bad("水平起步加速时间必须大于0");
            var ids=new HashSet<string>(StringComparer.Ordinal);var sourceTypes=new Dictionary<string,string>();
            foreach(var c in Array(p.OriginalJson,"courses"))foreach(var r in Array(Object(c,"course"),"rooms"))foreach(var o in Array(Object(r,"room"),"objects")){var raw=Object(o,"object");sourceTypes[Text(raw,"id","")]=Text(raw,"type","");}
            var courses=Array(root,"courses");if(courses.Count<1||courses.Count>12)throw Bad("大关数量需为1–12");
            foreach(var ct in courses) {
                var c=Object(ct,"course");var course=new NativeCourse { Id=Id(c,ids),Name=Text(c,"name",""),Kind=Text(c,"kind","physics"),AiId=Text(c,"aiId",null),Raw=c,ArtBindings=OptionalObject(c,"artBindings") };
                var rooms=Array(c,"rooms");if(rooms.Count<1||rooms.Count>64)throw Bad("每大关需1–64间房");
                foreach(var rt in rooms) {
                    var r=Object(rt,"room");var room=new NativeRoom { Id=Id(r,ids),Name=Text(r,"name",""),Cols=Int(r,"cols"),Rows=Int(r,"rows"),Environment=Text(r,"environment","cold"),Phase=Text(r,"phase","inherit"),AiPolicy=Text(r,"aiPolicy","inherit"),AiId=Text(r,"aiId",null),Raw=r,ArtBindings=OptionalObject(r,"artBindings") };
                    if(room.Cols<1||room.Cols>256||room.Rows<1||room.Rows>256)throw Bad("房间尺寸需为1–256格");
                    var camera=r["playCamera"]==null?new JObject():Object(r["playCamera"],"playCamera");room.CameraMode=Text(camera,"mode","room");if(room.CameraMode!="room"&&room.CameraMode!="follow")throw Bad("试玩视角模式无效");room.CameraCols=Number(camera,"cols",30);room.CameraRows=Number(camera,"rows",17);if(room.CameraCols<1||room.CameraCols>256||room.CameraRows<1||room.CameraRows>256)throw Bad("视野尺寸无效");
                    var cells=new HashSet<string>();foreach(var tt in Array(r,"tiles")) {var t=Object(tt,"tile");int x=Int(t,"x"),y=Int(t,"y");Bounds(x,y,1,1,room);if(!cells.Add(x+","+y))throw Bad("固定砖坐标重复");room.Tiles.Add(new NativeTile {X=x,Y=y,Collision=Bool(t,"collision",true),Raw=t});}
                    ReadRegions(r,"entries",room.Entries,room,ids);ReadRegions(r,"exits",room.Exits,room,ids);ReadRegions(r,"zones",room.Zones,room,ids);ReadRegions(r,"movables",room.Movables,room,ids);
                    if(room.Entries.Count==0)throw Bad("房间没有入口："+room.Name);
                    foreach(var ot in Array(r,"objects")) {
                        var o=Object(ot,"object");string type=Text(o,"type","",true);var definition=NativeModuleCatalog.Definitions[type];var shape=Text(definition,"collider","");
                        var obj=new NativeObject { Id=Id(o,ids),Name=Text(o,"name",type),Type=type,SourceType=sourceTypes[Text(o,"id","")],X=Int(o,"x"),Y=Int(o,"y"),W=Int(o,"w",1),H=Int(o,"h",1),Collision=Bool(o,"collision",shape!=""),Raw=o,Parameters=Resolved(root,o),Trigger=OptionalObject(o,"trigger"),AssetOverrides=OptionalObject(o,"assetOverrides"),AiId=Text(o,"aiId",null),ResetPolicy=Text(o,"resetPolicy","checkpoint") };
                        obj.ColliderShape=obj.Collision?(shape==""?"tile":shape):"";Bounds(obj.X,obj.Y,obj.W,obj.H,room);
                        if(obj.Trigger["mode"]!=null)Text(obj.Trigger,"mode","",true);Bool(obj.Trigger,"requiresAI",false);Bool(obj.Trigger,"once",false);Number(obj.Trigger,"distance",5);Number(obj.Trigger,"cooldown",1);
                        var effectiveTrigger=new JObject { ["mode"]=Text(definition,"trigger","none"),["requiresAI"]=false,["distance"]=5,["once"]=false,["cooldown"]=1 };Merge(effectiveTrigger,obj.Trigger);obj.Trigger=effectiveTrigger;
                        room.Objects.Add(obj);
                    }
                    foreach(var o in room.Objects) {
                        if(o.Type!="physics.ice"&&Text(o.Parameters,"zoneId","")!=""&&!room.Zones.Any(z=>z.Id==Text(o.Parameters,"zoneId","")))throw Bad("温控区域关联缺失："+o.Id);
                        if(o.Parameters["path"] is JArray nodes)foreach(var nt in nodes) {var n=Object(nt,"node");if(n["id"]!=null)Id(n,ids);if(Text(n,"parentId",o.Id)!=o.Id)throw Bad("轨道节点归属无效");double x=Number(n,"x",0,true),y=Number(n,"y",0,true);if(x<0||x>room.Cols||y<0||y>room.Rows)throw Bad("轨道节点越界");}
                    }
                    var temperatures=new Dictionary<string,string>();foreach(var o in room.Objects)if(o.Type=="physics.thermal") {string value=Text(o.Parameters,"initialState","inherit"),zone=Text(o.Parameters,"zoneId","");if(value=="hot"||value=="cold"){if(temperatures.TryGetValue(zone,out var old)&&old!=value)throw Bad("同一区域初始温度互相冲突");temperatures[zone]=value;}}
                    foreach(var m in room.Movables) {int tx=Int(m.Raw,"targetX"),ty=Int(m.Raw,"targetY");Bounds(tx,ty,1,1,room);if(Text(m.Raw,"padId","")!=""&&!room.Objects.Any(o=>o.Id==Text(m.Raw,"padId","")))throw Bad("机关砖绑定缺失");}
                    foreach(var e in room.Entries)if(room.Tiles.Any(t=>t.Collision&&t.X==e.X&&t.Y==e.Y))throw Bad("入口埋在砖里："+e.Id);
                    if(r["playTraces"]!=null)foreach(var trace in Array(r,"playTraces")){var tr=Object(trace,"trace");Id(tr,ids);foreach(var point in Array(tr,"points")){Number(Object(point,"point"),"x",0,true);Number(Object(point,"point"),"y",0,true);}}
                    course.Rooms.Add(room);
                }
                var usedOutputs=new HashSet<string>();foreach(var wt in c["connections"]==null?new JArray():Array(c,"connections")) {
                    var w=Object(wt,"connection");var from=Object(w["from"],"from");var to=Object(w["to"],"to");var edge=new NativeConnection {Id=Id(w,ids),FromRoomId=Text(from,"roomId","",true),ExitId=Text(from,"exitId","",true),ToRoomId=Text(to,"roomId","",true),EntryId=Text(to,"entryId","",true),Velocity=Text(w,"velocity","reset"),Raw=w};
                    var a=course.Rooms.Find(x=>x.Id==edge.FromRoomId);var b=course.Rooms.Find(x=>x.Id==edge.ToRoomId);if(a==null||b==null||!a.Exits.Any(x=>x.Id==edge.ExitId)||!b.Entries.Any(x=>x.Id==edge.EntryId))throw Bad("连线端口缺失："+edge.Id);if(!usedOutputs.Add(edge.ExitId))throw Bad("一个出口只能接一条线");course.Connections.Add(edge);
                }
                p.Courses.Add(course);
            }
            var assetIds=new HashSet<string>();var assetPaths=new HashSet<string>(StringComparer.OrdinalIgnoreCase);foreach(var at in root["assets"]==null?new JArray():Array(root,"assets")) {
                var a=Object(at,"asset");var asset=new NativeAsset {Id=Text(a,"id","",true),Path=Text(a,"path","",true),Mime=Text(a,"mime","application/octet-stream"),Raw=a,Width=Number(a,"width",0),Height=Number(a,"height",0),FrameWidth=Number(a,"frameWidth",0),FrameHeight=Number(a,"frameHeight",0),Fps=Number(a,"fps",6)};
                if(!assetIds.Add(asset.Id)||!assetPaths.Add(asset.Path))throw Bad("素材ID或路径重复");SafePath(asset.Path);p.Assets.Add(asset);
            }
            foreach(var c in p.Courses) {
                ValidateBindings(c.ArtBindings,assetIds);
                foreach(var r in c.Rooms) {ValidateBindings(r.ArtBindings,assetIds);foreach(var o in r.Objects)foreach(var binding in o.AssetOverrides.Properties())if(binding.Value.Type==JTokenType.String&&binding.Value.Value<string>()!=""&&!assetIds.Contains(binding.Value.Value<string>()))throw Bad("缺失实例素材引用："+binding.Value);}
            }
        }
        static void ValidateBindings(JObject bindings,HashSet<string> ids) {foreach(var binding in bindings.Properties()){IEnumerable<JToken> values=binding.Value is JObject o?o.Properties().Select(x=>x.Value):new[]{binding.Value};foreach(var value in values)if(value.Type==JTokenType.String&&value.Value<string>()!=""&&!ids.Contains(value.Value<string>()))throw Bad("缺失素材引用："+value);}}
        static void ReadRegions(JObject r,string key,List<NativeRegion> result,NativeRoom room,HashSet<string> ids) {foreach(var token in Array(r,key)){var o=Object(token,key);var item=new NativeRegion {Id=Id(o,ids),Name=Text(o,"name",""),X=Int(o,"x"),Y=Int(o,"y"),W=Int(o,"w",1),H=Int(o,"h",1),Raw=o};Bool(o,"collision",false);Bounds(item.X,item.Y,item.W,item.H,room);result.Add(item);} }
        static void ResolveAssets(NativeProject p,Dictionary<string,byte[]> archive,ImportOptions options)
        {
            bool resolved=true;foreach(var a in p.Assets) {
                byte[] bytes=null;if(archive!=null) {if(!archive.TryGetValue(a.Path,out bytes))throw Bad("项目包缺少素材："+a.Path);}
                else if(options.AssetRoot!=null) {var root=Path.GetFullPath(options.AssetRoot).TrimEnd(Path.DirectorySeparatorChar,Path.AltDirectorySeparatorChar)+Path.DirectorySeparatorChar;var file=Path.GetFullPath(Path.Combine(root,a.Path.Replace('/',Path.DirectorySeparatorChar)));if(!file.StartsWith(root,StringComparison.OrdinalIgnoreCase))throw Bad("素材路径越界");if(File.Exists(file)){var info=new FileInfo(file);if(info.Length>EntryLimit)throw Bad("素材容量超过限制");bytes=File.ReadAllBytes(file);}else if(options.RequireAssets)throw Bad("缺少素材："+a.Path);}
                if(bytes==null) {resolved=false;if(options.RequireAssets)throw Bad("素材未解析："+a.Path);}a.Bytes=bytes;
            }p.AssetsResolved=resolved;
        }
        internal static void SafePath(string path) {if(string.IsNullOrEmpty(path)||!path.StartsWith("assets/",StringComparison.Ordinal)||path.Contains("..")||path.IndexOfAny(new[]{'\\',':','\0'})>=0||path.StartsWith("/")||path.Split('/').Any(v=>v==""||v=="."))throw Bad("素材路径不安全："+path);}
        internal static NativeDataException Bad(string text){return new NativeDataException(text);}
        static void Merge(JObject target,JObject source) {foreach(var property in source.Properties())target[property.Name]=property.Value.DeepClone();}
        internal static JObject Object(JToken token,string name) {if(!(token is JObject obj))throw Bad(name+"必须为对象");return obj;}
        static JObject OptionalObject(JObject o,string key) {return o[key]==null?new JObject():Object(o[key],key);}
        internal static JArray Array(JObject o,string key) {if(!(o[key] is JArray array))throw Bad(key+"列表缺失或形状无效");return array;}
        internal static string Text(JObject o,string key,string fallback,bool required=false) {var t=o[key];if(t==null||t.Type==JTokenType.Null){if(required)throw Bad(key+"不能为空");return fallback;}if(t.Type!=JTokenType.String)throw Bad(key+"必须为字符串");return t.Value<string>();}
        internal static double Number(JObject o,string key,double fallback,bool required=false) {var t=o[key];if(t==null){if(required)throw Bad(key+"数值缺失");return fallback;}if(t.Type!=JTokenType.Integer&&t.Type!=JTokenType.Float)throw Bad(key+"必须为数值");double value=t.Value<double>();if(double.IsNaN(value)||double.IsInfinity(value))throw Bad(key+"必须为有限数值");return value;}
        static int Int(JObject o,string key,int fallback=int.MinValue) {double d=Number(o,key,fallback,fallback==int.MinValue);if(d!=Math.Truncate(d)||d<int.MinValue||d>int.MaxValue)throw Bad(key+"必须为整数");return (int)d;}
        internal static bool Bool(JObject o,string key,bool fallback,bool required=false) {var t=o[key];if(t==null){if(required)throw Bad(key+"布尔参数缺失");return fallback;}if(t.Type!=JTokenType.Boolean)throw Bad(key+"必须为布尔值");return t.Value<bool>();}
        static string Id(JObject o,HashSet<string> ids) {string id=Text(o,"id","",true);if(id.Length==0||id.Length>100||!ids.Add(id))throw Bad("ID无效或重复："+id);return id;}
        static void Bounds(int x,int y,int w,int h,NativeRoom room) {if(x<0||y<0||w<1||h<1||x>=room.Cols||y>=room.Rows||(long)x+w>room.Cols||(long)y+h>room.Rows)throw Bad("对象或地形越界："+room.Name);}
    }
}
