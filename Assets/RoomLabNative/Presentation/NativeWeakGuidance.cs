using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;
namespace RoomLab.Native
{
    public sealed partial class NativePhysicsDemoPlayer
    {
        Font noteFont;Font NoteFont=>noteFont!=null?noteFont:noteFont=Resources.Load<Font>("DiegeticFont/LXGWWenKai-Regular");
        readonly HashSet<string> guidanceSeen=new HashSet<string>();
        string guidanceRoom,guidanceLine="",guidanceNotice="";double guidanceUntil,stillSince;Vector2 guidanceAnchor;
        NativeMotion guidanceGame;JObject guidanceEvent;
        void Whisper(string key,string text,double seconds=2.8,bool priority=false)
        {
            if(string.IsNullOrWhiteSpace(text)||guidanceSeen.Contains(key)||!priority&&guidanceUntil>Game.Elapsed)return;
            guidanceSeen.Add(key);guidanceLine=text;guidanceUntil=Game.Elapsed+seconds;
        }
        void GuideCompletedAction()
        {
            int start=guidanceEvent==null?0:Game.Events.IndexOf(guidanceEvent)+1;
            for(int i=start;i<Game.Events.Count;i++){
                var e=Game.Events[i];string type=(string)e["type"];
                if((string)e["room"]!=Game.Room.Id||type!="checkin"&&type!="calculus-integral"&&type!="calculus-derivative")continue;
                string line=(string)Game.Room.Raw["nativeCampaign"]?["progressHint"];
                Whisper("progress:"+Game.Course.Id+":"+Game.Room.Id,line,4,true);
            }
            if(Game.Events.Count>0)guidanceEvent=Game.Events[Game.Events.Count-1];
        }
        void WeakGuide()
        {
            if(hint==null)return;
            if(guidanceGame!=Game){guidanceGame=Game;guidanceEvent=null;guidanceRoom=null;}
            if(guidanceRoom!=Game.Room.Id){guidanceRoom=Game.Room.Id;guidanceLine="";guidanceUntil=0;guidanceNotice="";stillSince=Game.Elapsed;guidanceAnchor=new Vector2((float)Game.Player.x,(float)Game.Player.y);
                if(Game.UsesManualSaveSlots){
                    string arrival=(string)Game.Room.Raw["nativeCampaign"]?["arrivalHint"];
                    if(string.IsNullOrWhiteSpace(arrival)&&Game.Course.Kind=="physics"&&Game.Course.Rooms.IndexOf(Game.Room)==0)arrival=bindings[0]+" ←  → "+bindings[1]+"     "+bindings[2]+" ↑";
                    Whisper("arrival:"+Game.Course.Id+":"+Game.Room.Id,arrival,3.8);
                }else if(Game.Course.Rooms.IndexOf(Game.Room)==0)Whisper("arrival:"+Game.Course.Id,Game.Course.Kind=="physics"?bindings[0]+" ←  → "+bindings[1]+"     "+bindings[2]+" ↑":Game.Course.Kind=="calculus"?"纸上，也会长出路。":"刚才那道光呢？",3.5);
            }
            if(Game.IsGuided)GuideCompletedAction();
            Vector2 now=new Vector2((float)Game.Player.x,(float)Game.Player.y);if(Vector2.Distance(now,guidanceAnchor)>80){guidanceAnchor=now;stillSince=Game.Elapsed;}
            if(Game.IsContactAutosave&&Game.NearbyExit!=null)Whisper("door-use:"+Game.Course.Id,KeyName()+" · 进入",2.5,true);
            else if(Game.IsNetwork&&Game.NearbyExit!=null)Whisper("door-use",KeyName()+" · "+(Game.Course.Kind=="calculus"?"翻过这一页":"推门"),3);
            if(Game.NearbyInteraction!=null){var o=Game.NearbyInteraction;
                if(Game.IsContactAutosave&&o.Type=="common.checkpoint")Whisper("manual-save:"+Game.Course.Id,KeyName()+" · 存档",2.3,true);
                else if(Game.IsGuided&&o.Type=="common.checkpoint")Whisper("save-choice","碰到旗子，选一格存档。",3);
                else if(Game.IsAwarenessResource&&(o.Type=="common.checkpoint"||o.Raw["rework"]?["clarityDelta"]!=null))Whisper("resource:"+o.Type,KeyName()+" · "+(o.Type=="common.checkpoint"?"记住这一刻":((double?)o.Raw["rework"]?["clarityDelta"]>0?"喝一口（只够一次）":"翻讲义（只用一次）")),3);
            }
            if(Game.NearbyInteraction!=null&&(Game.NearbyInteraction.Type=="common.aiStart"||Game.NearbyInteraction.Type=="common.aiStartHollow")&&!Game.AI.active)Whisper("terminal:"+Game.Room.Id,KeyName()+" · 接通助手",3);
            if(Game.CampaignSkill=="charge")Whisper("skill:"+Game.Course.Kind,Game.Course.Kind=="physics"?"它蓄着一口气。":Game.Course.Kind=="calculus"?"那一点，亮起来了。":"眼皮有点重。",2);
            if(Game.BlockedExitUntil>Game.Elapsed){
                var blocked=Game.Room.Exits.Find(e=>e.Id==Game.BlockedExit);
                string line=Game.BlockedExit=="course"?(!Game.AI.active?"把助手带上再走。":"这间还有一份没收好。"):((string)blocked?.Raw["rework"]?["lockedText"]??"这边暂时过不去。看看旁边那条路。");
                Whisper("door:"+Game.Course.Id+":"+Game.Room.Id+":"+Game.BlockedExit,line,3.5,true);
            }
            if(Game.ReworkNotice!=guidanceNotice&&Game.ReworkNoticeUntil>Game.Elapsed){guidanceNotice=Game.ReworkNotice;
                if(guidanceNotice.StartsWith("跨房连动"))Whisper("remote:"+guidanceNotice,"隔页传来一声轻响 · "+(guidanceNotice.Contains("β")?"β":guidanceNotice.Contains("γ")?"γ":"纸页"),3);
                else if(guidanceNotice.Contains("重叠"))Whisper("blocked:"+Game.Room.Id,"纸页在等你让一让。",3);
            }
            if(Game.Elapsed-stillSince>18){string clue=(string)Game.Room.Raw["nativeCampaign"]?["softHint"];
                if(string.IsNullOrWhiteSpace(clue))clue=Game.Course.Kind=="physics"?"风和冰，好像都不只一种用处。":Game.Course.Kind=="calculus"?"同样的记号，会不会在别处？":Game.IsAwarenessResource?"桌上的东西，留到什么时候呢？":"换一个座位，景色也许会不同。";
                Whisper("stuck:"+Game.Room.Id,clue,3.5);
            }
            var parent=hint.transform.parent;var group=parent.GetComponent<CanvasGroup>();if(group==null){group=parent.gameObject.AddComponent<CanvasGroup>();group.alpha=0;}group.blocksRaycasts=false;group.interactable=false;
            float wanted=Game.Elapsed<guidanceUntil&&page=="play"&&!map?1:0;group.alpha=Mathf.MoveTowards(group.alpha,wanted,Time.unscaledDeltaTime*2.5f);
            var rect=(RectTransform)parent;rect.anchorMin=rect.anchorMax=new Vector2(.5f,0);rect.sizeDelta=new Vector2(Mathf.Min(Game.UsesManualSaveSlots?460:380,designWidth-30),Game.UsesManualSaveSlots?40:28);rect.anchoredPosition=new Vector2(0,12);
            hint.text=guidanceLine;hint.font=NoteFont??font;hint.fontSize=15;hint.lineSpacing=1.15f;hint.alignment=TextAnchor.MiddleCenter;
        }
    }
}
