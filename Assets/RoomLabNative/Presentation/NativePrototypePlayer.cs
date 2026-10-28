using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace RoomLab.Native
{
    // A real Unity scene: sprites and meshes are rendered directly from native C# state.
    // This P2 presentation intentionally has no dependency on the old screenshot bridge.
    public sealed class NativePrototypePlayer : MonoBehaviour
    {
        public NativeMotion Game {get;private set;}
        readonly NativeInputTimeline timeline=new NativeInputTimeline();
        readonly NativeKeyboardEvents keyboard=new NativeKeyboardEvents();
        readonly Dictionary<string,SpriteRenderer> visuals=new Dictionary<string,SpriteRenderer>();
        Sprite sprite;Transform player;Camera gameCamera;Font font;bool verify;int verificationChecks;string error;
        void Start()
        {
            verify=Array.IndexOf(Environment.GetCommandLineArgs(),"-nativeMotionVerify")>=0||Environment.GetEnvironmentVariable("ROOMLAB_NATIVE_MOTION_VERIFY")=="1";
            try{
                Application.runInBackground=true;Application.targetFrameRate=60;QualitySettings.vSyncCount=0;
                var data=Resources.Load<TextAsset>("NativePrototype");if(data==null)throw new FileNotFoundException("NativePrototype resource missing");
                var project=NativeProjectLoader.LoadBytes(data.bytes,"json",new ImportOptions{Profile=ImportProfile.CustomDdl13Preserve});Game=new NativeMotion(project);
                keyboard.Bind((int)KeyCode.A,MotionBinding.Left);keyboard.Bind((int)KeyCode.LeftArrow,MotionBinding.Left);keyboard.Bind((int)KeyCode.D,MotionBinding.Right);keyboard.Bind((int)KeyCode.RightArrow,MotionBinding.Right);
                foreach(var key in new[]{KeyCode.W,KeyCode.UpArrow,KeyCode.Space})keyboard.Bind((int)key,MotionBinding.Up|MotionBinding.Jump);
                keyboard.Bind((int)KeyCode.S,MotionBinding.Down);keyboard.Bind((int)KeyCode.DownArrow,MotionBinding.Down);keyboard.Bind((int)KeyCode.LeftShift,MotionBinding.Dash);keyboard.Bind((int)KeyCode.RightShift,MotionBinding.Dash);
                var texture=new Texture2D(1,1,TextureFormat.RGBA32,false);texture.SetPixel(0,0,Color.white);texture.Apply();sprite=Sprite.Create(texture,new Rect(0,0,1,1),new Vector2(.5f,.5f),1);
                gameCamera=Camera.main;if(gameCamera==null){var cameraObject=new GameObject("Native Camera");cameraObject.tag="MainCamera";gameCamera=cameraObject.AddComponent<Camera>();}
                gameCamera.orthographic=true;gameCamera.orthographicSize=11.7f;gameCamera.transform.position=new Vector3(20,11,-10);gameCamera.backgroundColor=new Color(.04f,.07f,.11f);gameCamera.clearFlags=CameraClearFlags.SolidColor;
                foreach(var t in Game.Room.Tiles)Box("Ground "+t.X+","+t.Y,new MotionRect(null,t.X*32,t.Y*32,32,32),new Color(.18f,.32f,.43f),0);
                foreach(var o in Game.Room.Objects){Color color=o.Type=="physics.jet"?new Color(.99f,.78f,.2f):o.Type=="physics.rail"?new Color(.65f,.45f,.9f):o.Type=="common.spike"?new Color(.95f,.2f,.3f):new Color(1,.66f,.1f);var rect=Game.ObjectRect(o);
                    if(o.Type=="common.spike"){var go=new GameObject(o.Id);go.transform.SetParent(transform);go.AddComponent<MeshFilter>().sharedMesh=SpikeMesh(rect,o.Text("direction","up"));go.AddComponent<MeshRenderer>().sharedMaterial=new Material(Shader.Find("Sprites/Default")){color=color};}
                    else{if(o.Type.StartsWith("physics."))rect.h=8;if(o.Id=="prototype-low-ceiling")color=new Color(.4f,.6f,.7f);visuals[o.Id]=Box(o.Id,rect,color,2).GetComponent<SpriteRenderer>();}
                    if(o.Type=="physics.rail"){var path=o.Parameters["path"] as Newtonsoft.Json.Linq.JArray;var go=new GameObject("Native rail path");go.transform.SetParent(transform);var line=go.AddComponent<LineRenderer>();line.positionCount=path.Count;line.startWidth=line.endWidth=.08f;line.useWorldSpace=true;line.sharedMaterial=new Material(Shader.Find("Sprites/Default"));line.startColor=line.endColor=new Color(.8f,.65f,1);for(int i=0;i<path.Count;i++)line.SetPosition(i,new Vector3((float)path[i]["x"]/1,(float)(Game.Room.Rows-path[i]["y"].Value<double>()),1));}
                }
                player=Box("Native player",Game.Player.Rect,new Color(.2f,.95f,.8f),5).transform;
                font=Font.CreateDynamicFontFromOSFont("Microsoft YaHei",18);
                if(verify)StartCoroutine(Verify(project));
            }catch(Exception e){error=e.ToString();Debug.LogException(e);if(verify)Finish(2);}
        }
        GameObject Box(string name,MotionRect r,Color color,int layer)
        {
            var go=new GameObject(name);go.transform.SetParent(transform);var sr=go.AddComponent<SpriteRenderer>();sr.sprite=sprite;sr.color=color;sr.sortingOrder=layer;go.transform.position=new Vector3((float)((r.x+r.w/2)/32),(float)(Game.Room.Rows-(r.y+r.h/2)/32),0);go.transform.localScale=new Vector3((float)(r.w/32),(float)(r.h/32),1);return go;
        }
        Mesh SpikeMesh(MotionRect r,string direction)
        {
            double x=r.x+r.w/2,y=r.y+r.h,angle=0;if(direction=="down"){y=r.y;angle=Math.PI;}else if(direction=="right"){x=r.x;y=r.y+r.h/2;angle=Math.PI/2;}else if(direction=="left"){x=r.x+r.w;y=r.y+r.h/2;angle=-Math.PI/2;}
            const int segments=24;var v=new Vector3[segments+2];var triangles=new int[segments*3];double radius=Math.Min(r.w,r.h)/2-2;v[0]=new Vector3((float)(x/32),(float)(Game.Room.Rows-y/32),0);
            for(int i=0;i<=segments;i++){double a=Math.PI+i*Math.PI/segments+angle;v[i+1]=new Vector3((float)((x+Math.Cos(a)*radius)/32),(float)(Game.Room.Rows-(y+Math.Sin(a)*radius)/32),0);if(i<segments){triangles[i*3]=0;triangles[i*3+1]=i+1;triangles[i*3+2]=i+2;}}
            var mesh=new Mesh();mesh.vertices=v;mesh.triangles=triangles;mesh.RecalculateNormals();return mesh;
        }
        void Update()
        {
            if(Game==null||error!=null)return;
            if(!verify){if(GameInput.WasPressedExact(KeyCode.Escape)){timeline.Reset();keyboard.DiscardEdges();Game.TogglePause();}if(GameInput.WasPressedExact(KeyCode.R)){timeline.Reset();keyboard.DiscardEdges();Game.Retry();}
                if(keyboard.Overflowed){timeline.Advance(Game,1,default(MotionInput));keyboard.DiscardEdges();}
                if(Game.Mode!="playing"||Game.RespawnRemaining>0)keyboard.DiscardEdges();
                while(keyboard.TryRead(out var edge))timeline.Advance(Game,0,edge);
                timeline.Advance(Game,Time.unscaledDeltaTime,keyboard.Held);
            }
            var p=Game.Player;player.position=new Vector3((float)((p.x+p.w/2)/32),(float)(Game.Room.Rows-(p.y+p.h/2)/32),0);player.localScale=new Vector3((float)(p.w/32),(float)(p.h/32),1);
            foreach(var o in Game.Room.Objects)if(visuals.TryGetValue(o.Id,out var sr))sr.enabled=!Game.Credited.Contains(Game.Room.Id+"/"+o.Id);
            float aspect=(float)Screen.width/Math.Max(1,Screen.height-100);gameCamera.orthographicSize=Mathf.Max(11.7f,20.8f/aspect);gameCamera.rect=new Rect(0,0,1,Mathf.Max(.2f,(Screen.height-100f)/Screen.height));
        }
        void OnApplicationFocus(bool focus){if(Game==null||verify)return;if(!focus){keyboard.Clear();timeline.LoseFocus(Game);}else{foreach(int key in keyboard.BoundKeys)if(GameInput.IsHeldExact((KeyCode)key))keyboard.Apply(key,true);keyboard.DiscardEdges();}}
        void OnGUI()
        {
            if(Game!=null&&!verify&&(Event.current.type==EventType.KeyDown||Event.current.type==EventType.KeyUp)){keyboard.Apply((int)Event.current.keyCode,Event.current.type==EventType.KeyDown);if(Game.Mode!="playing"||Game.RespawnRemaining>0)keyboard.DiscardEdges();}
            if(font!=null)GUI.skin.font=font;GUI.Box(new Rect(0,0,Screen.width,100),GUIContent.none);
            if(error!=null){GUI.Label(new Rect(12,8,Screen.width-24,90),error);return;}if(Game==null)return;
            GUI.Label(new Rect(12,5,Screen.width-24,25),"RoomLab 原生运动样板 · P2");
            GUI.Label(new Rect(12,30,Screen.width-24,25),"A/D 移动　空格/W 跳跃　S 下蹲　Shift 水平冲刺　R 重试　Esc 暂停");
            GUI.Label(new Rect(12,56,Screen.width-24,25),"Token "+Game.Tokens+"　免费冲刺 "+(Game.Player.freeDash?"可用":"已用")+"　付费库存 "+Game.Charges+"/3　重试 "+Game.Deaths+"　"+Game.Mode);
            if(Game.Mode=="paused"){GUI.Box(new Rect(Screen.width/2-180,Screen.height/2-80,360,160),"游戏已暂停");GUI.Label(new Rect(Screen.width/2-160,Screen.height/2-40,320,40),timeline.ProtectionReason??"按 Esc 或点击继续");if(GUI.Button(new Rect(Screen.width/2-100,Screen.height/2+15,200,42),"继续")){timeline.Reset();keyboard.DiscardEdges();Game.TogglePause();}}
        }
        IEnumerator Verify(NativeProject project)
        {
            yield return null;bool failed=false;
            try{verificationChecks=NativeMotionSmokeChecks.Run(project);if(FindObjectsByType<NativePrototypePlayer>().Length!=1)throw new Exception("Duplicate native player");Debug.Log("NATIVE_MOTION_PLAYER_PASS checks="+verificationChecks+" externalRuntime=false renderer=UnitySpriteMesh");Game.Tick(NativeMotion.Step);}
            catch(Exception e){Debug.LogException(e);failed=true;}
            if(failed){Finish(2);yield break;}
            // Hidden standalone windows do not guarantee a drawable system backbuffer either.
            // Explicit camera rendering proves the actual native scene; live GUI is a separate
            // visible-window acceptance, not falsely inferred from an automatic capture.
            yield return null;
            string path=EvidencePath(),image=Path.Combine(path,"native-prototype.png");
            try{Directory.CreateDirectory(path);Capture(image);}catch(Exception e){Debug.LogException(e);failed=true;}
            if(failed){Finish(2);yield break;}for(int i=0;i<30&&!File.Exists(image);i++)yield return null;
            try{if(!File.Exists(image))throw new IOException("Screenshot not produced");File.WriteAllText(Path.Combine(path,"native-player-result.json"),"{\"checks\":"+verificationChecks+",\"native\":true,\"externalRuntime\":false,\"captureIncludesGUI\":false,\"capturePixelsValidated\":true,\"scene\":\"NativePrototype\",\"screenshot\":\"native-prototype.png\"}");Debug.Log("NATIVE_MOTION_PLAYER_SCREENSHOT "+image);Finish(0);}
            catch(Exception e){Debug.LogException(e);Finish(2);}
        }
        string EvidencePath(){var args=Environment.GetCommandLineArgs();int at=Array.IndexOf(args,"-nativeEvidencePath");if(at>=0&&at+1<args.Length)return Path.GetFullPath(args[at+1]);return Path.Combine(Application.dataPath,"..","NativeEvidence");}
        void Capture(string file)
        {
            int width=Math.Max(200,Screen.width),height=Math.Max(200,Screen.height);Texture2D capture=null;RenderTexture render=null,previous=RenderTexture.active;var previousTarget=gameCamera.targetTexture;
            try{render=RenderTexture.GetTemporary(width,height,24);gameCamera.targetTexture=render;gameCamera.Render();RenderTexture.active=render;capture=new Texture2D(width,height,TextureFormat.RGB24,false);capture.ReadPixels(new Rect(0,0,width,height),0,0);capture.Apply();
                if(capture==null)throw new IOException("Native screenshot API returned no texture");ValidateCapture(capture);File.WriteAllBytes(file,capture.EncodeToPNG());}
            finally{gameCamera.targetTexture=previousTarget;RenderTexture.active=previous;if(render!=null)RenderTexture.ReleaseTemporary(render);if(capture!=null)Destroy(capture);}
        }
        static void ValidateCapture(Texture2D capture)
        {
            int green=0,blue=0;var pixels=capture.GetPixels32();foreach(var p in pixels){if(p.g>150&&p.r<160&&p.b>100&&p.g>p.r+40)green++;if(p.b>p.r+10&&p.g>p.r+10)blue++;}
            if(green<10||blue<500)throw new IOException("Native screenshot lacks rendered player/terrain: green="+green+" blue="+blue);
            Debug.Log("NATIVE_MOTION_CAPTURE_PIXELS_PASS player="+green+" terrain="+blue+" size="+capture.width+"x"+capture.height);
        }
        void Finish(int code){
#if UNITY_EDITOR
            UnityEditor.EditorApplication.Exit(code);
#else
            Application.Quit(code);
#endif
        }
        void OnDestroy(){if(font!=null)Destroy(font);if(sprite!=null){Destroy(sprite.texture);Destroy(sprite);}}
    }
}
