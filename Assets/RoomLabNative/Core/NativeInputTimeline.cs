using System;
using System.Collections.Generic;

namespace RoomLab.Native
{
    // Captures ordered physical edges, including two presses shorter than one simulation step.
    // Keep fixed simulation steps and bound catch-up work after a stalled render frame.
    public sealed class NativeInputTimeline
    {
        readonly Queue<MotionInput> edges=new Queue<MotionInput>(32);
        const int MaxTicksPerFrame=8;
        const int MaxEdges=64;
        double accumulator;public bool ProtectionPaused{get;private set;}public string ProtectionReason{get;private set;}
        public int PendingEdges{get{return edges.Count;}}public double PendingSeconds{get{return accumulator;}}
        public void Reset(){edges.Clear();accumulator=0;ProtectionPaused=false;ProtectionReason=null;}
        public void LoseFocus(NativeMotion game){Reset();if(game.Mode=="playing")game.TogglePause();}
        public void ProtectInputOverflow(NativeMotion game)
        {
            if(ProtectionPaused||game.Mode!="playing")return;
            edges.Clear();accumulator=0;
            ProtectionPaused=true;
            ProtectionReason="输入积压保护暂停，请恢复后重试";
            game.TogglePause();
        }
        public void Advance(NativeMotion game,double dt,MotionInput input)
        {
            if(ProtectionPaused)return;if(game.Mode!="playing"){Reset();return;}
            if(double.IsNaN(dt)||double.IsInfinity(dt)||dt<0)throw new ArgumentOutOfRangeException("dt");
            if(game.RespawnRemaining>0)edges.Clear();
            else if(input.jumpPressed||input.dashPressed||input.interactPressed){
                if(edges.Count>=MaxEdges){ProtectInputOverflow(game);return;}
                edges.Enqueue(input);
            }
            accumulator+=Math.Min(dt,MaxTicksPerFrame*NativeMotion.Step);
            while(accumulator+1e-12>=NativeMotion.Step){var tick=input.WithoutEdges();if(edges.Count>0)tick=edges.Dequeue();game.Tick(NativeMotion.Step,tick);accumulator-=NativeMotion.Step;if(accumulator<0&&accumulator>-1e-10)accumulator=0;
                if(game.Mode!="playing"||game.RespawnRemaining>0)edges.Clear();if(game.Mode!="playing"){Reset();return;}
            }
        }
    }
}
