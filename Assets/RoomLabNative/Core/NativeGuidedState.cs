using System;
using Newtonsoft.Json.Linq;
namespace RoomLab.Native
{
    public sealed partial class NativeMotion
    {
        public bool IsGuided=>IsRework&&(bool?)Project.OriginalJson["nativeCampaign"]?["guided"]==true;
        string pendingCheckpoint;
        double pendingCheckpointX,pendingCheckpointY;
        public bool AwaitingSaveChoice=>pendingCheckpoint!=null;
        public string PendingCheckpointId=>pendingCheckpoint;
        void ResetCheckpointChoice(){pendingCheckpoint=null;}
        bool RequestCheckpointChoice(NativeObject point,double x,double y)
        {
            if(!UsesManualSaveSlots)return false;
            // E may be pressed from just outside the trigger rectangle. The saved position is
            // on the flag, so its contact latch must already be present in the frozen snapshot.
            if(IsContactAutosave)ObjectStates[point.Id].firedDuringContact=true;
            pendingCheckpoint=point.Id;pendingCheckpointX=x;pendingCheckpointY=y;Mode="paused";
            Emit("checkpoint-prompt",new JObject{{"id",point.Id}});return true;
        }
        // Preparing the on-disk transaction must not change the retry point. Only a successful
        // write followed by ResolveCheckpointChoice(true) makes this the new checkpoint.
        public JObject PrepareCheckpointSave()
        {
            if(!UsesManualSaveSlots||!AwaitingSaveChoice||!SafePosition(pendingCheckpointX,pendingCheckpointY))throw new InvalidOperationException("还没到存档点");
            var previous=Checkpoint;var anchor=ResourceAnchor;
            try{Checkpoint=CaptureCheckpoint(pendingCheckpoint,pendingCheckpointX,pendingCheckpointY);SaveResourceAnchor();return ExportContinuation();}
            finally{Checkpoint=previous;ResourceAnchor=anchor;}
        }
        public void ResolveCheckpointChoice(bool save)
        {
            if(!AwaitingSaveChoice)return;
            string id=pendingCheckpoint;pendingCheckpoint=null;
            if(save){Checkpoint=CaptureCheckpoint(id,pendingCheckpointX,pendingCheckpointY);SaveResourceAnchor();Emit("checkpoint",new JObject{{"id",id},{"x",pendingCheckpointX},{"y",pendingCheckpointY}});Message="存好了，接着走。";}
            Mode="playing";
        }
        public int RemainingAwarenessItems(string roomId,bool coffee)
        {
            if(!IsAwarenessResource||!VisitedRooms.Contains(roomId))return -1;
            var room=Course.Rooms.Find(r=>r.Id==roomId);if(room==null)return -1;
            roomCaches.TryGetValue(roomId,out var saved);int count=0;
            foreach(var item in room.Objects){var raw=item.Raw["rework"]?["clarityDelta"];if(raw==null||((double)raw>0)!=coffee)continue;
                bool spent=roomId==Room.Id?ObjectStates.TryGetValue(item.Id,out var current)&&current.used:saved!=null&&saved.objects.TryGetValue(item.Id,out var state)&&state.used;
                if(!spent)count++;
            }return count;
        }
    }
}
