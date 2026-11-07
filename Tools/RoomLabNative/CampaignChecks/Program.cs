using System;
using System.Linq;
using System.IO;
using Newtonsoft.Json.Linq;
using RoomLab.Native;
class Program
{
 static void Check(bool b,string m){if(!b)throw new Exception(m);}
 static int Main(string[] args){
  var p=NativeProjectLoader.LoadFile("Assets/StreamingAssets/RoomLabNative/Campaign/deadline-night.json");var results=new JArray();int failed=0;
  foreach(var c in p.Courses)foreach(var r in c.Rooms){
   var g=new NativeMotion(p,c.Id,r.Id,NativeGameplayRules.DemoPhysics);int lane=0,stuck=0;double lastX=g.Player.x;bool reached=false;
   var route=(JArray)r.Raw["nativeCampaign"]["route"];
   for(int frame=0;frame<120*180;frame++){
    var player=g.Player;double feet=(player.y+player.h)/32;
    int floor=(int)route[lane]["floor"];
    if(lane<route.Count-1&&feet>floor+5){lane++;floor=(int)route[lane]["floor"];}
    int dir=(int)route[lane]["direction"];bool right=dir>0,left=dir<0,jump=false,dash=false;
    // Only real input: no position writes, invulnerability, developer options or trigger calls.
    if(player.grounded){
     foreach(var b in g.CollisionRects){double front=dir>0?b.x-player.x-player.w:player.x-b.x-b.w;
      if(front>=-1&&front<38&&b.y<player.y+player.h-4&&b.y+b.h>player.y+2){jump=true;break;}}
     foreach(var o in r.Objects)if(o.Type=="common.spike"){double front=dir>0?o.X*32-player.x-player.w:player.x-o.X*32-32;if(front>=-1&&front<43&&Math.Abs(o.Y*32+32-player.y-player.h)<40)jump=true;}
    }
    // Stand at required sign-in pads until the assistant is close enough.
    foreach(var o in r.Objects)if(o.Type=="slacker.checkin"&&g.ObjectStates[o.Id].signIns==0&&Math.Abs(player.x+12-(o.X+.5)*32)<18&&Math.Abs(feet-o.Y)<.4){right=left=false;jump=false;}
    double distance=Math.Sqrt(Math.Pow(g.AI.x-player.x-12,2)+Math.Pow(g.AI.y-player.y-14,2));
    if(g.AI.active&&distance<85&&player.freeDash&&!jump)dash=true;
    g.Tick(NativeMotion.Step,new MotionInput{left=left,right=right,jumpPressed=jump,dashPressed=dash,interactPressed=!g.AI.active&&g.NearbyInteraction!=null});
    if(g.Room.Id!=r.Id||g.Completed){reached=true;break;}
    if(g.Deaths>0){lane=0;while(lane<route.Count-1&&(g.Player.y+g.Player.h)/32>(int)route[lane]["floor"]+5)lane++;}
    if(Math.Abs(g.Player.x-lastX)<.01)stuck++;else stuck=0;lastX=g.Player.x;
    if(stuck>120*12)break;
   }
   var result=new JObject{{"room",r.Id},{"reachedExit",reached},{"seconds",Math.Round(g.Elapsed,2)},{"deaths",g.Deaths},{"x",Math.Round(g.Player.x/32,2)},{"y",Math.Round(g.Player.y/32,2)},{"objective",g.CampaignObjective}};
   results.Add(result);Console.WriteLine(result.ToString(Newtonsoft.Json.Formatting.None));if(!reached)failed++;
  }
  Directory.CreateDirectory("Validation/Native/EarlyGame20261107");File.WriteAllText("Validation/Native/EarlyGame20261107/normal-input-routes.json",results.ToString());
  Console.WriteLine("CAMPAIGN_INPUT_CHECK rooms=24 failed="+failed+" (automated input, not human first-play timing)");return failed==0?0:1;
 }
}
