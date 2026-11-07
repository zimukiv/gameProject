using System;
using UnityEngine;
namespace RoomLab.Native
{
    // Presentation only. The 1.2s clarity envelope is not a gameplay buff duration.
    public sealed class NativeDreamPresentation : IDisposable
    {
        public readonly GameObject Root;
        public float Clarity { get; private set; }
        public const float ClaritySeconds = 1.2f;
        readonly NativeMotion game;
        readonly LineRenderer[] mist = new LineRenderer[6], sleep = new LineRenderer[4];
        readonly LineRenderer spark, trail;
        readonly Material material;
        string room;
        int life, deaths;
        long boosts;
        float remaining, clock;
        bool disposed;
        public NativeDreamPresentation(NativeMotion game, Transform parent)
        {
            this.game=game;
            Root=new GameObject("Dream presentation / visual only");Root.transform.SetParent(parent,false);
            material=new Material(Shader.Find("Sprites/Default"));
            for(int i=0;i<mist.Length;i++)mist[i]=Line("Dream mist "+i,2,-6);
            for(int i=0;i<sleep.Length;i++)sleep[i]=Line("Drowsy Z "+i,4,-4);
            spark=Line("Wake sparkle / visual 1.2s",5,11);
            trail=Line("Wake speed trail / noncolliding",2,8);
            Reset();Refresh(0);
        }
        LineRenderer Line(string name,int points,int order)
        {
            var child=new GameObject(name);child.transform.SetParent(Root.transform,false);
            var line=child.AddComponent<LineRenderer>();line.sharedMaterial=material;line.useWorldSpace=true;
            line.positionCount=points;line.sortingOrder=order;line.numCapVertices=0;line.numCornerVertices=0;
            line.startWidth=line.endWidth=1f/32;line.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;line.receiveShadows=false;
            return line;
        }
        long BoostCount(out double cooldown)
        {
            long count=0;cooldown=0;
            foreach(var o in game.Room.Objects)if(o.Type=="slacker.awake"&&game.ObjectStates.TryGetValue(o.Id,out var state))
            {count+=state.boosts;cooldown=Math.Max(cooldown,state.cooldown);}
            return count;
        }
        void Reset(){room=game.Room.Id;life=game.Life;deaths=game.Deaths;boosts=BoostCount(out _);remaining=clock=Clarity=0;}
        static void Tint(LineRenderer line,Color color){line.startColor=line.endColor=color;}
        public void Refresh(double dt)
        {
            if(disposed)return;
            bool enabled=game.Course.Kind=="slacker";
            Root.SetActive(enabled);if(!enabled)return;
            bool reset=room!=game.Room.Id||life!=game.Life||deaths!=game.Deaths;
            if(reset)Reset();
            long current=BoostCount(out var cooldown);
            if(!reset&&current>boosts&&game.RespawnRemaining<=0)remaining=ClaritySeconds;
            boosts=current;
            // Pause freezes the presentation; continuing from a checkpoint creates/reset this envelope.
            float step=game.Mode=="playing"?(float)Math.Max(0,Math.Min(dt,.1)):0;
            if(game.RespawnRemaining>0)remaining=0;
            remaining=Mathf.Max(0,remaining-step);clock+=step;
            Clarity=game.IsRework?(float)game.Awareness/100:Mathf.SmoothStep(0,1,Mathf.Min(1,remaining/.25f));
            float cols=game.Room.Cols,rows=game.Room.Rows;
            for(int i=0;i<mist.Length;i++){
                float y=rows*(i+.5f)/mist.Length+Mathf.Sin(clock*.25f+i)*.2f;
                var line=mist[i];line.startWidth=line.endWidth=Mathf.Min(2.5f,rows/6f);
                line.SetPosition(0,new Vector3(0,y,0));line.SetPosition(1,new Vector3(cols,y+.25f,0));
                Tint(line,new Color(.42f,.46f,.58f,.07f*(1-Clarity)));
            }
            for(int i=0;i<sleep.Length;i++){
                float x=cols*(i+.5f)/sleep.Length+Mathf.Sin(clock*.3f+i)*.15f;
                float y=rows*(.65f+.12f*Mathf.Sin(i*2))+Mathf.Sin(clock*.5f+i)*.15f;
                if(i==0){x=(float)(game.Player.x+game.Player.w/2)/32+.22f;y=rows-(float)game.Player.y/32+.25f+Mathf.Sin(clock*.5f)*.06f;}
                var line=sleep[i];line.SetPosition(0,new Vector3(x,y+.22f,0));line.SetPosition(1,new Vector3(x+.22f,y+.22f,0));line.SetPosition(2,new Vector3(x,y,0));line.SetPosition(3,new Vector3(x+.22f,y,0));
                Tint(line,new Color(.65f,.7f,.82f,.2f*(1-Clarity)));
            }
            float px=(float)(game.Player.x+game.Player.w/2)/32,py=rows-(float)game.Player.y/32;
            spark.enabled=remaining>ClaritySeconds-.25f;
            float size=.16f+(ClaritySeconds-remaining)*.4f;
            spark.SetPosition(0,new Vector3(px,py+.2f+size,0));spark.SetPosition(1,new Vector3(px+size,py+.2f,0));spark.SetPosition(2,new Vector3(px,py+.2f-size,0));spark.SetPosition(3,new Vector3(px-size,py+.2f,0));spark.SetPosition(4,new Vector3(px,py+.2f+size,0));Tint(spark,new Color(1,.9f,.55f,.75f));
            trail.enabled=remaining>0&&Math.Abs(game.Player.vx)>100;
            trail.SetPosition(0,new Vector3(px,py-.35f,0));trail.SetPosition(1,new Vector3(px-(float)game.Player.vx/1000,py-.35f,0));Tint(trail,new Color(.6f,1,1,.35f*Clarity));
        }
        public void Dispose(){if(disposed)return;disposed=true;Root.SetActive(false);UnityEngine.Object.Destroy(Root);UnityEngine.Object.Destroy(material);}
    }
}
