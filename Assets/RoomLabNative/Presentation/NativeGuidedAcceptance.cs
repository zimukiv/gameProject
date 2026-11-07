using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;
namespace RoomLab.Native
{
    public sealed partial class NativePhysicsDemoPlayer
    {
        readonly JArray guidedUiChecks=new JArray();
        void GuidedCheck(bool ok,string name){guidedUiChecks.Add(new JObject{{"check",name},{"pass",ok}});if(!ok)throw new Exception("GUIDED_UI_FAIL "+name);Debug.Log("GUIDED_UI_CHECK "+name);}
        NativeSaveSlotFiles AuditSlots()=>new NativeSaveSlotFiles(saveDirectory,Game.Project.SourceSha256);
        Button GuidedButton(string name,bool objectName=false){var b=panels.GetComponentsInChildren<Button>().FirstOrDefault(x=>objectName?x.name==name:x.GetComponentInChildren<Text>()?.text==name);if(b==null)throw new Exception("UI button missing: "+name);return b;}
        void GuidedClick(string name,bool objectName=false){var b=GuidedButton(name,objectName);GuidedCheck(b.interactable,"button enabled "+name);b.onClick.Invoke();}
        void GuidedLayout(){Canvas.ForceUpdateCanvases();var errors=new List<string>();NativeUiKit.Validate((RectTransform)panels,errors,NativeUiKit.WorldRect(ui));GuidedCheck(errors.Count==0,"layout "+page+" "+Screen.width+"x"+Screen.height+": "+string.Join("; ",errors));}
        void GuidedDates(){var labels=panels.GetComponentsInChildren<Text>().Where(t=>System.Text.RegularExpressions.Regex.IsMatch(t.text??"",@"^\d{2}-\d{2} \d{2}:\d{2}$")).ToArray();GuidedCheck(labels.Length==3,"three slot timestamps present");foreach(var label in labels)GuidedCheck(label.preferredHeight<=label.rectTransform.rect.height+.1f,"timestamp glyphs fit "+label.text);}
        void WalkToFirstFlag(){for(int i=0;i<480&&!Game.AwaitingSaveChoice;i++)Game.Tick(NativeMotion.Step,new MotionInput{right=true});GuidedCheck(Game.AwaitingSaveChoice,"normal movement touched flag "+Game.Course.Kind);Update();GuidedCheck(page=="save-slots"&&Game.Mode=="paused","contact opened paused save page");}
        static readonly KeyCode[] HiddenAuditKeys={KeyCode.UpArrow,KeyCode.UpArrow,KeyCode.DownArrow,KeyCode.DownArrow,KeyCode.LeftArrow,KeyCode.RightArrow,KeyCode.LeftArrow,KeyCode.RightArrow};
        bool FeedHiddenAudit(float time){bool opened=false;for(int i=0;i<HiddenAuditKeys.Length;i++)opened|=FeedHiddenDeveloperKey(HiddenAuditKeys[i],time+i*.1f);return opened;}
        void CheckNormalButtons(){var text=panels.GetComponentsInChildren<Button>().Select(b=>b.GetComponentInChildren<Text>()?.text??"").ToArray();GuidedCheck(!text.Any(t=>t.Contains("导入")||t.Contains("开发")||t.Contains("示例")||t.Contains("原 11")||t.Contains("锁血")||t.Contains("飞行")||t.Contains("教程")||t.Contains("恢复内置")),"normal page hides development controls "+page);}
        IEnumerator VerifyHiddenDeveloperMenu()
        {
            Show("menu");CheckNormalButtons();yield return Capture("guided-clean-menu");
            Show("builtin-select");CheckNormalButtons();yield return Capture("guided-clean-chapters");
            Show("settings");CheckNormalButtons();Show("pause");CheckNormalButtons();yield return Capture("guided-clean-pause");
            Show("menu");foreach(var key in new[]{KeyCode.W,KeyCode.W,KeyCode.S,KeyCode.S,KeyCode.A,KeyCode.D,KeyCode.A,KeyCode.D})FeedHiddenDeveloperKey(key,Time.unscaledTime);GuidedCheck(page=="menu","WASD cannot open development options");
            float stamp=Time.unscaledTime;for(int i=0;i<HiddenAuditKeys.Length-1;i++)FeedHiddenDeveloperKey(HiddenAuditKeys[i],stamp+i*.1f);GuidedCheck(page=="menu","seven-arrow prefix does not open");
            GuidedCheck(FeedHiddenDeveloperKey(HiddenAuditKeys[7],stamp+.7f)&&page=="developer"&&Game.Mode=="paused","eighth arrow opens paused developer page");
            GuidedLayout();yield return Capture("guided-hidden-developer");GuidedClick("关卡与导入");GuidedLayout();yield return Capture("guided-hidden-imports");GuidedClick("返回");GuidedCheck(page=="menu","developer close returns to originating menu");
            Show("play");GuidedCheck(FeedHiddenAudit(Time.unscaledTime+2)&&page=="developer","code also works during play");GuidedClick("返回");GuidedCheck(page=="play"&&Game.Mode=="playing"&&!Game.DeveloperEnabled,"viewing developer options does not taint play");
            Show("pause");GuidedCheck(FeedHiddenAudit(Time.unscaledTime+4)&&page=="developer","code also works while paused");GuidedClick("返回");GuidedCheck(page=="pause"&&Game.Mode=="paused","developer close preserves paused origin");
        }
        IEnumerator VerifyGuidedPresentation()
        {
            LoadBuiltinCourse("guided-physics");NewGame();var original=Game.Checkpoint;WalkToFirstFlag();
            GuidedCheck(panels.GetComponentsInChildren<Button>().Count(b=>b.name.StartsWith("Save slot "))==6,"six save cards");
            GuidedCheck(!panels.GetComponentsInChildren<Text>().Any(t=>t.text.Contains("把进度存在哪里")||t.text.Contains("选一个位置就好")||t.text.Contains("三门课共用")||t.text.Contains("从哪份记录")),"save choice removes explanatory header lines");
            GuidedCheck(!FeedHiddenAudit(Time.unscaledTime)&&page=="save-slots","hidden shortcut blocked during save choice");
            ChooseSaveSlot(1);GuidedCheck(Game.AwaitingSaveChoice&&!AuditSlots().Read(1).Exists,"opening input cannot accidentally save");
            double elapsed=Game.Elapsed;for(int i=0;i<60;i++)Game.Tick(NativeMotion.Step,new MotionInput{right=true});GuidedCheck(Game.Elapsed==elapsed,"slot modal freezes simulation");
            yield return new WaitForSecondsRealtime(.25f);GuidedLayout();yield return Capture("guided-save-empty");
            GuidedClick("不存，继续走");GuidedCheck(page=="play"&&!Game.AwaitingSaveChoice&&Game.Checkpoint==original,"cancel keeps previous retry point");
            for(int i=0;i<30;i++)Game.Tick(NativeMotion.Step);GuidedCheck(!Game.AwaitingSaveChoice,"cancel does not immediately reopen");
            NewGame();WalkToFirstFlag();yield return new WaitForSecondsRealtime(.25f);GuidedClick("Save slot 01",true);
            GuidedCheck(page=="play"&&!Game.AwaitingSaveChoice&&AuditSlots().Read(1).Readable&&Game.Checkpoint.id!=null,"empty slot writes and commits checkpoint");
            Game.Tick(NativeMotion.Step,new MotionInput{jumpPressed=true});world.Refresh(NativeMotion.Step,view,false);
            var student=world.Root.GetComponentsInChildren<SpriteRenderer>().First(r=>r.name=="Student visual / separate 24x28 motor").transform;
            GuidedCheck(student!=null&&student.localScale!=Vector3.one,"jump uses subtle native sprite deformation");
            GuidedCheck(Mathf.Abs(student.position.y-(Game.Room.Rows-(float)(Game.Player.y+Game.Player.h)/32))<.001f,"deformation preserves player foot pivot");
            var dressing=world.Root.GetComponentsInChildren<Transform>().First(t=>t.name=="Campus action feedback / noncolliding");var actors=dressing.GetComponentsInChildren<SpriteRenderer>();
            GuidedCheck(actors.Length>0,"action feedback pool exists after dressing removal");
            var pausedPositions=actors.Select(a=>a.transform.position).ToArray();var pausedScale=student.localScale;Show("pause");world.Refresh(.5,view,false);
            GuidedCheck(student.localScale==pausedScale&&actors.Select((a,i)=>a.transform.position==pausedPositions[i]).All(x=>x),"save and action presentation freezes while paused");Show("play");
            string physicsFile=AuditSlots().FilePath(1),before=File.ReadAllText(physicsFile);
            NewGame();WalkToFirstFlag();yield return new WaitForSecondsRealtime(.25f);GuidedClick("Save slot 01",true);
            GuidedCheck(page=="overwrite-slot"&&File.ReadAllText(physicsFile)==before,"occupied slot asks before overwriting");yield return new WaitForSecondsRealtime(.25f);GuidedLayout();yield return Capture("guided-overwrite-confirmation");
            GuidedClick("再想想");GuidedCheck(page=="save-slots"&&File.ReadAllText(physicsFile)==before,"declined overwrite keeps bytes");
            yield return new WaitForSecondsRealtime(.25f);GuidedClick("Save slot 01",true);yield return new WaitForSecondsRealtime(.25f);
            original=Game.Checkpoint;
            using(var locked=new FileStream(physicsFile,FileMode.Open,FileAccess.Read,FileShare.Read)){GuidedClick("覆盖并保存");GuidedCheck(Game.AwaitingSaveChoice&&Game.Checkpoint==original,"write failure keeps pending choice and retry point");}
            GuidedCheck(File.ReadAllText(physicsFile)==before,"failed overwrite preserves old slot bytes");
            if(page=="save-slots"){yield return new WaitForSecondsRealtime(.25f);GuidedClick("Save slot 01",true);}
            yield return new WaitForSecondsRealtime(.25f);GuidedClick("覆盖并保存");GuidedCheck(page=="play"&&AuditSlots().Read(1).Readable&&!Game.AwaitingSaveChoice,"retry after failed write succeeds");
            LoadBuiltinCourse("guided-calculus");NewGame();WalkToFirstFlag();yield return new WaitForSecondsRealtime(.25f);GuidedClick("Save slot 02",true);GuidedCheck(AuditSlots().Read(1).Readable&&AuditSlots().Read(2).Readable,"chapters share six manual slots");
            LoadBuiltinCourse("guided-slacker");NewGame();WalkToFirstFlag();yield return new WaitForSecondsRealtime(.25f);GuidedClick("Save slot 03",true);
            OpenLoadSlots("pause");yield return new WaitForSecondsRealtime(.25f);GuidedLayout();GuidedDates();yield return Capture("guided-load-three-chapters");
            GuidedCheck(panels.GetComponentsInChildren<Button>().Count(b=>b.name.StartsWith("Load slot "))==6,"six load cards");
            Screen.SetResolution(1024,768,FullScreenMode.Windowed);yield return new WaitForSecondsRealtime(.35f);Show("load-slots");yield return new WaitForSecondsRealtime(.25f);GuidedLayout();GuidedDates();yield return Capture("guided-load-1024x768");
            GuidedClick("Load slot 02",true);GuidedCheck(Game.Course.Id=="guided-calculus"&&page=="play"&&!Game.AwaitingSaveChoice,"load changes chapter after validated restoration");
            for(int i=0;i<100;i++)Game.Tick(NativeMotion.Step);GuidedCheck(!Game.AwaitingSaveChoice,"loaded flag does not prompt on resume");
            var gameBeforeBad=Game;string identityBeforeBad=identity;var bad=(JObject)AuditSlots().Read(2).Data.DeepClone();bad["slot"]=4;bad["continuation"]["course"]="does-not-exist";File.WriteAllText(AuditSlots().FilePath(4),bad.ToString());
            OpenLoadSlots("pause");yield return new WaitForSecondsRealtime(.25f);GuidedClick("Load slot 04",true);GuidedCheck(Game==gameBeforeBad&&identity==identityBeforeBad&&page=="load-slots","invalid cross-chapter continuation preserves current game");
            yield return new WaitForSecondsRealtime(.25f);CloseLoadSlots();GuidedCheck(page=="pause","failed load remains escapable");
            Screen.SetResolution(1280,720,FullScreenMode.Windowed);yield return new WaitForSecondsRealtime(.35f);
            LoadBuiltinCourse("guided-slacker");NewGame();courseMapPreferred=true;OpenExplorationMap();yield return null;
            GuidedCheck(panels.GetComponentsInChildren<Text>().Any(t=>t.text.Contains("咖啡")&&t.text.Contains("讲义")),"known water room map displays remaining items");
            GuidedLayout();yield return Capture("guided-known-room-supplies");CloseExplorationMap(true);
            yield return VerifyHiddenDeveloperMenu();
            File.WriteAllText(Path.Combine(Evidence(),"guided-ui-checks.json"),new JObject{{"checks",guidedUiChecks},{"actualProductionCanvas",true},{"contactMethod","normal fixed-step movement"},{"saveLocation",saveDirectory},{"fullManualPlaythrough",false}}.ToString());
            Debug.Log("GUIDED_UI_PASS checks="+guidedUiChecks.Count+" sixSlots=true cancel=true overwrite=true writeFailure=true crossChapter=true mapCounts=true");
        }
    }
}
