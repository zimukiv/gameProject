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
        IEnumerator VerifyDAlphaRoute()
        {
            var args=Environment.GetCommandLineArgs();int arg=Array.IndexOf(args,"-nativeDAlphaReplayPath");
            if(arg<0||arg+1>=args.Length)throw new Exception("Missing d-alpha replay file");
            var replay=JObject.Parse(File.ReadAllText(args[arg+1]));
            var inputs=(JArray)replay["inputs"];var markers=(JArray)replay["markers"];
            double dt=(double)replay["dt"];
            if(Math.Abs(dt-NativeMotion.Step)>1e-10||inputs.Count==0)throw new Exception("Invalid replay step");
            LoadAutosaveCourse("guided-calculus");
            if((string)replay["course"]!="guided-calculus"||(string)replay["room"]!="network-calculus-10")throw new Exception("Unexpected replay room");
            SetGame(new NativeMotion(Game.Project,(string)replay["course"],(string)replay["room"],NativeGameplayRules.DemoPhysics));Show("play");
            var captures=new JArray();var checks=new JArray();
            yield return Capture("dalpha-000-entry");
            for(int i=0;i<inputs.Count;i++){
                Game.Tick(dt,inputs[i].ToObject<MotionInput>());
                world.Refresh(dt,view,false);
                foreach(var marker in markers.Where(m=>(int)m["frame"]==i+1)){
                    string name="dalpha-"+(i+1).ToString("D5")+"-"+captures.Count.ToString("D2");
                    Update();CampaignTick();yield return Capture(name);
                    captures.Add(new JObject{{"file",name+".png"},{"frame",i+1},{"target",marker["target"]?.DeepClone()},{"x",Game.Player.x/32},{"feet",(Game.Player.y+Game.Player.h)/32},{"cameraRows",view.orthographicSize*2}});
                }
                if(i%120==0)yield return null;
            }
            Update();CampaignTick();yield return Capture("dalpha-final-exit");
            checks.Add(new JObject{{"check","ordinary input reaches completed exit"},{"pass",Game.Completed}});
            checks.Add(new JObject{{"check","no deaths"},{"pass",Game.Deaths==0}});
            checks.Add(new JObject{{"check","developer controls unused"},{"pass",!Game.DeveloperEnabled&&!Game.DeveloperFlight}});
            checks.Add(new JObject{{"check","all replay markers captured"},{"pass",captures.Count==markers.Count}});
            var result=new JObject{{"checks",checks},{"source",Game.Project.SourceSha256},{"runtimeAssemblySha256",NativeProjectLoader.Sha(File.ReadAllBytes(typeof(NativePhysicsDemoPlayer).Assembly.Location))},{"normalInputOnly",true},{"start","native final room entrance; no actor placement or switch edits"},{"frames",inputs.Count},{"dt",dt},{"captures",captures},{"deaths",Game.Deaths},{"completed",Game.Completed}};
            File.WriteAllText(Path.Combine(Evidence(),"dalpha-runtime.json"),result.ToString());
            bool passed=checks.All(c=>(bool)c["pass"]);Debug.Log("DALPHA_ROUTE_RUNTIME_"+(passed?"PASS":"FAIL")+" frames="+inputs.Count);Finish(passed?0:2);
        }
    }
}
