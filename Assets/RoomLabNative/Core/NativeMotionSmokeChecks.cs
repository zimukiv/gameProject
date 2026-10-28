using System;
namespace RoomLab.Native
{
    // The same integration checks run in .NET, Unity Play Mode and the standalone prototype.
    public static class NativeMotionSmokeChecks
    {
        static void Require(bool value,string name){if(!value)throw new InvalidOperationException("Native motion contact: "+name);}
        public static int Run(NativeProject project)
        {
            int n=0;var g=new NativeMotion(project);var jet=g.Room.Objects.Find(o=>o.Id=="prototype-jet");g.Player.x=jet.X*32+4;g.Player.y=jet.Y*32-28;g.Player.grounded=true;g.Player.support="tile-7-20";g.Tick(NativeMotion.Step);
            Require(g.Player.launched&&g.Player.vy==-900&&g.ObjectStates[jet.Id].used,"real jet top trigger");n++;
            g=new NativeMotion(project);var rail=g.Room.Objects.Find(o=>o.Id=="prototype-rail");g.Player.x=rail.X*32+4;g.Player.y=rail.Y*32-28;g.Player.grounded=true;g.Tick(NativeMotion.Step);Require(g.Player.rail!=null,"real rail top trigger");n++;
            int ticks=0;while(g.Player.rail!=null&&ticks++<1000)g.Tick(NativeMotion.Step);Require(ticks<1000&&g.Player.launched,"multi segment rail exit");n++;Require(g.Tokens>0,"rail pickup");n++;
            g=new NativeMotion(project);g.Player.x=rail.X*32+4;g.Player.y=rail.Y*32-28;g.Player.grounded=true;g.Tick(NativeMotion.Step);g.Tick(NativeMotion.Step,new MotionInput{jumpPressed=true});Require(g.Player.rail==null&&g.Player.vy<0,"rail jump detach");n++;
            g=new NativeMotion(project);g.Player.x=rail.X*32+4;g.Player.y=rail.Y*32-28;g.Player.grounded=true;g.Tick(NativeMotion.Step);g.Tick(NativeMotion.Step,new MotionInput{left=true,dashPressed=true});Require(g.Player.rail==null&&g.Player.vx<0,"rail dash detach");n++;
            g=new NativeMotion(project);var spike=g.Room.Objects.Find(o=>o.Type=="common.spike");g.Player.x=spike.X*32+4;g.Player.y=spike.Y*32+3;g.Tick(NativeMotion.Step);Require(g.Deaths==1&&g.RespawnRemaining==.5,"spike retry");n++;
            double x=g.Player.x;for(int i=0;i<60;i++)g.Tick(NativeMotion.Step,new MotionInput{right=true,dashPressed=true,jumpPressed=true});Require(g.RespawnRemaining==0&&g.Player.x==x&&g.Player.dashCount==0,"frozen retry input discard");n++;
            g=new NativeMotion(project);g.Player.x=35*32;g.Player.y=20*32-28;g.Player.grounded=true;g.Tick(NativeMotion.Step,new MotionInput{down=true});Require(g.Player.crouching&&g.Player.h==18,"crouch");n++;
            g=new NativeMotion(project);g.Player.x=36*32-24-.1;g.Player.y=20*32-28;g.Player.grounded=true;g.Tick(NativeMotion.Step,new MotionInput{right=true});Require(Math.Abs(g.Player.x-(36*32-24))<.001&&g.Player.vx==0,"wall corner collision");n++;
            g=new NativeMotion(project);g.Player.x=4*32+4;g.Player.y=20*32-18;g.Player.h=18;g.Player.crouching=g.Player.grounded=true;g.Tick(NativeMotion.Step);Require(g.Player.h==18&&g.Player.crouching,"low ceiling blocks standing");n++;g.Player.x=3*32;g.Tick(NativeMotion.Step);Require(g.Player.h==28&&!g.Player.crouching,"clear headroom allows standing");n++;
            foreach(string direction in new[]{"up","down","left","right"}){var r=new MotionRect(null,100,100,32,32);MotionRect contact=direction=="up"?new MotionRect(null,112,121,8,8):direction=="down"?new MotionRect(null,112,103,8,8):direction=="right"?new MotionRect(null,103,112,8,8):new MotionRect(null,121,112,8,8);Require(NativeMotion.SpikeTouches(contact,r,direction),"oriented spike contact "+direction);n++;}
            return n;
        }
    }
}
