using System;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace RoomLab.Native
{
    public sealed partial class NativePhysicsDemoPlayer
    {
        bool loadAutoSlots;
        NativeMotion autoSaveNoticeGame;
        bool autoSaveNoticePending;
        float autoSaveNoticeUntil;
        NativeAutoSaveFiles AutoSaves=>new NativeAutoSaveFiles(saveDirectory,Game.Project.SourceSha256);

        void DrainAutoSaves()
        {
            if(Game==null||!Game.IsContactAutosave)return;
            while(Game.TryDequeueAutoSave(out NativeAutoSaveRequest request))
            {
                if(tainted||Game.DeveloperEnabled)continue;
                try{AutoSaves.Write(request);}
                catch(Exception error)
                {
                    // The request already contains the exact contact-frame snapshot. A disk
                    // failure does not change the player's live anchor or stop the simulation.
                    autoSaveNoticeGame=Game;autoSaveNoticePending=true;autoSaveNoticeUntil=0;
                    Debug.LogWarning("NATIVE_AUTO_SAVE_FAILED "+error.Message);
                }
            }
        }
        void TickAutoSaveNotice()
        {
            if(Game!=autoSaveNoticeGame){autoSaveNoticePending=false;return;}
            if(page!="play"||hint==null)return;
            if(autoSaveNoticePending){autoSaveNoticePending=false;autoSaveNoticeUntil=Time.unscaledTime+3;}
            if(Time.unscaledTime>=autoSaveNoticeUntil)return;
            hint.text="这次没存上，先继续走。";
            var group=hint.transform.parent.GetComponent<CanvasGroup>();if(group!=null)group.alpha=1;
        }
        void SelectLoadTab(bool automatic)
        {
            if(page!="load-slots"||Time.unscaledTime<saveSlotReadyAt)return;
            loadAutoSlots=automatic&&Game.IsContactAutosave;saveSlotNotice="";Show("load-slots");
        }
        NativeSaveSlot AutomaticSlot(NativeAutoSaveHistory history,int number)
        {
            var slot=new NativeSaveSlot{Number=number};
            if(history==null||!history.Readable||number<1||number>history.Entries.Count)return slot;
            slot.Exists=true;slot.Data=history.Entries[number-1] as JObject;
            if(slot.Data==null)slot.Error="这份记录暂时读不了";
            return slot;
        }
        void LoadAutoSlot(int number)
        {
            if(Time.unscaledTime<saveSlotReadyAt||page!="load-slots"||!loadAutoSlots||!Game.IsContactAutosave)return;
            try
            {
                var history=AutoSaves.Read();
                if(!history.Readable)throw new NativeDataException(history.Error??"还没有自动记录");
                var slot=AutomaticSlot(history,number);
                if(!slot.Readable)throw new NativeDataException("这份自动记录暂时读不了");
                RestoreSlotData(slot.Data);
            }
            catch(Exception error){SlotLoadFailed(error);return;}
            FinishSlotLoad();
        }
    }
}
