using System;
using System.Collections;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEngine.UI;

namespace RoomLab.Native
{
    public sealed partial class NativeMotion
    {
        public bool OwnsPhone => IsEditorBuild15 && HasBuild15Item("item.phone");
    }

    public sealed partial class NativePhysicsDemoPlayer
    {
        static readonly Color PausePhoneInk = new Color(.02f,.05f,.07f);
        static readonly Color PausePhoneText = new Color(.78f,.97f,.98f);

        Image PauseArt(Transform parent,string key,float x,float y,float w,float h,Color tint)
        {
            var image=NativeUiKit.AbsImage(parent,key,x,y,w,h,tint);
            image.sprite=resultArt(key);
            return image;
        }

        void PauseLabel(Transform parent,float x,float y,float w,float h,string caption,int size,Color color)
        {
            NativeUiKit.AbsLabel(parent,x,y,w,h,caption,size,color,TextAnchor.MiddleCenter);
        }

        void PauseAction(Transform parent,float x,float y,float w,float h,string caption,Action action,bool phone,bool primary=false,bool exit=false)
        {
            var rect=NativeUiKit.Abs(parent,caption,x,y,w,h);
            var image=rect.gameObject.AddComponent<Image>();
            var bg=phone?(primary?new Color(.08f,.32f,.35f):new Color(.025f,.11f,.14f)):Color.white;
            image.color=bg;
            if(!phone)image.sprite=resultArt(primary?"ui-pause-btn-primary":"ui-pause-btn-secondary");
            else {
                var outline=rect.gameObject.AddComponent<Outline>();
                outline.effectColor=new Color(.27f,.62f,.67f);
                outline.effectDistance=new Vector2(1,-1);
            }
            var button=rect.gameObject.AddComponent<Button>();
            button.targetGraphic=image;
            var colors=button.colors;
            colors.highlightedColor=new Color(.87f,1,1);colors.pressedColor=new Color(.68f,.86f,.88f);button.colors=colors;
            button.onClick.AddListener(()=>{NativeUiKit.ClickSound?.Invoke();action();});
            if(exit){
                var exitIcon=NativeUiKit.AbsImage(rect,"Exit icon",6,(h-10)/2,10,10,Color.white);
                exitIcon.sprite=menuArt("ui-icon-exit");exitIcon.raycastTarget=false;
                exitIcon.enabled=exitIcon.sprite!=null;
            }
            PauseLabel(rect,0,0,w,h,caption,10,phone?PausePhoneText:primary?Color.white:Ink);
        }

        void PauseProgress(Transform parent,float x,float y,float width,int visited,int total)
        {
            NativeUiKit.AbsImage(parent,"Progress track",x,y,width,6,new Color(.19f,.25f,.27f));
            float fill=Mathf.Clamp01(visited/(float)Math.Max(1,total));
            if(fill>0)NativeUiKit.AbsImage(parent,"Progress fill",x+1,y+1,(width-2)*fill,4,new Color(.3f,.75f,.76f));
        }

        void ResultStars(Transform parent,float x,float y,float step,float size,int stars)
        {
            for(int i=0;i<3;i++)PauseArt(parent,i<stars?"ui-result-star-full":"ui-result-star-empty",x+i*step,y,size,size,Color.white);
        }

        void BuildLegacyPause(Transform root,string state){float width=Mathf.Min(560f,designWidth-32f);
            var panel=NativeUiKit.Column(root,"Panel",7,14,12);NativeUiKit.Center(panel,width);var bg=panel.gameObject.AddComponent<Image>();bg.color=Ink;bg.raycastTarget=false;
            NativeUiKit.Label(panel,state=="won"?Game.Course.Name+" · 完成":"课程暂停",20,Paper);
            NativeUiKit.Label(panel,state=="won"?(tainted?"检查完成 · 不记录正常成绩":"分数 "+Game.Score+"   +50,000 论文提交奖励"):(timeline.ProtectionPaused?timeline.ProtectionReason:notice),12,Orange);
            CampaignPause(panel,state);if(state!="won")NativeUiKit.Button(panel,"继续游戏",()=>Show("play"),13,30,Teal);
            var first=NativeUiKit.Row(panel,"Pause row 1",28,8);NativeUiKit.Button(first,"从上个存档点开始",Retry,12,28);NativeUiKit.Button(first,"设置",()=>{settingsFromGame=true;Show("settings");},12,28);
            var second=NativeUiKit.Row(panel,"Pause row 2",28,8);NativeUiKit.Button(second,"查看地图",OpenExplorationMap,12,28);if(Game.UsesManualSaveSlots)NativeUiKit.Button(second,"读取存档",()=>OpenLoadSlots(state),12,28);
            var third=NativeUiKit.Row(panel,"Pause row 3",28,8);NativeUiKit.Button(third,"主菜单",()=>{SaveProgress();Show("menu");},12,28);NativeUiKit.Button(third,"退出游戏",Quit,12,28);
            NativeUiKit.Fit(panel,width,designHeight-24f);}

        void PauseHit(Transform parent,float x,float y,float w,float h,string caption,Action action,int size,Color color)
        {
            var area=NativeUiKit.Abs(parent,"Hit "+caption,x,y,w,h);
            var img=area.gameObject.AddComponent<Image>();
            img.color=new Color(0,0,0,0);
            var btn=area.gameObject.AddComponent<Button>();
            if(action!=null)btn.onClick.AddListener(()=>{NativeUiKit.ClickSound?.Invoke();action();});
            if(!string.IsNullOrEmpty(caption))NativeUiKit.AbsLabel(parent,x,y,w,h,caption,size,color,TextAnchor.MiddleCenter);
        }
        // 结算页（纸版）：面板图自带奖章/星星/进度条/按钮框，代码只叠文字与热区
        void BuildPaperResult(Transform root)
        {
            // 面板图自带奖章/星星/进度条/按钮框，且坐标无法精确对齐 → 先在纸面内铺一块纸色，
            // 再在干净纸面上完整排版（评级/星星/进度/按钮全部由代码绘制，位置绝不重叠）
            PauseArt(root,"ui-result-panel",0f,0f,640f,360f,Color.white);
            var paper=new Color(.902f,.867f,.694f,1f);
            NativeUiKit.AbsImage(root,"Paper clean",108f,78f,424f,228f,paper);   // 加高：盖住面板自带的两个空按钮框

            int stars=StarCount();
            // 奖章 + 评级字母
            PauseArt(root,"ui-result-medal",128f,92f,84f,84f,Color.white);
            NativeUiKit.AbsLabel(root,128f,110f,84f,48f,GradeLetter(),24,new Color(.96f,.84f,.50f),TextAnchor.MiddleCenter);
            // 标题
            NativeUiKit.AbsLabel(root,226f,86f,288f,26f,"论文已提交",18,Ink,TextAnchor.MiddleLeft);
            // 三行统计
            NativeUiKit.AbsLabel(root,226f,120f,288f,18f,"总进度 "+ProgressText(),11,Ink,TextAnchor.MiddleLeft);
            NativeUiKit.AbsLabel(root,226f,142f,288f,18f,"用时 "+ElapsedText(),11,Ink,TextAnchor.MiddleLeft);
            NativeUiKit.AbsLabel(root,226f,164f,288f,18f,(tainted?"检查完成":"分数 ")+Game.Score,11,Ink,TextAnchor.MiddleLeft);
            // 星星（按评级实心/空心）
            for(int i=0;i<3;i++)
                PauseArt(root,i<stars?"ui-result-star-full":"ui-result-star-empty",226f+i*36f,184f,26f,26f,Color.white);
            // 进度条
            int collected=Game.CampaignCollected,total=TotalCollectibles();
            NativeUiKit.AbsLabel(root,226f,214f,288f,14f,"藏品 "+collected+" / "+total,10,Ink,TextAnchor.MiddleLeft);
            PauseProgress(root,226,232,288,collected,total);
            // 按钮：自绘底框 + 文字（覆盖面板自带按钮区）
            PauseAction(root,226f,246f,288f,24f,"返回桌面",()=>{SaveProgress();Show("menu");},false,true);
            PauseAction(root,226f,276f,138f,20f,"再来一次",NewGame,false);
            PauseAction(root,376f,276f,138f,20f,"退出游戏",Quit,false,false,true);
        }
        void Hit(Transform root,float x,float y,float w,float h,string caption,Action action,int size,Color color)
        {
            var area=NativeUiKit.Abs(root,"Hit "+caption,x,y,w,h);
            var img=area.gameObject.AddComponent<Image>();img.color=new Color(0,0,0,0);
            var btn=area.gameObject.AddComponent<Button>();
            if(action!=null)btn.onClick.AddListener(()=>{NativeUiKit.ClickSound?.Invoke();action();});
            NativeUiKit.AbsLabel(root,x,y,w,h,caption,size,color,TextAnchor.MiddleCenter);
        }

        void StatsLabel(Transform f,float y,string text){NativeUiKit.AbsLabel(f,88f,y,300f,14f,text,9,Ink,TextAnchor.MiddleLeft);}
        long MaximumCourseScore()
        {
            long max=50000;
            foreach(var room in Game.Course.Rooms)
                foreach(var item in room.Objects)
                    switch(item.Type){
                        case "common.small":max+=100;break;
                        case "common.coin":max+=1000;break;
                        case "common.collectible":max+=10000;break;
                        case "common.assignmentSubmit":max+=50000;break;
                    }
            return max;
        }
        int StarCount()
        {
            if(!Game.IsEditorBuild15)return Game.Score>=50000?3:Game.Score>=20000?2:Game.Score>0?1:0;
            switch(GradeLetter()){
                case "A+":case "A":return 3;
                case "B":return 2;
                case "C":return 1;
                default:return 0;
            }
        }
        string GradeLetter()
        {
            if(!Game.IsEditorBuild15)return Game.Score>=50000?"A":Game.Score>=20000?"B":"C";
            long score=(long)Game.Score*100,maximum=MaximumCourseScore();
            return score>=maximum*98?"A+":score>=maximum*90?"A":
                score>=maximum*80?"B":score>=maximum*70?"C":score>=maximum*60?"D":"F";
        }
        string ProgressText(){return Visited()+" / "+ProgressRoomCount();}
        string ElapsedText(){return TimeSpan.FromSeconds(Game.Elapsed).ToString(@"mm\:ss");}
        NativeCourse progressCourse;
        readonly System.Collections.Generic.HashSet<string> progressRoute = new System.Collections.Generic.HashSet<string>(StringComparer.Ordinal);
        int ProgressRoomCount()
        {
            if(Game.Course!=progressCourse){
                progressCourse=Game.Course;progressRoute.Clear();
                if(progressCourse.Rooms.Count>0){
                    var pending=new System.Collections.Generic.Queue<string>();
                    string start=progressCourse.Rooms[0].Id;
                    progressRoute.Add(start);pending.Enqueue(start);
                    while(pending.Count>0){
                        string from=pending.Dequeue();
                        foreach(var edge in progressCourse.Connections)
                            if(edge.FromRoomId==from&&progressRoute.Add(edge.ToRoomId))pending.Enqueue(edge.ToRoomId);
                    }
                }
            }
            return progressRoute.Count;
        }
        int Visited()
        {
            ProgressRoomCount();
            int visited=0;
            foreach(var id in discoveredRooms)if(progressRoute.Contains(id))visited++;
            return visited;
        }

        void BuildReferencePauseResult(Transform root,string state)
        {
            if(!Game.IsEditorBuild15){BuildLegacyPause(root,state);return;}
            bool won=state=="won",phone=Game.OwnsPhone;
            var dim=NativeUiKit.AbsImage(root,"Dim gameplay",0,0,designWidth,designHeight,new Color(0,0,0,phone?.63f:.58f));
            if(!phone&&won) {dim.sprite=resultArt("ui-result-dim");dim.color=Color.white;}
            float width=Mathf.Min(designWidth,designHeight*16/9);
            var frame=NativeUiKit.Abs(root,phone?"Phone layout":"Paper layout",(designWidth-width)/2,(designHeight-width*9/16)/2,640,360);
            frame.localScale=Vector3.one*(width/640);
            int visited=Visited();
            int stars=StarCount();
            string progress=visited+" / "+ProgressRoomCount();
            string elapsed=TimeSpan.FromSeconds(Game.Elapsed).ToString(@"mm\:ss");
            Action desktop=()=>{SaveProgress();Show("menu");};
            Action settings=()=>{settingsFromGame=true;Show("settings");};
            Action resume=()=>Show("play");

            if(phone)
            {
                // The supplied phone shell is a full-canvas sprite with transparent margins.
                PauseArt(frame,"ui-phone-body",-105,-90,800,450,Color.white);
                NativeUiKit.AbsImage(frame,"Phone display",224,50,192,310,PausePhoneInk);
                PauseArt(frame,"ui-phone-glow",219,161,202,190,new Color(.24f,.54f,.58f,.26f));
                NativeUiKit.AbsImage(frame,"Notification card",246,68,148,44,Color.white);
                PauseArt(frame,"ui-icon-message",252,78,22,22,Color.white);
                PauseLabel(frame,276,72,110,19,won?"关卡完成":"游戏已暂停",11,Ink);
                PauseLabel(frame,276,91,110,13,won?"论文已提交":"等待你的下一步指令",8,Ink);
                PauseArt(frame,won?"ui-result-medal":"ui-pause-icon",306,119,28,28,Color.white);
                PauseLabel(frame,230,148,180,23,won?"论文已提交":"论文已暂停",18,PausePhoneText);
                PauseLabel(frame,230,172,180,16,(won?"总进度 ":"进度 ")+progress+(won?"  ·  "+elapsed:""),9,PausePhoneText);
                if(won){
                    PauseLabel(frame,306,119,28,28,GradeLetter(),GradeLetter()=="A+"?11:14,new Color(.96f,.84f,.50f));
                    PauseLabel(frame,336,119,54,28,Game.Score.ToString(),10,PausePhoneText);
                    ResultStars(frame,296,188,16,15,stars);
                }
                if(won){
                    int collected=Game.CampaignCollected,total=TotalCollectibles();
                    PauseLabel(frame,263,204,114,12,"藏品 "+collected+" / "+total,8,PausePhoneText);
                    PauseProgress(frame,263,217,114,collected,total);
                }else PauseProgress(frame,263,189,114,visited,ProgressRoomCount());
                PauseAction(frame,236,won?230:204,168,19,won?"返回桌面":"继续作业",won?desktop:resume,true,true);
                PauseAction(frame,236,won?254:228,81,16,won?"再来一次":"从存档点重来",won?(Action)NewGame:Retry,true);
                PauseAction(frame,323,won?254:228,81,16,"设置",settings,true);
                if(!won){
                    PauseAction(frame,236,249,81,16,"地图",OpenExplorationMap,true);
                    PauseAction(frame,323,249,81,16,"藏品",()=>Show("collection"),true);
                    PauseAction(frame,236,270,168,16,"返回桌面",desktop,true);
                }
                PauseAction(frame,274,won?280:295,92,15,"退出游戏",Quit,true,false);
                if(!won&&Game.UsesManualSaveSlots)PauseAction(frame,274,316,92,16,"读取存档",()=>OpenLoadSlots(state),true);
            }
            else if(won)
            {
                BuildPaperResult(frame);
            }
            else
            {
                PauseArt(frame,"ui-pause-panel",0,0,640,360,Color.white);
                // Hide sample controls baked into the source before drawing live controls.
                NativeUiKit.AbsImage(frame,"Clean pause controls",208,143,226,132,new Color32(230,216,169,255));
                PauseArt(frame,"ui-pause-icon",203,91,30,30,Color.white);
                PauseLabel(frame,233,90,190,30,"论文已暂停",18,Ink);
                PauseLabel(frame,201,123,239,20,timeline.ProtectionPaused?timeline.ProtectionReason:"进度 "+progress,10,Ink);
                PauseProgress(frame,211,148,220,visited,ProgressRoomCount());
                PauseAction(frame,211,168,220,23,"继续作业",resume,false,true);
                PauseAction(frame,211,199,106,20,"从存档点重来",Retry,false);
                PauseAction(frame,325,199,106,20,"设置",settings,false);
                PauseAction(frame,211,226,106,18,"地图",OpenExplorationMap,false);
                PauseAction(frame,325,226,106,18,"藏品",()=>Show("collection"),false);
                PauseAction(frame,211,252,106,18,"返回桌面",desktop,false);
                PauseAction(frame,325,252,106,18,"退出游戏",Quit,false,false,true);
                if(Game.UsesManualSaveSlots)PauseAction(frame,267,275,106,16,"读取存档",()=>OpenLoadSlots(state),false);
            }
        }

        IEnumerator CaptureReferencePauseResult()
        {
            Show("settings");
            yield return new WaitForSecondsRealtime(.3f);
            WriteShot(Path.Combine(Evidence(),"page-settings.png"));
            // A dedicated in-memory fixture drives both forms without changing persisted inventory.
            var original=Game;
            var fixture=new NativeMotion(Game.Project,Game.Course.Id,Game.Room.Id,Game.Rules);
            var phone=Game.Course.Rooms.SelectMany(r=>r.Objects.Where(o=>o.Type=="item.phone").Select(o=>r.Id+"/"+o.Id)).FirstOrDefault();
            SetGame(fixture);
            foreach(bool withPhone in new[]{false,true})
            {
                if(withPhone)
                {
                    if(phone==null)break;
                    Game.Credited.Add(phone);
                    if(!Game.OwnsPhone)break;
                }
                var key=withPhone?"phone":"paper";
                Show("pause");
                yield return new WaitForSecondsRealtime(.3f);
                WriteShot(Path.Combine(Evidence(),"page-pause-"+key+".png"));
                Game.Score=50000;
                Show("won");
                yield return new WaitForSecondsRealtime(.3f);
                WriteShot(Path.Combine(Evidence(),"page-result-"+key+".png"));
            }
            SetGame(original);
        }
    }
}
