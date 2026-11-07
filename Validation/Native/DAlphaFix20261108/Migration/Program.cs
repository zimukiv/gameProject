using System;using System.IO;using System.Text;using System.Linq;using Newtonsoft.Json.Linq;using RoomLab.Native;
class Test {
static void Main(){
var root="Validation/Native/DAlphaFix20261108/Migration/run-"+Guid.NewGuid().ToString("N");Directory.CreateDirectory(root);
var bytes=File.ReadAllBytes("Assets/StreamingAssets/RoomLabNative/Campaign/deadline-autosave.json");
var project=NativeProjectLoader.LoadBytes(bytes,"json",new ImportOptions{Profile=ImportProfile.CustomDdl13Preserve});
var oldBytes=System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("git","show 887f7d8:Assets/StreamingAssets/RoomLabNative/Campaign/deadline-autosave.json"){RedirectStandardOutput=true,UseShellExecute=false});
var old=NativeProjectLoader.LoadBytes(Encoding.UTF8.GetBytes(oldBytes.StandardOutput.ReadToEnd()),"json",new ImportOptions{Profile=ImportProfile.CustomDdl13Preserve});oldBytes.WaitForExit();
var game=new NativeMotion(old,"guided-calculus","network-calculus-10",NativeGameplayRules.DemoPhysics);var cp=game.ExportContinuation();
var slots=new NativeSaveSlotFiles(root,old.SourceSha256);for(int i=1;i<=6;i++)slots.Write(i,cp,"math","calculus","final",0);
var auto=new NativeAutoSaveFiles(root,old.SourceSha256);for(int i=0;i<3;i++)auto.Write(cp,"math","calculus","final",0,"checkpoint");
string Id(string sha)=>"builtin-"+NativeProjectLoader.Sha(Encoding.UTF8.GetBytes(sha+"\nguided-calculus\nDemoPhysics"))+"-DemoPhysics";
File.WriteAllText(Path.Combine(root,Id(old.SourceSha256)+".json"),new JObject{{"version",1},{"identity",Id(old.SourceSha256)},{"high",10},{"continuation",cp}}.ToString());
var original=Directory.GetFiles(root,"*.json",SearchOption.AllDirectories).ToDictionary(p=>p,p=>File.ReadAllText(p));int checks=0;
void Check(bool yes){checks++;if(!yes)throw new Exception("check "+checks);}
Check(NativeCampaignSaveMigration.Run(root,project,false).Count==0);
var results=NativeCampaignSaveMigration.Run(root,project,true);Check(results.Count==8);Check(results.All(x=>x.StartsWith("migrated")));
var ns=new NativeSaveSlotFiles(root,project.SourceSha256);for(int i=1;i<=6;i++)Check(ns.Read(i).Readable);
Check(new NativeAutoSaveFiles(root,project.SourceSha256).Read().Entries.Count==3);
Check(File.Exists(Path.Combine(root,Id(project.SourceSha256)+".json")));
foreach(var f in original)Check(File.ReadAllText(f.Key)==f.Value);
Check(NativeCampaignSaveMigration.Run(root,project,true).Count==0);
var invalid=Path.Combine(root,"invalid");new NativeSaveSlotFiles(invalid,old.SourceSha256).Write(1,cp,"m","c","r",0);var file=new NativeSaveSlotFiles(invalid,old.SourceSha256).FilePath(1);var bad=JObject.Parse(File.ReadAllText(file));bad["continuation"]["source"]=new string('a',64);File.WriteAllText(file,bad.ToString());Check(NativeCampaignSaveMigration.Run(invalid,project,true).Single().StartsWith("skipped"));Check(!new NativeSaveSlotFiles(invalid,project.SourceSha256).Read(1).Exists);
var finals=Path.Combine(root,"finals");game.ReworkSwitches["final-beta"]=true;game.ReworkSwitches["final-alpha"]=false;
var finalCp=game.ExportContinuation();new NativeSaveSlotFiles(finals,old.SourceSha256).Write(1,finalCp,"m","c","r",0);Check(NativeCampaignSaveMigration.Run(finals,project,true).Single().StartsWith("migrated"));
var target=new NativeSaveSlotFiles(finals,project.SourceSha256).FilePath(1);File.WriteAllText(target,"existing-user-data");Check(NativeCampaignSaveMigration.Run(finals,project,true).Count==0);Check(File.ReadAllText(target)=="existing-user-data");
Check(NativeCampaignSaveMigration.Run(root,old,true).Count==0);
var broken=Path.Combine(root,"broken");Directory.CreateDirectory(Path.Combine(broken,"manual-slots-v1",old.SourceSha256));var brokenSlots=new NativeSaveSlotFiles(broken,old.SourceSha256);File.WriteAllText(brokenSlots.FilePath(1),"{bad json");brokenSlots.Write(2,cp,"m","c","r",0);var malformed=JObject.Parse(File.ReadAllText(brokenSlots.FilePath(2)));malformed["continuation"]["elapsed"]=-5;File.WriteAllText(brokenSlots.FilePath(2),malformed.ToString());
var wrongRecord=new JObject{{"version",1},{"identity",Id(old.SourceSha256)},{"continuation",cp.DeepClone()}};var otherCourse=old.Courses.First(x=>x.Id!="guided-calculus");wrongRecord["continuation"]=new NativeMotion(old,otherCourse.Id,otherCourse.Rooms[0].Id,NativeGameplayRules.DemoPhysics).ExportContinuation();File.WriteAllText(Path.Combine(broken,Id(old.SourceSha256)+".json"),wrongRecord.ToString());
var brokenBefore=Directory.GetFiles(broken,"*.json",SearchOption.AllDirectories).ToDictionary(x=>x,x=>File.ReadAllText(x));var skipped=NativeCampaignSaveMigration.Run(broken,project,true);Check(skipped.Count==3&&skipped.All(x=>x.StartsWith("skipped")));foreach(var item in brokenBefore)Check(File.ReadAllText(item.Key)==item.Value);Check(!new NativeSaveSlotFiles(broken,project.SourceSha256).Read(1).Exists&&!new NativeSaveSlotFiles(broken,project.SourceSha256).Read(2).Exists);Check(!File.Exists(Path.Combine(broken,Id(project.SourceSha256)+".json")));
File.WriteAllText("Validation/Native/DAlphaFix20261108/Migration/results.json",new JObject{{"checks",checks},{"passed",true},{"reports",new JArray(results)}}.ToString());Console.WriteLine("PASS "+checks);
}}
