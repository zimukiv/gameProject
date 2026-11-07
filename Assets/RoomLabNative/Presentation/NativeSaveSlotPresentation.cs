using System;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;

namespace RoomLab.Native
{
    public sealed partial class NativePhysicsDemoPlayer
    {
        string loadSlotReturnPage="menu",saveSlotNotice="";
        int overwriteSlot;
        float saveSlotReadyAt;
        bool IsSaveSlotPage=>page=="save-slots"||page=="load-slots"||page=="overwrite-slot";
        NativeSaveSlotFiles SaveSlots=>new NativeSaveSlotFiles(saveDirectory,Game.Project.SourceSha256);

        void OpenSaveSlots()
        {
            if(Game==null||!Game.UsesManualSaveSlots||!Game.AwaitingSaveChoice)return;
            saveSlotNotice="";overwriteSlot=0;Show("save-slots");
        }
        void OpenLoadSlots(string returnPage)
        {
            if(Game==null||!Game.UsesManualSaveSlots)return;
            DrainAutoSaves();loadAutoSlots=Game.IsContactAutosave;
            loadSlotReturnPage=returnPage=="pause"||returnPage=="won"?returnPage:"menu";
            saveSlotNotice="";Show("load-slots");
        }
        void CancelSaveSlots()
        {
            if(Time.unscaledTime<saveSlotReadyAt||Game==null||!Game.AwaitingSaveChoice)return;
            Game.ResolveCheckpointChoice(false);saveSlotNotice="";overwriteSlot=0;
            notice=Game.IsContactAutosave?"":"这次先不存。";Show("play");
        }
        void CloseLoadSlots()
        {
            if(Time.unscaledTime<saveSlotReadyAt)return;
            saveSlotNotice="";Show(loadSlotReturnPage);
        }
        void ChooseSaveSlot(int number)
        {
            if(Time.unscaledTime<saveSlotReadyAt||page!="save-slots"||!Game.AwaitingSaveChoice)return;
            var slot=SaveSlots.Read(number);
            if(slot.Exists){overwriteSlot=number;Show("overwrite-slot");}
            else WriteSaveSlot(number);
        }
        void ConfirmOverwriteSlot()
        {
            if(Time.unscaledTime<saveSlotReadyAt||page!="overwrite-slot"||overwriteSlot<1||!Game.AwaitingSaveChoice)return;
            WriteSaveSlot(overwriteSlot);
        }
        void WriteSaveSlot(int number)
        {
            try
            {
                var continuation=Game.PrepareCheckpointSave();
                SaveSlots.Write(number,continuation,Game.Course.Name,Game.Course.Kind,Game.Room.Name,Game.CampaignCollected);
                Game.ResolveCheckpointChoice(true);SaveProgress();
            }
            catch(Exception error)
            {
                // PrepareCheckpointSave restores the previous in-memory anchor in its finally;
                // a failed write leaves the choice pending so the player can retry or cancel.
                saveSlotNotice="暂时存不了。稍后再试，或换一个位置。";Debug.LogWarning("NATIVE_MANUAL_SAVE_FAILED "+error.Message);
                Show("save-slots");return;
            }
            notice="存好了，接着走。";saveSlotNotice="";overwriteSlot=0;Show("play");
        }
        NativeProject SlotProject(JObject continuation)
        {
            var source=Game.Project;
            // Re-select the saved chapter from the exact loaded source bytes. Reading the file
            // again could silently pick up an edited package and invalidate source isolation.
            var candidate=NativeProjectLoader.LoadBytes(source.SourceBytes,source.SourceKind,
                new ImportOptions{Profile=source.Profile,PlayableCoursesOnly=true,CourseId=(string)continuation["course"]});
            candidate.SourcePath=source.SourcePath;
            bool resolved=true;
            foreach(var asset in candidate.Assets)
            {
                var loaded=source.Assets.Find(a=>a.Id==asset.Id&&a.Path==asset.Path);
                if(loaded?.Bytes!=null)asset.Bytes=(byte[])loaded.Bytes.Clone();
                if(asset.Bytes==null)resolved=false;
            }
            candidate.AssetsResolved=resolved;return candidate;
        }
        void LoadSlot(int number)
        {
            if(Time.unscaledTime<saveSlotReadyAt||page!="load-slots"||loadAutoSlots)return;
            try
            {
                var slot=SaveSlots.Read(number);
                if(!slot.Readable)throw new NativeDataException(slot.Error??"这个位置还没有存档");
                RestoreSlotData(slot.Data);
            }
            catch(Exception error)
            {
                SlotLoadFailed(error);return;
            }
            FinishSlotLoad();
        }
        void RestoreSlotData(JObject data)
        {
            var continuation=(JObject)data["continuation"];
            var candidate=SlotProject(continuation);
            var restored=NativeMotion.FromContinuation(candidate,continuation,Game.Rules);
            CommitCandidate(candidate,Game.Rules,isBuiltin,!candidate.AssetsResolved,restored);
        }
        void SlotLoadFailed(Exception error)
        {
            saveSlotNotice="没读成功，当前进度还在。";Debug.LogWarning("NATIVE_SLOT_LOAD_FAILED "+error.Message);
            Show("load-slots");
        }
        void FinishSlotLoad()
        {
            if(isBuiltin)builtinCourseId=Game.IsContactAutosave?"autosave:"+Game.Course.Id:Game.Course.Id;else importedCourseId=Game.Course.Id;
            // A settings failure must not be reported as a failed load after the new game was
            // already adopted. The selected slot itself is never rewritten by loading it.
            notice="回来了，从这里接着走。";
            try{SaveSettings();}catch(Exception error){notice="存档已读取；本次大关选择暂未记住。";Debug.LogWarning("NATIVE_SLOT_SETTINGS_FAILED "+error.Message);}
            storyRoom=null;guidanceRoom=null;guidanceSeen.Clear();saveSlotNotice="";SaveProgress();Show("play");
        }

        static string SlotText(string value,int max)
        {
            value=(value??"").Replace('\r',' ').Replace('\n',' ').Trim();
            return value.Length<=max?value:value.Substring(0,max-1)+"…";
        }
        static string SlotRoomName(string value)
        {
            value=value??"";int divider=value.IndexOf('·');return SlotText(divider<0?value:value.Substring(divider+1),19);
        }
        string SlotRoomDisplayName(NativeSaveSlot slot)=>SlotRoomName(NativeDisplayCopy.SavedRoom(Game,slot.Data,SlotField(slot,"room")));
        static string SlotChapter(string kind)=>kind=="physics"?"物理":kind=="calculus"?"高数":kind=="slacker"?"水课":"课程";
        static string SlotField(NativeSaveSlot slot,string name)
        {
            var token=slot.Data?[name];
            return token!=null&&(token.Type==JTokenType.String||token.Type==JTokenType.Integer||token.Type==JTokenType.Float)?token.ToString():"";
        }
        static string SlotTime(NativeSaveSlot slot)
        {
            var token=slot.Data?["savedAt"];
            if(token?.Type==JTokenType.Date)return token.ToObject<DateTimeOffset>().ToLocalTime().ToString("MM-dd HH:mm");
            if(DateTimeOffset.TryParse(SlotField(slot,"savedAt"),out var stamp))return stamp.ToLocalTime().ToString("MM-dd HH:mm");
            return "时间未知";
        }
        static string SlotProgress(NativeSaveSlot slot)
        {
            var elapsed=slot.Data?["continuation"]?["elapsed"];
            double seconds=0;
            try{if(elapsed!=null&&(elapsed.Type==JTokenType.Integer||elapsed.Type==JTokenType.Float))seconds=elapsed.Value<double>();}catch{ /* A corrupt metadata number must not break the other five cards. */ }
            if(double.IsNaN(seconds)||double.IsInfinity(seconds)||seconds<0||seconds>1e12)seconds=0;
            string duration=seconds>=6000000?"99999+ 分钟":((long)seconds/60)+":"+((long)seconds%60).ToString("00");
            return "用时 "+duration+"   藏品 "+SlotText(SlotField(slot,"collected"),6);
        }
        Text SlotLabel(Transform parent,float x,float y,float width,float height,string text,int size,Color color)
        {
            var label=NativeUiKit.AbsLabel(parent,x,y,width,height,text,size,color,TextAnchor.MiddleLeft);
            if(NativeDisplayCopy.Active(Game))label.font=NoteFont??font;
            label.horizontalOverflow=HorizontalWrapMode.Overflow;label.verticalOverflow=VerticalWrapMode.Truncate;
            return label;
        }
        void BuildSaveSlots(Transform root,bool saving)
        {
            float width=Mathf.Min(600,designWidth-32),height=296;
            var panel=NativeUiKit.Abs(root,saving?"Save slots panel":"Load slots panel",(designWidth-width)/2,(designHeight-height)/2,width,height);
            NativeUiKit.MarkBackdrop(NativeUiKit.Box(panel,"Slot page paper",Ink).gameObject);
            bool automatic=!saving&&loadAutoSlots&&Game.IsContactAutosave;
            if(!saving&&Game.IsContactAutosave){
                SlotTab(panel,14,"手动",false,!automatic);
                SlotTab(panel,86,"自动",true,automatic);
            }else SlotLabel(panel,14,6,width-28,18,saving?"保存":"读取",12,Teal);
            float cardWidth=automatic?width-28:(width-40)/2;
            var files=SaveSlots;
            var history=automatic?AutoSaves.Read():null;
            for(int i=1;i<=(automatic?3:NativeSaveSlotFiles.Count);i++)
            {
                int number=i;var slot=automatic?AutomaticSlot(history,number):files.Read(number);float x=automatic?14:14+(i-1)%2*(cardWidth+12),y=30+(automatic?i-1:(i-1)/2)*74;
                var button=NativeUiKit.Button(panel,"",()=>{if(saving)ChooseSaveSlot(number);else if(automatic)LoadAutoSlot(number);else LoadSlot(number);},12,66,NativeUiKit.SlotIdle,cardWidth,0);
                button.gameObject.name=(saving?"Save slot ":automatic?"Auto load slot ":"Load slot ")+number.ToString("00");
                var rect=(RectTransform)button.transform;rect.anchorMin=rect.anchorMax=new Vector2(0,1);rect.pivot=new Vector2(0,1);rect.anchoredPosition=new Vector2(x,-y);rect.sizeDelta=new Vector2(cardWidth,66);
                var caption=button.transform.Find("Caption");if(caption!=null)caption.gameObject.SetActive(false);
                button.interactable=saving||slot.Readable;
                string heading=(automatic?"自动 ":"存档 ")+number.ToString("00")+(slot.Readable?"  ·  "+SlotChapter(SlotField(slot,"kind")):"");
                SlotLabel(rect,9,3,cardWidth-18,17,heading,12,slot.Exists?Paper:Teal);
                if(!slot.Exists)SlotLabel(rect,9,25,cardWidth-18,27,"空存档",12,new Color(.65f,.72f,.72f));
                else if(!slot.Readable)SlotLabel(rect,9,24,cardWidth-18,34,saving?"无法读取，可覆盖":"无法读取",11,Orange);
                else
                {
                    SlotLabel(rect,9,20,cardWidth-18,16,SlotRoomDisplayName(slot),11,Paper);
                    SlotLabel(rect,9,36,cardWidth-18,14,SlotProgress(slot),10,new Color(.68f,.79f,.79f));
                    SlotLabel(rect,9,50,cardWidth-18,16,SlotTime(slot),10,new Color(.55f,.65f,.68f));
                }
            }
            string message=!string.IsNullOrEmpty(saveSlotNotice)?saveSlotNotice:history!=null&&history.Exists&&!history.Readable?"自动记录暂时读不了。":"";
            SlotLabel(panel,14,248,width-28,16,message,11,Orange);
            var back=NativeUiKit.Button(panel,saving?"不存，继续走":"返回",()=>{if(saving)CancelSaveSlots();else CloseLoadSlots();},12,23,NativeUiKit.Slot,156,0);
            var backRect=(RectTransform)back.transform;backRect.anchorMin=backRect.anchorMax=new Vector2(.5f,0);backRect.pivot=new Vector2(.5f,0);backRect.anchoredPosition=new Vector2(0,6);backRect.sizeDelta=new Vector2(156,23);
        }
        void SlotTab(Transform panel,float x,string title,bool automatic,bool selected)
        {
            var button=NativeUiKit.Button(panel,title,()=>SelectLoadTab(automatic),12,22,selected?Teal:NativeUiKit.SlotIdle,64,0);
            var rect=(RectTransform)button.transform;rect.anchorMin=rect.anchorMax=new Vector2(0,1);rect.pivot=new Vector2(0,1);rect.anchoredPosition=new Vector2(x,-4);rect.sizeDelta=new Vector2(64,22);
        }
        void BuildOverwriteSlot(Transform root)
        {
            float width=Mathf.Min(430,designWidth-40);
            var panel=NativeUiKit.Column(root,"Overwrite slot confirmation",9,18,16);NativeUiKit.Center(panel,width);
            NativeUiKit.MarkBackdrop(panel.gameObject);panel.gameObject.AddComponent<Image>().color=Ink;
            var slot=SaveSlots.Read(overwriteSlot);
            NativeUiKit.Label(panel,"覆盖存档 "+overwriteSlot.ToString("00")+"？",20,Paper);
            var summary=NativeUiKit.Label(panel,slot.Readable?SlotChapter(SlotField(slot,"kind"))+" · "+SlotRoomDisplayName(slot)+"\n"+SlotTime(slot):"这个位置已经有一份记录。",12,Teal);if(NativeDisplayCopy.Active(Game))summary.font=NoteFont??font;
            var row=NativeUiKit.Row(panel,"Overwrite choice",30,10);
            NativeUiKit.Button(row,"再想想",()=>{if(Time.unscaledTime>=saveSlotReadyAt)Show("save-slots");},12,30);
            NativeUiKit.Button(row,"覆盖并保存",ConfirmOverwriteSlot,12,30,Teal);
            NativeUiKit.Fit(panel,width,designHeight-24);
        }
    }
}
