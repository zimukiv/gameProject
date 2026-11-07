using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace RoomLab.Native
{
    public sealed class NativeAutoSaveRequest
    {
        readonly JObject continuation;
        public JObject Continuation => (JObject)continuation.DeepClone();
        public readonly string Reason, Chapter, Kind, Room;
        public readonly int Collected;
        public NativeAutoSaveRequest(JObject continuation,string reason,string chapter,string kind,string room,int collected)
        {this.continuation=(JObject)(continuation??throw new ArgumentNullException(nameof(continuation))).DeepClone();Reason=reason;Chapter=chapter;Kind=kind;Room=room;Collected=collected;}
    }
    public sealed partial class NativeMotion
    {
        public bool IsContactAutosave => Rules==NativeGameplayRules.DemoPhysics&&(string)Project.OriginalJson["nativeCampaign"]?["saveMode"]=="contact-auto-v1";
        public bool UsesManualSaveSlots => IsGuided||IsContactAutosave;
        public bool IsAuthoredPhysics => NativeReworkValidation.IsAuthoredPhysics(Project,Course);
        readonly Queue<NativeAutoSaveRequest> autoSaveRequests=new Queue<NativeAutoSaveRequest>();
        public int PendingAutoSaveCount => autoSaveRequests.Count;
        public bool TryDequeueAutoSave(out NativeAutoSaveRequest request)
        {if(autoSaveRequests.Count==0){request=null;return false;}request=autoSaveRequests.Dequeue();return true;}
        bool PreferContactInteraction(NativeObject candidate,NativeObject current)
        {
            if(!IsContactAutosave||current==null)return false;
            bool candidateTerminal=candidate.Type=="common.aiStart"||candidate.Type=="common.aiStartHollow";
            bool currentTerminal=current.Type=="common.aiStart"||current.Type=="common.aiStartHollow";
            if(candidateTerminal&&current.Type=="common.checkpoint")return !AI.active;
            if(candidate.Type=="common.checkpoint"&&currentTerminal)return AI.active;
            return false;
        }
        void QueueContactAutoSave(string reason)
        {
            if(!IsContactAutosave||DeveloperEnabled||DeveloperFlight||Completed)return;
            autoSaveRequests.Enqueue(new NativeAutoSaveRequest(ExportContinuation(),reason,Course.Name,Course.Kind,Room.Name,CampaignCollected));
            Emit("auto-save-request",new JObject{{"reason",reason}});
        }
        bool CheckpointPosition(NativeObject o,out double x,out double y)
        {
            x=o.X*32+4;y=o.Collision?o.Y*32-28:o.Y*32+4;
            if(!SafePosition(x,y)){x=Player.x;y=Player.y-(Player.crouching?10:0);}
            return SafePosition(x,y);
        }
        void HandleContactCheckpoint(NativeObject o,MotionObjectState state,bool occupied,MotionInput input,NativeObject interaction)
        {
            bool ready=!o.Trigger["requiresAI"].Value<bool>()||(AI.active&&AI.id==(o.AiId??Room.AiId??Course.AiId)&&Hypot(AI.x-(o.X+.5)*32,AI.y-o.Y*32)<=((double?)o.Trigger["distance"]??5)*32);
            state.waitingAI=!ready;state.hasWaitingAI=true;
            if(!occupied)state.firedDuringContact=false;
            else if(ready&&!state.firedDuringContact)
            {
                // Serialize the occupied latch before capturing the continuation, so loading while
                // standing on the same flag does not generate another automatic save.
                state.firedDuringContact=true;state.used=true;SaveCheckpoint(o);
            }
            if(ready&&input.interactPressed&&interaction==o&&CheckpointPosition(o,out var x,out var y))
            {networkExitPressed=false;RequestCheckpointChoice(o,x,y);}
        }
        bool CommitContactExitAnchor(string reason)
        {
            if(!IsContactAutosave)return true;
            double x=Player.x,y=Player.y-(Player.crouching?10:0);
            if(!SafePosition(x,y))
            {
                bool found=false;
                // A malformed imported entry can be embedded in geometry. Prefer a nearby safe
                // point above/alongside it without changing the authored layout or live player.
                for(int radius=1;radius<=8&&!found;radius++)for(int dx=-radius;dx<=radius;dx++)
                {double sx=x+dx*16,sy=y-radius*16;if(SafePosition(sx,sy)){x=sx;y=sy;found=true;break;}}
                if(!found){Emit("auto-save-unavailable",new JObject{{"reason","unsafe-entry"}});return false;}
            }
            var restoredRect=new MotionRect(null,x,y,24,28);
            foreach(var o in Room.Objects)if(o.Type=="common.checkpoint")
            {
                var r=ObjectRect(o);bool onTop=Math.Abs(y+28-r.y)<1&&x+24>r.x+2&&x<r.x+r.w-2;
                if(MotionRect.Overlap(restoredRect,r)||onTop)ObjectStates[o.Id].firedDuringContact=true;
            }
            Checkpoint=CaptureCheckpoint(null,x,y);SaveResourceAnchor();QueueContactAutoSave(reason);return true;
        }
    }
}
