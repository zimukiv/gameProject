using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using UnityEngine;
using Debug=UnityEngine.Debug;
using Control=RoomLabKeyBindings.ActionId;

// The vendored RoomLab engine owns all gameplay. Unity only forwards input and displays its canvas.
public class RoomLabExactPlayer : MonoBehaviour
{
    public string editorRuntimeDirectory;
    [Serializable] public class Room { public string id,name,course; }
    [Serializable] public class Actor { public float x,y,w,h,vx,vy; public bool freeDash,grounded,paidDashUsed; public int dashCount; }
    [Serializable] public class DeveloperOptions { public bool enabled,lockHealth,flight; }
    [Serializable] public class State { public string mode,roomId; public int tokens,charges,recharge,score,deaths,steals; public Actor player; public DeveloperOptions developer; }
    [Serializable] public class MapRoom { public string id,name; public float x,y,w,h; }
    [Serializable] public class Frame { public int id; public State state; public Room[] rooms; public string png,roomName,message,mapView,previewRoomName; public MapRoom[] mapRooms; }
    [Serializable] public class InputData { public bool left,right,up,down,jumpPressed,dashPressed; }
    [Serializable] public class InputSample { public float dt; public InputData input; }
    [Serializable] public class Command { public int id,width,height; public float dt; public InputData input; public InputSample[] samples; public bool retry,pause; public string room,course,mapView,previewRoom; public float mapZoom,mapPanX,mapPanY; public DeveloperOptions developer; }
    private Process process;
    private TcpListener listener;
    private TcpClient client;
    private StreamWriter writer;
    private readonly ConcurrentQueue<string> received=new ConcurrentQueue<string>();
    private Texture2D texture;
    private Font font;
    private Frame frame;
    private bool pending,selectRoom,pauseMenu,edgeRetry;
    private bool developerMode,lockHealth,flight,mapPreview;
    private string mapScope="room",previewRoom;
    private float mapZoom=1;
    private Vector2 mapPan;
    private RoomLabKeyBindings bindings;
    private bool keyBindingsMenu;
    private int rebindAction=-1,rebindSlot,handledBindingFrame=-1;
    private string bindingMessage="点击按键后，按下新的键盘按键；Esc 取消。修改会自动保存。";
    private Vector2 bindingsScroll;
    private readonly List<InputSample> inputSamples=new List<InputSample>();
    private float lastReply;
    private int sequence,verified;
    private string failure;
    private string chosenRoom,chosenCourse;
    private Vector2 scroll;
    private bool verify;
    private void Start()
    {
        verify=Array.Exists(Environment.GetCommandLineArgs(),x=>x=="-roomLabExactVerify");
        bindings=RoomLabKeyBindings.Load();
        string root=Path.GetFullPath(Path.Combine(Application.dataPath,"..","RoomLabRuntime"));
#if UNITY_EDITOR
        string portableRuntime=Path.GetFullPath(Path.Combine(Application.dataPath,"..",".roomlab-runtime"));
        if(File.Exists(Path.Combine(portableRuntime,"RoomLabCore.exe")))root=portableRuntime;
        else if(!string.IsNullOrEmpty(editorRuntimeDirectory))root=editorRuntimeDirectory;
#endif
        listener=new TcpListener(IPAddress.Loopback,0);listener.Start();
        int port=((IPEndPoint)listener.LocalEndpoint).Port;
        new Thread(()=>{try{client=listener.AcceptTcpClient();listener.Stop();writer=new StreamWriter(client.GetStream()){AutoFlush=true};
            using(var reader=new StreamReader(client.GetStream())){string line;while((line=reader.ReadLine())!=null)received.Enqueue(line);}}
            catch(Exception error){received.Enqueue("ROOMLAB_ERROR "+error.Message);}}){IsBackground=true}.Start();
        var info=new ProcessStartInfo(Path.Combine(root,"RoomLabCore.exe"),"--roomlab-port="+port){
            WorkingDirectory=root,UseShellExecute=false,CreateNoWindow=true,
            WindowStyle=ProcessWindowStyle.Hidden};
        info.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
        process=new Process{StartInfo=info};
        try{process.Start();}
        catch(Exception error){failure=error.Message;Debug.LogException(error);return;}
        texture=new Texture2D(2,2,TextureFormat.RGBA32,false);
        font=Font.CreateDynamicFontFromOSFont("Microsoft YaHei",18);
        lastReply=Time.realtimeSinceStartup;
        Send(new Command());
    }
    private void Send(Command command)
    {
        if(writer==null)return;
        command.id=++sequence;command.width=Mathf.Max(200,Screen.width);command.height=Mathf.Max(200,Screen.height-110);
        command.developer=new DeveloperOptions{enabled=developerMode,lockHealth=developerMode&&lockHealth,flight=developerMode&&flight};
        command.mapView=developerMode&&mapPreview?mapScope:"";
        command.previewRoom=previewRoom;command.mapZoom=mapZoom;command.mapPanX=mapPan.x;command.mapPanY=mapPan.y;
        writer.WriteLine(JsonUtility.ToJson(command));pending=true;
    }
    private void Update()
    {
        if(failure!=null)return;
        if(frame==null&&!pending&&writer!=null)Send(new Command());
        while(received.TryDequeue(out string line))
        {
            if(line.StartsWith("ROOMLAB_ERROR ")){failure=line;Debug.LogError(line);if(verify)Application.Quit(2);return;}
            if(!line.StartsWith("ROOMLAB_FRAME "))continue;
            frame=JsonUtility.FromJson<Frame>(line.Substring(14));
            if(!string.IsNullOrEmpty(frame.png))texture.LoadImage(Convert.FromBase64String(frame.png));
            pending=false;lastReply=Time.realtimeSinceStartup;
            if(verify)
            {
                if(frame.state==null||frame.rooms.Length==0||texture.width<200){Debug.LogError("ROOMLAB_EXACT_UNITY_FAIL");Application.Quit(2);return;}
                if(++verified>=frame.rooms.Length){Debug.Log("ROOMLAB_EXACT_UNITY_PASS rooms="+frame.rooms.Length+" textures="+verified);Application.Quit(0);return;}
                Send(new Command{room=frame.rooms[verified].id,course=frame.rooms[verified].course,dt=.05f});
            }
        }
        if(verify){if(Time.realtimeSinceStartup-lastReply>45){Debug.LogError("ROOMLAB_EXACT_UNITY_TIMEOUT");Application.Quit(3);}return;}
        bool escape=GameInput.WasPressedExact(KeyCode.Escape);
        if(escape&&mapPreview)
        {mapPreview=false;escape=false;handledBindingFrame=Time.frameCount;}
        if(pauseMenu&&keyBindingsMenu&&rebindAction>=0)
        {
            if(escape)
            {
                rebindAction=-1;bindingMessage="已取消修改。";escape=false;
                handledBindingFrame=Time.frameCount;
            }
            else if(RoomLabKeyBindings.TryReadPressedKey(out KeyCode key))
            {
                handledBindingFrame=Time.frameCount;
                if(bindings.TryBind((Control)rebindAction,rebindSlot,key,out bindingMessage))
                {bindings.Save();rebindAction=-1;}
            }
        }
        bool menuChanged=false;
        if(escape&&keyBindingsMenu)
        {
            keyBindingsMenu=false;rebindAction=-1;handledBindingFrame=Time.frameCount;
        }
        else if(escape)menuChanged=true;
        if(menuChanged)
        {
            pauseMenu=!pauseMenu;
            selectRoom=false;chosenRoom=chosenCourse=null;
        }
        // Reconcile the menu with the acknowledged runtime state, including while a frame is in flight.
        // Never queue gameplay input or elapsed time while paused or on the frame that resumes play.
        if(pauseMenu||menuChanged||frame?.state?.mode=="paused")
        {
            inputSamples.Clear();edgeRetry=false;
            if(!pending&&frame!=null)Send(new Command{
                pause=pauseMenu?frame.state.mode=="playing":frame.state.mode=="paused"});
            return;
        }
        if(bindings.WasPressed(Control.SelectRoom))selectRoom=!selectRoom;
        edgeRetry|=bindings.WasPressed(Control.Retry);
        // Preserve every frame, including distinct presses while a PNG reply is in flight.
        inputSamples.Add(new InputSample{dt=Time.unscaledDeltaTime,input=new InputData{
            left=bindings.IsHeld(Control.Left),right=bindings.IsHeld(Control.Right),
            up=bindings.IsHeld(Control.Jump),down=bindings.IsHeld(Control.Crouch),
            jumpPressed=bindings.WasPressed(Control.Jump),dashPressed=bindings.WasPressed(Control.Dash)}});
        if(pending)return;
        var command=new Command{samples=inputSamples.ToArray(),retry=edgeRetry};
        if(chosenRoom!=null){command=new Command{room=chosenRoom,course=chosenCourse};chosenRoom=chosenCourse=null;}
        inputSamples.Clear();edgeRetry=false;Send(command);
    }
    private void OnGUI()
    {
        // A captured Space/Enter must not also activate the focused menu button.
        if(handledBindingFrame==Time.frameCount&&(Event.current.type==EventType.KeyDown||Event.current.type==EventType.KeyUp))Event.current.Use();
        if(font!=null)GUI.skin.font=font;
        if(texture!=null)GUI.DrawTexture(new Rect(0,110,Screen.width,Screen.height-110),texture,ScaleMode.StretchToFill);
        if(failure!=null){GUI.Label(new Rect(10,10,Screen.width-20,90),failure);return;}
        if(frame==null){GUI.Label(new Rect(10,10,600,40),"正在加载 RoomLab 2.5.2…");return;}
        var s=frame.state;
        GUI.Label(new Rect(10,5,Screen.width-180,25),frame.roomName+" · RoomLab 2.5.2 规则");
        GUI.Label(new Rect(10,30,Screen.width-20,25),$"Token {s.tokens}   免费冲刺 {(s.player.freeDash?"●":"○")}   付费库存 {s.charges}/3   落地前付费 {(s.player.paidDashUsed?"已用":s.charges>0?"可用":"无库存")}   积分 {s.score}   重试 {s.deaths}   {s.mode}");
        GUI.Label(new Rect(10,56,Screen.width-20,25),bindings.HelpText());
        string developerStatus=s.developer?.enabled==true?"开发者模式 · 锁血"+(s.developer.lockHealth?"开启":"关闭")+
            " · 飞行"+(s.developer.flight?"开启":"关闭")+"    ":"";
        GUI.Label(new Rect(10,82,Screen.width-20,25),developerStatus+(frame.message??""));
        if(mapPreview){DrawMapPreview();return;}
        if(pauseMenu){DrawPauseMenu();return;}
        if(GUI.Button(new Rect(Screen.width-130,5,120,28),"选择房间"))selectRoom=!selectRoom;
        if(selectRoom){GUILayout.BeginArea(new Rect(Screen.width-300,112,290,Screen.height-125),GUI.skin.box);
            scroll=GUILayout.BeginScrollView(scroll);foreach(var r in frame.rooms)if(GUILayout.Button(r.name,GUILayout.Height(30)))
            {selectRoom=false;inputSamples.Clear();chosenRoom=r.id;chosenCourse=r.course;}
            GUILayout.EndScrollView();GUILayout.EndArea();}
    }
    private void DrawPauseMenu()
    {
        Color previous=GUI.color;
        GUI.color=new Color(0,0,0,.7f);
        GUI.DrawTexture(new Rect(0,0,Screen.width,Screen.height),Texture2D.whiteTexture);
        GUI.color=previous;
        if(keyBindingsMenu){DrawKeyBindings();return;}
        float width=Mathf.Min(480,Screen.width-32);
        var panel=new Rect((Screen.width-width)/2,(Screen.height-454)/2,width,454);
        GUI.Box(panel,GUIContent.none);
        var title=new GUIStyle(GUI.skin.label){alignment=TextAnchor.MiddleCenter,fontSize=24};
        var hint=new GUIStyle(GUI.skin.label){alignment=TextAnchor.MiddleCenter,fontSize=14};
        var button=new GUIStyle(GUI.skin.button){fontSize=20};
        GUI.Label(new Rect(panel.x+16,panel.y+16,width-32,40),"游戏已暂停",title);
        GUI.Label(new Rect(panel.x+16,panel.y+60,width-32,26),"按 Esc 返回游戏",hint);
        if(GUI.Button(new Rect(panel.x+32,panel.y+96,width-64,38),"键位设置",button))
        {keyBindingsMenu=true;rebindAction=-1;bindingsScroll=Vector2.zero;}
        developerMode=GUI.Toggle(new Rect(panel.x+32,panel.y+152,width-64,30),developerMode,"开发者模式");
        if(!developerMode){lockHealth=false;flight=false;}
        bool previousEnabled=GUI.enabled;
        GUI.enabled=previousEnabled&&developerMode;
        lockHealth=GUI.Toggle(new Rect(panel.x+48,panel.y+192,width-80,30),lockHealth,"锁血（免疫尖刺和 AI）");
        flight=GUI.Toggle(new Rect(panel.x+48,panel.y+228,width-80,30),flight,"飞行（穿墙、无重力）");
        GUI.Label(new Rect(panel.x+48,panel.y+264,width-80,34),bindings.KeysLabel(Control.Jump)+" 上升 / "+
            bindings.KeysLabel(Control.Crouch)+" 下降，左右沿用移动键",hint);
        if(GUI.Button(new Rect(panel.x+48,panel.y+308,width-96,36),"全局地图预览",button))
        {mapPreview=true;mapScope="room";previewRoom=frame.state.roomId;mapZoom=1;mapPan=Vector2.zero;}
        GUI.enabled=previousEnabled;
        GUI.Label(new Rect(panel.x+16,panel.y+356,width-32,26),"锁血时掉落返回入口，"+bindings.KeysLabel(Control.Retry)+" 仍可重试",hint);
        if(GUI.Button(new Rect(panel.x+32,panel.y+390,width-64,48),"退出游戏",button))
        {
#if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying=false;
#else
            Application.Quit();
#endif
        }
    }
    private void DrawMapPreview()
    {
        GUI.Box(new Rect(8,114,Screen.width-16,74),GUIContent.none);
        GUI.Label(new Rect(20,118,Screen.width-40,24),"全局地图预览 · 游戏已暂停 · "+
            (mapScope=="course"?"全部房间":frame.previewRoomName));
        if(GUI.Button(new Rect(20,148,120,30),"当前房间全图"))
        {mapScope="room";previewRoom=frame.state.roomId;mapZoom=1;mapPan=Vector2.zero;}
        if(GUI.Button(new Rect(148,148,100,30),"全部房间"))
        {mapScope="course";mapZoom=1;mapPan=Vector2.zero;}
        bool previous=GUI.enabled;GUI.enabled=previous&&mapScope=="room";
        if(GUI.Button(new Rect(260,148,32,30),"−"))mapZoom=Mathf.Max(1,mapZoom/1.25f);
        if(GUI.Button(new Rect(298,148,32,30),"+"))mapZoom=Mathf.Min(8,mapZoom*1.25f);
        if(GUI.Button(new Rect(338,148,80,30),"适应全图")){mapZoom=1;mapPan=Vector2.zero;}
        GUI.enabled=previous;
        if(GUI.Button(new Rect(430,148,100,30),"返回菜单"))mapPreview=false;
        GUI.Label(new Rect(544,151,Screen.width-554,30),mapScope=="course"?"点击房间查看全图；Esc 返回菜单":"滚轮缩放 · 左键拖动平移 · Esc 返回菜单");
        if(mapScope=="course"&&frame.mapView=="course"&&frame.mapRooms!=null)
        {
            foreach(var room in frame.mapRooms)
                if(GUI.Button(new Rect(room.x,110+room.y,room.w,room.h),GUIContent.none,GUIStyle.none))
                {mapScope="room";previewRoom=room.id;mapZoom=1;mapPan=Vector2.zero;}
        }
        else if(mapScope=="room"&&Event.current.mousePosition.y>194)
        {
            if(Event.current.type==EventType.ScrollWheel)
            {mapZoom=Mathf.Clamp(mapZoom*Mathf.Pow(1.15f,-Event.current.delta.y),1,8);Event.current.Use();}
            else if(Event.current.type==EventType.MouseDrag&&Event.current.button==0)
            {mapPan+=Event.current.delta;Event.current.Use();}
        }
    }
    private void DrawKeyBindings()
    {
        float width=Mathf.Min(650,Screen.width-32),height=Mathf.Min(540,Screen.height-32);
        var panel=new Rect((Screen.width-width)/2,(Screen.height-height)/2,width,height);
        GUI.Box(panel,GUIContent.none);
        var title=new GUIStyle(GUI.skin.label){alignment=TextAnchor.MiddleCenter,fontSize=24};
        var status=new GUIStyle(GUI.skin.label){wordWrap=true,fontSize=14};
        GUI.Label(new Rect(panel.x+16,panel.y+12,width-32,38),"键位设置",title);
        GUI.Label(new Rect(panel.x+20,panel.y+54,width-40,46),rebindAction>=0?
            "正在修改“"+RoomLabKeyBindings.Label((Control)rebindAction)+"”：请按新键（Esc 取消）。\n"+bindingMessage:bindingMessage,status);
        float viewHeight=height-180;
        float contentWidth=Mathf.Max(596,width-54);
        bindingsScroll=GUI.BeginScrollView(new Rect(panel.x+16,panel.y+108,width-32,viewHeight),bindingsScroll,new Rect(0,0,contentWidth,365));
        float column=(contentWidth-112)/3;
        GUI.Label(new Rect(112,0,column,24),"主按键");
        GUI.Label(new Rect(112+column,0,column,24),"备用按键 1");
        GUI.Label(new Rect(112+column*2,0,column,24),"备用按键 2");
        for(int action=0;action<RoomLabKeyBindings.ActionCount;action++)
        {
            float y=30+action*42;
            GUI.Label(new Rect(4,y+5,104,30),RoomLabKeyBindings.Label((Control)action));
            for(int slot=0;slot<RoomLabKeyBindings.SlotCount;slot++)
            {
                bool waiting=rebindAction==action&&rebindSlot==slot;
                KeyCode key=bindings.GetKey((Control)action,slot);
                float x=112+slot*column;
                if(GUI.Button(new Rect(x,y,column-30,32),waiting?"请按新键…":RoomLabKeyBindings.KeyName(key)))
                {rebindAction=action;rebindSlot=slot;bindingMessage="Esc 取消；每项操作至少保留一个按键。";}
                bool enabled=GUI.enabled;GUI.enabled=enabled&&key!=KeyCode.None;
                if(GUI.Button(new Rect(x+column-28,y,24,32),"×"))
                {
                    rebindAction=-1;
                    if(bindings.TryBind((Control)action,slot,KeyCode.None,out bindingMessage))bindings.Save();
                }
                GUI.enabled=enabled;
            }
        }
        GUI.Label(new Rect(4,330,width-70,28),"暂停 / 返回菜单：Esc（固定）");
        GUI.EndScrollView();
        if(GUI.Button(new Rect(panel.x+20,panel.y+height-52,(width-52)/2,34),"恢复默认"))
        {bindings.ResetDefaults();bindings.Save();rebindAction=-1;bindingMessage="已恢复默认键位，并保存。";}
        if(GUI.Button(new Rect(panel.x+32+(width-52)/2,panel.y+height-52,(width-52)/2,34),"返回菜单"))
        {keyBindingsMenu=false;rebindAction=-1;}
    }
    private void OnDestroy()
    {
        try{writer?.WriteLine("{\"quit\":true}");}catch{}
        client?.Close();listener?.Stop();process?.Dispose();
        if(texture!=null)Destroy(texture);if(font!=null)Destroy(font);
    }
}
