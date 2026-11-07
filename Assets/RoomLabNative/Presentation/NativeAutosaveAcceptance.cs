using System;
using System.Collections;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;
namespace RoomLab.Native
{
    public sealed partial class NativePhysicsDemoPlayer
    {
        void WalkToAutoFlag()
        {
            for(int i=0;i<480&&Game.PendingAutoSaveCount==0;i++)Game.Tick(NativeMotion.Step,new MotionInput{right=true});
            GuidedCheck(Game.PendingAutoSaveCount>0,"normal movement touched autosave flag "+Game.Course.Kind);
            GuidedCheck(!Game.AwaitingSaveChoice&&Game.Mode=="playing","contact never opens manual modal");
            Update();GuidedCheck(page=="play"&&Game.Mode=="playing","contact stays in live gameplay");
        }
        void LeaveAutoFlag(){for(int i=0;i<48;i++)Game.Tick(NativeMotion.Step,new MotionInput{left=true});Update();}
        void CheckNoDressing(){GuidedCheck(!world.Root.GetComponentsInChildren<Transform>().Any(t=>t.name.StartsWith("Campus note / ")||t.name=="Binder spine"||t.name=="Pinned notice"),"repeated dressing removed "+Game.Room.Id);}
        IEnumerator VerifyAutosaveEdition()
        {
            guidedUiChecks.Clear();
            GuidedCheck(builtinCourseId=="autosave:physics","fresh edition defaults to authored physics");
            LoadAutosaveCourse("physics");NewGame();
            var original=NativeProjectLoader.LoadFile(Path.Combine(Application.streamingAssetsPath,"RoomLabNative/AuthoredPhysics/authored-physics.json"),new ImportOptions{RequireAssets=true});
            GuidedCheck(Game.Course.Id=="physics"&&Game.Course.Rooms.Count==11&&Game.IsAuthoredPhysics&&!Game.IsRework&&!Game.IsCampaign,"original physics runs without rework rules");
            GuidedCheck(JToken.DeepEquals(Game.Course.Raw,original.Courses[0].Raw),"author course data unchanged");
            GuidedCheck(!AutoSaves.Read().Exists&&Game.PendingAutoSaveCount==0,"new game does not invent autosaves");
            yield return Capture("autosave-default-original-physics");
            LoadAutosaveCourse("guided-calculus");NewGame();WalkToAutoFlag();
            var first=AutoSaves.Read();GuidedCheck(first.Readable&&first.Entries.Count==1&&first.Generation==1,"first contact writes one automatic record");
            for(int i=0;i<120;i++)Game.Tick(NativeMotion.Step);Update();GuidedCheck(AutoSaves.Read().Generation==1,"standing at flag does not rotate history");
            Game.Tick(NativeMotion.Step,new MotionInput{interactPressed=true});Update();GuidedCheck(Game.AwaitingSaveChoice&&page=="save-slots","interaction opens manual selection");
            yield return new WaitForSecondsRealtime(.25f);GuidedLayout();yield return Capture("autosave-interact-manual-six");
            GuidedCheck(panels.GetComponentsInChildren<Button>().Count(b=>b.name.StartsWith("Save slot "))==6,"manual six slots retained");
            var anchor=Game.Checkpoint;GuidedClick("不存，继续走");GuidedCheck(Game.Checkpoint==anchor&&!Game.AwaitingSaveChoice,"manual cancel retains automatic retry anchor");
            Game.Tick(NativeMotion.Step,new MotionInput{interactPressed=true});Update();yield return new WaitForSecondsRealtime(.25f);GuidedClick("Save slot 01",true);
            GuidedCheck(SaveSlots.Read(1).Readable&&AutoSaves.Read().Generation==1,"manual write does not rotate automatic history");
            for(int visit=0;visit<3;visit++){LeaveAutoFlag();WalkToAutoFlag();}
            var four=AutoSaves.Read();GuidedCheck(four.Generation==4&&four.Entries.Count==3,"four contacts retain only latest three");
            double previous=double.MaxValue;foreach(var entry in four.Entries){double now=(double)entry["continuation"]["elapsed"];GuidedCheck(now<previous,"automatic history newest first");previous=now;}
            OpenLoadSlots("pause");yield return new WaitForSecondsRealtime(.25f);GuidedLayout();
            GuidedCheck(panels.GetComponentsInChildren<Button>().Count(b=>b.name.StartsWith("Auto load slot "))==3,"three automatic load choices");yield return Capture("autosave-recent-three");
            GuidedClick("手动");yield return new WaitForSecondsRealtime(.25f);GuidedLayout();GuidedCheck(panels.GetComponentsInChildren<Button>().Count(b=>b.name.StartsWith("Load slot "))==6,"load tabs separate six manual slots");yield return Capture("autosave-manual-load-six");
            GuidedClick("自动");yield return new WaitForSecondsRealtime(.25f);GuidedClick("Auto load slot 01",true);
            long restoredGeneration=AutoSaves.Read().Generation;for(int i=0;i<150;i++)Game.Tick(NativeMotion.Step);Update();GuidedCheck(AutoSaves.Read().Generation==restoredGeneration&&!Game.AwaitingSaveChoice,"restored flag stays quiet");
            LoadAutosaveCourse("guided-slacker");NewGame();WalkToAutoFlag();
            GuidedCheck((string)AutoSaves.Read().Entries[0]["kind"]=="slacker"&&AutoSaves.Read().Entries.Count==3,"automatic history shared across chapters");
            OpenLoadSlots("pause");yield return new WaitForSecondsRealtime(.25f);GuidedClick("Auto load slot 02",true);GuidedCheck(Game.Course.Kind=="calculus"&&page=="play","automatic load restores another chapter");
            string automaticFile=AutoSaves.HistoryPath,before=File.ReadAllText(automaticFile);NewGame();
            using(var locked=new FileStream(automaticFile,FileMode.Open,FileAccess.Read,FileShare.Read)){WalkToAutoFlag();GuidedCheck(File.ReadAllText(automaticFile)==before&&page=="play"&&Game.Mode=="playing","failed automatic write preserves history without pausing");}
            GuidedCheck(SaveSlots.Read(1).Readable,"automatic history never overwrites manual slot");
            // A pending contact and an E press can be consumed by one presentation frame.
            // Keep a manual page open past the notice duration; failure must still be visible on return.
            NewGame();
            using(var locked=new FileStream(automaticFile,FileMode.Open,FileAccess.Read,FileShare.Read))
            {
                for(int i=0;i<480&&Game.PendingAutoSaveCount==0;i++)Game.Tick(NativeMotion.Step,new MotionInput{right=true});
                GuidedCheck(Game.PendingAutoSaveCount>0,"pending contact exists before same-frame interaction");
                Game.Tick(NativeMotion.Step,new MotionInput{interactPressed=true});Update();
                GuidedCheck(page=="save-slots","failed contact and interaction still open manual page");
                yield return new WaitForSecondsRealtime(3.2f);GuidedClick("不存，继续走");Update();
                GuidedCheck(page=="play"&&hint.text=="这次没存上，先继续走。"&&hint.transform.parent.GetComponent<CanvasGroup>().alpha>.9f,"failed-save notice waits until gameplay is visible");
                GuidedCheck(File.ReadAllText(automaticFile)==before,"modal delay keeps previous automatic history intact");
            }

            // Only this contact-location setup is synthetic. Route traversal is independently
            // covered by Core and the normal-input level controller; this verifies real UI adoption.
            NewGame();var exit=Game.Room.Exits.First(e=>Game.Course.Connections.Any(c=>c.FromRoomId==Game.Room.Id&&c.ExitId==e.Id));
            var edge=Game.Course.Connections.First(c=>c.FromRoomId==Game.Room.Id&&c.ExitId==exit.Id);
            string sourceRoom=Game.Room.Id;long beforeDoorGeneration=AutoSaves.Read().Generation;
            Game.Player.x=exit.X*32+4;Game.Player.y=(exit.Y+exit.H)*32-28;Game.Player.vx=Game.Player.vy=0;Game.ExitCooldown=0;Game.Tick(NativeMotion.Step);Update();
            GuidedCheck(Game.Room.Id==sourceRoom&&AutoSaves.Read().Generation==beforeDoorGeneration&&page=="play"&&!Game.AwaitingSaveChoice,"door waits for interaction without saving");
            Game.Tick(NativeMotion.Step,new MotionInput{interactPressed=true});Update();
            GuidedCheck(Game.Room.Id==edge.ToRoomId&&page=="play"&&!Game.AwaitingSaveChoice,"interaction enters door without manual modal");
            GuidedCheck(AutoSaves.Read().Generation==beforeDoorGeneration+1,"one interaction writes one destination autosave");
            GuidedCheck((string)AutoSaves.Read().Entries[0]["continuation"]["room"]==Game.Room.Id,"door autosave records destination room");
            string destination=Game.Room.Id;long generation=AutoSaves.Read().Generation;for(int i=0;i<150;i++)Game.Tick(NativeMotion.Step);Update();GuidedCheck(Game.Room.Id==destination&&AutoSaves.Read().Generation==generation,"arrival does not bounce or resave");
            OpenLoadSlots("pause");yield return new WaitForSecondsRealtime(.25f);GuidedClick("Auto load slot 01",true);GuidedCheck(Game.Room.Id==destination&&Game.SafePosition(Game.Player.x,Game.Player.y),"door save loads safe destination");

            int rooms=0;
            GuidedCheck(Game.Project.SourceSha256=="523b045170f88881cf14cc4a401f023f76f5169a16aaf8f98b5bb2a9ca472ab5","display copy preserves existing save source identity");
            var oldLabelSlot=SaveSlots.Read(1);oldLabelSlot.Data["room"]="01 · 等号的另一端";
            GuidedCheck(SlotRoomDisplayName(oldLabelSlot)=="∫α","previous slot room label resolves to current short name");
            foreach(var id in CampaignIds)
            {
                LoadAutosaveCourse(id);NewGame();yield return new WaitForSecondsRealtime(.3f);CampaignTick();yield return new WaitForSecondsRealtime(.3f);
                GuidedCheck(exploreMusic.isPlaying&&chaseMusic.isPlaying,"music playing "+Game.Course.Kind);
                yield return Capture("autosave-"+Game.Course.Kind+"-opening");
                var data=Game.Project;
                foreach(var room in Game.Course.Rooms){SetGame(new NativeMotion(data,Game.Course.Id,room.Id,NativeGameplayRules.DemoPhysics));Show("play");world.Refresh(0,view,false);CheckNoDressing();GuidedCheck(NativeDisplayCopy.HasRoom(Game,room)&&room.Name!=(string)room.Raw["name"]&&room.Name.Length<=4,"short display name with original Raw retained "+room.Id);CampaignTick();GuidedCheck(hud.text.Contains(room.Name),"HUD displays short name "+room.Id);rooms++;if(Game.Course.Rooms.IndexOf(room)==4)yield return Capture("autosave-"+Game.Course.Kind+"-middle");}
                Show("pause");GuidedLayout();yield return Capture("autosave-"+Game.Course.Kind+"-pause");
            }
            LoadAutosaveCourse("physics");Show("menu");CheckNormalButtons();yield return Capture("autosave-menu-original-default");
            Show("builtin-select");GuidedLayout();yield return Capture("autosave-chapters");
            OpenLoadSlots("menu");yield return new WaitForSecondsRealtime(.25f);Screen.SetResolution(1024,768,FullScreenMode.Windowed);yield return new WaitForSecondsRealtime(.3f);Show("load-slots");yield return new WaitForSecondsRealtime(.25f);GuidedLayout();yield return Capture("autosave-three-1024");
            GuidedClick("手动");yield return new WaitForSecondsRealtime(.25f);GuidedLayout();yield return Capture("autosave-six-1024");CloseLoadSlots();
            File.WriteAllText(Path.Combine(Evidence(),"autosave-runtime.json"),new JObject{{"checks",guidedUiChecks},{"renderedRooms",rooms},{"displayCopyRooms",rooms},{"displayCopySourceUnchanged",true},{"displayCopyCatalogSha256",NativeDisplayCopy.CatalogSha256},{"contactFlagInput","normal movement"},{"doorMode","interaction"},{"doorUiContactSetup","synthetic location; no-input retention then interaction edge, not route completion"},{"source",Game.Project.SourceSha256},{"runtimeAssemblySha256",NativeProjectLoader.Sha(File.ReadAllBytes(typeof(NativePhysicsDemoPlayer).Assembly.Location))},{"defaultPhysics","original authored course deep-equal"},{"allDressingRemoved",true},{"fullManualPlaythrough",false}}.ToString());
            Debug.Log("AUTOSAVE_RUNTIME_PASS checks="+guidedUiChecks.Count+" rooms="+rooms+" recent=3 manual=6 default=authored-physics dressing=removed");Finish(0);
        }
    }
}
