using System.Linq;
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
        Camera view;RenderTexture target;Canvas canvas;CanvasScaler scaler;RectTransform ui;Transform panels;RawImage worldImage;Text hud,hint,status;Font font;AudioSource speaker;readonly Dictionary<string,AudioClip> sounds=new Dictionary<string,AudioClip>();JObject lastEvent;float volume=.55f;string saveDirectory;bool settingsFromGame;int desiredWidth=1280,desiredHeight=720;bool desiredFull;bool matrix;bool tutorialSeen;bool importLegacyRules;string importedLevel="";int verifiedCoreChecks;string importedCourseId="";string builtinCourseId="autosave:physics";string pendingImportPath,pendingReturnPage;JObject[] pendingCourses;bool displayExpanded;float viewMax=1.3f;float designWidth=640f,designHeight=360f,playfieldWidth=640f,playfieldHeight=327f;int pixelScale=1,appliedWidth,appliedHeight;
        // The HUD bar lives above the level instead of on top of it: 26px bar + 7px margin.
        const float HudBand=33f;
        string developerReturnPage="pause";bool hiddenDeveloperOpen,developerTools;
        static readonly Color Ink=NativeAssetOverrides.ColorSetting("ink",new Color(.055f,.085f,.14f)),Paper=NativeAssetOverrides.ColorSetting("paper",new Color(.88f,.87f,.77f)),Teal=NativeAssetOverrides.ColorSetting("accent",new Color(.2f,.72f,.72f)),Orange=new Color(.95f,.58f,.29f);
        string SaveFile{get{return Path.Combine(saveDirectory,identity+".json");}}
        bool mainlineEdition;
        bool mainlineVerify;
        bool mapShot;
        Image hintBacking;
        Text tutorial;             // 新手提示：背景之上，放在关卡空白处
        Image tutorialIcon;        // 提示左侧的像素小图（图文结合）
        string tutorialIconName="";
        bool endingShown;
        bool teaHintSeen; float teaHintUntil;
        string tutorialText="";
        string tutorialShown="";
        RectTransform hintBarRect;   // 字幕条：按人物高度换位
        string rememberedRoom;
        string noticedRoom;
        bool moveHintSeen;
        readonly HashSet<string> assistantHintRooms=new HashSet<string>();   // 新手提示只弹一次
        float moveHintUntil;
        bool aiWarningWasOn;
        float submitHintUntil;
        string submitHintLine="";
        float noticeUntil;
        // 提示统一限时：notice 一变就重新计时，避免任何提示常驻在提示行上。
        string noticeShown = "";
        float noticeShownUntil;
        void Start(){mainlineVerify=Array.IndexOf(Environment.GetCommandLineArgs(),"-nativeMainlineVerify")>=0;mapShot=Array.IndexOf(Environment.GetCommandLineArgs(),"-nativeMapShot")>=0;campaignVerify=Array.IndexOf(Environment.GetCommandLineArgs(),"-nativeCampaignVerify")>=0;verify=mainlineVerify||campaignVerify||Array.IndexOf(Environment.GetCommandLineArgs(),"-nativePhysicsVerify")>=0;matrix=Array.IndexOf(Environment.GetCommandLineArgs(),"-nativeUiMatrix")>=0;try{Application.runInBackground=true;Application.targetFrameRate=120;QualitySettings.vSyncCount=1;string mainlinePath=Path.Combine(Application.streamingAssetsPath,"RoomLabNative","Mainline","mainline.zip");
            mainlineEdition=File.Exists(mainlinePath);
            saveDirectory=Path.Combine(Application.persistentDataPath,mainlineEdition?"mainline-formal-20261126-clean-v1":"deadline-autosave-progress-v1");if(verify){Screen.SetResolution(1280,720,FullScreenMode.Windowed);}if(verify||matrix||mapShot)saveDirectory=Path.Combine(Evidence(),"isolated-progress");else if(mainlineEdition){var documents=Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);if(!string.IsNullOrEmpty(documents))saveDirectory=Path.Combine(documents,"AI大人拜托了","玩家存档");}Directory.CreateDirectory(saveDirectory);font=Resources.Load<Font>("PhysicsPixelFont/FusionPixel");if(font==null)throw new Exception("中文字体未打包");LoadSettings();BindKeys();speaker=gameObject.AddComponent<AudioSource>();speaker.playOnAwake=false;CreateSounds();CreateCampaignAudio();
            view=Camera.main;if(view==null){var c=new GameObject("Native Physics World Camera");c.tag="MainCamera";view=c.AddComponent<Camera>();}view.orthographic=true;view.clearFlags=CameraClearFlags.SolidColor;
            SetupCanvas();
            if(mainlineEdition||mainlineVerify){
                NativeMainlineCopy.Load(Application.streamingAssetsPath);
                LoadMainlineEdition();
                Show("menu");
                if(mainlineVerify)StartCoroutine(VerifyMainlineEdition());
                if(mapShot)StartCoroutine(MapShot());
                if(matrix)StartCoroutine(UiMatrix());
                if(!verify&&!mapShot&&!matrix)ShowStartupIntro(PlayerPrefs.GetInt(StartupIntroSeenKey,0)==1);
                return;
            }
            string dir=Path.Combine(Application.streamingAssetsPath,"RoomLabNative");builtin=NativeProjectLoader.LoadFile(Path.Combine(dir,"AuthoredPhysics","authored-physics.json"),new ImportOptions{Profile=ImportProfile.EditorAuto,RequireAssets=true});CommitCandidate(builtin,NativeGameplayRules.DemoPhysics,true);if(!verify&&!matrix&&!string.IsNullOrEmpty(builtinCourseId)){try{LoadBuiltinCourse(builtinCourseId);}catch(Exception e){builtinCourseId="";notice="上次大关无法恢复，已返回物理关："+e.Message;SaveSettings();}}if(!verify&&!matrix&&!string.IsNullOrEmpty(importedLevel))TryRestoreImport();Show("menu");if(matrix)StartCoroutine(UiMatrix());else if(verify)StartCoroutine(campaignVerify?VerifyCampaign():Verify());
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
        static readonly string[] UiMatrixPages={"tutorial","menu","play","pause","settings","settings-expanded","developer","won","exploration-map","collection"};
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
            if((state=="developer"||state=="developer-map")&&!hiddenDeveloperOpen&&!verify&&!matrix)return;
            if(state=="play"&&Game!=null&&Game.UsesManualSaveSlots&&Game.AwaitingSaveChoice)state="save-slots";
            if(state=="settings"&&page!="settings")displayExpanded=false;
            foreach(var label in blockHints.Values)if(label!=null){
                label.enabled=false;Destroy(label.gameObject);
            }
            blockHints.Clear();blockHintPage=null;
            page=state;NativeWorldEffects.masterPage=state;if(NativeWorldEffects.FormulaRoot!=null)NativeWorldEffects.FormulaRoot.gameObject.SetActive(state=="play");ClearUI();timeline.Reset();keys?.Clear();if(Game!=null){if(state=="play"){Game.Mode=Game.Completed?"won":"playing";}else if(!Game.Completed)Game.Mode="paused";}
            var root=NativeUiKit.New(panels,"Page "+state);
            if(state=="play"){artifactNoticeHost=root;BuildHud(root);NativeUiKit.Relayout(root);return;}
            if(state=="exploration-map"){BuildExplorationMap(root);NativeUiKit.Relayout(root);return;}
            if(state=="collection"){BuildCollectionPage(root);NativeUiKit.Relayout(root);return;}
            if(!Game.IsEditorBuild15||state!="pause"&&state!="won")NativeUiKit.MarkBackdrop(NativeUiKit.Box(root,"Backdrop",new Color(.025f,.045f,.08f,.9f)).gameObject);
            if(IsSaveSlotPage){saveSlotReadyAt=Time.unscaledTime+.2f;if(EventSystem.current!=null)EventSystem.current.SetSelectedGameObject(null);if(state=="overwrite-slot")BuildOverwriteSlot(root);else BuildSaveSlots(root,state=="save-slots");NativeUiKit.Relayout(root);return;}
            if(state=="new-game")BuildNewGameConfirm(root);else if(state=="collection")BuildCollection(root);else if(state=="builtin-select")BuildBuiltinSelection(root);else if(state=="course-select")BuildCourseSelection(root);else if(state=="menu")BuildMenu(root);else if(state=="settings")BuildSettings(root);else if(state=="developer")BuildDeveloper(root);else if(state=="developer-map")BuildDeveloperMap(root);else if(state=="settings-expanded"){displayExpanded=true;phoneSettingsTab=2;BuildSettings(root);}else if(state=="tutorial"){tutorialSeen=true;SaveSettings();BuildTutorial(root);}else BuildPause(root,state);
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
            var pauseArt=Game.IsEditorBuild15?resultArt("ui-pause-icon"):null;
            var pause=NativeUiKit.Button(bar,pauseArt==null?"Ⅱ":"",()=>Show("pause"),12,20,NativeUiKit.Slot,32,0).GetComponent<RectTransform>();
            pause.anchorMin=pause.anchorMax=new Vector2(1,.5f);pause.pivot=new Vector2(1,.5f);pause.anchoredPosition=new Vector2(-6,0);pause.sizeDelta=new Vector2(32,20);
            if(pauseArt!=null){
                var icon=NativeUiKit.AbsImage(pause,"Pause icon",7,1,18,18,Color.white);
                icon.sprite=pauseArt;icon.preserveAspect=true;icon.raycastTarget=false;
            }
            var hintBar=NativeUiKit.New(root,"Hint");hintBarRect=hintBar;
            tutorial=NativeUiKit.AbsLabel(root,0f,0f,470f,84f,"",16,new Color(1f,.96f,.82f),TextAnchor.UpperLeft);
            tutorial.lineSpacing=1.1f;
            tutorialIcon=NativeUiKit.AbsImage(root,"Tutorial icon",0f,0f,38f,38f,Color.white);
            tutorialIcon.raycastTarget=false;
            tutorialIcon.enabled=false;
            tutorial.raycastTarget=false;
            tutorial.alignment=TextAnchor.UpperLeft;hintBar.anchorMin=new Vector2(0,0);hintBar.anchorMax=new Vector2(1,0);hintBar.pivot=new Vector2(.5f,0);hintBar.anchoredPosition=new Vector2(0,6);hintBar.sizeDelta=new Vector2(-16,44);hintBar.gameObject.AddComponent<Image>().color=new Color(Ink.r,Ink.g,Ink.b,.78f);
            hintBacking=hintBar.gameObject.GetComponent<Image>();hint=NativeUiKit.Label(hintBar,"",12,Paper,TextAnchor.MiddleLeft);var hr=hint.rectTransform;hr.anchorMin=Vector2.zero;hr.anchorMax=Vector2.one;hr.offsetMin=new Vector2(8,0);hr.offsetMax=new Vector2(-8,0);BuildAwarenessHud(root);}
        // Fixed 224x312 art panel: absolute offsets inside it never depend on the window.
        void BuildPhone(RectTransform phone){NativeUiKit.AbsImage(phone,"Phone header",10,10,204,24,Ink);
            NativeUiKit.AbsLabel(phone,20,16,180,18,RealClock()+"     论文助手     ●",12,Paper);
            NativeUiKit.AbsLabel(phone,17,51,180,25,"今晚的作业",16,Ink);
            NativeUiKit.AbsLabel(phone,17,85,185,45,"AI：论文交给我。\n你负责带我找到素材。",12,Ink);
            NativeUiKit.AbsImage(phone,"Divider",16,144,192,1,new Color(.55f,.62f,.6f));
            NativeUiKit.AbsLabel(phone,17,271,180,25,"DDL  /  截止之前",12,new Color(.25f,.4f,.45f));}
        // 主界面：交付的手机 UI 全量图层（480×270 原生图按设计空间缩放，保持比例）。
        Sprite menuArt(string name){try{return world!=null?world.Fx(name):null;}catch(Exception){return null;}}
        void Layer(Transform root,string spriteName,float x,float y,float w,float h,bool keepAspect,int order)
        {
            var image=NativeUiKit.AbsImage(root,spriteName,x,y,w,h,Color.white);
            image.sprite=menuArt(spriteName);
            image.preserveAspect=keepAspect;
            image.raycastTarget=false;
            image.transform.SetSiblingIndex(order);
        }
        void IconOn(Button button,string spriteName)
        {
            if(button==null)return;
            var rect=button.GetComponent<RectTransform>();if(rect==null)return;
            var icon=NativeUiKit.AbsImage(rect,spriteName,4f,3f,14f,14f,Color.white);
            icon.sprite=menuArt(spriteName);icon.preserveAspect=true;icon.raycastTarget=false;
        }
        RectTransform pointerLightScreen;
        Image pointerLight;
        int phoneSettingsTab;

        // 界面时钟：与系统时间同步
        Text clockLabel;
        static string RealClock(){return System.DateTime.Now.ToString("HH:mm");}
        void RefreshClock(){if(clockLabel!=null)clockLabel.text=RealClock();}
        void UpdatePhoneLight()
        {
            RefreshClock();
            if (pointerLight == null || pointerLightScreen == null) return;
            Vector2 point = default;
            bool inside = GameInput.TryGetMousePosition(out var pointer) && RectTransformUtility.ScreenPointToLocalPointInRectangle(
                pointerLightScreen, pointer, null, out point)
                && pointerLightScreen.rect.Contains(point);
            if (inside)
            {
                var rect = pointerLightScreen.rect;
                pointerLight.rectTransform.anchoredPosition = new Vector2(point.x - rect.xMin, point.y - rect.yMax);
            }
            var color = pointerLight.color;
            color.a = Mathf.MoveTowards(color.a, inside ? .65f : 0f, Time.unscaledDeltaTime * 6f);
            pointerLight.color = color;
        }

        RectTransform BuildMenuArt(Transform root,bool notifications=true)
        {
            float scale=Mathf.Min(designWidth/640f,designHeight/360f);
            var stage=NativeUiKit.Abs(root,"Desk composition",0,0,640,360);
            NativeUiKit.Center(stage,640);
            stage.sizeDelta=new Vector2(640,360);
            stage.localScale=Vector3.one*scale;
            Layer(stage,"ui-desk-bg",0,0,640,360,false,0);
            Layer(stage,"ui-env-shadow",0,0,640,360,false,1);
            Layer(stage,"ui-env-light",0,0,640,360,false,2);
            Layer(stage,"ui-title",0,0,640,360,false,3);
            Layer(stage,"ui-phone-body",0,0,640,360,false,4);
            var screen=NativeUiKit.Abs(stage,"Phone screen",264,118,149,242);
            screen.gameObject.AddComponent<RectMask2D>();
            // 手机背景：单色（不再用花纹美术）
            var wallpaper=NativeUiKit.AbsImage(screen,"Phone wallpaper",0f,0f,149f,242f,new Color(.055f,.085f,.13f,1f));
            wallpaper.raycastTarget=false;
            wallpaper.sprite=null;
            Layer(screen,"ui-phone-glow",0,-22,149,220,false,1);
            Layer(screen,"ui-phone-glass",0,0,149,242,false,2);
            pointerLightScreen = screen;
            pointerLight = NativeUiKit.AbsImage(screen, "Mouse light", 0, 0, 131, 131, new Color(1, 1, 1, 0));
            pointerLight.sprite = menuArt("ui-hover-glow");
            pointerLight.raycastTarget = false;
            pointerLight.rectTransform.pivot = new Vector2(.5f, .5f);
            pointerLight.enabled = pointerLight.sprite != null;
            // 论文助手提醒：手机屏幕右上角（屏幕宽 149）
            if(notifications){
                Layer(screen,"ui-notify-bar",53,4,92,30,true,5);
                NativeUiKit.AbsLabel(screen,84,8,58,12,"论文助手",9,Ink);
                clockLabel=NativeUiKit.AbsLabel(screen,84,21,58,10,RealClock(),8,Ink);
            }else clockLabel=null;
            return screen;
        }
        Button PhoneMenuButton(Transform parent,string label,string icon,Action action,bool primary=false)
        {
            var button=NativeUiKit.Button(parent,label,action,11,22,primary?Teal:NativeUiKit.Slot);
            IconOn(button,icon);
            return button;
        }
        void BuildMenu(Transform root)
        {
            var screen=BuildMenuArt(root);
            var menu=NativeUiKit.Column(screen,"Home",3,0,0);
            pointerLight.transform.SetAsLastSibling();
            menu.anchorMin=menu.anchorMax=new Vector2(0,1);
            menu.pivot=new Vector2(0,1);
            menu.anchoredPosition=new Vector2(9,-12);
            menu.sizeDelta=new Vector2(131,0);
            NativeUiKit.AbsLabel(screen,9,10,38,14,RealClock(),9,Paper,TextAnchor.MiddleLeft);
            menu.anchoredPosition=new Vector2(9,-35);
            var note=NativeUiKit.Column(menu,"Paper todo panel",2,6,5);
            var paper=note.gameObject.AddComponent<Image>();paper.color=Paper;paper.raycastTarget=false;
            NativeUiKit.Label(note,"作业待办",12,Ink,TextAnchor.MiddleLeft);
            NativeUiKit.Label(note,"进度 "+Mathf.FloorToInt(Visited()*100f/Mathf.Max(1,ProgressRoomCount()))+"%",9,Ink,TextAnchor.MiddleLeft);
            PhoneMenuButton(menu,"新游戏","ui-icon-level",TryNewGame,true);
            if(!mainlineEdition)PhoneMenuButton(menu,"选择章节","ui-icon-message",()=>Show("builtin-select"));
            PhoneMenuButton(menu,"藏品收集","ui-icon-collection",()=>Show("collection"));
            if(Game.UsesManualSaveSlots)PhoneMenuButton(menu,"读取存档","ui-icon-message",()=>OpenLoadSlots("menu"));
            else PhoneMenuButton(menu,"继续","ui-icon-message",Continue).interactable=CanContinue();
            PhoneMenuButton(menu,"设置","ui-icon-settings",()=>{settingsFromGame=false;Show("settings");});
            PhoneMenuButton(menu,"难度："+Game.DifficultyName,Game.Difficulty<=0?"ui-difficulty-easy":Game.Difficulty>=2?"ui-difficulty-hard":"ui-difficulty-normal",()=>{Game.CycleDifficulty();Show("menu");});
            PhoneMenuButton(menu,"退出","ui-icon-quit",Quit);
            // menu notice text removed
        }
        Sprite resultArt(string name){try{return world!=null?world.Fx(name):null;}catch(Exception){return null;}}
        void BuildPause(Transform root,string state)=>BuildReferencePauseResult(root,state);
        // 藏品收集查看：卡片式列表 + 进度条 + 分页；未收集的一律显示「？？？」。
        int collectionPage;
        Sprite collectibleArt;
        Sprite CollectibleArt(){if(collectibleArt==null&&world!=null)collectibleArt=world.Fx("ui-collectible");return collectibleArt;}
        void BuildCollectionPage(Transform root)
        {
            float width = Mathf.Min(700f, designWidth - 32f);
            var panel = NativeUiKit.Column(root, "Collection", 6, 12, 10);
            NativeUiKit.Center(panel, width);
            var bg = panel.gameObject.AddComponent<Image>();
            bg.color = ArchivePaper; bg.raycastTarget = false;

            var catalog = NativeMainlineCopy.CollectiblesRaw;
            var ids = new List<string>();
            var entries = new List<JObject>();
            int got = 0;
            if (catalog != null)
                foreach (var property in catalog.Properties())
                {
                    var entry = property.Value as JObject;
                    var room = (string)entry?["room"];
                    ids.Add(property.Name); entries.Add(entry);
                    if (room != null && journal.Contains(room + "/" + property.Name)) got++;
                }
            int total = entries.Count;
            const int perPage = 5;
            int pages = Mathf.Max(1, Mathf.CeilToInt(total / (float)perPage));
            collectionPage = Mathf.Clamp(collectionPage, 0, pages - 1);

            Color dim = new Color(.37f, .38f, .34f);
            Color cardColor = ArchiveCard;

            var head = NativeUiKit.Row(panel, "Collection head", 32, 8);
            var title = NativeUiKit.Label(head, "藏品收集", 20, Ink, TextAnchor.MiddleLeft);
            NativeUiKit.Size(title, flexWidth: 1, height: 32);
            var count = NativeUiKit.Label(head, got + " / " + total, 16, ArchiveAccent, TextAnchor.MiddleRight);
            NativeUiKit.Size(count, 96, 32);

            // 进度条：底板 + 按比例填充
            float barWidth = width - 26f;
            var barRow = NativeUiKit.Row(panel, "Collection progress", 8, 0);
            var back = NativeUiKit.Box(barRow, "progress back", new Color(.65f, .60f, .44f)).rectTransform;
            NativeUiKit.Size(back, barWidth, 6f);
            var fill = NativeUiKit.Box(back, "progress fill", Teal).rectTransform;
            fill.anchorMin = new Vector2(0f, 0f); fill.anchorMax = new Vector2(0f, 1f);
            fill.pivot = new Vector2(0f, .5f); fill.anchoredPosition = Vector2.zero;
            fill.sizeDelta = new Vector2(total == 0 ? 0f : barWidth * got / total, 0f);

            if (total == 0)
                NativeUiKit.Label(panel, "还没有可显示的藏品文案。", 12, Ink);

            int first = collectionPage * perPage, last = Mathf.Min(first + perPage, total);
            for (int i = first; i < last; i++)
            {
                var entry = entries[i];
                var room = (string)entry?["room"];
                bool seen = room != null && journal.Contains(room + "/" + ids[i]);
                string artifact = (string)entry?["name"] ?? "";
                string line = (string)entry?["line"] ?? "";

                var card = NativeUiKit.Box(panel, "Artifact card", cardColor).rectTransform;
                NativeUiKit.Size(card, flexWidth: 1, height: 40f);
                var accent = NativeUiKit.Box(card, "Card accent", seen ? Teal : new Color(.32f, .36f, .42f, 1f)).rectTransform;
                accent.anchorMin = new Vector2(0f, 0f); accent.anchorMax = new Vector2(0f, 1f);
                accent.pivot = new Vector2(0f, .5f); accent.anchoredPosition = Vector2.zero;
                accent.sizeDelta = new Vector2(4f, 0f);

                // 已收集：左侧用藏品大图（320×320 素材缩到卡片高度）；未收集保持 ？？？。
                if (seen)
                {
                    var art = NativeUiKit.AbsImage(card, "Artifact art", 10f, 3f, 34f, 34f, Color.white);
                    art.sprite = CollectibleArt();
                    art.preserveAspect = true;
                    var frame = NativeUiKit.Box(card, "Artifact frame", new Color(.16f, .30f, .32f, 1f)).rectTransform;
                    frame.SetAsFirstSibling();
                    frame.anchorMin = new Vector2(0f, 0f); frame.anchorMax = new Vector2(0f, 0f);
                    frame.pivot = new Vector2(0f, 0f); frame.anchoredPosition = new Vector2(9f, 2f);
                    frame.sizeDelta = new Vector2(36f, 36f);
                }

                float textX = seen ? 52f : 14f;
                NativeUiKit.AbsLabel(card, textX, 11f, 46f, 18f, "No." + (i + 1).ToString("00"), 11,
                    seen ? ArchiveAccent : dim, TextAnchor.MiddleLeft);
                NativeUiKit.AbsLabel(card, textX + 48f, 4f, width - 92f - (seen ? 38f : 0f), 17f, seen ? artifact : "？？？", 12,
                    seen ? Ink : dim, TextAnchor.MiddleLeft);
                NativeUiKit.AbsLabel(card, textX + 48f, 22f, width - 92f - (seen ? 38f : 0f), 16f, seen ? line : "？？？", 10,
                    seen ? ArchiveAccent : dim, TextAnchor.MiddleLeft);
            }

            var footer = NativeUiKit.Row(panel, "Collection footer", 30, 8);
            var previous = NativeUiKit.Button(footer, "上一页", () => { collectionPage--; Show("collection"); }, 12, 28);
            previous.interactable = collectionPage > 0;
            NativeUiKit.Label(footer, "第 " + (collectionPage + 1) + " / " + pages + " 页", 11, Ink, TextAnchor.MiddleCenter);
            var next = NativeUiKit.Button(footer, "下一页", () => { collectionPage++; Show("collection"); }, 12, 28);
            next.interactable = collectionPage < pages - 1;
            NativeUiKit.Button(footer, "返回", () => Show(Game != null ? "pause" : "menu"), 12, 28);
            NativeUiKit.Fit(panel, width, designHeight - 24f);
        }
        void BuildSettings(Transform root)
        {
            var screen=BuildMenuArt(root,false);
            var top=NativeUiKit.Column(screen,"Settings header",1,0,0);
            top.anchorMin=top.anchorMax=new Vector2(0,1);top.pivot=new Vector2(0,1);
            top.anchoredPosition=new Vector2(9,-10);top.sizeDelta=new Vector2(131,0);
            PhoneMenuButton(top,"返回","ui-icon-back",()=>{rebind=-1;Show(settingsFromGame?"pause":"menu");});
            NativeUiKit.Label(top,"设置",15,Paper,TextAnchor.MiddleLeft);
            var tabs=NativeUiKit.Row(top,"Settings categories",17,3);
            string[] categories={"声音","操作","显示","难度"};
            for(int i=0;i<categories.Length;i++)
            {
                int tab=i;
                NativeUiKit.Button(tabs,categories[i],()=>{phoneSettingsTab=tab;Show("settings");},
                    9,17,phoneSettingsTab==tab?Teal:NativeUiKit.SlotIdle);
            }
            var viewport=NativeUiKit.Abs(screen,"Settings viewport",9,73,131,158);
            pointerLight.transform.SetAsLastSibling();
            var scrollBacking=viewport.gameObject.AddComponent<Image>();
            scrollBacking.color=new Color(.035f,.075f,.11f,.96f);
            viewport.gameObject.AddComponent<RectMask2D>();
            var scroll=viewport.gameObject.AddComponent<ScrollRect>();
            scroll.viewport=viewport;scroll.horizontal=false;scroll.scrollSensitivity=19;
            scroll.movementType=ScrollRect.MovementType.Clamped;
            var panel=NativeUiKit.Column(viewport,"Settings controls",5,5,5);
            panel.anchorMin=new Vector2(0,1);panel.anchorMax=new Vector2(1,1);
            panel.pivot=new Vector2(.5f,1);panel.anchoredPosition=Vector2.zero;
            panel.sizeDelta=Vector2.zero;scroll.content=panel;

            if(phoneSettingsTab==3)
            {
                NativeUiKit.Label(panel,"论文助手速度",11,Paper,TextAnchor.MiddleLeft);
                string[] names={"简单 · 75%","普通 · 100%","困难 · 125%"};
                string[] icons={"ui-difficulty-easy","ui-difficulty-normal","ui-difficulty-hard"};
                for(int i=0;i<names.Length;i++)
                {
                    int difficulty=i;
                    var button=NativeUiKit.Button(panel,names[i],()=>{Game.SetDifficulty(difficulty);Show("settings");},
                        10,29,Game.Difficulty==i?Teal:NativeUiKit.SlotIdle);
                    IconOn(button,icons[i]);
                    button.GetComponentInChildren<Text>().rectTransform.offsetMin=new Vector2(20,0);
                }
            }
            else if(phoneSettingsTab==0)
            {
                var volumeLabel=NativeUiKit.Label(panel,"主音量 "+Mathf.RoundToInt(volume*100)+"%",11,Paper,TextAnchor.MiddleLeft);
                var volumeRow=NativeUiKit.Row(panel,"Volume row",22,3);
                VolumeSlider(volumeRow,volumeLabel);
                NativeUiKit.Button(volumeRow,"试听",()=>Play("finish"),10,22,NativeUiKit.Slot,36,0);
                void AudioRow(string title,float value,Action<float> set)
                {
                    var section=NativeUiKit.Column(panel,title,2,0,0);
                    NativeUiKit.Label(section,title,10,Paper,TextAnchor.MiddleLeft);
                    var row=NativeUiKit.Row(section,title+" slider",22,0);
                    NativeSciFiGauge.Create(row,0,1,value,set,SaveSettings);
                }
                AudioRow("音乐",musicVolume,v=>musicVolume=v);
                AudioRow("音效",effectsVolume,v=>effectsVolume=v);
            }
            else if(phoneSettingsTab==1)
            {
                string[] names={"向左","向右","跳跃","下蹲","冲刺","交互"};
                for(int k=0;k<6;k++){
                    int index=k;
                    var text=k==5&&Game.Rules==NativeGameplayRules.Editor255Compat?"按关卡自动触发":names[k]+"  "+(rebind==k?"按新按键":bindings[k].ToString());
                    NativeUiKit.Button(panel,text,()=>{
                        if(index==5&&Game.Rules==NativeGameplayRules.Editor255Compat){notice="控温板踩踏切换";if(status!=null)status.text=notice;return;}
                        rebind=index;Show("settings");
                    },11,20);
                }
            }
            else
            {
                NativeUiKit.Label(panel,"默认地图打开方式",11,Paper,TextAnchor.MiddleLeft);
                var mapRow=NativeUiKit.Row(panel,"Map preference",22,4);
                NativeUiKit.Button(mapRow,"当前全景",()=>SetMapPreference(false,false),9,22,courseMapPreferred?NativeUiKit.SlotIdle:Teal);
                NativeUiKit.Button(mapRow,"沿途总图",()=>SetMapPreference(true,false),9,22,courseMapPreferred?Teal:NativeUiKit.SlotIdle);
                BuildDisplayGroup(panel);
            }
            status=NativeUiKit.Label(panel,notice!=null&&notice.StartsWith("已进入",StringComparison.Ordinal)?"":notice,10,Orange);
            Canvas.ForceUpdateCanvases();
            LayoutRebuilder.ForceRebuildLayoutImmediate(panel);
            scroll.verticalNormalizedPosition=1;
        }
        void BuildDisplayGroup(Transform parent){
            var group=NativeUiKit.Column(parent,"Display options",6,10,8);var bg=group.gameObject.AddComponent<Image>();bg.color=new Color(.09f,.14f,.19f);bg.raycastTarget=false;
            NativeUiKit.Label(group,"显示",12,Teal);
            var viewRow=NativeUiKit.Row(group,"Room view",26,8);
            var viewLabel=NativeUiKit.Label(viewRow,"视野",12,Paper,TextAnchor.MiddleLeft);NativeUiKit.Size(viewLabel,44,26,0);
            NativeSciFiGauge.Create(viewRow,1f,1.6f,viewMax,v=>{viewMax=v;NativeCameraView.Zoom=v;},SaveSettings);
            string current=desiredFull?"全屏":desiredWidth+"×"+desiredHeight;
            NativeUiKit.Button(group,"分辨率  "+current+(displayExpanded?"  收起 ▾":"  展开 ▸"),()=>{displayExpanded=!displayExpanded;Show("settings");},9,24,NativeUiKit.Slot);
            if(displayExpanded){
                var available=AvailablePresets();int currentIndex=SelectedPreset(available);
                var presets=NativeUiKit.Row(group,"Resolution presets",24,6);
                for(int i=0;i<available.Count;i++){if(i>0&&i%2==0)presets=NativeUiKit.Row(group,"Resolution presets",24,6);int index=i;bool active=!desiredFull&&i==currentIndex;NativeUiKit.Button(presets,available[i].x+"×"+available[i].y,()=>SetDisplay(available[index].x,available[index].y,false),9,24,active?Teal:NativeUiKit.SlotIdle);}
                var modes=NativeUiKit.Row(group,"Display mode",24,6);
                NativeUiKit.Button(modes,"窗口",()=>{SetDisplay(desiredWidth,desiredHeight,false);},11,24,!desiredFull?Teal:NativeUiKit.SlotIdle);
                NativeUiKit.Button(modes,"全屏",()=>SetDisplay(desiredWidth,desiredHeight,true),11,24,desiredFull?Teal:NativeUiKit.SlotIdle);
            }
        }
        List<Vector2Int> AvailablePresets(){var list=new List<Vector2Int>();int maxWidth=Screen.currentResolution.width,maxHeight=Screen.currentResolution.height;foreach(var preset in DisplayPresets)if(preset.x<=maxWidth&&preset.y<=maxHeight)list.Add(preset);if(list.Count==0)list.Add(new Vector2Int(1280,720));bool found=false;foreach(var preset in list)if(preset.x==desiredWidth&&preset.y==desiredHeight)found=true;if(!found)list.Add(new Vector2Int(desiredWidth,desiredHeight));return list;}
        int SelectedPreset(List<Vector2Int> available){for(int i=0;i<available.Count;i++)if(available[i].x==desiredWidth&&available[i].y==desiredHeight)return i;return -1;}
        void SetDisplay(int width,int height,bool full){if(!full){desiredWidth=width;desiredHeight=height;}desiredFull=full;int targetWidth=full?Screen.currentResolution.width:width,targetHeight=full?Screen.currentResolution.height:height;Screen.SetResolution(targetWidth,targetHeight,full?FullScreenMode.FullScreenWindow:FullScreenMode.Windowed);SaveSettings();Show("settings");}
        void OpenHiddenDeveloper(){
            if(Game==null||Game.AwaitingSaveChoice||IsSaveSlotPage)return;
            if(page=="developer")return;
            developerReturnPage=page;hiddenDeveloperOpen=true;developerTools=false;
            Show("developer");
        }
        void CloseHiddenDeveloper(){hiddenDeveloperOpen=false;Show(developerReturnPage=="developer"?"pause":developerReturnPage);}
        void BuildDeveloper(Transform root){float width=Mathf.Min(560f,designWidth-32f);
            var panel=NativeUiKit.Column(root,"Hidden developer panel",6,14,12);NativeUiKit.Center(panel,width);var bg=panel.gameObject.AddComponent<Image>();bg.color=Ink;bg.raycastTarget=false;
            NativeUiKit.Label(panel,"开发者选项",20,Paper);
            var tabs=NativeUiKit.Row(panel,"Developer tabs",26,8);
            NativeUiKit.Button(tabs,"调试",()=>{developerTools=false;Show("developer");},12,26,developerTools?NativeUiKit.SlotIdle:Teal);
            NativeUiKit.Button(tabs,Debug.isDebugBuild?"关卡与导入":"关卡工具",()=>{developerTools=true;Show("developer");},12,26,developerTools?Teal:NativeUiKit.SlotIdle);
            if(developerTools){
                var tools=NativeUiKit.Row(panel,"Developer tools",27,8);
                if(Debug.isDebugBuild)NativeUiKit.Button(tools,"替换导入",PickImport,12,27);
                NativeUiKit.Button(tools,"恢复内置大关",()=>{if(mainlineEdition)LoadMainlineEdition();else LoadBuiltinCourse(builtinCourseId);ForgetImport();hiddenDeveloperOpen=false;Show("menu");},12,27);
                NativeUiKit.Button(tools,"教程",()=>Show("tutorial"),12,27);
                if(Debug.isDebugBuild)NativeUiKit.Button(panel,importLegacyRules?"导入关卡：按 2.5.5 原规则":"导入关卡：按本包规则",()=>{importLegacyRules=!importLegacyRules;SaveSettings();Show("developer");},12,26,importLegacyRules?NativeUiKit.SlotIdle:Teal);
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
                NativeUiKit.Button(toggles,"一键获得全部道具",()=>{tainted=true;Game.GrantAllItems();Show("developer");},12,28);
                NativeUiKit.Button(panel,"地图跳转",()=>Show("developer-map"),12,27);
            }
            NativeUiKit.Button(panel,"返回",CloseHiddenDeveloper,12,27);
            NativeUiKit.Fit(panel,width,designHeight-24f);}
        void LoadDeveloperCourse(string id){try{LoadBuiltinCourse(id);ForgetImport();hiddenDeveloperOpen=false;Show("menu");}catch(Exception e){notice="关卡暂时无法读取";Debug.LogWarning("NATIVE_DEVELOPER_COURSE_FAILED "+e.Message);Show("developer");}}
        string KeyName(){return bindings[5]==KeyCode.None?"E":bindings[5].ToString();}
        string InteractionPrompt(NativeObject o){string key=KeyName();if(o.Type=="common.aiStart"||o.Type=="common.aiStartHollow")return Game.AI.active?"助手已在追踪你":key+" 唤醒助手";
            if(o.Type=="common.assignmentSubmit")return key+" 提交作业（停止助手）";return key+" 操作："+o.Name;}
        // First run tutorial: what the AI is for, and that E boots it.
        void BuildTutorial(Transform root){float width=Mathf.Min(560f,designWidth-32f);
            var panel=NativeUiKit.Column(root,"Panel",6,14,12);NativeUiKit.Center(panel,width);var bg=panel.gameObject.AddComponent<Image>();bg.color=Ink;bg.raycastTarget=false;
            NativeUiKit.Label(panel,"新手教程",20,Paper);
            NativeUiKit.Label(panel,"操作：A/D 移动 · 空格/W 跳跃 · S 下蹲 · Shift 冲刺 · "+KeyName()+" 交互 · Esc 菜单 · M 地图 · R 重试",12,Paper);
            NativeUiKit.Label(panel,"冲刺：落地恢复 1 次免费冲刺；付费冲刺上限 1 次，3 个小 token 或 1 个大 token 充能 1 次。",12,Paper);
            NativeUiKit.Label(panel,"风险：被 AI 抓到扣掉一半 token，同一局第二次被抓回最近检查点。",12,Orange);
            var row=NativeUiKit.Row(panel,"Tutorial row",30,8);NativeUiKit.Button(row,"开始游戏",()=>{hiddenDeveloperOpen=false;Show(Game!=null?"play":"menu");},13,30,Teal);NativeUiKit.Button(row,"返回",()=>Show(hiddenDeveloperOpen?"developer":"menu"),12,30);
            NativeUiKit.Fit(panel,width,designHeight-24f);}
        IEnumerator UiMatrix(){
            var report=new StringBuilder();int shots=0,pairs=0,problems=0;
            yield return null;NewGame();HideStory();
            // Evidence only: discover part of the world so the map page shows a partial state.
            foreach(var room in Game.Course.Rooms){if(discoveredRooms.Count>=14)break;discoveredRooms.Add(room.Id);}
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
            if(mainlineEdition){
                var railRoom=Game.Course.Rooms.Find(room=>room.Id=="rail-room");
                if(railRoom!=null){
                    SetGame(new NativeMotion(Game.Project,Game.Course.Id,railRoom.Id,Game.Rules));
                    Show("play");
                    yield return Capture("curve-drift-start");
                    yield return new WaitForSecondsRealtime(1.2f);
                    yield return Capture("curve-drift-after");
                }
                yield return CaptureReferencePauseResult();
                File.WriteAllText(Path.Combine(Evidence(),"ui-matrix.txt"),report.ToString());
                Debug.Log("MAINLINE_UI_MATRIX shots="+shots+" findings="+problems);
                Finish(problems==0?0:2);
                yield break;
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
        void Update(){float previousDesignWidth=designWidth,previousDesignHeight=designHeight;ApplyScreen(false);UpdatePhoneLight();bool hadStory=storyActive;TickStory();TickArtifactNotice(Time.unscaledTime);if(Game==null||hadStory||storyActive)return;if(!verify&&!matrix&&!mapShot&&ShowFirstAssistantRoomHint())return;if((page=="exploration-map"||IsSaveSlotPage)&&(previousDesignWidth!=designWidth||previousDesignHeight!=designHeight))Show(page);
            DrainAutoSaves();
            if(Game.UsesManualSaveSlots&&Game.AwaitingSaveChoice&&page=="play")OpenSaveSlots();
            if(!verify&&!matrix&&HandleHiddenDeveloperInput())return;
            if(!verify&&!matrix&&IsSaveSlotPage){if(GameInput.WasPressedExact(KeyCode.Escape)&&Time.unscaledTime>=saveSlotReadyAt){if(page=="overwrite-slot")Show("save-slots");else if(page=="save-slots")CancelSaveSlots();else CloseLoadSlots();}}
            else if(!verify&&!matrix&&page=="developer-map"){if(GameInput.WasPressedExact(KeyCode.Escape))Show("developer");}
            else if(!verify&&!matrix&&page=="developer"){if(GameInput.WasPressedExact(KeyCode.Escape))CloseHiddenDeveloper();}
            else if(!verify&&!matrix&&page=="play"){if(GameInput.WasPressedExact(KeyCode.Escape)){SaveProgress();Show("pause");}else if(GameInput.WasPressedExact(KeyCode.M)&&!LegacyUses(KeyCode.M))OpenExplorationMap();else if(legacy.WasPressed(RoomLabKeyBindings.ActionId.Retry))Retry();else Advance(Time.unscaledDeltaTime);}
            else if(!verify&&!matrix&&page=="exploration-map"){if(GameInput.WasPressedExact(KeyCode.Escape))CloseExplorationMap(false);else if(GameInput.WasPressedExact(KeyCode.M))CloseExplorationMap(true);}
            DrainAutoSaves();
            if(Game.UsesManualSaveSlots&&Game.AwaitingSaveChoice&&page=="play")OpenSaveSlots();
            if(rememberedRoom!=Game.Room.Id){rememberedRoom=Game.Room.Id;RememberRoom(Game.Room.Id);}
            // 第一次见到交付方块时给一句加粗提示（本次运行只弹一次）。
            var nearbyInteraction=Game.NearbyInteraction;
            if(!verify&&!matrix&&!mapShot&&ShowFirstAssistantRoomHint()){world.Refresh(0,view,map);return;}
            if(noticedRoom!=Game.Room.Id){noticedRoom=Game.Room.Id;SaveProgress();}if(loadedRoom!=Game.Room.Id)loadedRoom=Game.Room.Id;if(lastCheckpoint!=Game.Checkpoint.id){lastCheckpoint=Game.Checkpoint.id;SaveProgress();}
            // 新手教程：第一关提示移动与冲刺（每次运行只弹一次，6 秒）
            // 第一关：移动教程作为背景小字常驻（不再居中大字）
            bool inFirstRoom = Game.Course.Rooms.Count > 0 && Game.Room.Id == Game.Course.Rooms[0].Id;
            if(Time.unscaledTime<moveHintUntil)tutorialText="AD / ←→ 移动　　空格 跳跃　　Shift 冲刺";
            else if(Time.unscaledTime<teaHintUntil)tutorialText="现在消耗 Token 可连续两次冲刺！";
            else tutorialText="";
            // 新手教程：第一次遇到助手方块时提示交互键
            if(Game.Completed&&page=="play"&&!endingShown)
            {
                if(!tainted){high=Math.Max(high,Game.Score);SaveRecord(false);}
                if(!endingShown)
                {
                    endingShown=true;
                    StartCoroutine(StoryRoutine(new[]{"恭喜你完成了所有作业！",Game.Difficulty>=2?"现在你可以自由探索了！":"现在你可以游玩困难模式了！"},true,()=>Show("won")));
                }
            }
            world.Refresh(Time.unscaledDeltaTime,view,map);if(hud!=null){var hudNow="分数 "+Game.Score+"   Token "+Game.Tokens+"   免费 "+(Game.Player.freeDash?"●":"○")+(Game.PaidDashUnlocked?"   付费 "+Game.Charges+"/"+Game.PaidStockCap:"");if(hudNow!=hudShown){hudShown=hudNow;hud.text=hudNow;}}
            // 新手提示：内容 + 放在空白背景区（人在下方→上方区域；人在上方→下方区域）
            bool tutLow=Game.Player.y>Game.Room.Rows*16.0;
            tutorialText = "";
            if(!(Game!=null&&Game.Course.Rooms.Count>0&&Game.Room.Id==Game.Course.Rooms[0].Id)&&tutorial!=null)tutorial.enabled=false;
            if(false&&tutorial!=null)
            {
                if(tutorialText!=tutorialShown)
                {
                    tutorialShown=tutorialText;
                    tutorial.text=tutorialText;
                    tutorial.enabled=!string.IsNullOrEmpty(tutorialText);
                    if(!string.IsNullOrEmpty(tutorialText))
                    {
                        // 只在这条提示刚出现时定一次位置，之后不再随人物移动
                        var tr=tutorial.rectTransform;
                        tr.anchorMin=tr.anchorMax=new Vector2(0f,1f);
                        tr.pivot=new Vector2(0f,1f);
                        tr.anchoredPosition=tutLow?new Vector2(70f,-64f):new Vector2(70f,-268f);
                        tr.sizeDelta=new Vector2(460f,64f);
                    }
                }
            }
            if(hint!=null)
            {
                bool bold=Time.unscaledTime<submitHintUntil;
                hint.fontSize=bold?17:12;
                hint.color=bold?Orange:Paper;
                // 底部小字提示条已废弃：交互提示改为方块上的常驻小字
                hint.text="";
            }
            if(hintBacking!=null)hintBacking.enabled=false;   // 字幕不再带底衬/阴影
            if(notice!=noticeShown){noticeShown=notice;noticeShownUntil=Time.unscaledTime+2f;}bool warningOn=Game!=null&&Game.AI!=null&&Game.AI.warning!=null;if(warningOn&&!aiWarningWasOn)Play("ai_warning");aiWarningWasOn=warningOn;AiCopyTick();if(hint!=null)hint.text=mainlineEdition?"":Time.unscaledTime<copyUntil?copyLine:Time.unscaledTime<noticeShownUntil?notice:tainted?"开发检查 · 成绩不保存":Game.RespawnRemaining>0?"复活准备…":nearbyInteraction!=null?InteractionPrompt(nearbyInteraction):"";
            TickLocatedTutorial(inFirstRoom);TickBlockHints();TickTeaReturnHint();if(page=="play"&&Time.unscaledTime>saveAt){saveAt=Time.unscaledTime+20;var sig=Game.Score+":"+Game.Tokens+":"+Game.Room.Id+":"+Game.Credited.Count;if(sig!=saveSigShown){saveSigShown=sig;SaveProgress();}}PumpSounds();CampaignTick();TickAwarenessHud();TickAutoSaveNotice();}
        // 字幕位置：人在下方 → 右上角；人在上方 → 左下角
        // ---- 剧情/拾取文字：无对话框，上下黑边 + 画面正中白字，字号自适应，逐字显示 ----
        Canvas storyCanvas; RectTransform storyRoot; Text storyText; Text storyKeyHint; Image storyBackdrop;
        Image storyBarTop, storyBarBottom;   // 上下黑边：只用于开场/结局
        string[] storyLines; int storyIdx; float storyReveal; bool storyActive, storySkippable;
        Action storyDone; string storyFull = ""; int storyChar; float storyCharAt;
        readonly Queue<(string[] pages,bool instant)> storyQueue = new Queue<(string[],bool)>();
        bool storyInstant;
        int storyOpenedFrame;
        float storyAutoHideAt; double gateNoticeShown = -1;
        float storyInputLockUntil;   // 刚弹出时的输入冷却，避免上一个点击直接跳过首句
        float gateNoticeCooldown;
        string hudShown;
        string saveSigShown;   // 门禁提示冷却，避免关门瞬间反复弹出
        readonly Dictionary<string,Text> blockHints = new Dictionary<string,Text>();
        Transform blockHintPage;
        string blockHintRoom;   // 方块上的常驻小字（按房间重建）

        void EnsureStoryCanvas()
        {
            if (storyCanvas != null) return;
            var go = new GameObject("Story overlay", typeof(RectTransform), typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            go.transform.SetParent(transform, false);
            storyCanvas = go.GetComponent<Canvas>();
            storyCanvas.renderMode = RenderMode.ScreenSpaceOverlay;
            storyCanvas.sortingOrder = 900;
            var scaler = go.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(640f, 360f);
            scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            scaler.matchWidthOrHeight = 1f;
            storyRoot = (RectTransform)go.transform;
            // 居中字幕的背景：用项目背景美术（与网页预览一致：中间有背景，文字压在上面）
            storyBackdrop = NativeUiKit.AbsImage(storyRoot, "Story backdrop", 0f, 0f, 640f, 360f, new Color(.16f, .14f, .2f, 1f));
            storyBackdrop.raycastTarget = true;
            storyBackdrop.rectTransform.anchorMin=Vector2.zero;
            storyBackdrop.rectTransform.anchorMax=Vector2.one;
            storyBackdrop.rectTransform.offsetMin=storyBackdrop.rectTransform.offsetMax=Vector2.zero;
            var backdropArt = menuArt("ui-desk-bg");
            if (backdropArt != null) { storyBackdrop.sprite = backdropArt; storyBackdrop.color = Color.white; storyBackdrop.preserveAspect = false; }
            // 叠一层半透明暗色，保证白字可读（仍是"背景"而不是纯黑）
            var dim = NativeUiKit.AbsImage(storyRoot, "Story dim", 0f, 0f, 640f, 360f, new Color(0f, 0f, 0f, .45f));
            dim.rectTransform.anchorMin=Vector2.zero;dim.rectTransform.anchorMax=Vector2.one;
            dim.rectTransform.offsetMin=dim.rectTransform.offsetMax=Vector2.zero;dim.raycastTarget=false;
            var layout=NativeUiKit.Abs(storyRoot,"Centered story layout",0,0,640,360);
            layout.anchorMin=layout.anchorMax=new Vector2(.5f,.5f);
            layout.pivot=new Vector2(.5f,.5f);layout.anchoredPosition=Vector2.zero;
            storyBarTop = NativeUiKit.AbsImage(layout, "Letterbox top", 0f, 0f, 640f, 68f, Color.black);
            storyBarBottom = NativeUiKit.AbsImage(layout, "Letterbox bottom", 0f, 292f, 640f, 68f, Color.black);
            // 文字：画面正中，白色，无框无底
            storyText = NativeUiKit.AbsLabel(layout, 51f, 120f, 538f, 120f, "", 28, Color.white, TextAnchor.MiddleCenter);
            storyText.horizontalOverflow = HorizontalWrapMode.Wrap;
            storyText.verticalOverflow = VerticalWrapMode.Overflow;
            storyText.lineSpacing = 1.15f;
            storyText.raycastTarget = false;
            var inkOutline=storyText.gameObject.AddComponent<UnityEngine.UI.Outline>();
            inkOutline.effectColor=new Color(0f,0f,0f,.9f);
            inkOutline.effectDistance=new Vector2(1.25f,-1.25f);
            // 右下角小字号按键提示
            storyKeyHint = NativeUiKit.AbsLabel(layout, 380f, 322f, 240f, 22f, "", 12, new Color(1f, 1f, 1f, .7f), TextAnchor.MiddleRight);
            storyKeyHint.raycastTarget = false;
            foreach(var child in storyRoot.GetComponentsInChildren<Transform>(true))child.gameObject.layer=5;
            SetStoryVisible(false);
        }
        void SetStoryVisible(bool on) { if (storyCanvas != null) storyCanvas.gameObject.SetActive(on); }
        void SetLetterbox(bool on)
        {
            if (storyBarTop != null) storyBarTop.enabled = on;
            if (storyBarBottom != null) storyBarBottom.enabled = on;
        }
        // 背景美术：每次显示都尝试一次（开场时世界还没建好，之前会取不到导致背景丢失）
        void EnsureStoryBackdrop()
        {
            if (storyBackdrop == null) return;
            if (storyBackdrop.sprite != null) return;
            var art = menuArt("ui-desk-bg");
            if (art == null) art = menuArt("ui-menu-wallpaper");
            if (art != null) { storyBackdrop.sprite = art; storyBackdrop.color = Color.white; storyBackdrop.preserveAspect = false; }
        }

        // 字号自适应：按最长一行字符数与行数，限制在 84% 宽 / 42% 高之内
        void FitStoryText(string txt)
        {
            if (storyText == null) return;
            int rows = 1, maxChars = 1;
            foreach (var line in (txt ?? "").Split('\n'))
            {
                rows = Math.Max(rows, 1); maxChars = Math.Max(maxChars, line.Length);
            }
            rows = (txt ?? "").Split('\n').Length;
            float byWidth = 640f * .84f / (maxChars * 1.02f);
            float byHeight = 360f * .42f / (rows * 1.6f);
            storyText.fontSize = Mathf.Clamp(Mathf.RoundToInt(Math.Min(byWidth, byHeight)), 10, 34);
        }

        void ShowStory(string[] lines, bool skippable, Action done, bool instant=false)
        {
            EnsureStoryCanvas();
            if(lines==null||lines.Length==0)return;
            storyInstant=instant;storyOpenedFrame=Time.frameCount;
            storyInputLockUntil=Time.unscaledTime+.18f;
            keys?.Clear();timeline.Reset();
            storyLines = lines; storyIdx = 0; storyActive = true; storySkippable = skippable; storyDone = done;
            if (Game != null) Game.StoryPaused = true;   // 显示期间暂停
            EnsureStoryBackdrop();
            SetLetterbox(true);                          // 开场/结局：保留上下黑边
            SetStoryVisible(true);
            BeginStoryPage();
        }
        void BeginStoryPage()
        {
            storyFull = storyLines != null && storyIdx < storyLines.Length ? storyLines[storyIdx] : "";
            FitStoryText(storyFull);
            storyChar = storyInstant?storyFull.Length:Math.Min(1,storyFull.Length);
            storyText.text = storyFull.Substring(0,storyChar); storyCharAt = Time.unscaledTime; storyReveal = Time.unscaledTime + .8f;
            if (storyKeyHint != null) storyKeyHint.text = startupIntro&&storySkippable?"任意键继续   Esc 跳过":"任意键继续";
        }
        System.Collections.IEnumerator StoryRoutine(string[] lines, bool skippable, Action done)
        {
            ShowStory(lines, skippable, done);
            while (storyActive) yield return null;
        }
        void TickStory()
        {
            if (!storyActive || storyCanvas == null) return;
            EnsureStoryBackdrop();   // 每帧重试：开场时世界未就绪也能补上背景
            // 不再自动消失：按任意键继续（storyAutoHideAt 保留字段但不再使用）
            // 逐字显示
            if (storyChar < storyFull.Length && Time.unscaledTime - storyCharAt >= .028f)
            {
                storyCharAt = Time.unscaledTime;
                storyChar++;
                storyText.text = storyFull.Substring(0, storyChar);
            }
            if (Time.frameCount <= storyOpenedFrame || Time.unscaledTime < storyInputLockUntil) return;
            if(startupIntro&&GameInput.WasPressedExact(KeyCode.Escape)){TrySkipStartupIntro();return;}
            if(GameInput.StoryAdvancePressed())AdvanceStoryPage();
        }

        const string StartupIntroSeenKey="roomlab-startup-intro-seen";
        bool startupIntro;
        void ShowStartupIntro(bool seen)
        {
            startupIntro=true;
            ShowStory(new[]{"2026年冬","作为一名大学生享受生活的你突然发现","自己正面临着无数ddl",
                "然而常年不听课的你感到学习知识如死亡般痛苦","绝望的你只好求助——"},seen,()=>{
                startupIntro=false;
                if(!mapShot&&!verify&&!matrix){PlayerPrefs.SetInt(StartupIntroSeenKey,1);PlayerPrefs.Save();}
                Show("menu");
            });
        }

        bool TrySkipStartupIntro()
        {
            if(!startupIntro||!storySkippable)return false;
            CompleteStory();
            return true;
        }

        void AdvanceStoryPage()
        {
            if(storyChar<storyFull.Length){storyChar=storyFull.Length;storyText.text=storyFull;return;}
            storyIdx++;
            if(storyIdx<storyLines.Length){BeginStoryPage();return;}
            CompleteStory();
        }

        void CompleteStory()
        {
            storyActive=false;
            if(Game!=null)Game.StoryPaused=false;
            SetStoryVisible(false);
            var done=storyDone;storyDone=null;done?.Invoke();
            if(!storyActive&&storyQueue.Count>0){
                var next=storyQueue.Dequeue();ShowStory(next.pages,true,null,next.instant);
            }
        }

        public void ShowNotice(string text,float seconds) => ShowPickup("",new[]{text},true);

        public void ShowPickup(string title,string[] pages,bool instant)
        {
            if(pages==null||pages.Length==0)return;
            if(storyActive){storyQueue.Enqueue((pages,instant));return;}
            ShowStory(pages,true,null,instant);
        }
        static readonly Dictionary<string, string[]> ItemCopy = new Dictionary<string, string[]>
        {
            { "item.icedTea",    new[]{ "自动贩卖机里最后一瓶冰红茶，瓶身还带着凉意。", "现在消耗 Token 可连续两次冲刺！" } },
            { "item.phone",      new[]{ "屏幕碎了一角的旧手机，通知栏里躺着 37 条未读的作业提醒。", "菜单、暂停与结算界面切换为手机样式，地图同样以手机样式显示。", "可以使用签到方块!" } },
            { "item.calculator", new[]{ "从高三用到现在的小计算器，按键上的数字已经磨白。", "可以触发积分块与求导块机关。" } },
            { "item.coffee",     new[]{ "半杯冷掉的美式，杯壁结着一圈咖啡渍。", "提提神——效果与冰红茶一致。" } },
        };
        // 每帧对比已获得集合，新获得的道具/藏品弹出对应文字
        void PlaceHint()
        {
            if(hintBarRect==null||hint==null||Game==null)return;
            bool playerLow = Game.Player.y > Game.Room.Rows * 16.0;   // y 向下增长，超过半屏即在下方
            if(playerLow)
            {
                hintBarRect.anchorMin=hintBarRect.anchorMax=new Vector2(1f,1f);
                hintBarRect.pivot=new Vector2(1f,1f);
                hintBarRect.anchoredPosition=new Vector2(-10f,-8f);
                hintBarRect.sizeDelta=new Vector2(300f,44f);
                hint.alignment=TextAnchor.MiddleRight;
            }
            else
            {
                hintBarRect.anchorMin=hintBarRect.anchorMax=new Vector2(0f,0f);
                hintBarRect.pivot=new Vector2(0f,0f);
                hintBarRect.anchoredPosition=new Vector2(10f,8f);
                hintBarRect.sizeDelta=new Vector2(300f,44f);
                hint.alignment=TextAnchor.MiddleLeft;
            }
        }
        void OnGUI(){if(keys==null)return;var e=Event.current;if(storyActive)return;if(e.type!=EventType.KeyDown&&e.type!=EventType.KeyUp)return;if(rebind>=0&&e.type==EventType.KeyDown){if(e.keyCode==KeyCode.Escape){rebind=-1;Show("settings");return;}if(e.keyCode==KeyCode.None||e.keyCode==KeyCode.M||e.keyCode==KeyCode.R){notice="M / R / Esc 保留为界面快捷键";return;}for(int i=0;i<bindings.Length;i++)if(i!=rebind&&bindings[i]==e.keyCode){notice="此按键已绑定其他动作";return;}if(rebind<5){if(!legacy.TryBind((RoomLabKeyBindings.ActionId)rebind,0,e.keyCode,out var reason)){notice=reason;return;}legacy.Save();}if(rebind==5&&LegacyUses(e.keyCode)){notice="该按键已用于已有动作";return;}bindings[rebind]=e.keyCode;rebind=-1;BindKeys();SaveSettings();Show("settings");e.Use();return;}keys.Apply((int)e.keyCode,e.type==EventType.KeyDown);if(page!="play"||Game==null||Game.RespawnRemaining>0)keys.DiscardEdges();}
        bool LegacyUses(KeyCode key){for(int a=0;a<RoomLabKeyBindings.ActionCount;a++)for(int slot=0;slot<RoomLabKeyBindings.SlotCount;slot++)if(legacy.GetKey((RoomLabKeyBindings.ActionId)a,slot)==key)return true;return false;}
        void BindKeys(){if(!RoomLabKeyBindings.IsBindable(bindings[5])||LegacyUses(bindings[5])){bindings[5]=KeyCode.None;foreach(KeyCode alternative in Enum.GetValues(typeof(KeyCode)))if(RoomLabKeyBindings.IsBindable(alternative)&&alternative!=KeyCode.M&&alternative!=KeyCode.R&&!LegacyUses(alternative)){bindings[5]=alternative;break;}}keys=new NativeKeyboardEvents();for(int i=0;i<5;i++)for(int slot=0;slot<RoomLabKeyBindings.SlotCount;slot++){var key=legacy.GetKey((RoomLabKeyBindings.ActionId)i,slot);if(key!=KeyCode.None)keys.Bind((int)key,actions[i]);}if(bindings[5]!=KeyCode.None)keys.Bind((int)bindings[5],actions[5]);}
        void Advance(double dt){if(keys.Overflowed){timeline.ProtectInputOverflow(Game);notice=timeline.ProtectionReason;keys.Clear();Show("pause");return;}if(Game.Mode!="playing"||Game.RespawnRemaining>0)keys.DiscardEdges();while(keys.TryRead(out var edge))timeline.Advance(Game,0,edge);timeline.Advance(Game,dt,keys.Held);if(timeline.ProtectionPaused){notice=timeline.ProtectionReason;Show("pause");}}
        void OnApplicationFocus(bool focus){if(!focus&&Game!=null&&!verify&&!matrix){keys.Clear();timeline.LoseFocus(Game);if(page=="play"&&!storyActive){SaveProgress();Show("pause");}}}
        void CommitCandidate(NativeProject candidate,NativeGameplayRules rules,bool builtIn,bool allowUnresolvedAssets=false,NativeMotion restored=null){
            DrainAutoSaves();
            NativeDemoAssets decoded=null;NativePixelWorld render=null;NativeMotion motor=null;string nextIdentity=null;
            var cameraPosition=view.transform.position;float cameraSize=view.orthographicSize;Color cameraBackground=view.backgroundColor;
            try{
                foreach(var c in candidate.Courses)foreach(var r in c.Rooms)if(!NativeMotion.SupportsRoom(r,out var reason))throw new NativeDataException(reason);
                if(restored!=null&&(!ReferenceEquals(restored.Project,candidate)||restored.Rules!=rules))throw new NativeDataException("存档与目标关卡不一致");
                motor=restored??new NativeMotion(candidate,rules:rules);NativeDisplayCopy.Apply(motor);decoded=NativeDemoAssets.Decode(candidate,allowUnresolvedAssets);render=new NativePixelWorld(motor,decoded,builtIn);render.Refresh(0,view,false);
                foreach(var migration in NativeCampaignSaveMigration.Run(saveDirectory,candidate,builtIn))Debug.Log("SAVE_MIGRATION "+migration);
                nextIdentity=(builtIn?"builtin-":"import-")+(((JArray)candidate.OriginalJson["courses"]).Count==1?candidate.SourceSha256+"-"+rules:NativeProjectLoader.Sha(Encoding.UTF8.GetBytes(candidate.SourceSha256+"\n"+motor.Course.Id+"\n"+rules))+"-"+rules);
            }catch{render?.Dispose();decoded?.Dispose();view.transform.position=cameraPosition;view.orthographicSize=cameraSize;view.backgroundColor=cameraBackground;throw;}
            // The current game remains owned and visible until the complete candidate has passed
            // state validation, asset decoding and a first render refresh.
            var oldWorld=world;var oldAssets=assets;world=render;assets=decoded;Game=motor;isBuiltin=builtIn;identity=nextIdentity;tainted=false;notice="";loadedRoom=Game.Room.Id;lastCheckpoint=Game.Checkpoint.id;lastEvent=null;timeline.Reset();keys.Clear();map=false;RootActivate();oldWorld?.Dispose();oldAssets?.Dispose();ReadRecord();
        }
        void LoadMainlineEdition()
        {
            // ① 同学替换关卡：exe 同级 "关卡" 文件夹里的 JSON / ZIP 优先
            string looseJson=FindLooseLevelFile("*.json");
            if(looseJson!=null)
            {
                try
                {
                    var loose=LoadImport(looseJson,false,out _);
                    CommitCandidate(loose,NativeGameplayRules.EditorBuild15,false);
                    Debug.Log("MAINLINE_LOOSE_LEVEL "+looseJson);
                    return;
                }
                catch(Exception e)
                {
                    // 多课程 JSON：自动取第一个可玩课程（物理优先）再试一次
                    try
                    {
                        var raw=Newtonsoft.Json.Linq.JObject.Parse(File.ReadAllText(looseJson));
                        string cid=null;
                        foreach(var c in (Newtonsoft.Json.Linq.JArray)raw["courses"])
                        {
                            if(cid==null)cid=(string)c["id"];
                            if((string)c["kind"]=="physics"||(string)c["nativeKind"]=="physics"){cid=(string)c["id"];break;}
                        }
                        var loose=LoadImport(looseJson,false,out _,cid);
                        CommitCandidate(loose,NativeGameplayRules.EditorBuild15,false);
                        Debug.Log("MAINLINE_LOOSE_LEVEL "+looseJson+" course="+cid);
                        return;
                    }
                    catch(Exception e2){Debug.LogWarning("MAINLINE_LOOSE_LEVEL_FAILED "+looseJson+" : "+e.Message+" / "+e2.Message);}
                }
            }
            string looseZip=FindLooseLevelFile("*.zip");
            if(looseZip!=null)
            {
                try
                {
                    var loose=LoadImport(looseZip,false,out _);
                    CommitCandidate(loose,NativeGameplayRules.EditorBuild15,false);
                    Debug.Log("MAINLINE_LOOSE_PACK "+looseZip);
                    return;
                }
                catch(Exception e){Debug.LogWarning("MAINLINE_LOOSE_PACK_FAILED "+looseZip+" : "+e.Message);}
            }
            // ② 内置关卡包
            string path=Path.Combine(Application.streamingAssetsPath,"RoomLabNative","Mainline","mainline.zip");
            var project=LoadImport(path,true,out _);
            CommitCandidate(project,NativeGameplayRules.EditorBuild15,false);
            identity="mainline-player-v2";
            ImportLegacyPlayerProgress();
            ReadRecord();
        }
        // exe 同级 "关卡" 目录：优先 关卡.json / mainline.zip，其次该目录里第一个同类型文件
        string FindLooseLevelFile(string pattern)
        {
            // 两个位置都找：exe 同级的 关卡\，以及 exe 上一层目录的 关卡\
            string[] roots={
                Path.GetFullPath(Path.Combine(Application.dataPath,"..","关卡")),
                Path.GetFullPath(Path.Combine(Application.dataPath,"..","..","关卡")),
            };
            string name=pattern=="*.json"?"关卡.json":"mainline.zip";
            foreach(var root in roots)
            {
                if(!Directory.Exists(root))continue;
                string preferred=Path.Combine(root,name);
                if(File.Exists(preferred))return preferred;   // 只认固定文件名，避免参考资料被误加载
            }
            return null;
        }
        void RootActivate(){world.Root.SetActive(true);}
        void SetGame(NativeMotion g){DrainAutoSaves();NativeDisplayCopy.Apply(g);var next=new NativePixelWorld(g,assets,isBuiltin);next.Refresh(0,view,map);var old=world;Game=g;world=next;world.Root.SetActive(true);old.Dispose();loadedRoom=g.Room.Id;lastCheckpoint=g.Checkpoint.id;timeline.Reset();keys.Clear();lastEvent=null;}
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
            string[] names={"物理","高数","水课"};
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
        string ThemeHint()=>NativeDisplayCopy.Active(Game)?NativeDisplayCopy.Text(Game,"notes"):Game.IsRework?(Game.Course.Kind=="calculus"?"纸上的路，总还有另一种写法。":Game.Course.Kind=="slacker"?"钟声快响了。窗外似乎换了天。":"楼梯封了。实验记录还在上面。"):Game.Course.Kind=="calculus"?"踩积分板聚合搭桥 · 踩求导板展开道路":Game.Course.Kind=="slacker"?"踩签到板记录 · 清醒板加速前进":"按 "+KeyName()+" 启动 AI · 引 AI 去吃收藏品";
        bool HasProgress(){return discoveredRooms.Count>1||storyRoom!=null||!(Game!=null&&Game.Score==0&&Game.Tokens==0);}
        bool TryLocateWorldText(RectTransform parent,Vector3 position,out Vector2 local)
        {
            local=default;
            if(view==null||worldImage==null||parent==null)return false;
            var uv=view.WorldToViewportPoint(position);
            if(uv.z<=0||uv.x<0||uv.x>1||uv.y<0||uv.y>1)return false;
            var field=worldImage.rectTransform;
            var point=field.TransformPoint(new Vector3(field.rect.xMin+uv.x*field.rect.width,
                field.rect.yMin+uv.y*field.rect.height,0));
            var projected=parent.InverseTransformPoint(point);
            local=new Vector2(projected.x,projected.y)-parent.rect.center;
            return true;
        }

        void TickLocatedTutorial(bool firstRoom)
        {
            if(tutorial==null)return;
            var tr=tutorial.rectTransform;
            var position=new Vector3(Game.Entry.X+1f,Game.Room.Rows-Game.Entry.Y+3f,0);
            Vector2 local=default;
            tutorial.enabled=page=="play"&&firstRoom&&TryLocateWorldText(tr.parent as RectTransform,position,out local);
            if(!tutorial.enabled)return;
            tutorial.text="AD / ←→ 移动\n空格 跳跃\nShift 冲刺";
            tutorial.fontSize=12;tutorial.alignment=TextAnchor.UpperLeft;
            tr.anchorMin=tr.anchorMax=new Vector2(.5f,.5f);
            tr.pivot=new Vector2(0,1);
            tr.anchoredPosition=local;
            tr.sizeDelta=new Vector2(160,54);
        }

        // 交付方块 / 助手方块上的常驻小字（小号、贴在方块上方、随房间重建）
        bool ShowFirstAssistantRoomHint()
        {
            if(Game==null||page!="play"||storyActive||!Game.IsEditorBuild15||
                !Game.Room.Objects.Exists(o=>o.Type=="common.aiStart"||o.Type=="common.aiStartHollow"))return false;
            if(!assistantHintRooms.Add(Game.Course.Id+"/"+Game.Room.Id))return false;
            ShowStory(new[]{"你无法自己完成任务……","需要寻找帮手。"},true,null,true);
            return true;
        }
        Text teaReturnHint;
        void TickTeaReturnHint()
        {
            var parent=NativeUiKit.PageRoot as RectTransform;
            var entry=Game.ReturnEntry;
            if(page!="play"||parent==null||Game.Room.Id!="room-mwixuwlb-l0h52r"||entry==null){
                if(teaReturnHint!=null)teaReturnHint.enabled=false;
                return;
            }
            if(teaReturnHint==null){
                teaReturnHint=NativeUiKit.AbsLabel(parent,0,0,130,17,"门内站 1.5 秒可返回",9,Color.white,TextAnchor.MiddleCenter);
                teaReturnHint.raycastTarget=false;
                teaReturnHint.rectTransform.anchorMin=teaReturnHint.rectTransform.anchorMax=new Vector2(.5f,.5f);
                teaReturnHint.rectTransform.pivot=new Vector2(.5f,.5f);
                var outline=teaReturnHint.gameObject.AddComponent<UnityEngine.UI.Outline>();
                outline.effectColor=new Color(.05f,.09f,.12f,.9f);
            }
            var rect=Game.EntryRect(entry);
            var tip=new Vector3((float)(rect.x+rect.w*.5)/32,Game.Room.Rows-(float)(rect.y+rect.h-100)/32,0);
            teaReturnHint.enabled=TryLocateWorldText(parent,tip,out var position);
            if(teaReturnHint.enabled){
                teaReturnHint.rectTransform.anchoredPosition=new Vector2(
                    Mathf.Clamp(position.x,parent.rect.xMin+70,parent.rect.xMax-70),
                    Mathf.Clamp(position.y,parent.rect.yMin+12,parent.rect.yMax-18));
            }
        }

        void TickBlockHints()
        {
            if (Game == null || NativeUiKit.PageRoot == null || page!="play") return;
            if (blockHintRoom != Game.Room.Id || blockHintPage!=NativeUiKit.PageRoot)
            {
                blockHintRoom = Game.Room.Id;blockHintPage=NativeUiKit.PageRoot;
                foreach (var kv in blockHints) if (kv.Value != null) Destroy(kv.Value.gameObject);
                blockHints.Clear();
                foreach (var o in Game.Room.Objects)
                {
                    if (o.Type != "common.aiStart" && o.Type != "common.aiStartHollow" && o.Type != "common.assignmentSubmit") continue;
                    var lbl = NativeUiKit.AbsLabel(NativeUiKit.PageRoot, 0f, 0f, 210f, 46f, "", 9, Color.white, TextAnchor.LowerCenter);
                    lbl.raycastTarget = false;
                    var rt = lbl.rectTransform;
                    rt.anchorMin = rt.anchorMax = new Vector2(.5f, .5f);
                    rt.pivot = new Vector2(.5f, .5f);
                    blockHints[o.Id] = lbl;
                }
            }
            var parent = NativeUiKit.PageRoot as RectTransform;
            if (parent == null) return;
            foreach (var kv in blockHints)
            {
                var lbl = kv.Value;
                if (lbl == null) continue;
                NativeObject o = null;
                foreach (var cand in Game.Room.Objects) if (cand.Id == kv.Key) { o = cand; break; }
                if (o == null) { lbl.enabled = false; continue; }
                var r = Game.ObjectRect(o);
                var world = new Vector3((float)(r.x + r.w * .5) / 32f, Game.Room.Rows - (float)(r.y + r.h * .5) / 32f, 0f);
                if (!TryLocateWorldText(parent,world,out var local)) { lbl.enabled = false; continue; }
                lbl.rectTransform.anchoredPosition = local + new Vector2(0f, 30f);
                lbl.enabled=Math.Abs(Game.Player.x-r.x)<96&&Math.Abs(Game.Player.y-r.y)<72&&
                    (o.Type=="common.assignmentSubmit"?!Game.ObjectStates[o.Id].fired:!Game.AI.active);
                lbl.text=o.Type=="common.assignmentSubmit"?"按 "+KeyName()+" 提交作业":"按 "+KeyName()+" 消耗 Token 启动 AI";
                lbl.color=Color.white;
            }
        }
        void HideStory(){storyQueue.Clear();artifactNotices.Clear();if(artifactNotice!=null){Destroy(artifactNotice.gameObject);artifactNotice=null;}storyDone=null;storyActive=false;storyAutoHideAt=0;if(Game!=null)Game.StoryPaused=false;SetStoryVisible(false);}
        void TryNewGame()
        {
            HideStory();
            if(!HasProgress()){NewGame();return;}
            Show("new-game");           // 手机内的确认页面
        }
        // 手机页面：开始新游戏确认（与设置页同款，选项都在手机屏幕里）
        void BuildNewGameConfirm(Transform root)
        {
            var screen=BuildMenuArt(root,false);
            var top=NativeUiKit.Column(screen,"New game header",1,0,0);
            top.anchorMin=top.anchorMax=new Vector2(0,1);top.pivot=new Vector2(0,1);
            top.anchoredPosition=new Vector2(9,-10);top.sizeDelta=new Vector2(131,0);
            PhoneMenuButton(top,"返回","ui-icon-back",()=>Show("menu"));
            NativeUiKit.Label(top,"开始新游戏？",15,Paper,TextAnchor.MiddleLeft);
            var body=NativeUiKit.Column(top,"New game body",3,8,6);
            NativeUiKit.Label(body,"当前已有进度。",10,Paper,TextAnchor.UpperLeft);
            NativeUiKit.Label(body,"开始新游戏会清空全部进度。",10,Paper,TextAnchor.UpperLeft);
            NativeUiKit.Label(body,"确定要清空并重新开始吗？",10,Orange,TextAnchor.UpperLeft);
            PhoneMenuButton(top,"确定清空并开始","ui-icon-level",()=>{HideStory();NewGame();},true);
            PhoneMenuButton(top,"取消","ui-icon-back",()=>Show("menu"));
        }
        bool playerRunStarted;
        void NewGame(){playerRunStarted=true;HideStory();assistantHintRooms.Clear();guidanceSeen.Clear();guidanceRoom=null;storyRoom=null;discoveredRooms.Clear();roomReached=0;high=0;journal.Clear();try{if(File.Exists(SaveFile))File.Move(SaveFile,SaveFile+".before-new-game-"+DateTime.UtcNow.Ticks);}catch{}SetGame(new NativeMotion(Game.Project,rules:Game.Rules));tainted=false;notice=ThemeHint();SaveProgress();
            Show("play");
        }
        static readonly HashSet<string> LegacyMainlineSources=new HashSet<string>(StringComparer.OrdinalIgnoreCase){
            "392d857ed6db107158fba239079bba36af5b018d3c0d0a62dbef0df34ced1a23",
            "f41b2dc8f623f6d5f3f54fbbfb8bd66212c77e1d90015824d1c94e5224d4cedb"
        };
        NativeMotion RestorePlayerContinuation(JObject saved)
        {
            if(identity=="mainline-player-v2"&&(string)saved["source"]!=Game.Project.SourceSha256)
                return NativeMotion.FromMainlineRevision(Game.Project,saved,Game.Rules);
            return NativeMotion.FromContinuation(Game.Project,saved,Game.Rules);
        }

        void ImportLegacyPlayerProgress()
        {
            if(verify||matrix||mapShot)return;
            var marker=Path.Combine(saveDirectory,"legacy-mainline-reconciled-v2");
            if(File.Exists(marker))return;
            JObject current=null;
            if(File.Exists(SaveFile)){
                try{current=JObject.Parse(File.ReadAllText(SaveFile));}
                catch(Exception error){Debug.LogWarning("MAINLINE_SAVE_MIGRATION "+error.Message);return;}
                var currentProgress=current["continuation"] as JObject;
                bool atResetStart=(string)currentProgress?["room"]==Game.Course.Rooms[0].Id&&
                    (int?)currentProgress?["checkpoint"]?["score"]==0&&
                    (current["discovered"] as JArray)?.Count>1;
                if(!atResetStart)return;
            }

            var old=Path.Combine(Application.persistentDataPath,"mainline-formal-20261126-clean-v1");
            if(!Directory.Exists(old))return;
            foreach(var path in new DirectoryInfo(old).GetFiles("import-*-EditorBuild15.json").OrderByDescending(f=>f.LastWriteTimeUtc)){
                try{
                    if(path.Length>4*1024*1024)continue;
                    var data=JObject.Parse(File.ReadAllText(path.FullName));
                    if(!(data["continuation"] is JObject saved)||!LegacyMainlineSources.Contains((string)saved["source"]))continue;
                    if(current!=null&&((string)saved["room"]==Game.Course.Rooms[0].Id||
                        ((int?)saved["checkpoint"]?["score"]??0)<=0))continue;
                    var restored=RestorePlayerContinuation(saved);
                    data["continuation"]=restored.ExportContinuation();
                    data["identity"]=identity;
                    var temp=SaveFile+".migration.tmp";
                    File.WriteAllText(temp,data.ToString());
                    if(current!=null)File.Replace(temp,SaveFile,SaveFile+".before-recovery-"+DateTime.UtcNow.Ticks);
                    else File.Move(temp,SaveFile);
                    File.WriteAllText(marker,restored.Room.Id);
                    Debug.Log("MAINLINE_SAVE_MIGRATED room="+restored.Room.Id+" score="+restored.Score);
                    return;
                }catch(Exception error){Debug.LogWarning("MAINLINE_SAVE_MIGRATION "+error.Message);}
            }
        }
        bool CanContinue(){try{if(new FileInfo(SaveFile).Length>4*1024*1024)return false;var data=JObject.Parse(File.ReadAllText(SaveFile));if(data["continuation"] is JObject saved){RestorePlayerContinuation(saved);return true;}}catch{}return false;}
        void Continue(){try{var saved=(JObject)JObject.Parse(File.ReadAllText(SaveFile))["continuation"];SetGame(RestorePlayerContinuation(saved));playerRunStarted=true;tainted=false;notice="已从最近检查点恢复";Debug.Log("PLAYER_CONTINUED room="+Game.Room.Id+" checkpoint="+Game.Checkpoint.id+" player="+Game.Checkpoint.x+","+Game.Checkpoint.y+" assistant="+Game.AI.active+" "+Game.AI.x+","+Game.AI.y+" score="+Game.Score);Show("play");}catch(Exception e){notice="存档不可用，已安全返回菜单："+e.Message;Show("menu");}}
        void Retry(){Game.Retry();notice="已恢复最近检查点";Show("play");}
        void ReadRecord(){journal.Clear();high=roomReached=0;try{var data=JObject.Parse(File.ReadAllText(SaveFile));high=Math.Max(0,(int?)data["high"]??0);discoveredRooms.Clear();foreach(var token in data["discovered"] as JArray??new JArray()){var id=(string)token;if(!string.IsNullOrEmpty(id))discoveredRooms.Add(id);}roomReached=Math.Max(0,(int?)data["roomReached"]??0);if(data["journal"] is JArray recorded)foreach(var item in recorded){string key=(string)item;foreach(var r in Game.Course.Rooms)foreach(var o in r.Objects)if(o.Type=="common.collectible"&&key==r.Id+"/"+o.Id)journal.Add(key);}}catch{}}
        void SaveProgress(){if(Game==null||identity=="mainline-player-v2"&&!playerRunStarted||tainted||Game.DeveloperEnabled||Game.Completed)return;roomReached=Visited();SaveRecord(true);}
        void SaveRecord(bool continuation){if(identity=="mainline-player-v2"&&!playerRunStarted)return;if(Game.IsContactAutosave)continuation=false;try{UpdateJournal();var data=new JObject{{"version",1},{"identity",identity},{"high",high},{"roomReached",roomReached},{"journal",new JArray(journal)},{"discovered",new JArray(discoveredRooms)},{"lastRun",new JObject{{"seconds",Game.Elapsed},{"deaths",Game.Deaths},{"collected",Game.CampaignCollected},{"complete",Game.Completed}}},{"continuation",continuation?(JToken)Game.ExportContinuation():null}};var temp=SaveFile+".tmp";File.WriteAllText(temp,data.ToString());if(File.Exists(SaveFile))File.Replace(temp,SaveFile,null);else File.Move(temp,SaveFile);}catch(Exception e){notice="保存失败："+e.Message;Debug.LogWarning("NATIVE_SAVE_FAILED "+e.Message);}}
        string SettingsFile{get{return Path.Combine(saveDirectory,"settings-autosave-v1.json");}}
        void LoadSettings(){
            legacy=RoomLabKeyBindings.Load();
            for(int i=0;i<5;i++)bindings[i]=legacy.GetKey((RoomLabKeyBindings.ActionId)i,0);
            try
            {
                var d=JObject.Parse(File.ReadAllText(SettingsFile));
                if((int?)d["version"]==1)
                {
                    volume=Mathf.Clamp01((float?)d["volume"]??.55f);musicEnabled=(bool?)d["musicEnabled"]??true;musicVolume=Mathf.Clamp01((float?)d["musicVolume"]??.55f);effectsVolume=Mathf.Clamp01((float?)d["effectsVolume"]??.85f);
                    tutorialSeen=(bool?)d["tutorialSeen"]==true;courseMapPreferred=(bool?)d["courseMapPreferred"]??true;
                    viewMax=Mathf.Clamp((float?)d["viewMax"]??1.3f,1f,1.6f);
                    importLegacyRules=(bool?)d["importLegacyRules"]==true;
                    importedLevel=(string)d["importedLevel"]??"";importedCourseId=(string)d["importedCourseId"]??"";builtinCourseId=(string)d["builtinCourseId"]??"autosave:physics";
                    NativeCameraView.Zoom=viewMax;
                    int w=(int?)d["width"]??1280,h=(int?)d["height"]??720;
                    if(w>=640&&w<=7680&&h>=360&&h<=4320){desiredWidth=w;desiredHeight=h;}
                    desiredFull=(bool?)d["fullscreen"]==true;
                    var b=(JArray)d["bindings"];
                    if(b!=null&&b.Count==6){var seen=new HashSet<int>();for(int i=0;i<6;i++){int n=(int)b[i];if(!Enum.IsDefined(typeof(KeyCode),n)||n==(int)KeyCode.Escape||n==(int)KeyCode.M||n==(int)KeyCode.R||!seen.Add(n))throw new Exception("坏键位");if(i==5)bindings[i]=(KeyCode)n;}}
                }
            }
            catch{}
            if(!verify&&!matrix&&!mapShot)Screen.SetResolution(desiredWidth,desiredHeight,desiredFull?FullScreenMode.FullScreenWindow:FullScreenMode.Windowed);
            AudioListener.volume=volume;
        }
        void SaveSettings(){var list=new JArray();foreach(var b in bindings)list.Add((int)b);string temporary=SettingsFile+"."+Guid.NewGuid().ToString("N")+".tmp";File.WriteAllText(temporary,new JObject{{"version",1},{"volume",volume},{"musicEnabled",musicEnabled},{"musicVolume",musicVolume},{"effectsVolume",effectsVolume},{"tutorialSeen",tutorialSeen},{"courseMapPreferred",courseMapPreferred},{"viewMax",viewMax},{"importLegacyRules",importLegacyRules},{"importedLevel",importedLevel},{"importedCourseId",importedCourseId},{"builtinCourseId",builtinCourseId},{"bindings",list},{"fullscreen",desiredFull},{"width",desiredWidth},{"height",desiredHeight}}.ToString());if(File.Exists(SettingsFile))File.Replace(temporary,SettingsFile,null);else File.Move(temporary,SettingsFile);}
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
        static readonly string[] SfxKeys={"ai_start","ai_steal","ai_warning","big_token","charge","checkpoint","collectible","dash","death_ai","death_fall","death_spike","finish","ice_create","ice_melt","jet","jump","land","rail_end","rail_start","teleport","thermal","token","transform","ui_back","ui_confirm","ui_move"};
        static readonly string[] LegacyTones={"ui","jump","dash","coin","temperature","retry","finish"};
        // The approved pack ships as Resources/DeadlineAudio/<key>.wav and can still be replaced at
        // runtime through -nativeCustomAssetsPath (audio/). Whatever the pack or an override does not
        // provide keeps its original synthesised tone, so a build without the pack still makes noise.
        void CreateSounds(){int loaded=0;foreach(var key in SfxKeys){var clip=NativeAssetOverrides.Audio(key,Resources.Load<AudioClip>("DeadlineAudio/"+key));if(clip!=null){sounds[key]=clip;loaded++;}}
            Alias("ui","ui_confirm");Alias("coin","token");Alias("retry","death_fall");Alias("temperature","thermal");Alias("awake","charge");Alias("checkpoint","checkpoint");
            for(int k=0;k<LegacyTones.Length;k++)if(!sounds.ContainsKey(LegacyTones[k]))sounds[LegacyTones[k]]=Tone(LegacyTones[k],k);
            Debug.Log("NATIVE_SFX_PACK loaded="+loaded+"/"+SfxKeys.Length+" slots="+sounds.Count);}
        void Alias(string name,string target){if(!sounds.ContainsKey(name)&&sounds.TryGetValue(target,out var clip))sounds[name]=clip;}
        AudioClip Tone(string name,int index){int count=name=="finish"?11025:2205;var samples=new float[count];float hz=220+index*85;for(int i=0;i<count;i++)samples[i]=(Mathf.Sin(i*hz*2*Mathf.PI/22050)>0?1:-1)*.12f*(1-i/(float)count);var clip=AudioClip.Create(name,count,1,22050,false);clip.SetData(samples,0);return clip;}
        void Play(string name){if(speaker!=null&&sounds.TryGetValue(name,out var clip))speaker.PlayOneShot(clip);}
        void PumpSounds(){int start=lastEvent==null?0:Game.Events.IndexOf(lastEvent)+1;for(int i=start;i<Game.Events.Count;i++){var e=Game.Events[i];string type=(string)e["type"];if(type=="collect"&&(string)e["by"]=="ai"&&!tainted&&!Game.DeveloperEnabled){journal.Add((string)e["room"]+"/"+(string)e["id"]);SaveRecord(!Game.Completed);}if(type=="checkpoint"&&Game.IsAwarenessResource)SaveProgress();if(type=="checkin")notice="签到成功：第 "+(int?)e["count"]+" 次记录";else if(type=="awake")notice=Game.IsRework?"视线变化了":"清醒：短暂加速";else if(type=="calculus-integral")notice="积分：机关砖向目标聚合";else if(type=="calculus-derivative")notice="求导：机关砖向目标展开";MainlineCopyOnEvent(type,e);var cue=SoundFor(type,e);if(cue!=null)Play(cue);}if(Game.Events.Count>0)lastEvent=Game.Events[Game.Events.Count-1];}
        // Runtime event -> approved pack key. Unknown events stay silent instead of guessing.
        string SoundFor(string type,JToken e){
            switch(type){
                case "collect":{if((string)e["by"]=="ai")return "collectible";var ot=(string)e["objectType"];if(ot!=null&&ot.StartsWith("item."))return "collectible";
                    var id=(string)e["id"];if(Game!=null)foreach(var o in Game.Room.Objects)if(o.Id==id)return o.Type=="common.small"?"token":"big_token";return "token";}
                case "steal":return "ai_steal";
                case "retry":return DeathSound((string)e["reason"]);
                case "temperature":return "thermal";
                case "ice-melt":return "ice_melt";
                case "ice-create":return "ice_create";
                case "room-enter":return "teleport";
                case "ai-start":return "ai_start";
                case "ai-warning":return "ai_warning";
                case "rail-start":return "rail_start";
                case "rail-end":return "rail_end";
                case "calculus-integral":case "calculus-derivative":return "transform";
                case "checkin":case "checkpoint":return "checkpoint";
                case "awake":return "charge";
                case "jump":case "land":case "dash":case "jet":case "finish":case "transform":return type;
                default:return null;
            }
        }
        // The runtime tells spike / fall / AI deaths apart only through the retry reason text.
        static string DeathSound(string reason){if(string.IsNullOrEmpty(reason))return "death_fall";
            if(reason.Contains("AI")||reason.Contains("抓到"))return "death_ai";
            if(reason.Contains("尖刺")||reason.Contains("刺"))return "death_spike";
            return "death_fall";}
        // Remember a manually resized window even when the adaptive mode is off, so the next launch
        // keeps the size the player dragged to instead of falling back to an old preset.
        void Quit(){DrainAutoSaves();SaveProgress();if(!Screen.fullScreen){desiredWidth=Mathf.Clamp(Screen.width,640,7680);desiredHeight=Mathf.Clamp(Screen.height,360,4320);}SaveSettings();Application.Quit();}
        static string Evidence(){var args=Environment.GetCommandLineArgs();int i=Array.IndexOf(args,"-nativeEvidencePath");return i>=0?args[i+1]:Path.GetFullPath(Path.Combine(Application.dataPath,"../NativePhysicsEvidence"));}
        static void Finish(int code){
#if UNITY_EDITOR
            UnityEditor.EditorApplication.Exit(code);
#else
            Application.Quit(code);
#endif
        }
        // 成品里也能出图：离屏渲染 UI 层后写 PNG（ScreenCapture 在本工程不可用）。
        void WriteShot(string file)
        {
            var go = new GameObject("Map shot camera");
            var cam = go.AddComponent<Camera>();
            cam.enabled = false; cam.clearFlags = CameraClearFlags.SolidColor; cam.backgroundColor = Color.black;
            cam.cullingMask = 1 << 5; cam.transform.position = new Vector3(0, 0, -1);
            var rt = RenderTexture.GetTemporary(Screen.width, Screen.height, 24);
            var before = RenderTexture.active;
            Texture2D image = null;
            try
            {
                cam.targetTexture = rt; canvas.renderMode = RenderMode.ScreenSpaceCamera; canvas.worldCamera = cam; canvas.planeDistance = 1;
                if(storyCanvas!=null&&storyActive){
                    storyCanvas.renderMode=RenderMode.ScreenSpaceCamera;storyCanvas.worldCamera=cam;storyCanvas.planeDistance=.9f;
                }
                Canvas.ForceUpdateCanvases(); view.Render(); cam.Render(); RenderTexture.active = rt;
                image = new Texture2D(rt.width, rt.height, TextureFormat.RGB24, false);
                image.ReadPixels(new Rect(0, 0, rt.width, rt.height), 0, 0); image.Apply();
                Directory.CreateDirectory(Evidence());
                File.WriteAllBytes(file, image.EncodeToPNG());
                Debug.Log("NATIVE_MAP_SHOT wrote " + file);
            }
            finally
            {
                canvas.renderMode = RenderMode.ScreenSpaceOverlay; canvas.worldCamera = null;
                if(storyCanvas!=null){storyCanvas.renderMode=RenderMode.ScreenSpaceOverlay;storyCanvas.worldCamera=null;}
                RenderTexture.active = before; cam.targetTexture = null; RenderTexture.ReleaseTemporary(rt);
                if (image != null) Destroy(image); Destroy(go);
            }
        }
        // 成品里也能出图：-nativeMapShot 打开地图两种模式并各截一张，便于验收。
        IEnumerator MapShot()
        {
            yield return null;
            ShowStartupIntro(true);
            if(!storyKeyHint.text.Contains("Esc")||!TrySkipStartupIntro()||page!="menu")
                throw new Exception("Returning startup must support Esc");
            ShowStartupIntro(false);
            if(TrySkipStartupIntro()||storyKeyHint.text.Contains("Esc"))
                throw new Exception("First startup must play all pages");
            if(!storyActive||storyIdx!=0||storyFull!="2026年冬"||!Game.StoryPaused)throw new Exception("Intro first page missing");
            var teaRoom=Game.Course.Rooms.Find(r=>r.Objects.Exists(o=>o.Type=="item.icedTea"));
            var tea=teaRoom.Objects.Find(o=>o.Type=="item.icedTea");
            MainlineCopyOnEvent("collect",new JObject{{"id",tea.Id},{"room",teaRoom.Id}});
            if(storyQueue.Count!=1||storyIdx!=0)throw new Exception("Pickup overwrote intro");
            AdvanceStoryPage();
            if(storyIdx!=0||storyText.text!="2026年冬")throw new Exception("Intro reveal skipped the page");
            WriteShot(Path.Combine(Evidence(),"story-intro-first.png"));
            for(int i=0;i<4;i++){
                AdvanceStoryPage();
                if(storyIdx!=i+1)throw new Exception("Intro page out of order");
                AdvanceStoryPage();
            }
            AdvanceStoryPage();
            if(storyIdx!=0||storyText.text!=ItemCopy["item.icedTea"][0])throw new Exception("Pickup copy not first");
            WriteShot(Path.Combine(Evidence(),"story-pickup-copy.png"));
            AdvanceStoryPage();
            if(storyIdx!=1||storyText.text!=ItemCopy["item.icedTea"][1])throw new Exception("Pickup effect not second");
            WriteShot(Path.Combine(Evidence(),"story-pickup-effect.png"));
            AdvanceStoryPage();
            if(storyActive||Game.StoryPaused)throw new Exception("Story left gameplay paused");
            Debug.Log("STORY_ORDER_PASS startup=5 firstNoSkip=true returningEsc=true pickup=2 queue=1");
            HideStory();
            Show("play");
            var artifactRoom=Game.Course.Rooms.Find(r=>r.Objects.Exists(o=>o.Type=="common.collectible"));
            var artifact=artifactRoom.Objects.Find(o=>o.Type=="common.collectible");
            MainlineCopyOnEvent("collect",new JObject{{"id",artifact.Id},{"room",artifactRoom.Id}});
            float toastStart=Time.unscaledTime;
            TickArtifactNotice(toastStart);
            TickArtifactNotice(toastStart+.3f);
            if(artifactNotice==null||storyActive||Game.StoryPaused)throw new Exception("Artifact notification blocked gameplay");
            WriteShot(Path.Combine(Evidence(),"artifact-notification.png"));
            TickArtifactNotice(toastStart+3.01f);
            if(artifactNotice!=null)throw new Exception("Artifact notification exceeded three seconds");
            double priorY=Game.Player.y;
            for(int i=0;i<2;i++){
                bool playerAbove=i==0;
                float cameraY=view.transform.position.y;
                Game.Player.y=(Game.Room.Rows-cameraY+(playerAbove?-1f:1f))*32f-Game.Player.h*.5;
                artifactNotices.Enqueue(("藏品标题","藏品正文"));
                float sample=toastStart+4f+i*4f;
                TickArtifactNotice(sample);
                TickArtifactNotice(sample+.3f);
                if(artifactNotice.anchorMin.y!=(playerAbove?0f:1f)||artifactNotice.localScale.x!=.5f||artifactNotice.localScale.y!=.5f)
                    throw new Exception("Artifact notification corner or scale is wrong");
                TickArtifactNotice(sample+3.01f);
            }
            Game.Player.y=priorY;
            Debug.Log("ARTIFACT_NOTICE_PASS corners=2 scale=0.5 duration=3");
            for(int i=0;i<45&&!Game.Player.grounded;i++)Game.Tick(NativeMotion.Step);
            if(Game.Player.grounded){
                int before=Game.Events.Count;
                Game.Tick(NativeMotion.Step,new MotionInput{jumpPressed=true});
                world.Refresh(1f/60f,view,map);
                if(Game.Events.FindIndex(before,e=>(string)e["type"]=="jump")>=0)
                    WriteShot(Path.Combine(Evidence(),"fx-jump.png"));
                for(int i=0;i<140&&!Game.Player.grounded;i++){
                    Game.Tick(NativeMotion.Step);
                    world.Refresh(NativeMotion.Step,view,map);
                }
                if(Game.Player.grounded)WriteShot(Path.Combine(Evidence(),"fx-land.png"));
            }
            foreach (var room in Game.Course.Rooms) { if (discoveredRooms.Count >= 14) break; discoveredRooms.Add(room.Id); }
            Directory.CreateDirectory(Evidence());
            courseMapPreferred = true;
            var railRoom = Game.Course.Rooms.Find(room => room.Id == "rail-room");
            if (railRoom != null)
            {
                SetGame(new NativeMotion(Game.Project, Game.Course.Id, railRoom.Id, Game.Rules));
                Show("play");
                yield return new WaitForSecondsRealtime(0.4f);
                WriteShot(Path.Combine(Evidence(), "room-rail-background.png"));
            }
            // 交付方块所在房间的实机图（确认贴图与交互对象）
            var submitRoom = Game.Course.Rooms.Find(room => room.Id == "room-mvndxqmk-k9xt7n");
            if (submitRoom != null)
            {
                SetGame(new NativeMotion(Game.Project, Game.Course.Id, submitRoom.Id, Game.Rules));
                Show("play");
                yield return new WaitForSecondsRealtime(0.6f);
                WriteShot(Path.Combine(Evidence(), "room-submit.png"));
            }
            notice="已进入 喷气起跳";
            Show("collection");
            yield return new WaitForSecondsRealtime(1.0f);
            WriteShot(Path.Combine(Evidence(), "page-collection.png"));
            Show("pause");
            yield return new WaitForSecondsRealtime(1.0f);
            WriteShot(Path.Combine(Evidence(), "page-pause.png"));
            Show("menu");
            yield return new WaitForSecondsRealtime(1.0f);
            WriteShot(Path.Combine(Evidence(), "page-menu.png"));
            Show("won");
            yield return new WaitForSecondsRealtime(1.0f);
            WriteShot(Path.Combine(Evidence(), "page-won.png"));
            var phoneRoom=Game.Course.Rooms.Find(r=>r.Objects.Exists(o=>o.Type=="item.phone"));
            var phoneItem=phoneRoom.Objects.Find(o=>o.Type=="item.phone");
            Game.Credited.Add(phoneRoom.Id+"/"+phoneItem.Id);
            int maximum=(int)MaximumCourseScore();
            foreach(var band in new[]{(threshold:98,grade:"A+",below:"A"),(threshold:90,grade:"A",below:"B"),
                (threshold:80,grade:"B",below:"C"),(threshold:70,grade:"C",below:"D"),(threshold:60,grade:"D",below:"F")}){
                int boundary=(maximum*band.threshold+99)/100;
                Game.Score=boundary-1;
                if(GradeLetter()!=band.below)throw new Exception("Incorrect grade below threshold");
                Game.Score=boundary;
                if(GradeLetter()!=band.grade)throw new Exception("Incorrect grade at threshold");
            }
            foreach(var sample in new[]{(score:maximum,grade:"A+"),(score:maximum*95/100,grade:"A"),
                (score:maximum*85/100,grade:"B"),(score:maximum*75/100,grade:"C"),
                (score:maximum*65/100,grade:"D"),(score:maximum*59/100,grade:"F")}){
                Game.Score=sample.score;
                Show("won");
                var resultTexts=panels.GetComponentsInChildren<Text>();
                if(!Array.Exists(resultTexts,t=>t.text==sample.grade)||
                    !Array.Exists(resultTexts,t=>t.text==sample.score.ToString()))
                    throw new Exception("Phone result grade or score missing");
            }
            WriteShot(Path.Combine(Evidence(),"page-won-phone.png"));
            Debug.Log("PHONE_RESULT_GRADE_PASS A+ A B C D F maximum="+maximum);
            Show("play");
            yield return new WaitForSecondsRealtime(0.4f);
            WriteShot(Path.Combine(Evidence(), "hint-t0.png"));
            yield return new WaitForSecondsRealtime(3.0f);
            WriteShot(Path.Combine(Evidence(), "hint-t3.png"));
            Show("exploration-map");
            yield return new WaitForSecondsRealtime(1.2f);
            WriteShot(Path.Combine(Evidence(), "map-plate.png"));
            foreach (var room in Game.Course.Rooms) discoveredRooms.Add(room.Id);
            Show("exploration-map");
            yield return new WaitForSecondsRealtime(1.2f);
            WriteShot(Path.Combine(Evidence(), "map-plate-full.png"));
            yield return new WaitForSecondsRealtime(1.6f);
            SetMapPreference(false, true);
            yield return new WaitForSecondsRealtime(1.2f);
            WriteShot(Path.Combine(Evidence(), "map-panorama.png"));
            yield return new WaitForSecondsRealtime(1.6f);
            yield return CaptureReferencePauseResult();
            Debug.Log("NATIVE_MAP_SHOT done " + Evidence());
            Finish(0);
        }
        IEnumerator VerifyMainlineEdition()
        {
            yield return null;
            int result=0;
            try
            {
                if(Game.Rules!=NativeGameplayRules.EditorBuild15||Game.Course.Rooms.Count<1||Game.Course.Connections.Count<1||
                   Game.Room.Name!="喷气起跳")throw new Exception("主线房间数、接线数、起始房间或规则不一致");
                var course=Game.Course;
                var project=Game.Project;
                foreach(var room in course.Rooms)
                {
                    SetGame(new NativeMotion(project,course.Id,room.Id,NativeGameplayRules.EditorBuild15));
                    world.Refresh(0,view,false);
                }
                NewGame();
                if(!CanContinue())throw new Exception("主线继续记录未写入");
                Show("menu");
                Continue();
                if(page!="play"||Game.Room.Name!="喷气起跳")throw new Exception("主线继续记录恢复失败");
                Debug.Log("NATIVE_MAINLINE_PASS rooms="+Game.Course.Rooms.Count+" connections="+Game.Course.Connections.Count+" projectRooms="+Game.Project.RoomCount+" start="+Game.Room.Name);
            }
            catch(Exception error){Debug.LogException(error);result=2;}
            Finish(result);
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
