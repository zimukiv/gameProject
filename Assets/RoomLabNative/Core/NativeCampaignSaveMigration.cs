using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
namespace RoomLab.Native
{
    public static class NativeCampaignSaveMigration
    {
        public const string OldSource="523b045170f88881cf14cc4a401f023f76f5169a16aaf8f98b5bb2a9ca472ab5";
        public const string NewSource="54855f159e43923772bcfd4b68d7524bea7b2d8e8b4b86f2459edb0a60d7ff08";
        public static List<string> Run(string directory,NativeProject project,bool builtIn)
        {
            var report=new List<string>();
            if(!builtIn||project.SourceSha256!=NewSource)return report;
            JObject Convert(JObject source)
            {
                if(source==null||(string)source["source"]!=OldSource)throw new NativeDataException("migration source mismatch");
                var copy=(JObject)source.DeepClone();copy["source"]=NewSource;
                var selected=NativeProjectLoader.LoadBytes(project.SourceBytes,project.SourceKind,new ImportOptions{Profile=project.Profile,PlayableCoursesOnly=true,CourseId=(string)copy["course"]});
                NativeMotion.FromContinuation(selected,copy,NativeGameplayRules.DemoPhysics);
                return copy;
            }
            void Copy(string from,string to,Func<JObject,JObject> transform,int limit)
            {
                if(!File.Exists(from)||File.Exists(to))return;
                string temporary=null;
                try {
                    if(new FileInfo(from).Length>limit)throw new NativeDataException("migration size limit");
                    var data=transform(JObject.Parse(File.ReadAllText(from)));
                    Directory.CreateDirectory(Path.GetDirectoryName(to));temporary=to+"."+Guid.NewGuid().ToString("N")+".tmp";
                    File.WriteAllText(temporary,data.ToString());File.Move(temporary,to);
                    report.Add("migrated "+Path.GetFileName(to));
                }catch(Exception e){report.Add("skipped "+Path.GetFileName(from)+" "+e.GetType().Name);}
                finally{if(temporary!=null&&File.Exists(temporary))File.Delete(temporary);}
            }
            var oldSlots=new NativeSaveSlotFiles(directory,OldSource);var newSlots=new NativeSaveSlotFiles(directory,NewSource);
            for(int i=1;i<=NativeSaveSlotFiles.Count;i++){
                int number=i;
                Copy(oldSlots.FilePath(i),newSlots.FilePath(i),data=>{
                    var slot=oldSlots.Read(number);if(!slot.Readable)throw new NativeDataException("invalid old slot");
                    data=(JObject)slot.Data.DeepClone();data["continuation"]=Convert((JObject)data["continuation"]);data["source"]=NewSource;return data;
                },4*1024*1024);
            }
            var oldAuto=new NativeAutoSaveFiles(directory,OldSource);var newAuto=new NativeAutoSaveFiles(directory,NewSource);
            Copy(oldAuto.HistoryPath,newAuto.HistoryPath,data=>{
                var history=oldAuto.Read();if(!history.Readable)throw new NativeDataException("invalid old history");
                var entries=(JArray)history.Entries.DeepClone();foreach(JObject entry in entries){entry["continuation"]=Convert((JObject)entry["continuation"]);entry["source"]=NewSource;}
                return new JObject{{"version",1},{"source",NewSource},{"generation",history.Generation},{"entries",entries}};
            },12*1024*1024);
            foreach(var course in (JArray)project.OriginalJson["courses"]){
                string Id(string sha)=>"builtin-"+NativeProjectLoader.Sha(Encoding.UTF8.GetBytes(sha+"\n"+(string)course["id"]+"\nDemoPhysics"))+"-DemoPhysics";
                string oldId=Id(OldSource),newId=Id(NewSource);
                Copy(Path.Combine(directory,oldId+".json"),Path.Combine(directory,newId+".json"),data=>{
                    if((int?)data["version"]!=1||(string)data["identity"]!=oldId)throw new NativeDataException("invalid record");
                    if(data["continuation"] is JObject cp){if((string)cp["course"]!=(string)course["id"])throw new NativeDataException("record chapter mismatch");data["continuation"]=Convert(cp);}
                    data["identity"]=newId;return data;
                },4*1024*1024);
            }
            return report;
        }
    }
}
