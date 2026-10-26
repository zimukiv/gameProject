using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using UnityEngine;
using Debug=UnityEngine.Debug;

// The vendored RoomLab engine owns all gameplay. Unity only forwards input and displays its canvas.
public class RoomLabExactPlayer : MonoBehaviour
{
    public string editorRuntimeDirectory;
    [Serializable] public class Room { public string id,name,course; }
    [Serializable] public class Actor { public float x,y,w,h,vx,vy; public bool freeDash,grounded; public int dashCount; }
    [Serializable] public class State { public string mode,roomId; public int tokens,charges,recharge,score,deaths,steals; public Actor player; }
    [Serializable] public class Frame { public int id; public State state; public Room[] rooms; public string png,roomName,message; }
    [Serializable] public class InputData { public bool left,right,up,down,jumpPressed,dashPressed; }
    [Serializable] public class Command { public int id,width,height; public float dt; public InputData input; public bool retry,pause; public string room,course; }
    private Process process;
    private TcpListener listener;
    private TcpClient client;
    private StreamWriter writer;
    private readonly ConcurrentQueue<string> received=new ConcurrentQueue<string>();
    private Texture2D texture;
    private Font font;
    private Frame frame;
    private bool pending,selectRoom,pauseMenu,edgeJump,edgeDash,edgeRetry;
    private float elapsed,lastReply;
    private int sequence,verified;
    private string failure;
    private string chosenRoom,chosenCourse;
    private Vector2 scroll;
    private bool verify;
    private void Start()
    {
        verify=Array.Exists(Environment.GetCommandLineArgs(),x=>x=="-roomLabExactVerify");
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
        writer.WriteLine(JsonUtility.ToJson(command));pending=true;
    }
    private bool Held(KeyCode a,KeyCode b)=>GameInput.IsHeld(a)||GameInput.IsHeld(b);
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
        bool menuChanged=GameInput.WasPressed(KeyCode.Escape);
        if(menuChanged)
        {
            pauseMenu=!pauseMenu;
            selectRoom=false;chosenRoom=chosenCourse=null;
        }
        // Reconcile the menu with the acknowledged runtime state, including while a frame is in flight.
        // Never queue gameplay input or elapsed time while paused or on the frame that resumes play.
        if(pauseMenu||menuChanged||frame?.state?.mode=="paused")
        {
            elapsed=0;edgeJump=edgeDash=edgeRetry=false;
            if(!pending&&frame!=null)Send(new Command{
                pause=pauseMenu?frame.state.mode=="playing":frame.state.mode=="paused"});
            return;
        }
        if(GameInput.WasPressed(KeyCode.F1))selectRoom=!selectRoom;
        edgeJump|=GameInput.WasPressed(KeyCode.Space)||GameInput.WasPressed(KeyCode.W)||GameInput.WasPressed(KeyCode.UpArrow);
        edgeDash|=GameInput.WasPressed(KeyCode.LeftShift)||GameInput.WasPressed(KeyCode.RightShift);
        edgeRetry|=GameInput.WasPressed(KeyCode.R);
        elapsed+=Time.unscaledDeltaTime;
        if(pending)return;
        var command=new Command{dt=elapsed,input=new InputData{left=Held(KeyCode.A,KeyCode.LeftArrow),right=Held(KeyCode.D,KeyCode.RightArrow),
            up=Held(KeyCode.W,KeyCode.UpArrow),down=Held(KeyCode.S,KeyCode.DownArrow),jumpPressed=edgeJump,dashPressed=edgeDash},
            retry=edgeRetry};
        if(chosenRoom!=null){command=new Command{room=chosenRoom,course=chosenCourse};chosenRoom=chosenCourse=null;}
        elapsed=0;edgeJump=edgeDash=edgeRetry=false;Send(command);
    }
    private void OnGUI()
    {
        if(font!=null)GUI.skin.font=font;
        if(texture!=null)GUI.DrawTexture(new Rect(0,110,Screen.width,Screen.height-110),texture,ScaleMode.StretchToFill);
        if(failure!=null){GUI.Label(new Rect(10,10,Screen.width-20,90),failure);return;}
        if(frame==null){GUI.Label(new Rect(10,10,600,40),"正在加载 RoomLab 2.5.2…");return;}
        var s=frame.state;
        GUI.Label(new Rect(10,5,Screen.width-180,25),frame.roomName+" · RoomLab 2.5.2 规则");
        GUI.Label(new Rect(10,30,Screen.width-20,25),$"Token {s.tokens}   免费首冲 {(s.player.freeDash?"●":"○")}   付费库存 {s.charges}/3   周期 {s.player.dashCount}/3   积分 {s.score}   重试 {s.deaths}   {s.mode}");
        GUI.Label(new Rect(10,56,Screen.width-20,25),"A/D 或方向键移动 · 空格/W/↑跳跃 · Shift左右冲刺（默认朝向） · S/↓下蹲 · R重试 · Esc菜单 · F1选房");
        GUI.Label(new Rect(10,82,Screen.width-20,25),frame.message??"");
        if(pauseMenu){DrawPauseMenu();return;}
        if(GUI.Button(new Rect(Screen.width-130,5,120,28),"选择房间"))selectRoom=!selectRoom;
        if(selectRoom){GUILayout.BeginArea(new Rect(Screen.width-300,112,290,Screen.height-125),GUI.skin.box);
            scroll=GUILayout.BeginScrollView(scroll);foreach(var r in frame.rooms)if(GUILayout.Button(r.name,GUILayout.Height(30)))
            {selectRoom=false;elapsed=0;edgeJump=edgeDash=false;chosenRoom=r.id;chosenCourse=r.course;}
            GUILayout.EndScrollView();GUILayout.EndArea();}
    }
    private void DrawPauseMenu()
    {
        Color previous=GUI.color;
        GUI.color=new Color(0,0,0,.7f);
        GUI.DrawTexture(new Rect(0,0,Screen.width,Screen.height),Texture2D.whiteTexture);
        GUI.color=previous;
        float width=Mathf.Min(340,Screen.width-32);
        var panel=new Rect((Screen.width-width)/2,(Screen.height-190)/2,width,190);
        GUI.Box(panel,GUIContent.none);
        var title=new GUIStyle(GUI.skin.label){alignment=TextAnchor.MiddleCenter,fontSize=24};
        var hint=new GUIStyle(GUI.skin.label){alignment=TextAnchor.MiddleCenter,fontSize=14};
        var button=new GUIStyle(GUI.skin.button){fontSize=20};
        GUI.Label(new Rect(panel.x+16,panel.y+16,width-32,40),"游戏已暂停",title);
        GUI.Label(new Rect(panel.x+16,panel.y+60,width-32,26),"按 Esc 返回游戏",hint);
        if(GUI.Button(new Rect(panel.x+32,panel.y+108,width-64,52),"退出游戏",button))
        {
#if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying=false;
#else
            Application.Quit();
#endif
        }
    }
    private void OnDestroy()
    {
        try{writer?.WriteLine("{\"quit\":true}");}catch{}
        client?.Close();listener?.Stop();process?.Dispose();
        if(texture!=null)Destroy(texture);if(font!=null)Destroy(font);
    }
}
