using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
namespace RoomLab.Native
{
    public sealed partial class NativePhysicsDemoPlayer:MonoBehaviour
    {
        public NativeMotion Game{get;private set;}NativeProject builtin;NativeDemoAssets assets;NativePixelWorld world;bool isBuiltin,tainted,map,verify;string identity,page="menu",notice="",loadedRoom,lastCheckpoint;int high,roomReached;float saveAt;
        NativeInputTimeline timeline=new NativeInputTimeline();NativeKeyboardEvents keys;RoomLabKeyBindings legacy;KeyCode[] bindings={KeyCode.A,KeyCode.D,KeyCode.Space,KeyCode.S,KeyCode.LeftShift,KeyCode.E};readonly MotionBinding[] actions={MotionBinding.Left,MotionBinding.Right,MotionBinding.Jump|MotionBinding.Up,MotionBinding.Down,MotionBinding.Dash,MotionBinding.Interact};int rebind=-1;
        Camera view;RenderTexture target;Canvas canvas;CanvasScaler scaler;RectTransform ui;Transform panels;RawImage worldImage;Text hud,hint,status;Font font;AudioSource speaker;readonly Dictionary<string,AudioClip> sounds=new Dictionary<string,AudioClip>();JObject lastEvent;float volume=.55f;string saveDirectory;bool settingsFromGame;int desiredWidth=1280,desiredHeight=720;bool desiredFull;bool matrix;bool tutorialSeen;bool adaptiveWindow=true;bool importLegacyRules;string importedLevel="";int verifiedCoreChecks;string importedCourseId="";string builtinCourseId="autosave:physics";string pendingImportPath,pendingReturnPage;JObject[] pendingCourses;bool displayExpanded;float windowScale=.9f;float viewMax=1.3f;float designWidth=640f,designHeight=360f,playfieldWidth=640f,playfieldHeight=327f;int pixelScale=1,appliedWidth,appliedHeight;
        // The HUD bar lives above the level instead of on top of it: 26px bar + 7px margin.
        const float HudBand=33f;
        string developerReturnPage="pause";bool hiddenDeveloperOpen,developerTools;int developerRoomPage;
        static readonly Color Ink=NativeAssetOverrides.ColorSetting("ink",new Color(.055f,.085f,.14f)),Paper=NativeAssetOverrides.ColorSetting("paper",new Color(.88f,.87f,.77f)),Teal=NativeAssetOverrides.ColorSetting("accent",new Color(.2f,.72f,.72f)),Orange=new Color(.95f,.58f,.29f);
        string SaveFile{get{return Path.Combine(saveDirectory,identity+".json");}}
        void Start(){campaignVerify=Array.IndexOf(Environment.GetCommandLineArgs(),"-nativeCampaignVerify")>=0;verify=campaignVerify||Array.IndexOf(Environment.GetCommandLineArgs(),"-nativePhysicsVerify")>=0;matrix=Array.IndexOf(Environment.GetCommandLineArgs(),"-nativeUiMatrix")>=0;try{Application.runInBackground=true;Application.targetFrameRate=120;QualitySettings.vSyncCount=1;saveDirectory=Path.Combine(Application.persistentDataPath,"deadline-autosave-progress-v1");if(verify){Screen.SetResolution(1280,720,FullScreenMode.Windowed);}if(verify||matrix)saveDirectory=Path.Combine(Evidence(),"isolated-progress");Directory.CreateDirectory(saveDirectory);font=Resources.Load<Font>("PhysicsPixelFont/FusionPixel");if(font==null)throw new Exception("中文字体未打包");LoadSettings();BindKeys();speaker=gameObject.AddComponent<AudioSource>();speaker.playOnAwake=false;CreateSounds();CreateCampaignAudio();
            view=Camera.main;if(view==null){var c=new GameObject("Native Physics World Camera");c.tag="MainCamera";view=c.AddComponent<Camera>();}view.orthographic=true;view.clearFlags=CameraClearFlags.SolidColor;
            SetupCanvas();string dir=Path.Combine(Application.streamingAssetsPath,"RoomLabNative");builtin=NativeProjectLoader.LoadFile(Path.Combine(dir,"AuthoredPhysics","authored-physics.json"),new ImportOptions{Profile=ImportProfile.EditorAuto,RequireAssets=true});CommitCandidate(builtin,NativeGameplayRules.DemoPhysics,true);if(!verify&&!matrix&&!string.IsNullOrEmpty(builtinCourseId)){try{LoadBuiltinCourse(builtinCourseId);}catch(Exception e){builtinCourseId="";notice="上次大关无法恢复，已返回物理关："+e.Message;SaveSettings();}}if(!verify&&!matrix&&!string.IsNullOrEmpty(importedLevel))TryRestoreImport();Show("menu");if(matrix)StartCoroutine(UiMatrix());else if(verify)StartCoroutine(campaignVerify?VerifyCampaign():Verify());
        }catch(Exception e){Debug.LogException(e);notice=e.Message;if(verify||matrix)Finish(2);}}
        void SetupCanvas(){var go=new GameObject("Native Physics UI",typeof(Canvas),typeof(CanvasScaler),typeof(GraphicRaycaster));go.layer=5;canvas=go.GetComponent<Canvas>();canvas.renderMode=RenderMode.ScreenSpaceOverlay;canvas.sortingOrder=10;
            scaler=go.GetComponent<CanvasScaler>();scaler.uiScaleMode=CanvasScaler.ScaleMode.ScaleWithScreenSize;scaler.referenceResolution=new Vector2(640,360);scaler.screenMatchMode=CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;scaler.referencePixelsPerUnit=100;scaler.matchWidthOrHeight=0;
            NativeUiKit.Font=font;NativeUiKit.ClickSound=()=>Play("ui");
            NativeUiKit.MarkBackdrop(NativeUiKit.Box(go.transform,"Screen background",Color.black).gameObject);
            ui=NativeUiKit.New(go.transform,"Design space");
            var raw=NativeUiKit.New(ui,"Native world").gameObject.AddComponent<RawImage>();raw.raycastTarget=false;raw.color=Color.white;worldImage=raw;NativeUiKit.MarkBackdrop(raw.gameObject);
            var worldRect=worldImage.rectTransform;worldRect.anchorMin=new Vector2(0,0);worldRect.anchorMax=new Vector2(1,1);worldRect.offsetMin=new Vector2(0,0);worldRect.offsetMax=new Vector2(0,-HudBand);
            panels=NativeUiKit.New(ui,"Interface");
            if(FindAnyObjectByType<EventSystem>()==null)new GameObject("Native UI Event System",typeof(EventSystem),typeof(StandaloneInputModule));ApplyScreen(true);}
        static readonly Vector2Int[] DisplayPresets={new Vector2Int(1280,720),new Vector2Int(1600,900),new Vector2Int(1920,1080),new Vector2Int(2560,1440)};
        static readonly Vector2Int[] UiMatrixSizes={new Vector2Int(1280,720),new Vector2Int(1366,768),new Vector2Int(1600,900),new Vector2Int(1920,1080),new Vector2Int(1024,768),new Vector2Int(1920,1200),new Vector2Int(2560,1440)};
        static readonly string[] UiMatrixPages={"tutorial","menu","play","pause","settings","settings-expanded","developer","won"};
        // World fills the window below the HUD band: the design space grows along the narrower axis,
        // the world render texture follows the playfield at an integer pixel scale, so no letterbox,
        // no wasted screen and the status bar never covers the level.
        void ApplyScreen(bool force){
            if(view==null)return;if(!force&&Screen.width==appliedWidth&&Screen.height==appliedHeight)return;
            appliedWidth=Screen.width;appliedHeight=Screen.height;
            float aspect=appliedWidth/(float)Mathf.Max(1,appliedHeight),baseline=16f/9f;bool wide=aspect>=baseline;
            if(scaler!=null)scaler.matchWidthOrHeight=wide?1f:0f;
            designWidth=wide?360f*aspect:640f;designHeight=wide?360f:640f/aspect;
            float scale=Mathf.Min(appliedWidth/designWidth,appliedHeight/designHeight);pixelScale=Mathf.Clamp(Mathf.FloorToInt(scale),1,4);
            playfieldWidth=designWidth;playfieldHeight=Mathf.Max(96f,designHeight-HudBand);
            int rw=Mathf.Clamp(Mathf.RoundToInt(playfieldWidth*pixelScale),320,4096),rh=Mathf.Clamp(Mathf.RoundToInt(playfieldHeight*pixelScale),180,2160);
            if(target!=null&&target.width==rw&&target.height==rh)return;
            var previous=target;target=new RenderTexture(rw,rh,24){filterMode=FilterMode.Point,name="Physics design "+rw+"x"+rh};target.Create();
            view.orthographic=true;view.clearFlags=CameraClearFlags.SolidColor;view.targetTexture=target;if(worldImage!=null)worldImage.texture=target;
            if(previous!=null){previous.Release();Destroy(previous);}}
        void ClearUI(){var previous=new List<Transform>();foreach(Transform t in panels)previous.Add(t);foreach(var t in previous){t.gameObject.SetActive(false);t.SetParent(null,false);Destroy(t.gameObject);}hud=hint=status=null;}
        void Show(string state){
            // The resolution list is an accordion: every fresh entry to settings starts collapsed,
            // while the in-page toggle keeps the state it just switched to.
            if(state=="developer"&&!hiddenDeveloperOpen&&!verify&&!matrix)return;
            if(state=="play"&&Game!=null&&Game.UsesManualSaveSlots&&Game.AwaitingSaveChoice)state="save-slots";
            if(state=="settings"&&page!="settings")displayExpanded=false;
            page=state;ClearUI();timeline.Reset();keys?.Clear();if(Game!=null){if(state=="play"){Game.Mode=Game.Completed?"won":"playing";}else if(!Game.Completed)Game.Mode="paused";}
            var root=NativeUiKit.New(panels,"Page "+state);
            if(state=="play"){BuildHud(root);NativeUiKit.Relayout(root);return;}
            if(state=="exploration-map"){BuildExplorationMap(root);NativeUiKit.Relayout(root);return;}
            NativeUiKit.MarkBackdrop(NativeUiKit.Box(root,"Backdrop",new Color(.025f,.045f,.08f,.9f)).gameObject);
            if(IsSaveSlotPage){saveSlotReadyAt=Time.unscaledTime+.2f;if(EventSystem.current!=null)EventSystem.current.SetSelectedGameObject(null);if(state=="overwrite-slot")BuildOverwriteSlot(root);else BuildSaveSlots(root,state=="save-slots");NativeUiKit.Relayout(root);return;}
            if(state=="collection")BuildCollection(root);else if(state=="builtin-select")BuildBuiltinSelection(root);else if(state=="course-select")BuildCourseSelection(root);else if(state=="menu")BuildMenu(root);else if(state=="settings")BuildSettings(root);else if(state=="developer")BuildDeveloper(root);else if(state=="settings-expanded"){displayExpanded=true;BuildSettings(root);}else if(state=="tutorial"){tutorialSeen=true;SaveSettings();BuildTutorial(root);}else BuildPause(root,state);
            NativeUiKit.Relayout(root);if(verify&&(state=="builtin-select"||state=="course-select"))VerifySelectionBounds(root);}
        void VerifySelectionBounds(RectTransform root){
            Canvas.ForceUpdateCanvases();NativeUiKit.Relayout(root);var screen=NativeUiKit.WorldRect((RectTransform)canvas.transform);
            foreach(var text in root.GetComponentsInChildren<Text>()){var bounds=NativeUiKit.WorldRect(text.rectTransform);if(bounds.xMin<screen.xMin-1||bounds.xMax>screen.xMax+1||bounds.yMin<screen.yMin-1||bounds.yMax>screen.yMax+1)throw new Exception("Selection UI outside canvas: "+text.text);}
            Debug.Log("NATIVE_SELECTION_BOUNDS_PASS page="+page);
        }
        // HUD and hint are anchored, not layout-driven: the status text keeps the left side and the
        // pause button keeps its exact 32x20 box at every resolution.
        void BuildHud(Transform root){
            var bar=NativeUiKit.New(root,"HUD");bar.anchorMin=new Vector2(0,1);bar.anchorMax=new Vector2(1,1);bar.pivot=new Vector2(.5f,1);bar.anchoredPosition=new Vector2(0,-7);bar.sizeDelta=new Vector2(-16,26);
            var bg=bar.gameObject.AddComponent<Image>();bg.color=new Color(.04f,.07f,.11f,.94f);bg.raycastTarget=false;
            hud=NativeUiKit.Label(bar,"",12,Paper,TextAnchor.MiddleLeft);var status=hud.rectTransform;status.anchorMin=new Vector2(0,0);status.anchorMax=new Vector2(1,1);status.offsetMin=new Vector2(8,0);status.offsetMax=new Vector2(Game.IsAwarenessResource?-238:-46,0);
            var pause=NativeUiKit.Button(bar,"Ⅱ",()=>Show("pause"),12,20,NativeUiKit.Slot,32,0).GetComponent<RectTransform>();
            pause.anchorMin=pause.anchorMax=new Vector2(1,.5f);pause.pivot=new Vector2(1,.5f);pause.anchoredPosition=new Vector2(-6,0);pause.sizeDelta=new Vector2(32,20);
            var hintBar=NativeUiKit.New(root,"Hint");hintBar.anchorMin=new Vector2(0,0);hintBar.anchorMax=new Vector2(1,0);hintBar.pivot=new Vector2(.5f,0);hintBar.anchoredPosition=new Vector2(0,6);hintBar.sizeDelta=new Vector2(-16,44);hintBar.gameObject.AddComponent<Image>().color=new Color(Ink.r,Ink.g,Ink.b,.78f);
            hint=NativeUiKit.Label(hintBar,"",12,Paper,TextAnchor.MiddleLeft);var hr=hint.rectTransform;hr.anchorMin=Vector2.zero;hr.anchorMax=Vector2.one;hr.offsetMin=new Vector2(8,0);hr.offsetMax=new Vector2(-8,0);BuildAwarenessHud(root);}
        // Fixed 224x312 art panel: absolute offsets inside it never depend on the window.
        void BuildPhone(RectTransform phone){NativeUiKit.AbsImage(phone,"Phone header",10,10,204,24,Ink);
            NativeUiKit.AbsLabel(phone,20,16,180,18,"09:41     论文助手     ●",12,Paper);
            NativeUiKit.AbsLabel(phone,17,51,180,25,"今晚的作业",16,Ink);
            NativeUiKit.AbsLabel(phone,17,85,185,45,"AI：论文交给我。\n你负责带我找到素材。",12,Ink);
            NativeUiKit.AbsImage(phone,"Divider",16,144,192,1,new Color(.55f,.62f,.6f));
            NativeUiKit.AbsLabel(phone,17,160,183,96,ThemeHint(),12,Ink);
            NativeUiKit.AbsLabel(phone,17,271,180,25,"DDL  /  截止之前",12,new Color(.25f,.4f,.45f));}
        void BuildMenu(Transform root){float width=Mathf.Min(600f,designWidth-32f);
            var menu=NativeUiKit.Column(root,"Menu",10,0,0);NativeUiKit.Center(menu,width);
            var head=NativeUiKit.Row(menu,"Menu head",312,18,0);
            var phone=NativeUiKit.Box(head,"Paper todo panel",Paper).rectTransform;NativeUiKit.Size(phone,224,312,0);BuildPhone(phone);
            var actions=NativeUiKit.Column(head,"Menu actions",8,0,0,false);NativeUiKit.Size(actions,flexWidth:1);
            NativeUiKit.Label(actions,HasChapterFlow?NativeAssetOverrides.Title:Game.Course.Kind=="calculus"?"高数 DDL":Game.Course.Kind=="slacker"?"水课 DDL":"物理 DDL",24,Paper);
            NativeUiKit.Label(actions,(Game.IsContactAutosave?"夜课 · ":Game.IsRework?"夜课 · ":Game.IsCampaign?"初期版本 · ":isBuiltin?"内置 Demo · ":"编辑器 2.5.5 / 3.0 · ")+Game.Course.Name,12,Teal);
            NativeUiKit.Label(actions,"进度 "+roomReached+" / "+Game.Course.Rooms.Count+"    最高分 "+high,12,Paper);
            NativeUiKit.Button(actions,"新游戏",NewGame,13,30,Teal);NativeUiKit.Button(actions,"作业待办",()=>Show("builtin-select"),12,28);
            if(Game.UsesManualSaveSlots)NativeUiKit.Button(actions,"读取存档",()=>OpenLoadSlots("menu"),13,30);
            else {var cont=NativeUiKit.Button(actions,"继续 · 从最近检查点 / 房间入口",Continue,13,30);cont.interactable=CanContinue();}
            var first=NativeUiKit.Row(actions,"Menu row 1",28,8);NativeUiKit.Button(first,"设置",()=>{settingsFromGame=false;Show("settings");},12,28);NativeUiKit.Button(first,"退出",Quit,12,28);
            status=NativeUiKit.Label(actions,notice,12,Orange);}
        void BuildPause(Transform root,string state){float width=Mathf.Min(560f,designWidth-32f);
            var panel=NativeUiKit.Column(root,"Panel",7,14,12);NativeUiKit.Center(panel,width);var bg=panel.gameObject.AddComponent<Image>();bg.color=Ink;bg.raycastTarget=false;
            NativeUiKit.Label(panel,state=="won"?Game.Course.Name+" · 完成":"课程暂停",20,Paper);
            NativeUiKit.Label(panel,state=="won"?(tainted?"检查完成 · 不记录正常成绩":"分数 "+Game.Score+"   +50,000 论文提交奖励"):(timeline.ProtectionPaused?timeline.ProtectionReason:notice),12,Orange);
            CampaignPause(panel,state);if(state!="won")NativeUiKit.Button(panel,"继续游戏",()=>Show("play"),13,30,Teal);
            var first=NativeUiKit.Row(panel,"Pause row 1",28,8);NativeUiKit.Button(first,"从上个存档点开始",Retry,12,28);NativeUiKit.Button(first,"设置",()=>{settingsFromGame=true;Show("settings");},12,28);
            var second=NativeUiKit.Row(panel,"Pause row 2",28,8);NativeUiKit.Button(second,"查看地图",OpenExplorationMap,12,28);if(Game.UsesManualSaveSlots)NativeUiKit.Button(second,"读取存档",()=>OpenLoadSlots(state),12,28);
            var third=NativeUiKit.Row(panel,"Pause row 3",28,8);NativeUiKit.Button(third,"主菜单",()=>{SaveProgress();Show("menu");},12,28);NativeUiKit.Button(third,"退出游戏",Quit,12,28);
            NativeUiKit.Fit(panel,width,designHeight-24f);}
        void BuildSettings(Transform root){float width=Mathf.Min(560f,designWidth-32f);
            var panel=NativeUiKit.Column(root,"Panel",6,14,12);NativeUiKit.Center(panel,width);var bg=panel.gameObject.AddComponent<Image>();bg.color=Ink;bg.raycastTarget=false;
            NativeUiKit.Label(panel,"设置",20,Paper);
            var volumeRow=NativeUiKit.Row(panel,"Volume row",24,8);
            var volumeLabel=NativeUiKit.Label(volumeRow,"主音量 "+Mathf.RoundToInt(volume*100)+"%",12,Paper,TextAnchor.MiddleLeft);NativeUiKit.Size(volumeLabel,150,24,0);
            VolumeSlider(volumeRow,volumeLabel);
            NativeUiKit.Button(volumeRow,"试听",()=>Play("finish"),12,22,NativeUiKit.Slot,64,0);
            string[] names={"向左","向右","跳跃","下蹲","冲刺","交互"};
            for(int i=0;i<6;i+=2){var row=NativeUiKit.Row(panel,"Key row "+i,26,8);for(int k=i;k<i+2;k++){int index=k;NativeUiKit.Button(row,(k==5&&Game.Rules==NativeGameplayRules.Editor255Compat?"按关卡自动触发":names[k]+"  "+(rebind==k?"按新按键":bindings[k].ToString())),()=>{if(index==5&&Game.Rules==NativeGameplayRules.Editor255Compat){notice="本关按作者配置触发：控温板踩踏切换，无需交互键";return;}rebind=index;Show("settings");},12,26);}}
            MixControls(panel);MapSettings(panel);BuildDisplayGroup(panel);
            NativeUiKit.Button(panel,"返回",()=>{rebind=-1;Show(settingsFromGame?"pause":"menu");},12,28);
            status=NativeUiKit.Label(panel,notice,12,Orange);
            NativeUiKit.Fit(panel,width,designHeight-24f);}
        // One display group: an adaptive-window switch with its own sub panel, plus a collapsible
        // resolution list so the presets do not fill the page when nobody needs them.
        void BuildDisplayGroup(Transform parent){
            var group=NativeUiKit.Column(parent,"Display options",6,10,8);var bg=group.gameObject.AddComponent<Image>();bg.color=new Color(.09f,.14f,.19f);bg.raycastTarget=false;
            NativeUiKit.Label(group,"显示",12,Teal);
            NativeUiKit.Button(group,adaptiveWindow?"自适应窗口  开":"自适应窗口  关",()=>{adaptiveWindow=!adaptiveWindow;if(adaptiveWindow)ApplyAdaptiveWindow();else Screen.SetResolution(desiredWidth,desiredHeight,FullScreenMode.Windowed);SaveSettings();Show("settings");},12,24,adaptiveWindow?Teal:NativeUiKit.SlotIdle);
            if(adaptiveWindow){
                var sub=NativeUiKit.Column(group,"Adaptive window options",4,8,6);var subBg=sub.gameObject.AddComponent<Image>();subBg.color=new Color(.055f,.09f,.13f);subBg.raycastTarget=false;
                var windowRow=NativeUiKit.Row(sub,"Window scale",26,8);
                var windowLabel=NativeUiKit.Label(windowRow,"窗口",12,Paper,TextAnchor.MiddleLeft);NativeUiKit.Size(windowLabel,44,26,0);
                NativeSciFiGauge.Create(windowRow,.5f,1f,windowScale,v=>{windowScale=v;adaptiveWindow=true;},()=>{ApplyAdaptiveWindow();SaveSettings();});
                var viewRow=NativeUiKit.Row(sub,"Room view",26,8);
                var viewLabel=NativeUiKit.Label(viewRow,"视野",12,Paper,TextAnchor.MiddleLeft);NativeUiKit.Size(viewLabel,44,26,0);
                NativeSciFiGauge.Create(viewRow,1f,1.6f,viewMax,v=>{viewMax=v;NativeCameraView.Zoom=v;},()=>{SaveSettings();Show("settings");});
                NativeUiKit.Label(sub,"窗口 "+Screen.width+"×"+Screen.height+" · 视野 100% 关闭大房间自动拉远 · 可直接拖动窗口边缘",10,new Color(.55f,.65f,.75f));
            }
            string current=desiredFull?"全屏":desiredWidth+"×"+desiredHeight;
            NativeUiKit.Button(group,"分辨率  "+current+(displayExpanded?"  收起 ▾":"  展开 ▸"),()=>{displayExpanded=!displayExpanded;Show("settings");},12,24,NativeUiKit.Slot);
            if(displayExpanded){
                var available=AvailablePresets();int currentIndex=SelectedPreset(available);
                var presets=NativeUiKit.Row(group,"Resolution presets",24,6);
                for(int i=0;i<available.Count;i++){int index=i;bool active=!desiredFull&&!adaptiveWindow&&i==currentIndex;NativeUiKit.Button(presets,available[i].x+"×"+available[i].y,()=>SetDisplay(available[index].x,available[index].y,false),11,24,active?Teal:NativeUiKit.SlotIdle);}
                var modes=NativeUiKit.Row(group,"Display mode",24,6);
                NativeUiKit.Button(modes,"窗口",()=>{adaptiveWindow=false;SetDisplay(desiredWidth,desiredHeight,false);},11,24,!desiredFull?Teal:NativeUiKit.SlotIdle);
                NativeUiKit.Button(modes,"全屏",()=>SetDisplay(desiredWidth,desiredHeight,true),11,24,desiredFull?Teal:NativeUiKit.SlotIdle);
            }
        }
        List<Vector2Int> AvailablePresets(){var list=new List<Vector2Int>();int maxWidth=Screen.currentResolution.width,maxHeight=Screen.currentResolution.height;foreach(var preset in DisplayPresets)if(preset.x<=maxWidth&&preset.y<=maxHeight)list.Add(preset);if(list.Count==0)list.Add(new Vector2Int(1280,720));bool found=false;foreach(var preset in list)if(preset.x==desiredWidth&&preset.y==desiredHeight)found=true;if(!found)list.Add(new Vector2Int(desiredWidth,desiredHeight));return list;}
        int SelectedPreset(List<Vector2Int> available){for(int i=0;i<available.Count;i++)if(available[i].x==desiredWidth&&available[i].y==desiredHeight)return i;return -1;}
        void SetDisplay(int width,int height,bool full){if(!full){adaptiveWindow=false;desiredWidth=width;desiredHeight=height;}desiredFull=full;int targetWidth=full?Screen.currentResolution.width:width,targetHeight=full?Screen.currentResolution.height:height;Screen.SetResolution(targetWidth,targetHeight,full?FullScreenMode.FullScreenWindow:FullScreenMode.Windowed);SaveSettings();Show("settings");}
        void OpenHiddenDeveloper(){
            if(Game==null||Game.AwaitingSaveChoice||IsSaveSlotPage)return;
            if(page=="developer")return;
            developerReturnPage=page;hiddenDeveloperOpen=true;developerTools=false;developerRoomPage=0;
            Show("developer");
        }
        void CloseHiddenDeveloper(){hiddenDeveloperOpen=false;Show(developerReturnPage=="developer"?"pause":developerReturnPage);}
        void BuildDeveloper(Transform root){float width=Mathf.Min(560f,designWidth-32f);
            var panel=NativeUiKit.Column(root,"Hidden developer panel",6,14,12);NativeUiKit.Center(panel,width);var bg=panel.gameObject.AddComponent<Image>();bg.color=Ink;bg.raycastTarget=false;
            NativeUiKit.Label(panel,"开发者选项",20,Paper);
            var tabs=NativeUiKit.Row(panel,"Developer tabs",26,8);
            NativeUiKit.Button(tabs,"调试",()=>{developerTools=false;Show("developer");},12,26,developerTools?NativeUiKit.SlotIdle:Teal);
            NativeUiKit.Button(tabs,"关卡与导入",()=>{developerTools=true;Show("developer");},12,26,developerTools?Teal:NativeUiKit.SlotIdle);
            if(developerTools){
                var tools=NativeUiKit.Row(panel,"Developer tools",27,8);
                NativeUiKit.Button(tools,"替换导入",PickImport,12,27);
                NativeUiKit.Button(tools,"恢复内置大关",()=>{LoadBuiltinCourse(builtinCourseId);ForgetImport();hiddenDeveloperOpen=false;Show("menu");},12,27);
                NativeUiKit.Button(tools,"教程",()=>Show("tutorial"),12,27);
                NativeUiKit.Button(panel,importLegacyRules?"导入关卡：按 2.5.5 原规则":"导入关卡：按本包规则",()=>{importLegacyRules=!importLegacyRules;SaveSettings();Show("developer");},12,26,importLegacyRules?NativeUiKit.SlotIdle:Teal);
                NativeUiKit.Label(panel,"作者 Demo",12,Teal);
                NativeUiKit.Button(panel,"物理 · 原 11 房",()=>LoadDeveloperCourse(""),12,26);
                try{NativeProjectLoader.LoadFile(BuiltinThemeFile,new ImportOptions{PlayableCoursesOnly=true});}
                catch(NativeCourseSelectionException choices){foreach(var c in choices.Courses){if((string)c["kind"]=="physics")continue;string id=(string)c["id"];NativeUiKit.Button(panel,((string)c["name"]??id)+" · 3 房示例",()=>LoadDeveloperCourse(id),12,26);}}
                catch(Exception e){NativeUiKit.Label(panel,"示例包暂时无法读取",11,Orange);Debug.LogWarning("NATIVE_DEVELOPER_EXAMPLES_FAILED "+e.Message);}
            }else{
                NativeUiKit.Label(panel,"启用调试后，本次成绩与进度不保存。",11,Orange);
                var toggles=NativeUiKit.Row(panel,"Developer toggles",28,8);
                NativeUiKit.Button(toggles,Game.LockHealth?"关闭锁血":"开启锁血",()=>{tainted=true;Game.SetDeveloperOptions(true,!Game.LockHealth,Game.DeveloperFlight);Show("developer");},12,28);
                NativeUiKit.Button(toggles,Game.DeveloperFlight?"关闭飞行":"开启飞行",()=>{tainted=true;Game.SetDeveloperOptions(true,Game.LockHealth,!Game.DeveloperFlight);Show("developer");},12,28);
                var rooms=Game.Course.Rooms;int pageCount=Mathf.Max(1,(rooms.Count+5)/6);developerRoomPage=Mathf.Clamp(developerRoomPage,0,pageCount-1);int start=developerRoomPage*6;
                for(int i=start;i<Mathf.Min(start+6,rooms.Count);i+=2){var row=NativeUiKit.Row(panel,"Room row "+i,24,8);for(int k=i;k<Mathf.Min(i+2,rooms.Count);k++){var room=rooms[k];NativeUiKit.Button(row,SlotText(room.Name,22),()=>{tainted=true;SetGame(new NativeMotion(Game.Project,Game.Course.Id,room.Id,Game.Rules));Game.SetDeveloperOptions(true,true,false);hiddenDeveloperOpen=false;Show("play");},11,24);}}
                if(pageCount>1){var pages=NativeUiKit.Row(panel,"Developer room pages",24,8);var prev=NativeUiKit.Button(pages,"上一页",()=>{developerRoomPage--;Show("developer");},11,24);prev.interactable=developerRoomPage>0;NativeUiKit.Label(pages,(developerRoomPage+1)+" / "+pageCount,11,Paper,TextAnchor.MiddleCenter);var next=NativeUiKit.Button(pages,"下一页",()=>{developerRoomPage++;Show("developer");},11,24);next.interactable=developerRoomPage<pageCount-1;}
            }
            NativeUiKit.Button(panel,"返回",CloseHiddenDeveloper,12,27);
            NativeUiKit.Fit(panel,width,designHeight-24f);}
        void LoadDeveloperCourse(string id){try{LoadBuiltinCourse(id);ForgetImport();hiddenDeveloperOpen=false;Show("menu");}catch(Exception e){notice="关卡暂时无法读取";Debug.LogWarning("NATIVE_DEVELOPER_COURSE_FAILED "+e.Message);Show("developer");}}
        string KeyName(){return bindings[5]==KeyCode.None?"E":bindings[5].ToString();}
        string InteractionPrompt(NativeObject o){string key=KeyName();if(o.Type=="common.aiStart"||o.Type=="common.aiStartHollow")return key+" 启动 AI（消耗全部 "+Game.Tokens+" token）";return key+" 操作："+o.Name;}
        // First run tutorial: what the AI is for, and that E boots it.
        void BuildTutorial(Transform root){float width=Mathf.Min(560f,designWidth-32f);
            var panel=NativeUiKit.Column(root,"Panel",6,14,12);NativeUiKit.Center(panel,width);var bg=panel.gameObject.AddComponent<Image>();bg.color=Ink;bg.raycastTarget=false;
            NativeUiKit.Label(panel,"新手教程",20,Paper);
            NativeUiKit.Label(panel,"目标：找到 AI 启动装置，靠近后按 "+KeyName()+" 启动 AI（会消耗当前全部 token），再引着 AI 去吃收藏品——收藏品只有 AI 拿得到。",12,Teal);
            NativeUiKit.Label(panel,"操作：A/D 移动 · 空格/W 跳跃 · S 下蹲 · Shift 冲刺 · "+KeyName()+" 交互 · Esc 菜单 · M 地图 · R 重试",12,Paper);
            NativeUiKit.Label(panel,"冲刺：落地恢复 1 次免费冲刺；付费冲刺上限 1 次，3 个小 token 或 1 个大 token 充能 1 次。",12,Paper);
            NativeUiKit.Label(panel,"风险：被 AI 抓到扣掉一半 token，同一局第二次被抓回最近检查点。",12,Orange);
            var row=NativeUiKit.Row(panel,"Tutorial row",30,8);NativeUiKit.Button(row,"开始游戏",()=>{hiddenDeveloperOpen=false;Show(Game!=null?"play":"menu");},13,30,Teal);NativeUiKit.Button(row,"返回",()=>Show(hiddenDeveloperOpen?"developer":"menu"),12,30);
            NativeUiKit.Fit(panel,width,designHeight-24f);}
        IEnumerator UiMatrix(){
            var report=new StringBuilder();int shots=0,pairs=0,problems=0;
            yield return null;NewGame();
            foreach(var size in UiMatrixSizes){
                Screen.SetResolution(size.x,size.y,FullScreenMode.Windowed);yield return null;yield return null;yield return new WaitForSecondsRealtime(.4f);
                bool exact=Screen.width==size.x&&Screen.height==size.y;
                var wr=worldImage!=null?NativeUiKit.WorldRect(worldImage.rectTransform):new Rect();
                var pr=NativeUiKit.WorldRect(ui);
                float band=HudBand*(pr.width/Mathf.Max(1f,designWidth));
                bool covered=worldImage!=null&&Mathf.Abs(wr.width-pr.width)<=1.5f&&Mathf.Abs(wr.yMin-pr.yMin)<=1.5f&&Mathf.Abs(wr.yMax-(pr.yMax-band))<=1.5f;
                report.AppendLine("RES "+size.x+"x"+size.y+(exact?" applied":" clamped->"+Screen.width+"x"+Screen.height)+" design="+designWidth.ToString("F1")+"x"+designHeight.ToString("F1")+" playfield="+playfieldWidth.ToString("F1")+"x"+playfieldHeight.ToString("F1")+" pixelScale="+pixelScale+" rt="+(target!=null?target.width+"x"+target.height:"none")+" worldImage="+wr.width.ToString("F0")+"x"+wr.height.ToString("F0")+" band="+band.ToString("F0"));
                if(!covered){problems++;report.AppendLine("  PROBLEM world coverage world="+wr+" page="+pr+" band="+band.ToString("F1"));Debug.LogWarning("NATIVE_UI_MATRIX_PROBLEM world-coverage "+wr+" page="+pr);}
                if(!exact)Debug.LogWarning("NATIVE_UI_MATRIX_CLAMPED want="+size.x+"x"+size.y+" got="+Screen.width+"x"+Screen.height);
                foreach(var state in UiMatrixPages){
                    if(state=="settings")displayExpanded=false;
                    Show(state);NativeUiKit.Relayout(panels);
                    var found=new List<string>();int inspected=NativeUiKit.Validate((RectTransform)panels,found,NativeUiKit.WorldRect(ui));pairs+=inspected;
                    foreach(var problem in found){problems++;report.AppendLine("  PROBLEM "+state+" "+problem);Debug.LogWarning("NATIVE_UI_MATRIX_PROBLEM "+state+" "+problem);}
                    yield return Capture("ui-"+Screen.width+"x"+Screen.height+"-"+state);shots++;
                }
            }
            NativeRoom bigRoom=null;foreach(var r in builtin.Courses[0].Rooms)if(r.Cols>=60&&r.Rows>=60){bigRoom=r;break;}
            if(bigRoom!=null){
                Screen.SetResolution(1280,720,FullScreenMode.Windowed);yield return null;yield return new WaitForSecondsRealtime(.4f);
                SetGame(new NativeMotion(builtin,builtin.Courses[0].Id,bigRoom.Id,NativeGameplayRules.DemoPhysics));Show("play");
                NativeCameraView.Zoom=1.3f;report.AppendLine("BIG_ROOM room="+bigRoom.Name+" cols="+bigRoom.Cols+" rows="+bigRoom.Rows+" zoom=1.30");
                yield return Capture("view-adaptive-130");
                NativeCameraView.Zoom=1f;report.AppendLine("BIG_ROOM room="+bigRoom.Name+" zoom=1.00");
                yield return Capture("view-adaptive-off");
                NativeCameraView.Zoom=viewMax;
                CommitCandidate(builtin,NativeGameplayRules.DemoPhysics,true);Show("menu");
            }
            NativeRoom jetRoom=null;NativeObject horizontal=null;
            foreach(var r in builtin.Courses[0].Rooms){foreach(var o in r.Objects)if(o.Type=="physics.jet"&&(o.Text("direction")=="left"||o.Text("direction")=="right")){jetRoom=r;horizontal=o;break;}if(jetRoom!=null)break;}
            if(jetRoom!=null){
                Screen.SetResolution(1280,720,FullScreenMode.Windowed);yield return null;yield return new WaitForSecondsRealtime(.4f);
                SetGame(new NativeMotion(builtin,builtin.Courses[0].Id,jetRoom.Id,NativeGameplayRules.DemoPhysics));
                Show("play");Game.ObjectStates[horizontal.Id].cooldown=1.0;world.Refresh(0,view,map);
                report.AppendLine("JET_PLUME room="+jetRoom.Name+" direction="+horizontal.Text("direction")+" cooldown="+Game.ObjectStates[horizontal.Id].cooldown);
                yield return Capture("jet-plume-"+horizontal.Text("direction"));
                CommitCandidate(builtin,NativeGameplayRules.DemoPhysics,true);Show("menu");
            }
            string userCases=Path.Combine(Evidence(),"user-cases");
            if(Directory.Exists(userCases)){
                foreach(var caseDir in Directory.GetDirectories(userCases)){
                    string level=Path.Combine(caseDir,"level.json");
                    if(!File.Exists(level))continue;
                    string caseName=Path.GetFileName(caseDir);
                    bool accepted=ImportFile(level);
                    report.AppendLine("USER_CASE "+caseName+" accepted="+accepted+" rules="+(accepted?Game.Rules.ToString():"n/a")+" assets="+(accepted?Game.Project.Assets.Count:0)+" notice="+notice);
                    if(!accepted)problems++;
                    else
                    {
                        Show("play");yield return Capture("import-"+caseName);
                        // presentation evidence inside the imported project itself
                        NativeRoom caseJet=null;NativeObject caseJetObject=null;
                        foreach(var r in Game.Course.Rooms){foreach(var o in r.Objects)if(o.Type=="physics.jet"&&(o.Text("direction")=="left"||o.Text("direction")=="right")){caseJet=r;caseJetObject=o;break;}if(caseJet!=null)break;}
                        if(caseJet!=null){SetGame(new NativeMotion(Game.Project,Game.Course.Id,caseJet.Id,Game.Rules));Show("play");Game.ObjectStates[caseJetObject.Id].cooldown=1.0;world.Refresh(0,view,map);yield return Capture("import-"+caseName+"-jet-"+caseJetObject.Text("direction"));}
                        NativeRoom caseRail=null;foreach(var r in Game.Course.Rooms){foreach(var o in r.Objects)if(o.Type=="physics.rail"){caseRail=r;break;}if(caseRail!=null)break;}
                        if(caseRail!=null){SetGame(new NativeMotion(Game.Project,Game.Course.Id,caseRail.Id,Game.Rules));Show("play");yield return Capture("import-"+caseName+"-rail");}
                    }
                    CommitCandidate(builtin,NativeGameplayRules.DemoPhysics,true);Show("menu");
                }
            }
            if(Directory.Exists(userCases)){
                bool restored=TryRestoreImport();
                report.AppendLine("IMPORT_RESTORE restored="+restored+" remembered="+importedLevel+" sha="+(Game!=null?Game.Project.SourceSha256:"none")+" builtin="+isBuiltin);
                if(!restored)problems++;
                else{Show("play");yield return Capture("import-restored");}
                ForgetImport();CommitCandidate(builtin,NativeGameplayRules.DemoPhysics,true);Show("menu");
            }
            string noArt=Path.Combine(Evidence(),"no-art.zip");
            if(File.Exists(noArt)){
                bool accepted=ImportFile(noArt);
                report.AppendLine("NOART_PACKAGE accepted="+accepted+" rules="+(accepted?Game.Rules.ToString():"n/a")+" notice="+notice);
                if(!accepted)problems++;
                else{Show("play");yield return Capture("import-no-art");}
                CommitCandidate(builtin,NativeGameplayRules.DemoPhysics,true);Show("menu");
            }
            Directory.CreateDirectory(Evidence());File.WriteAllText(Path.Combine(Evidence(),"ui-matrix.txt"),report.ToString());
            if(problems>0){Debug.LogError("NATIVE_UI_MATRIX_FAIL problems="+problems);Finish(2);yield break;}
            Debug.Log("NATIVE_UI_MATRIX_PASS shots="+shots+" pairs="+pairs+" overlaps=0 outside=0 clipped=0 resolutions="+UiMatrixSizes.Length+" pages="+UiMatrixPages.Length);
            Finish(0);}
        void Update(){float previousDesignWidth=designWidth,previousDesignHeight=designHeight;ApplyScreen(false);if(Game==null)return;if((page=="exploration-map"||IsSaveSlotPage)&&(previousDesignWidth!=designWidth||previousDesignHeight!=designHeight))Show(page);
            DrainAutoSaves();
            if(Game.UsesManualSaveSlots&&Game.AwaitingSaveChoice&&page=="play")OpenSaveSlots();
            if(!verify&&!matrix&&HandleHiddenDeveloperInput())return;
            if(!verify&&!matrix&&IsSaveSlotPage){if(GameInput.WasPressedExact(KeyCode.Escape)&&Time.unscaledTime>=saveSlotReadyAt){if(page=="overwrite-slot")Show("save-slots");else if(page=="save-slots")CancelSaveSlots();else CloseLoadSlots();}}
            else if(!verify&&!matrix&&page=="developer"){if(GameInput.WasPressedExact(KeyCode.Escape))CloseHiddenDeveloper();}
            else if(!verify&&!matrix&&page=="play"){if(GameInput.WasPressedExact(KeyCode.Escape)){SaveProgress();Show("pause");}else if(GameInput.WasPressedExact(KeyCode.M)&&!LegacyUses(KeyCode.M))OpenExplorationMap();else if(legacy.WasPressed(RoomLabKeyBindings.ActionId.Retry))Retry();else Advance(Time.unscaledDeltaTime);}
            else if(!verify&&!matrix&&page=="exploration-map"){if(GameInput.WasPressedExact(KeyCode.Escape))CloseExplorationMap(false);else if(GameInput.WasPressedExact(KeyCode.M))CloseExplorationMap(true);}
            DrainAutoSaves();
            if(Game.UsesManualSaveSlots&&Game.AwaitingSaveChoice&&page=="play")OpenSaveSlots();
            if(loadedRoom!=Game.Room.Id){loadedRoom=Game.Room.Id;notice="已进入 "+Game.Room.Name;SaveProgress();}if(lastCheckpoint!=Game.Checkpoint.id){lastCheckpoint=Game.Checkpoint.id;SaveProgress();}
            if(Game.Completed&&page=="play"){if(!tainted){high=Math.Max(high,Game.Score);SaveRecord(false);}Show("won");}
            world.Refresh(Time.unscaledDeltaTime,view,map);if(hud!=null)hud.text=Game.Room.Name+"   分数 "+Game.Score+"   Token "+Game.Tokens+"   免费 "+(Game.Player.freeDash?"●":"○")+"  付费 "+Game.Charges+"/"+Game.PaidStockCap;
            if(hint!=null)hint.text=tainted?"开发检查 · 成绩不保存":Game.RespawnRemaining>0?"复活准备…":Game.NearbyInteraction!=null?InteractionPrompt(Game.NearbyInteraction):world.ThermalHint??notice;
            if(page=="play"&&Time.unscaledTime>saveAt){saveAt=Time.unscaledTime+5;SaveProgress();}PumpSounds();CampaignTick();TickAwarenessHud();TickAutoSaveNotice();}
        void OnGUI(){if(keys==null)return;var e=Event.current;if(e.type!=EventType.KeyDown&&e.type!=EventType.KeyUp)return;if(rebind>=0&&e.type==EventType.KeyDown){if(e.keyCode==KeyCode.Escape){rebind=-1;Show("settings");return;}if(e.keyCode==KeyCode.None||e.keyCode==KeyCode.M||e.keyCode==KeyCode.R){notice="M / R / Esc 保留为界面快捷键";return;}for(int i=0;i<bindings.Length;i++)if(i!=rebind&&bindings[i]==e.keyCode){notice="此按键已绑定其他动作";return;}if(rebind<5){if(!legacy.TryBind((RoomLabKeyBindings.ActionId)rebind,0,e.keyCode,out var reason)){notice=reason;return;}legacy.Save();}if(rebind==5&&LegacyUses(e.keyCode)){notice="该按键已用于已有动作";return;}bindings[rebind]=e.keyCode;rebind=-1;BindKeys();SaveSettings();Show("settings");e.Use();return;}keys.Apply((int)e.keyCode,e.type==EventType.KeyDown);if(page!="play"||Game==null||Game.RespawnRemaining>0)keys.DiscardEdges();}
        bool LegacyUses(KeyCode key){for(int a=0;a<RoomLabKeyBindings.ActionCount;a++)for(int slot=0;slot<RoomLabKeyBindings.SlotCount;slot++)if(legacy.GetKey((RoomLabKeyBindings.ActionId)a,slot)==key)return true;return false;}
        void BindKeys(){if(!RoomLabKeyBindings.IsBindable(bindings[5])||LegacyUses(bindings[5])){bindings[5]=KeyCode.None;foreach(KeyCode alternative in Enum.GetValues(typeof(KeyCode)))if(RoomLabKeyBindings.IsBindable(alternative)&&alternative!=KeyCode.M&&alternative!=KeyCode.R&&!LegacyUses(alternative)){bindings[5]=alternative;break;}}keys=new NativeKeyboardEvents();for(int i=0;i<5;i++)for(int slot=0;slot<RoomLabKeyBindings.SlotCount;slot++){var key=legacy.GetKey((RoomLabKeyBindings.ActionId)i,slot);if(key!=KeyCode.None)keys.Bind((int)key,actions[i]);}if(bindings[5]!=KeyCode.None)keys.Bind((int)bindings[5],actions[5]);}
        void Advance(double dt){if(keys.Overflowed){timeline.Advance(Game,1,default(MotionInput));notice=timeline.ProtectionReason;keys.Clear();Show("pause");return;}if(Game.Mode!="playing"||Game.RespawnRemaining>0)keys.DiscardEdges();while(keys.TryRead(out var edge))timeline.Advance(Game,0,edge);timeline.Advance(Game,dt,keys.Held);if(timeline.ProtectionPaused){notice=timeline.ProtectionReason;Show("pause");}}
        void OnApplicationFocus(bool focus){if(!focus&&Game!=null&&!verify&&!matrix){keys.Clear();timeline.LoseFocus(Game);if(page=="play"){SaveProgress();Show("pause");}}}
        void CommitCandidate(NativeProject candidate,NativeGameplayRules rules,bool builtIn,bool allowUnresolvedAssets=false,NativeMotion restored=null){
            DrainAutoSaves();
            NativeDemoAssets decoded=null;NativePixelWorld render=null;NativeMotion motor=null;string nextIdentity=null;
            var cameraPosition=view.transform.position;float cameraSize=view.orthographicSize;Color cameraBackground=view.backgroundColor;
            try{
                foreach(var c in candidate.Courses)foreach(var r in c.Rooms)if(!NativeMotion.SupportsRoom(r,out var reason))throw new NativeDataException(reason);
                if(restored!=null&&(!ReferenceEquals(restored.Project,candidate)||restored.Rules!=rules))throw new NativeDataException("存档与目标关卡不一致");
                motor=restored??new NativeMotion(candidate,rules:rules);decoded=NativeDemoAssets.Decode(candidate,allowUnresolvedAssets);render=new NativePixelWorld(motor,decoded,builtIn);render.Refresh(0,view,false);
                nextIdentity=(builtIn?"builtin-":"import-")+(((JArray)candidate.OriginalJson["courses"]).Count==1?candidate.SourceSha256+"-"+rules:NativeProjectLoader.Sha(Encoding.UTF8.GetBytes(candidate.SourceSha256+"\n"+motor.Course.Id+"\n"+rules))+"-"+rules);
            }catch{render?.Dispose();decoded?.Dispose();view.transform.position=cameraPosition;view.orthographicSize=cameraSize;view.backgroundColor=cameraBackground;throw;}
            // The current game remains owned and visible until the complete candidate has passed
            // state validation, asset decoding and a first render refresh.
            var oldWorld=world;var oldAssets=assets;world=render;assets=decoded;Game=motor;isBuiltin=builtIn;identity=nextIdentity;tainted=false;notice="";loadedRoom=Game.Room.Id;lastCheckpoint=Game.Checkpoint.id;lastEvent=null;timeline.Reset();keys.Clear();map=false;RootActivate();oldWorld?.Dispose();oldAssets?.Dispose();ReadRecord();
        }
        void RootActivate(){world.Root.SetActive(true);}
        void SetGame(NativeMotion g){DrainAutoSaves();var next=new NativePixelWorld(g,assets,isBuiltin);next.Refresh(0,view,map);var old=world;Game=g;world=next;world.Root.SetActive(true);old.Dispose();loadedRoom=g.Room.Id;lastCheckpoint=g.Checkpoint.id;timeline.Reset();keys.Clear();lastEvent=null;}
        // Loads a designer package. A bare JSON whose assets folder is missing is accepted through the
        // built-in art fallback instead of being rejected outright.
        NativeProject LoadImport(string path,bool strict,out bool substituted,string courseId=null)
        {
            substituted=false;
            try{return NativeProjectLoader.LoadFile(path,new ImportOptions{Profile=ImportProfile.EditorAuto,RequireAssets=true,PlayableCoursesOnly=true,CourseId=courseId});}
            catch(NativeDataException missing) when(!strict&&(missing.Message.StartsWith("缺少素材：")||missing.Message.StartsWith("项目包缺少素材：")))
            {
                substituted=true;
                return NativeProjectLoader.LoadFile(path,new ImportOptions{Profile=ImportProfile.EditorAuto,RequireAssets=false,PlayableCoursesOnly=true,CourseId=courseId});
            }
        }
        public bool ImportFile(string path){
            if(string.IsNullOrEmpty(path)){notice="已取消，当前实验保留";return false;}
            try{return CommitImport(path,true);}
            catch(NativeCourseSelectionException choose){pendingImportPath=path;pendingReturnPage=page;pendingCourses=choose.Courses;Show("course-select");return false;}
            catch(Exception e){notice="导入失败，当前实验保留："+e.Message;Debug.Log("NATIVE_IMPORT_REJECTED "+e.Message);if(status!=null)status.text=notice;return false;}
        }
        bool CommitImport(string path,bool remember,string courseId=null){
            bool substituted;
            var data=LoadImport(path,false,out substituted,courseId);
            var rules=importLegacyRules?NativeGameplayRules.Editor255Compat:NativeGameplayRules.DemoPhysics;
            CommitCandidate(data,rules,false,substituted);
            hiddenDeveloperOpen=false;
            bool persisted=!remember||PersistImport(path,data.Courses[0].Id);
            notice=substituted?"导入成功（未随包提供 assets，已用内置像素美术替代）："+data.Name+" · 建议把 assets 文件夹与 JSON 放在同一目录":"导入成功："+data.Name;
            if(!persisted)notice+="（本次可玩，但未能保存导入副本，重启后可能无法恢复）";
            Show("pause");
            return true;
        }
        // Keeps a copy of the imported package under the save folder so the level survives a restart.
        bool PersistImport(string sourcePath,string courseId){
            string oldLevel=importedLevel,oldCourse=importedCourseId;
            try {
                string cacheId=Guid.NewGuid().ToString("N");
                string directory=Path.Combine(saveDirectory,"imported",cacheId);Directory.CreateDirectory(directory);
                string extension=Path.GetExtension(sourcePath).ToLowerInvariant();
                File.Copy(sourcePath,Path.Combine(directory,"level"+extension),false);
                if(extension==".json"){
                    string assets=Path.Combine(Path.GetDirectoryName(sourcePath)??"","assets");
                    if(Directory.Exists(assets))CopyTree(assets,Path.Combine(directory,"assets"));
                }
                importedLevel=Path.Combine("imported",cacheId,"level"+extension);importedCourseId=courseId;
                SaveSettings();return true;
            }catch(Exception e){importedLevel=oldLevel;importedCourseId=oldCourse;Debug.Log("NATIVE_IMPORT_PERSIST_FAILED "+e.Message);return false;}
        }
        void VerifyImportCache(){
            string oldLevel=importedLevel,oldCourse=importedCourseId;
            string fixture=Path.Combine(Evidence(),"cache-fixture.json");File.WriteAllText(fixture,"{\"version\":2}");
            try {
                if(!PersistImport(fixture,"first"))throw new Exception("cache first write failed");string first=Path.Combine(saveDirectory,importedLevel);byte[] original=File.ReadAllBytes(first);
                if(!PersistImport(fixture,"second"))throw new Exception("cache second write failed");string second=importedLevel;
                if(Path.Combine(saveDirectory,second)==first||NativeProjectLoader.Sha(File.ReadAllBytes(first))!=NativeProjectLoader.Sha(original))throw new Exception("old cache overwritten");
                using(var locked=new FileStream(SettingsFile,FileMode.Open,FileAccess.Read,FileShare.None))if(PersistImport(fixture,"failed"))throw new Exception("locked settings unexpectedly replaced");
                if(importedLevel!=second||importedCourseId!="second"||!File.Exists(first)||!File.Exists(Path.Combine(saveDirectory,second)))throw new Exception("failed settings lost cache");
                if((string)JObject.Parse(File.ReadAllText(SettingsFile))["importedLevel"]!=second)throw new Exception("failed settings changed pointer");
                Debug.Log("NATIVE_IMPORT_CACHE_PASS previousPreserved=true settingsFailureRetainsPointer=true");
            }finally{importedLevel=oldLevel;importedCourseId=oldCourse;SaveSettings();}
        }
        static void CopyTree(string from,string to){
            Directory.CreateDirectory(to);
            foreach(string file in Directory.GetFiles(from))File.Copy(file,Path.Combine(to,Path.GetFileName(file)),true);
            foreach(string directory in Directory.GetDirectories(from))CopyTree(directory,Path.Combine(to,Path.GetFileName(directory)));
        }
        // Startup restore of the last imported package; a broken copy falls back to the built-in level.
        public bool TryRestoreImport(){
            if(string.IsNullOrEmpty(importedLevel))return false;
            string file=Path.Combine(saveDirectory,importedLevel);
            if(!File.Exists(file)){importedLevel="";importedCourseId="";SaveSettings();return false;}
            try{bool substituted;var data=LoadImport(file,false,out substituted,importedCourseId);var rules=importLegacyRules?NativeGameplayRules.Editor255Compat:NativeGameplayRules.DemoPhysics;CommitCandidate(data,rules,false,substituted);notice="已恢复上次导入的关卡："+data.Name;return true;}
            catch(Exception e){Debug.Log("NATIVE_IMPORT_RESTORE_FAILED "+e.Message);importedLevel="";importedCourseId="";SaveSettings();return false;}
        }
        string BuiltinThemeFile=>Path.Combine(Application.streamingAssetsPath,"RoomLabNative/Editor3/editor3-three-themes.zip");
        void LoadBuiltinCourse(string id){
            if(id!=null&&id.StartsWith("autosave:")){LoadAutosaveCourse(id.Substring(9));return;}
            string campaign=id!=null&&id.StartsWith("guided-")?Path.Combine(Application.streamingAssetsPath,"RoomLabNative/Campaign/deadline-guided.json"):id!=null&&id.StartsWith("network-")?Path.Combine(Application.streamingAssetsPath,"RoomLabNative/Campaign/deadline-network.json"):id!=null&&id.StartsWith("rework-")?Path.Combine(Application.streamingAssetsPath,"RoomLabNative/Campaign/deadline-rework.json"):id!=null&&id.StartsWith("night-")?Path.Combine(Application.streamingAssetsPath,"RoomLabNative/Campaign/deadline-night.json"):null;
            var data=campaign!=null?NativeProjectLoader.LoadFile(campaign,new ImportOptions{PlayableCoursesOnly=true,CourseId=id,RequireAssets=true}):string.IsNullOrEmpty(id)?builtin:NativeProjectLoader.LoadFile(BuiltinThemeFile,new ImportOptions{PlayableCoursesOnly=true,CourseId=id,RequireAssets=true});
            CommitCandidate(data,NativeGameplayRules.DemoPhysics,true);builtinCourseId=id??"";SaveSettings();
        }
        void BuildBuiltinSelection(RectTransform root){
            var panel=NativeUiKit.Column(root,"作业待办",10,14,14);NativeUiKit.Center(panel,Mathf.Min(560,designWidth-32));panel.gameObject.AddComponent<Image>().color=Ink;
            NativeUiKit.Label(panel,"作业待办",20,Paper);
            string[] names={"01 · 实验楼的回路","02 · 纸页回廊","03 · 醒与梦的回廊"};
            for(int i=0;i<CampaignIds.Length;i++){string id=CampaignIds[i];NativeUiKit.Button(panel,names[i],()=>{LoadAutosaveCourse(id);ForgetImport();Show("menu");},13,30,Teal);}
            NativeUiKit.Button(panel,"返回",()=>Show("menu"),12,24);NativeUiKit.Fit(panel,Mathf.Min(560,designWidth-32),designHeight-20);
        }
        void BuildCourseSelection(RectTransform root){
            var panel=NativeUiKit.Column(root,"选择大关",5,14,14);NativeUiKit.Center(panel,Mathf.Min(560,designWidth-32));panel.gameObject.AddComponent<Image>().color=Ink;NativeUiKit.Label(panel,"选择要导入的大关",18,Paper);
            for(int i=0;i<pendingCourses.Length;i+=2){var row=NativeUiKit.Row(panel,"课程行 "+i,28,8);for(int j=i;j<Math.Min(i+2,pendingCourses.Length);j++){var entry=pendingCourses[j];string id=(string)entry["id"];string full=(string)entry["name"]??id;string label=(j+1)+". "+(full.Length>18?full.Substring(0,18)+"…":full);NativeUiKit.Button(row,label,()=>{try{CommitImport(pendingImportPath,true,id);}catch(Exception e){notice="导入失败，当前实验保留："+e.Message;Show(pendingReturnPage);}},11,28);}}
            NativeUiKit.Button(panel,"取消",()=>{Show(pendingReturnPage);},12,28);
        }
        void ForgetImport(){if(!string.IsNullOrEmpty(importedLevel)){importedLevel="";importedCourseId="";SaveSettings();}}
        void PickImport(){SaveProgress();keys.Clear();timeline.Reset();string path=NativeDemoFileDialog.Pick();ImportFile(path);if(status!=null)status.text=notice;}
        string ThemeHint()=>Game.IsRework?(Game.Course.Kind=="calculus"?"纸上的路，总还有另一种写法。":Game.Course.Kind=="slacker"?"钟声快响了。窗外似乎换了天。":"楼梯封了。实验记录还在上面。"):Game.Course.Kind=="calculus"?"踩积分板聚合搭桥 · 踩求导板展开道路":Game.Course.Kind=="slacker"?"踩签到板记录 · 清醒板加速前进":"按 "+KeyName()+" 启动 AI · 引 AI 去吃收藏品";
        void NewGame(){guidanceSeen.Clear();guidanceRoom=null;storyRoom=null;SetGame(new NativeMotion(Game.Project,rules:Game.Rules));tainted=false;notice=ThemeHint();SaveProgress();Show("play");}
        bool CanContinue(){try{if(new FileInfo(SaveFile).Length>4*1024*1024)return false;var data=JObject.Parse(File.ReadAllText(SaveFile));if(data["continuation"] is JObject saved){NativeMotion.FromContinuation(Game.Project,saved,Game.Rules);return true;}}catch{}return false;}
        void Continue(){try{var saved=(JObject)JObject.Parse(File.ReadAllText(SaveFile))["continuation"];SetGame(NativeMotion.FromContinuation(Game.Project,saved,Game.Rules));tainted=false;notice="已从最近检查点恢复";Show("play");}catch(Exception e){notice="存档不可用，已安全返回菜单："+e.Message;Show("menu");}}
        void Retry(){Game.Retry();notice="已恢复最近检查点";Show("play");}
        void ReadRecord(){journal.Clear();high=roomReached=0;try{var data=JObject.Parse(File.ReadAllText(SaveFile));high=Math.Max(0,(int?)data["high"]??0);roomReached=Math.Max(0,(int?)data["roomReached"]??0);if(data["journal"] is JArray recorded)foreach(var item in recorded){string key=(string)item;foreach(var r in Game.Course.Rooms)foreach(var o in r.Objects)if(o.Type=="common.collectible"&&key==r.Id+"/"+o.Id)journal.Add(key);}}catch{}}
        void SaveProgress(){if(Game==null||tainted||Game.DeveloperEnabled||Game.Completed)return;roomReached=Math.Max(roomReached,Game.Course.Rooms.IndexOf(Game.Room)+1);SaveRecord(true);}
        void SaveRecord(bool continuation){if(Game.IsContactAutosave)continuation=false;try{UpdateJournal();var data=new JObject{{"version",1},{"identity",identity},{"high",high},{"roomReached",roomReached},{"journal",new JArray(journal)},{"lastRun",new JObject{{"seconds",Game.Elapsed},{"deaths",Game.Deaths},{"collected",Game.CampaignCollected},{"complete",Game.Completed}}},{"continuation",continuation?(JToken)Game.ExportContinuation():null}};var temp=SaveFile+".tmp";File.WriteAllText(temp,data.ToString());if(File.Exists(SaveFile))File.Replace(temp,SaveFile,null);else File.Move(temp,SaveFile);}catch(Exception e){notice="保存失败："+e.Message;Debug.LogWarning("NATIVE_SAVE_FAILED "+e.Message);}}
        string SettingsFile{get{return Path.Combine(saveDirectory,"settings-autosave-v1.json");}}
        void LoadSettings(){
            legacy=RoomLabKeyBindings.Load();
            for(int i=0;i<5;i++)bindings[i]=legacy.GetKey((RoomLabKeyBindings.ActionId)i,0);
            bool applied=false;
            try
            {
                var d=JObject.Parse(File.ReadAllText(SettingsFile));
                if((int?)d["version"]==1)
                {
                    volume=Mathf.Clamp01((float?)d["volume"]??.55f);musicEnabled=(bool?)d["musicEnabled"]??true;musicVolume=Mathf.Clamp01((float?)d["musicVolume"]??.55f);effectsVolume=Mathf.Clamp01((float?)d["effectsVolume"]??.85f);
                    tutorialSeen=(bool?)d["tutorialSeen"]==true;courseMapPreferred=(bool?)d["courseMapPreferred"]??true;
                    adaptiveWindow=(bool?)d["adaptiveWindow"]??true;
                    windowScale=Mathf.Clamp((float?)d["windowScale"]??.9f,.5f,1f);
                    viewMax=Mathf.Clamp((float?)d["viewMax"]??1.3f,1f,1.6f);
                    importLegacyRules=(bool?)d["importLegacyRules"]==true;
                    importedLevel=(string)d["importedLevel"]??"";importedCourseId=(string)d["importedCourseId"]??"";builtinCourseId=(string)d["builtinCourseId"]??"autosave:physics";
                    NativeCameraView.Zoom=viewMax;
                    int w=(int?)d["width"]??1280,h=(int?)d["height"]??720;
                    if(w>=640&&w<=7680&&h>=360&&h<=4320){desiredWidth=w;desiredHeight=h;}
                    desiredFull=(bool?)d["fullscreen"]==true;
                    var b=(JArray)d["bindings"];
                    if(b!=null&&b.Count==6){var seen=new HashSet<int>();for(int i=0;i<6;i++){int n=(int)b[i];if(!Enum.IsDefined(typeof(KeyCode),n)||n==(int)KeyCode.Escape||n==(int)KeyCode.M||n==(int)KeyCode.R||!seen.Add(n))throw new Exception("坏键位");if(i==5)bindings[i]=(KeyCode)n;}}
                    applied=true;
                }
            }
            catch{}
            if(!verify&&!matrix){if(applied&&(desiredFull||!adaptiveWindow))Screen.SetResolution(desiredWidth,desiredHeight,desiredFull?FullScreenMode.FullScreenWindow:FullScreenMode.Windowed);else ApplyAdaptiveWindow();SaveSettings();}
            AudioListener.volume=volume;
        }
        void SaveSettings(){var list=new JArray();foreach(var b in bindings)list.Add((int)b);string temporary=SettingsFile+"."+Guid.NewGuid().ToString("N")+".tmp";File.WriteAllText(temporary,new JObject{{"version",1},{"volume",volume},{"musicEnabled",musicEnabled},{"musicVolume",musicVolume},{"effectsVolume",effectsVolume},{"tutorialSeen",tutorialSeen},{"courseMapPreferred",courseMapPreferred},{"adaptiveWindow",adaptiveWindow},{"windowScale",windowScale},{"viewMax",viewMax},{"importLegacyRules",importLegacyRules},{"importedLevel",importedLevel},{"importedCourseId",importedCourseId},{"builtinCourseId",builtinCourseId},{"bindings",list},{"fullscreen",desiredFull},{"width",desiredWidth},{"height",desiredHeight}}.ToString());if(File.Exists(SettingsFile))File.Replace(temporary,SettingsFile,null);else File.Move(temporary,SettingsFile);}
        // Adaptive window: fill most of the desktop and keep following the saved ratio, so the game is
        // no longer stuck at a fixed 1280x720 window on any monitor.
        void ApplyAdaptiveWindow(){
            if(verify||matrix)return;
            int screenWidth=Screen.currentResolution.width,screenHeight=Screen.currentResolution.height;
            float scale=Mathf.Clamp(windowScale,.5f,1f);
            desiredWidth=Mathf.Clamp(Mathf.RoundToInt(screenWidth*scale),640,7680);
            desiredHeight=Mathf.Clamp(Mathf.RoundToInt(screenHeight*scale),360,4320);
            desiredFull=false;
            Screen.SetResolution(desiredWidth,desiredHeight,FullScreenMode.Windowed);
        }

        void VolumeSlider(Transform parent,Text text){var holder=NativeUiKit.New(parent,"Actual sound volume");NativeUiKit.Size(holder,height:24,flexWidth:1);
            var track=NativeUiKit.New(holder,"Slider track");NativeUiKit.MarkBackdrop(track.gameObject);track.anchorMin=new Vector2(0,.5f);track.anchorMax=new Vector2(1,.5f);track.sizeDelta=new Vector2(0,8);track.anchoredPosition=Vector2.zero;track.gameObject.AddComponent<Image>().color=new Color(.2f,.3f,.38f);
            // uGUI Slider re-anchors its handleRect to the slide range, so the visible knob must not be the
            // handleRect: an invisible proxy gets stretched while the knob follows the value by anchors.
            var proxy=NativeUiKit.New(holder,"Slider handle proxy");var proxyImage=proxy.gameObject.AddComponent<Image>();proxyImage.color=new Color(0,0,0,0);proxyImage.raycastTarget=false;
            var knob=NativeUiKit.New(holder,"Slider knob");knob.anchorMin=knob.anchorMax=new Vector2(Mathf.Clamp01(volume),.5f);knob.pivot=new Vector2(.5f,.5f);knob.sizeDelta=new Vector2(10,18);knob.gameObject.AddComponent<Image>().color=Teal;
            var input=holder.gameObject.AddComponent<Image>();input.color=new Color(0,0,0,0);input.raycastTarget=true;
            var slider=holder.gameObject.AddComponent<Slider>();slider.minValue=0;slider.maxValue=1;slider.handleRect=proxy;slider.targetGraphic=input;slider.direction=Slider.Direction.LeftToRight;
            slider.onValueChanged.AddListener(v=>{volume=v;AudioListener.volume=v;knob.anchorMin=knob.anchorMax=new Vector2(Mathf.Clamp01(v),.5f);text.text="主音量 "+Mathf.RoundToInt(v*100)+"%";SaveSettings();});
            slider.value=volume;}
        void ChangeVolume(float amount){volume=Mathf.Clamp01(volume+amount);AudioListener.volume=volume;SaveSettings();Play("ui");Show("settings");}
        void CreateSounds(){string[] names={"ui","jump","dash","coin","temperature","retry","finish"};for(int k=0;k<names.Length;k++){int count=names[k]=="finish"?11025:2205;var samples=new float[count];float hz=220+k*85;for(int i=0;i<count;i++)samples[i]=(Mathf.Sin(i*hz*2*Mathf.PI/22050)>0?1:-1)*.12f*(1-i/(float)count);var clip=AudioClip.Create(names[k],count,1,22050,false);clip.SetData(samples,0);sounds.Add(names[k],clip);}}
        void Play(string name){if(speaker!=null&&sounds.TryGetValue(name,out var clip))speaker.PlayOneShot(clip);}
        void PumpSounds(){int start=lastEvent==null?0:Game.Events.IndexOf(lastEvent)+1;for(int i=start;i<Game.Events.Count;i++){var e=Game.Events[i];string type=(string)e["type"];if(type=="collect"&&(string)e["by"]=="ai"&&!tainted&&!Game.DeveloperEnabled){journal.Add((string)e["room"]+"/"+(string)e["id"]);SaveRecord(!Game.Completed);}if(type=="checkpoint"&&Game.IsAwarenessResource)SaveProgress();if(type=="checkin")notice="签到成功：第 "+(int?)e["count"]+" 次记录";else if(type=="awake")notice=Game.IsRework?"视线变化了":"清醒：短暂加速";else if(type=="calculus-integral")notice="积分：机关砖向目标聚合";else if(type=="calculus-derivative")notice="求导：机关砖向目标展开";Play(type=="collect"?((string)e["by"]=="ai"?"collectible":"coin"):type);}if(Game.Events.Count>0)lastEvent=Game.Events[Game.Events.Count-1];}
        // Remember a manually resized window even when the adaptive mode is off, so the next launch
        // keeps the size the player dragged to instead of falling back to an old preset.
        void Quit(){DrainAutoSaves();SaveProgress();if(!adaptiveWindow&&!Screen.fullScreen){desiredWidth=Mathf.Clamp(Screen.width,640,7680);desiredHeight=Mathf.Clamp(Screen.height,360,4320);}SaveSettings();Application.Quit();}
        static string Evidence(){var args=Environment.GetCommandLineArgs();int i=Array.IndexOf(args,"-nativeEvidencePath");return i>=0?args[i+1]:Path.GetFullPath(Path.Combine(Application.dataPath,"../NativePhysicsEvidence"));}
        static void Finish(int code){
#if UNITY_EDITOR
            UnityEditor.EditorApplication.Exit(code);
#else
            Application.Quit(code);
#endif
        }
        IEnumerator Verify(){yield return null;try{if(Game.Project.RoomCount!=11||Game.Project.ConnectionCount!=10||assets.Frames.Count!=9)throw new Exception("包内容不完整");int checks=NativeGameplaySmokeChecks.Run(Game.Project);verifiedCoreChecks=checks;int authoredChecks=NativeAuthoredIceChecks.Run(Game.Project);Debug.Log("NATIVE_AUTHORED_ICE_PASS checks="+authoredChecks+" source="+Game.Project.SourceSha256);NativeCodecChecks.Run(Path.Combine(Application.streamingAssetsPath,"RoomLabNative/CodecTests"));Debug.Log("NATIVE_PHYSICS_CORE_PASS checks="+checks);NewGame();SaveProgress();if(!CanContinue())throw new Exception("继续存档未生成");Show("menu");Continue();if(page!="play"||Game.RespawnRemaining!=.5)throw new Exception("生产继续路径错误");var original=Game;int score=Game.Score;string oldIdentity=identity;if(ImportFile(null)||Game!=original||identity!=oldIdentity||Game.Score!=score)throw new Exception("取消导入破坏状态");string bad=Path.Combine(Evidence(),"bad.json");Directory.CreateDirectory(Evidence());File.WriteAllText(bad,"{}");if(ImportFile(bad)||Game!=original||identity!=oldIdentity)throw new Exception("坏导入破坏状态");
                string dir=Path.Combine(Application.streamingAssetsPath,"RoomLabNative");if(!ImportFile(Path.Combine(dir,"default.json"))||isBuiltin||Game.Rules!=NativeGameplayRules.DemoPhysics)throw new Exception("真实JSON替换失败");if(identity==oldIdentity)throw new Exception("存档未隔离");int importChecks=NativeDemoAcceptance.Imports(this,builtin,Path.Combine(Evidence(),"import-cases"));Debug.Log("NATIVE_PHYSICS_IMPORT_PASS cases="+importChecks);NativeEditor3Acceptance.Run(this,builtin,Path.Combine(Evidence(),"editor3"));VerifyImportCache();CommitCandidate(builtin,NativeGameplayRules.DemoPhysics,true);Show("menu");Debug.Log("NATIVE_PHYSICS_UI_PASS menu=true newGame=true continue=true cancelRetains=true badRetains=true json=true sourceIsolation=true svg=9 rules="+Game.Rules);
            }catch(Exception e){Debug.LogException(e);Finish(2);yield break;}
            yield return Capture("01-menu");ImportFile(Path.Combine(Evidence(),"import-cases/valid.zip"));Show("play");yield return Capture("08-external-svg");ImportFile(Path.Combine(Evidence(),"import-cases/png-sheet.zip"));Show("play");yield return Capture("09-external-sheet");ImportFile(Path.Combine(Evidence(),"import-cases/gif-disposal-123.gif.zip"));Show("play");Game.RoomTime=.021;yield return Capture("16-gif-native-frame");ImportFile(Path.Combine(Evidence(),"import-cases/webp-animation.webp.zip"));Show("play");Game.RoomTime=.091;yield return Capture("17-webp-native-frame");CommitCandidate(builtin,NativeGameplayRules.DemoPhysics,true);NewGame();yield return Capture("02-gameplay");Show("pause");yield return Capture("03-pause");Show("settings");yield return Capture("04-settings");var volumeSlider=ui.GetComponentInChildren<Slider>();volumeSlider.value=.2f;Play("finish");if(Mathf.Abs(AudioListener.volume-.2f)>.001f||!speaker.isPlaying){Debug.LogError("Sound slider disconnected");Finish(2);yield break;}Debug.Log("NATIVE_SOUND_PASS generatedClipPlaying=true volumeSliderControlsListener=true");
            NewGame();for(int i=0;i<65;i++){keys.Apply((int)bindings[4],true);keys.Apply((int)bindings[4],false);}Advance(0);if(page!="pause"||!notice.Contains("保护")){Debug.LogError("Overflow protection not visible");Finish(2);yield break;}Show("play");Advance(0);if(Game.Player.dashCount!=0){Finish(2);yield break;}
            SetGame(NativeAuthoredIceChecks.Intro(builtin));Show("play");yield return Capture("10-ice-initial-hot");NativeAuthoredIceChecks.StepOnControl(Game);yield return Capture("11-ice-foot-cold");
            NativeObject standingIce=null;foreach(var o in Game.Room.Objects)if(o.Type=="physics.ice"&&Game.SafePosition(o.X*32+4,o.Y*32-28)){standingIce=o;break;}Game.Player.x=standingIce.X*32+4;Game.Player.y=standingIce.Y*32-28;Game.Player.vx=Game.Player.vy=0;Game.Player.grounded=true;Game.Player.support=standingIce.Id;for(int i=0;i<(int)Math.Ceiling(standingIce.Number("meltAfter")*.65/NativeMotion.Step);i++)Game.Tick(NativeMotion.Step);yield return Capture("12-ice-standing-cracked");for(int i=0;i<(int)Math.Ceiling(standingIce.Number("meltAfter")*.4/NativeMotion.Step);i++)Game.Tick(NativeMotion.Step);yield return Capture("13-ice-instance-melted");Game.Player.x=Game.Entry.X*32+4;Game.Player.y=Game.Entry.Y*32+4;Game.Player.grounded=false;Game.Player.support=null;for(int i=0;i<(int)Math.Ceiling(standingIce.Number("respawnDelay")/NativeMotion.Step)+2;i++)Game.Tick(NativeMotion.Step);yield return Capture("14-ice-instance-regenerated");NativeAuthoredIceChecks.StepOnControl(Game);yield return Capture("15-ice-foot-hot-again");
            foreach(var r in Game.Course.Rooms){SetGame(new NativeMotion(builtin,Game.Course.Id,r.Id,NativeGameplayRules.DemoPhysics));Show("play");yield return Capture("room-"+Game.Course.Rooms.IndexOf(r).ToString("00"));}
            NewGame();int transitions=0;while(!Game.Completed&&transitions<11){var exit=Game.Room.Exits[0];foreach(var e in Game.Room.Exits)if(Game.Course.Connections.Exists(c=>c.FromRoomId==Game.Room.Id&&c.ExitId==e.Id)){exit=e;break;}Game.Player.x=exit.X*32+4;Game.Player.y=exit.Y*32+4;Game.Player.vx=Game.Player.vy=0;Game.Player.invulnerable=99;Game.RespawnRemaining=0;Game.ExitCooldown=0;Game.Tick(0);transitions++;}if(!Game.Completed||transitions!=11){Debug.LogError("11-room exit chain failed");Finish(2);yield break;}int finalScore=Game.Score;Show("menu");Show("settings");Show("play");Game.Tick(0);if(Game.Score!=finalScore||Game.Mode!="won"){Finish(2);yield break;}high=Game.Score;SaveRecord(false);Show("won");yield return Capture("05-result");Debug.Log("NATIVE_PHYSICS_EXIT_PASS transitions=10 finalOnce=true productionTerminalReturn=true verifyPositionSetup=true");
            CommitCandidate(builtin,NativeGameplayRules.DemoPhysics,true);Show("menu");Screen.SetResolution(1024,768,FullScreenMode.Windowed);yield return new WaitForSecondsRealtime(.4f);yield return Capture("06-menu-1024x768");Screen.SetResolution(1920,1080,FullScreenMode.Windowed);yield return new WaitForSecondsRealtime(.4f);yield return Capture("07-menu-1920x1080");
            Show("builtin-select");yield return Capture("editor3-course-selection");
            JObject[] demoCourses=null;try{NativeProjectLoader.LoadFile(BuiltinThemeFile,new ImportOptions{PlayableCoursesOnly=true});}catch(NativeCourseSelectionException choice){demoCourses=choice.Courses;}
            if(demoCourses==null){Debug.LogError("Missing built-in theme choices");Finish(2);yield break;}
            foreach(var theme in demoCourses){if((string)theme["kind"]=="physics")continue;LoadBuiltinCourse((string)theme["id"]);NewGame();yield return Capture("editor3-"+(string)theme["kind"]+"-first-room");
                string actionType=Game.Course.Kind=="calculus"?"calculus.integral":"slacker.awake";NativeRoom actionRoom=null;NativeObject action=null;
                foreach(var r in Game.Course.Rooms){foreach(var o in r.Objects)if(o.Type==actionType){actionRoom=r;action=o;break;}if(action!=null)break;}
                if(action==null){Debug.LogError("EDITOR3_ACTION_MISSING "+actionType);Finish(2);yield break;}
                if(Game.Room.Id!=actionRoom.Id)SetGame(new NativeMotion(Game.Project,Game.Course.Id,actionRoom.Id,Game.Rules));
                Game.RespawnRemaining=0;Game.Mode="playing";Game.Player.invulnerable=99;
                typeof(NativeMotion).GetMethod("Fire",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic).Invoke(Game,new object[]{action});
                double[] times=Game.Course.Kind=="calculus"?new[]{.15,.4}:new[]{.05,.35,1.0};double elapsedAction=0;
                for(int frame=0;frame<times.Length;frame++){double remaining=times[frame];while(remaining>0){double step=Math.Min(NativeMotion.Step,remaining);Game.Tick(step);world.Refresh(step,view,map);remaining-=step;}elapsedAction+=times[frame];yield return Capture("editor3-"+Game.Course.Kind+"-action-"+frame);}
                Debug.Log("EDITOR3_ACTION_CAPTURE kind="+Game.Course.Kind+" directTrigger=true simulatedSeconds="+elapsedAction);NewGame();

                int hops=0;while(!Game.Completed&&hops<4){var exit=Game.Room.Exits[0];foreach(var e in Game.Room.Exits)if(Game.Course.Connections.Exists(c=>c.FromRoomId==Game.Room.Id&&c.ExitId==e.Id)){exit=e;break;}Game.Player.x=exit.X*32+4;Game.Player.y=exit.Y*32+4;Game.Player.vx=Game.Player.vy=0;Game.Player.invulnerable=99;Game.RespawnRemaining=0;Game.ExitCooldown=0;Game.Tick(0);hops++;}
                if(!Game.Completed||hops!=3){Debug.LogError("EDITOR3_EXIT_FAIL "+Game.Course.Kind);Finish(2);yield break;}Debug.Log("EDITOR3_EXIT_PASS kind="+Game.Course.Kind+" transitions=2 terminal=true positionSetup=true");
            }
            LoadBuiltinCourse("");Show("menu");
            try{File.WriteAllText(Path.Combine(Evidence(),"result.json"),new JObject{{"native",true},{"rooms",11},{"connections",10},{"svgDecoded",assets.Frames.Count},{"coreChecks",verifiedCoreChecks},{"captureIncludesGUI",true},{"captureMethod","actual-production-uGUI-canvas-to-camera"},{"webp","native-libwebp-static-animated"},{"gif","native-WIC-composited-animated"},{"source",builtin.SourceSha256},{"rules",Game.Rules.ToString()}}.ToString());}catch(Exception e){Debug.LogException(e);Finish(2);yield break;}Finish(0);
        }
        IEnumerator Capture(string name){
            yield return null;Canvas.ForceUpdateCanvases();world.Refresh(0,view,map);view.Render();
            var captureObject=new GameObject("Actual uGUI evidence camera");var capture=captureObject.AddComponent<Camera>();capture.enabled=false;capture.clearFlags=CameraClearFlags.SolidColor;capture.backgroundColor=Color.black;capture.cullingMask=1<<5;capture.transform.position=new Vector3(0,0,-100);capture.orthographic=true;capture.orthographicSize=180;
            var rt=RenderTexture.GetTemporary(Screen.width,Screen.height,24);var before=RenderTexture.active;Texture2D image=null;
            try{capture.targetTexture=rt;canvas.renderMode=RenderMode.ScreenSpaceCamera;canvas.worldCamera=capture;canvas.planeDistance=1;Canvas.ForceUpdateCanvases();capture.Render();RenderTexture.active=rt;image=new Texture2D(rt.width,rt.height,TextureFormat.RGB24,false);image.ReadPixels(new Rect(0,0,rt.width,rt.height),0,0);image.Apply();var colors=image.GetPixels32();int light=0,colored=0;foreach(var c in colors){if(c.r>150&&c.g>150&&c.b>130)light++;if(Math.Abs(c.r-c.b)>20)colored++;}if(light<100||colored<1000)throw new Exception("Full uGUI capture pixel assertion failed");Directory.CreateDirectory(Evidence());File.WriteAllBytes(Path.Combine(Evidence(),name+".png"),image.EncodeToPNG());Debug.Log("FULL_GUI_CAPTURE_PASS "+name+" light="+light+" colored="+colored+" actualCanvas=true");}
            finally{canvas.renderMode=RenderMode.ScreenSpaceOverlay;canvas.worldCamera=null;RenderTexture.active=before;capture.targetTexture=null;RenderTexture.ReleaseTemporary(rt);if(image!=null)Destroy(image);Destroy(captureObject);}
        }
    }
    public static class NativeDemoFileDialog
    {
        [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]sealed class OFN{public int size=Marshal.SizeOf(typeof(OFN));public IntPtr owner,instance;public string filter="RoomLab 2.5.5 / 3.0\0*.json;*.zip\0";public string customFilter;public int maxCustomFilter,filterIndex=1;public string file=new string('\0',32768);public int maxFile=32768;public string fileTitle;public int maxFileTitle;public string initialDir,title="替换导入 RoomLab 关卡";public int flags=0x00080000|0x00001000|0x00000008;public short fileOffset,fileExtension;public string defExt;public IntPtr custData,hook;public string templateName;public IntPtr reserved;public int reserved2,flagsEx;}
        [DllImport("comdlg32.dll",CharSet=CharSet.Unicode)]static extern bool GetOpenFileNameW([In,Out]OFN d);
        public static string Pick(){var d=new OFN();string imports=Path.GetFullPath(Path.Combine(Application.dataPath,"../关卡导入"));if(Directory.Exists(imports))d.initialDir=imports;return GetOpenFileNameW(d)?d.file:null;}
    }
}
