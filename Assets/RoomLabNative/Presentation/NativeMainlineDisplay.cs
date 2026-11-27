using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine.UI;
using UnityEngine;

namespace RoomLab.Native
{
    // 主线版的文案显示：拾取藏品/道具时弹名字+台词；AI 三类台词在启动、追逐中（按频率）、
    // 提交或离场时显示；藏品按“全关卡统一收集”计数。文案来源见 NativeMainlineCopy。
    public sealed partial class NativePhysicsDemoPlayer
    {
        string copyLine = "";
        float copyUntil, aiChaseNext;
        readonly Queue<(string title,string body)> artifactNotices=new Queue<(string,string)>();
        RectTransform artifactNotice;
        Transform artifactNoticeHost;
        float artifactNoticeStarted;
        bool artifactNoticeAtBottom;
        const float ArtifactNoticeScale=.5f;

        void TickArtifactNotice(float now)
        {
            if(page!="play"||storyActive||artifactNoticeHost==null){
                if(artifactNotice!=null)artifactNotice.gameObject.SetActive(false);
                return;
            }
            if(artifactNotice!=null&&now-artifactNoticeStarted>=3f){
                Destroy(artifactNotice.gameObject);
                artifactNotice=null;
            }
            if(artifactNotice==null&&artifactNotices.Count>0){
                var entry=artifactNotices.Dequeue();
                float width=Mathf.Min(330f,designWidth-32f);
                artifactNotice=NativeUiKit.Abs(artifactNoticeHost,"Artifact notification",0,0,width,72);
                var player=Game.Player;
                var playerWorld=new Vector3((float)(player.x+player.w*.5)/32f,
                    Game.Room.Rows-(float)(player.y+player.h*.5)/32f,0f);
                artifactNoticeAtBottom=view.WorldToViewportPoint(playerWorld).y>=.5f;
                var corner=new Vector2(1,artifactNoticeAtBottom?0:1);
                artifactNotice.anchorMin=artifactNotice.anchorMax=artifactNotice.pivot=corner;
                artifactNotice.localScale=new Vector3(ArtifactNoticeScale,ArtifactNoticeScale,1);
                var bg=artifactNotice.gameObject.AddComponent<Image>();
                bg.color=ArchiveCard;bg.raycastTarget=false;
                NativeUiKit.AbsImage(artifactNotice,"Accent",0,0,4,72,Teal);
                NativeUiKit.AbsImage(artifactNotice,"Artifact frame",12,12,48,48,new Color(.16f,.30f,.32f));
                var icon=NativeUiKit.AbsImage(artifactNotice,"Artifact icon",14,14,44,44,Color.white);
                icon.sprite=CollectibleArt();icon.preserveAspect=true;
                var title=NativeUiKit.AbsLabel(artifactNotice,70,7,width-82,21,entry.title,14,Ink,TextAnchor.MiddleLeft);
                var body=NativeUiKit.AbsLabel(artifactNotice,70,29,width-82,36,entry.body,11,Ink,TextAnchor.UpperLeft);
                title.raycastTarget=body.raycastTarget=false;
                body.resizeTextForBestFit=true;body.resizeTextMinSize=8;body.resizeTextMaxSize=11;
                artifactNoticeStarted=now;
            }
            if(artifactNotice==null)return;
            artifactNotice.gameObject.SetActive(true);
            float progress=Mathf.Clamp01((now-artifactNoticeStarted)/.22f);
            float remaining=1f-progress;
            artifactNotice.anchoredPosition=new Vector2(
                -12f+(artifactNotice.sizeDelta.x*ArtifactNoticeScale+16f)*remaining*remaining*remaining,
                artifactNoticeAtBottom?12f:-HudBand-10f);
        }

        NativeObject RoomObject(string id)
        {
            if (Game == null) return null;
            foreach (var o in Game.Room.Objects) if (o.Id == id) return o;
            return null;
        }

        int TotalCollectibles()
        {
            int n = 0;
            if (Game == null) return n;
            foreach (var c in Game.Project.Courses)
                foreach (var r in c.Rooms)
                    foreach (var o in r.Objects)
                        if (o.Type == "common.collectible") n++;
            return n > 0 ? n : NativeMainlineCopy.DeclaredTotal;
        }

        int CollectedGlobal()
        {
            int n = 0;
            if (Game == null) return n;
            foreach (var c in Game.Project.Courses)
                foreach (var r in c.Rooms)
                    foreach (var o in r.Objects)
                        if (o.Type == "common.collectible" && journal.Contains(r.Id + "/" + o.Id)) n++;
            return n;
        }

        void CopyToast(string name, string line)
        {
            if (string.IsNullOrEmpty(name) && string.IsNullOrEmpty(line)) return;
            copyLine = string.IsNullOrEmpty(line) ? name : (string.IsNullOrEmpty(name) ? line : name + "　" + line);
            copyUntil = Time.unscaledTime + 5f;
        }

        // 事件到达时的文案处理（由 PumpSounds 调用一次）。
        void MainlineCopyOnEvent(string type, JToken e)
        {
            if(Game==null)return;
            if(type=="submit-gate"&&(mainlineEdition||Game.IsEditorBuild15)){
                ShowNotice("对毕业的渴望阻止了你的行为",0);
                return;
            }
            if (!NativeMainlineCopy.Loaded) return;
            var courseId = Game.Course.Id;
            var kind = Game.Course.Kind;
            if (type == "collect")
            {
                var id = (string)e["id"];
                var room = Game.Course.Rooms.Find(r=>r.Id==(string)e["room"])??Game.Room;
                var o = room.Objects.Find(item=>item.Id==id);
                if (o == null) return;
                if (o.Type == "common.collectible")
                {
                    journal.Add(room.Id + "/" + id);
                    SaveRecord(!Game.Completed);
                    string name=o.Name,line=o.Text("notes","");
                    if(NativeMainlineCopy.Collectible(id,out var copyName,out var copyText)){name=copyName;line=copyText;}
                    artifactNotices.Enqueue((name,line));
                }
                else if ((string)e["by"]!="ai" && ItemCopy.TryGetValue(o.Type,out var pages))
                    ShowPickup(o.Name,pages,true);
                return;
            }
            if (type == "ai-start")
            {
                aiChaseNext = Time.unscaledTime + (float)NativeMainlineCopy.ChaseInterval;
                CopyToast(null, NativeMainlineCopy.Ai(courseId, kind, "start"));
                return;
            }
            if (type == "ai-stop" || type == "assignment-submit")
                CopyToast(null, NativeMainlineCopy.Ai(courseId, kind, "close"));
        }

        // 追逐中按频率重复提示（默认 10 秒，可在文案 JSON 里改）。
        void AiCopyTick()
        {
            if (Game == null || !Game.AI.active || !NativeMainlineCopy.Loaded) return;
            if (Time.unscaledTime < aiChaseNext) return;
            var line = NativeMainlineCopy.Ai(Game.Course.Id, Game.Course.Kind, "chase");
            if (string.IsNullOrEmpty(line)) return;
            aiChaseNext = Time.unscaledTime + (float)NativeMainlineCopy.ChaseInterval;
            CopyToast(null, line);
        }
    }
}
