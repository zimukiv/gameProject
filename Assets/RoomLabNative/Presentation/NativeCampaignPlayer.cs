using System;
using System.IO;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;
namespace RoomLab.Native
{
    public sealed partial class NativePhysicsDemoPlayer
    {
        readonly System.Collections.Generic.HashSet<string> journal=new System.Collections.Generic.HashSet<string>(StringComparer.Ordinal);
        int JournalCount{get{var all=new System.Collections.Generic.HashSet<string>(journal);foreach(var r in Game.Course.Rooms)foreach(var o in r.Objects)if(o.Type=="common.collectible"&&Game.Credited.Contains(r.Id+"/"+o.Id))all.Add(r.Id+"/"+o.Id);return all.Count;}}
        void UpdateJournal(){foreach(var r in Game.Course.Rooms)foreach(var o in r.Objects)if(o.Type=="common.collectible"&&Game.Credited.Contains(r.Id+"/"+o.Id))journal.Add(r.Id+"/"+o.Id);}
        AudioLowPassFilter exploreFilter,chaseFilter;AudioSource exploreMusic,chaseMusic;string musicKind,storyRoom;double storyUntil;bool musicEnabled=true;float musicVolume=.55f,effectsVolume=.85f;
        string CampaignFile=>Path.Combine(Application.streamingAssetsPath,"RoomLabNative/Campaign/deadline-autosave.json");
        static readonly string[] CampaignIds={"physics","guided-calculus","guided-slacker"};
        bool HasChapterFlow=>Game!=null&&(Game.IsCampaign||Game.IsContactAutosave);
        void LoadAutosaveCourse(string id){
            var data=NativeProjectLoader.LoadFile(CampaignFile,new ImportOptions{PlayableCoursesOnly=true,CourseId=id,RequireAssets=true});
            CommitCandidate(data,NativeGameplayRules.DemoPhysics,true);builtinCourseId="autosave:"+id;SaveSettings();
        }
        string[] CurrentChapterIds=>Game.IsContactAutosave?CampaignIds:Game.Course.Id.StartsWith("guided-")?new[]{"guided-physics","guided-calculus","guided-slacker"}:Game.Course.Id.StartsWith("network-")?new[]{"network-physics","network-calculus","network-slacker"}:Game.Course.Id.StartsWith("rework-")?new[]{"rework-physics","rework-calculus","rework-slacker"}:new[]{"night-physics","night-calculus","night-slacker"};
        void CreateCampaignAudio(){
            if(FindAnyObjectByType<AudioListener>()==null)gameObject.AddComponent<AudioListener>();
            AudioSource Track(string name){var child=new GameObject(name);child.transform.SetParent(transform,false);return child.AddComponent<AudioSource>();}exploreMusic=Track("探索音乐");chaseMusic=Track("追逐音乐");
            exploreFilter=exploreMusic.gameObject.AddComponent<AudioLowPassFilter>();chaseFilter=chaseMusic.gameObject.AddComponent<AudioLowPassFilter>();exploreMusic.volume=chaseMusic.volume=0;exploreMusic.loop=chaseMusic.loop=true;exploreMusic.playOnAwake=chaseMusic.playOnAwake=false;
            foreach(var clip in Resources.LoadAll<AudioClip>("DeadlineAudio"))if(!clip.name.EndsWith("-explore")&&!clip.name.EndsWith("-chase"))sounds[clip.name]=NativeAssetOverrides.Audio(clip.name,clip);
        }
        void CampaignTick(){
            if(Game==null)return;
            if(musicKind!=Game.Course.Kind){musicKind=Game.Course.Kind;exploreMusic.Stop();chaseMusic.Stop();exploreMusic.clip=NativeAssetOverrides.Audio(musicKind+"-explore",Resources.Load<AudioClip>("DeadlineAudio/"+musicKind+"-explore"));chaseMusic.clip=NativeAssetOverrides.Audio(musicKind+"-chase",Resources.Load<AudioClip>("DeadlineAudio/"+musicKind+"-chase"));if(exploreMusic.clip!=null&&chaseMusic.clip!=null&&(long)exploreMusic.clip.samples*chaseMusic.clip.frequency!=(long)chaseMusic.clip.samples*exploreMusic.clip.frequency){Debug.LogWarning("CUSTOM_MUSIC_LENGTH_MISMATCH: stems reverted to built-in pair");exploreMusic.clip=Resources.Load<AudioClip>("DeadlineAudio/"+musicKind+"-explore");chaseMusic.clip=Resources.Load<AudioClip>("DeadlineAudio/"+musicKind+"-chase");}double start=AudioSettings.dspTime+.12;exploreMusic.PlayScheduled(start);chaseMusic.PlayScheduled(start);}
            float cutoff=Game.IsRework&&Game.Course.Kind=="slacker"?(Game.AwarenessBand=="dream"?1800:Game.AwarenessBand=="haze"?5000:18000):22000;exploreFilter.cutoffFrequency=chaseFilter.cutoffFrequency=Mathf.Lerp(exploreFilter.cutoffFrequency,cutoff,Time.unscaledDeltaTime*2);bool playing=page=="play"&&!map;speaker.volume=effectsVolume;float gain=musicEnabled?musicVolume*(playing?1f:.4f):0;
            exploreMusic.volume=Mathf.MoveTowards(exploreMusic.volume,gain,Time.unscaledDeltaTime*.7f);chaseMusic.volume=Mathf.MoveTowards(chaseMusic.volume,playing&&Game.AI.active?gain:0,Time.unscaledDeltaTime*.8f);
            if(!HasChapterFlow)return;
            if(storyRoom!=Game.Room.Id){storyRoom=Game.Room.Id;storyUntil=Game.Elapsed+8;}
            if(hud!=null)hud.text=Game.Room.Name+"   "+Game.Tokens+"   ↔ "+(Game.Player.freeDash?"●":"○")+" +"+Game.Charges+"   ◇ "+Game.CampaignCollected;
            if(Game.IsRework||Game.IsContactAutosave){if(hud!=null&&(Game.Course.Kind!="physics"||NativeDisplayCopy.Active(Game))){hud.font=NoteFont??font;hud.fontSize=13;}WeakGuide();return;}if(hint!=null&&!tainted&&Game.RespawnRemaining<=0){
                string skill=Game.CampaignSkill=="charge"?"AI 过载预警 · 准备冲刺！":Game.CampaignSkill=="burst"?"AI 过载 · 继续移动":Game.CampaignSkill=="recover"?"AI 散热 · 可以折返带路":Game.AI.warning!=null?"坐标出口正在闪烁 · 让开落点":"";
                string line=Game.IsRework&&Game.ReworkNoticeUntil>Game.Elapsed?Game.ReworkNotice:Game.Elapsed<storyUntil?(string)Game.Room.Raw["notes"]:Game.CampaignObjective;
                if(Game.NearbyInteraction!=null&&!Game.AI.active)line=InteractionPrompt(Game.NearbyInteraction);
                else if(!string.IsNullOrEmpty(skill)&&!Game.IsRework)line=skill;
                else if(Game.Course.Rooms.IndexOf(Game.Room)==0)line+="  |  "+bindings[0]+" / "+bindings[1]+" 移动 · "+bindings[2]+" 跳 · "+bindings[4]+" 冲刺";
                hint.text=line+"\n"+(Game.AiHits>0?"已被抓一次 · 再次被抓会回到存档点":Game.IsRework&&Game.Course.Kind=="slacker"?"清醒 ≥65 / 朦胧 35–64 / 梦境 ≤34 · 咖啡与座位可主动切换":"Esc 暂停   M 地图   R 重试 · 巡查只在追逐时工作");
            }
        }
        void MixControls(Transform panel){
            void Row(string name,float value,Action<float> set){var row=NativeUiKit.Row(panel,name,24,8);var label=NativeUiKit.Label(row,name+" "+Mathf.RoundToInt(value*100)+"%",11,Paper);NativeUiKit.Size(label,120,24,0);NativeSciFiGauge.Create(row,0,1,value,v=>{set(v);label.text=name+" "+Mathf.RoundToInt(v*100)+"%";},SaveSettings);}
            Row("音乐",musicVolume,v=>musicVolume=v);Row("音效",effectsVolume,v=>effectsVolume=v);
        }
        void CampaignSelection(Transform panel){
            NativeUiKit.Label(panel,"作业待办",18,Paper);
            string[] names={"物理","高数","水课"};
            for(int i=0;i<3;i++){string id=CampaignIds[i];NativeUiKit.Button(panel,names[i],()=>{LoadAutosaveCourse(id);ForgetImport();Show("menu");},12,25,Teal);}
        }
        void BuildCollection(Transform root){
            var panel=NativeUiKit.Column(root,"藏品册",5,14,12);NativeUiKit.Center(panel,Mathf.Min(580,designWidth-24));panel.gameObject.AddComponent<Image>().color=Ink;
            NativeUiKit.Label(panel,"研究记录 · 历史收集 "+JournalCount+" 份",19,Paper);
            NativeUiKit.Label(panel,"带助手经过藏品，它会替你收好。未拿到的不会阻止提交。",11,Teal);
            foreach(var r in Game.Course.Rooms){string line="";foreach(var o in r.Objects)if(o.Type=="common.collectible")line+=((journal.Contains(r.Id+"/"+o.Id)||Game.Credited.Contains(r.Id+"/"+o.Id))?"◆ ":"◇ ")+o.Name+"   ";if(line!="")NativeUiKit.Label(panel,line,11,Paper);}
            NativeUiKit.Button(panel,"返回",()=>Show(Game.Completed?"won":"pause"),12,26);NativeUiKit.Fit(panel,Mathf.Min(580,designWidth-24),designHeight-20);
        }
        void CampaignPause(Transform panel,string state){
            if(!HasChapterFlow)return;
            if(NativeDisplayCopy.Active(Game)){
                var roomName=NativeUiKit.Label(panel,Game.Room.Name,15,Teal);roomName.font=NoteFont??font;
                var story=NativeUiKit.Label(panel,NativeDisplayCopy.Text(Game,"notes"),13,Paper);story.font=NoteFont??font;
                string objective=NativeDisplayCopy.Text(Game,"objective");if(!string.IsNullOrWhiteSpace(objective)){var line=NativeUiKit.Label(panel,objective,12,Teal);line.font=NoteFont??font;}
            }else if(!Game.IsContactAutosave||!Game.IsAuthoredPhysics){var story=NativeUiKit.Label(panel,(string)Game.Room.Raw["notes"],12,Paper);NativeUiKit.Size(story,height:40);if(Game.IsRework){story.font=NoteFont??font;story.fontSize=14;NativeUiKit.Label(panel,Game.CampaignObjective,11,Teal);}}
            if(state=="won"){
                var chapters=CurrentChapterIds;int index=Array.IndexOf(chapters,Game.Course.Id);NativeUiKit.Label(panel,"用时 "+TimeSpan.FromSeconds(Game.Elapsed).ToString(@"mm\:ss")+"   重试 "+Game.Deaths+"   ◇ "+Game.CampaignCollected,12,Paper);
                NativeUiKit.Label(panel,index==2?"交完了。走，吃点东西。":"这门交了，还有下一门。",12,Teal);
                if(index>=0&&index<2)NativeUiKit.Button(panel,"查看下一条作业通知",()=>{if(Game.IsContactAutosave)LoadAutosaveCourse(chapters[index+1]);else LoadBuiltinCourse(chapters[index+1]);ForgetImport();NewGame();},13,28,Teal);
            }else if(!Game.UsesManualSaveSlots)NativeUiKit.Button(panel,"返回本房间入口 · 保留已完成的机关",()=>{Game.LoadRoom(Game.Room.Id);SaveProgress();storyRoom=null;Show("play");},11,25);
            if(Game.IsGuided&&!Game.IsContactAutosave&&state!="won"){
                NativeUiKit.Label(panel,"碰到存档旗后，选一格保存；暂停时可以读档。",11,Paper);
                if(Game.IsAwarenessResource)NativeUiKit.Label(panel,"咖啡和讲义按 "+KeyName()+" 使用，每份只用一次。",11,Paper);
            }
            NativeUiKit.Button(panel,"研究记录 · 查看藏品",()=>Show("collection"),11,25);
        }
    }
}
