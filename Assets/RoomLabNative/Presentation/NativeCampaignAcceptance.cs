using System;
using System.Collections;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
namespace RoomLab.Native
{
    public sealed partial class NativePhysicsDemoPlayer
    {
        bool campaignVerify;
        IEnumerator VerifyCampaign(){
            yield return null;
            if(Array.IndexOf(Environment.GetCommandLineArgs(),"-nativeDAlphaRouteVerify")>=0){yield return VerifyDAlphaRoute();yield break;}
            if(Array.IndexOf(Environment.GetCommandLineArgs(),"-nativeAutosaveVerify")>=0){yield return VerifyAutosaveEdition();yield break;}
            if(Array.IndexOf(Environment.GetCommandLineArgs(),"-nativeGuidedVerify")>=0)yield return VerifyGuidedPresentation();
            if(Array.IndexOf(Environment.GetCommandLineArgs(),"-nativeCustomAssetsVerify")>=0){
                var good=NativeAssetOverrides.Texture("player-idle00",Resources.Load<Texture2D>("PhysicsPixel/player-idle00"));var bad=NativeAssetOverrides.Texture("ai-idle00",Resources.Load<Texture2D>("PhysicsPixel/ai-idle00"));
                if(!good.name.StartsWith("custom:")||bad.name.StartsWith("custom:")||!sounds["jump"].name.StartsWith("custom:")||sounds["dash"].name.StartsWith("custom:")||NativeAssetOverrides.Title!="本地替换验收")throw new Exception("Custom asset valid/fallback/UI check failed");
                Debug.Log("CUSTOM_ASSETS_PASS png=true wav=true invalidFallback=true ui=true");
            }
            string[] legacyValidationIds={"guided-physics","guided-calculus","guided-slacker"};
            int renderedRooms=0;
            foreach(string id in legacyValidationIds){
                LoadBuiltinCourse(id);NewGame();yield return new WaitForSecondsRealtime(.3f);
                if(Game.IsNetwork)yield return VerifyNetworkPresentation();
                if(Game.IsRework&&Game.Course.Kind=="calculus"){
                    yield return Capture("weakguide-calculus-arrival");
                    if(NoteFont==null||hud.font!=NoteFont||hint.transform.parent.GetComponent<CanvasGroup>()?.alpha<.1f)throw new Exception("Handwritten font / first soft hint missing");
                    // Verification normally freezes the motor for stable screenshots. Advance its
                    // real fixed-step clock here so hint expiry is exercised, not only wall time.
                    for(int tick=0;tick<516;tick++){Game.Tick(NativeMotion.Step);yield return null;}
                    yield return new WaitForSecondsRealtime(.5f);
                    if(hint.transform.parent.GetComponent<CanvasGroup>().alpha>.05f)throw new Exception("Soft hint remained visible");
                    yield return Capture("weakguide-calculus-cleared");Debug.Log("WEAK_GUIDANCE_PASS handwritten=true temporary=true cleared=true");
                }
                if(!Game.IsCampaign||Game.Course.Rooms.Count<7||FindObjectsByType<AudioListener>(FindObjectsSortMode.None).Length!=1)throw new Exception("Campaign/audio listener setup failed");
                CampaignTick();yield return new WaitForSecondsRealtime(.3f);
                if(exploreMusic.clip==null||chaseMusic.clip==null||!exploreMusic.isPlaying||!chaseMusic.isPlaying)throw new Exception("Music stem playback failed");
                SaveProgress();if(!CanContinue())throw new Exception("Campaign save missing");Continue();
                yield return Capture("campaign-"+Game.Course.Kind+"-opening");
                Show("pause");yield return Capture("campaign-"+Game.Course.Kind+"-pause");
                Show("collection");yield return Capture("campaign-"+Game.Course.Kind+"-collection");
                Show("builtin-select");yield return Capture("campaign-"+Game.Course.Kind+"-chapters");
                var data=Game.Project;
                foreach(var room in Game.Course.Rooms){SetGame(new NativeMotion(data,Game.Course.Id,room.Id,NativeGameplayRules.DemoPhysics));Show("play");world.Refresh(0,view,false);renderedRooms++;yield return null;if(Game.IsRework&&Game.Course.Rooms.IndexOf(room)>=6&&Game.Course.Rooms.IndexOf(room)<=9){map=true;yield return Capture("extended-"+room.Id);map=false;}}
                if(Game.IsRework){if(Game.Course.Kind=="slacker"){foreach(double awareness in new[]{15d,50d,90d}){SetGame(new NativeMotion(data,Game.Course.Id,Game.Course.Rooms[5].Id,NativeGameplayRules.DemoPhysics));Game.Awareness=awareness;Show("play");yield return Capture("rework-awareness-"+awareness);}}if(Game.Course.Kind=="calculus"){SetGame(new NativeMotion(data,Game.Course.Id,Game.Course.Rooms[2].Id,NativeGameplayRules.DemoPhysics));Game.ReworkSignals["beta"]=true;for(int step=0;step<150;step++)Game.Tick(NativeMotion.Step);Show("play");map=true;yield return Capture("rework-beta-open-map");map=false;}}var sample=Game.Course.Rooms[4];SetGame(new NativeMotion(data,Game.Course.Id,sample.Id,NativeGameplayRules.DemoPhysics));Show("play");yield return Capture("campaign-"+Game.Course.Kind+"-challenge");
                var relic=Game.Room.Objects.First(o=>o.Type=="common.collectible");Game.AI.active=true;Game.AI.x=relic.X*32+16;Game.AI.y=relic.Y*32+16;Game.AiProcessing=2;Game.Tick(NativeMotion.Step);PumpSounds();string relicKey=Game.Room.Id+"/"+relic.Id;
                if(!journal.Contains(relicKey))throw new Exception("AI collection event did not reach journal");
                SaveRecord(false);LoadBuiltinCourse(id==legacyValidationIds[0]?legacyValidationIds[1]:legacyValidationIds[0]);LoadBuiltinCourse(id);
                if(!journal.Contains(relicKey))throw new Exception("Journal lost after chapter switch");
                Debug.Log("CAMPAIGN_JOURNAL_PASS "+id+" ai-event=true persisted=true syntheticPlacement=true");
                Debug.Log("CAMPAIGN_RUNTIME_CHAPTER_PASS "+id+" rooms="+Game.Course.Rooms.Count+" music=playing save=restored");
            }
            LoadBuiltinCourse(legacyValidationIds[0]);Show("menu");yield return Capture("campaign-menu");
            Show("settings");yield return Capture("campaign-settings");
            var problems=new System.Collections.Generic.List<string>();NativeUiKit.Validate((RectTransform)panels,problems,NativeUiKit.WorldRect(ui));
            if(problems.Count>0)throw new Exception("Campaign UI: "+string.Join("; ",problems));
            Screen.SetResolution(1024,768,FullScreenMode.Windowed);yield return new WaitForSecondsRealtime(.3f);Show("settings");yield return Capture("campaign-settings-1024");Show("builtin-select");yield return Capture("campaign-chapters-1024");
            File.WriteAllText(Path.Combine(Evidence(),"campaign-runtime.json"),new JObject{{"chapters",3},{"renderedRooms",renderedRooms},{"musicStemsPlaying",true},{"audioListenerCount",1},{"continuationsRestored",3},{"fullManualPlaythrough",false}}.ToString());
            Debug.Log("CAMPAIGN_RUNTIME_PASS chapters=3 renderedRooms="+renderedRooms+" soundClips="+sounds.Count);Finish(0);
        }
    }
}
