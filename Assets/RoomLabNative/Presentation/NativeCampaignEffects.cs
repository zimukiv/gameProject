using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
namespace RoomLab.Native
{
    // Presentation-only cues: real exit destinations, portal signs and charge halos.
    public sealed class NativeCampaignEffects:IDisposable
    {
        readonly NativeMotion game;
        readonly GameObject root;
        readonly LineRenderer halo,portal;
        readonly Material ink;
        readonly List<GameObject> labels=new List<GameObject>();
        readonly List<DoorSign> doors=new List<DoorSign>();
        readonly List<Rect> signBounds=new List<Rect>();
        readonly Font font;
        Mesh signQuad;
        sealed class DoorSign
        {
            public NativeRegion exit;
            public string destination,condition;
            public TextMesh title,detail;
            public MeshRenderer plate;
            public LineRenderer leader;
            public readonly MaterialPropertyBlock colors=new MaterialPropertyBlock();
        }
        public NativeCampaignEffects(NativeMotion game,Transform parent)
        {
            this.game=game;root=new GameObject("Deadline route signage");root.transform.SetParent(parent,false);
            ink=new Material(Shader.Find("Sprites/Default"));
            halo=Ring("AI readable warning",.6f);portal=Ring("Destination warning",.65f);
            font=Resources.Load<Font>(NativeDisplayCopy.Active(game)||game.IsRework&&game.Course.Kind!="physics"?"DiegeticFont/LXGWWenKai-Regular":"PhysicsPixelFont/FusionPixel");
            string ShortExit(string name){if(name.Contains("◆"))return "◆";if(name.Contains("β"))return "β";if(name.Contains("γ"))return "γ";if(name.Contains("返")||name.Contains("↶"))return "↶";if(name.Contains("提交")||name.Contains("今晚"))return "交卷";return "→";}
            foreach(var exit in game.Room.Exits)
            {
                if(game.IsGuided||NativeDisplayCopy.Active(game))AddDestination(exit);
                else Label(game.IsRework?ShortExit(exit.Name):"提交 ↓",exit.X+.7f,exit.Y-.4f,new Color(.5f,1,.85f));
            }
            if(game.Room.Raw["nativeCampaign"]?["route"] is JArray route)foreach(var lane in route){int direction=(int)lane["direction"];float floor=(float)lane["floor"];Label(direction>0?"→":"←",direction>0?5:game.Room.Cols-6,floor-2,new Color(.55f,.85f,.8f));}
            foreach(var item in game.Room.Objects){if(item.Type=="common.portalIn")Label(game.IsRework?"↪":"IN",item.X+.5f,item.Y-1,new Color(.7f,.6f,1));else if(item.Type=="common.portalOut")Label(game.IsRework?"↩":"OUT",item.X+.5f,item.Y-1,new Color(1,.7f,.4f));else if(item.Type=="slacker.checkin"&&(bool?)item.Trigger["requiresAI"]==true)Label(game.IsRework?"○ ○":"等 AI",item.X+.5f,item.Y-1.5f,new Color(.9f,.8f,.5f));}
        }
        Vector3 Point(float x,float y)=>new Vector3(x,game.Room.Rows-y,0);
        TextMesh Label(string text,float x,float y,Color color)
        {
            var go=new GameObject("Route sign "+text);go.transform.SetParent(root.transform,false);go.transform.position=Point(x,y);
            var label=go.AddComponent<TextMesh>();label.font=font;label.fontSize=32;label.characterSize=.17f;label.anchor=TextAnchor.MiddleCenter;label.text=text;
            label.color=game.Course.Kind=="calculus"?new Color(.06f,.22f,.25f):color;
            var renderer=go.GetComponent<MeshRenderer>();renderer.sharedMaterial=font.material;renderer.sortingOrder=7;labels.Add(go);return label;
        }
        static string RoomName(NativeRoom room)
        {
            string name=room.Name??"下一间教室";int divider=name.IndexOf('·');return (divider<0?name:name.Substring(divider+1)).Trim();
        }
        string Destination(NativeRegion exit)
        {
            var edge=game.Course.Connections.Find(c=>c.FromRoomId==game.Room.Id&&c.ExitId==exit.Id);
            if(edge==null)return game.Course.Kind=="slacker"?"下课":game.Course.Kind=="physics"?"交实验报告":"交作业";
            if(edge.ToRoomId==game.Room.Id)return "回到这间的入口";
            var room=game.Course.Rooms.Find(r=>r.Id==edge.ToRoomId);
            if(room==null)return "前往下一间"; // Invalid links are normally rejected by the loader.
            // The name is the actual linked room; no inference from the exit's decorative label.
            var from=game.Room.Raw["graph"];var to=room.Raw["graph"];
            string arrow="去";
            if(Coordinate(from?["x"],out var fromX)&&Coordinate(from?["y"],out var fromY)&&Coordinate(to?["x"],out var toX)&&Coordinate(to?["y"],out var toY))
            {
                float dx=toX-fromX,dy=toY-fromY;
                if(Mathf.Abs(dx)>1||Mathf.Abs(dy)>1)
                    arrow=Mathf.Abs(dx)>=Mathf.Abs(dy)?dx<0?"←":"→":dy<0?"↑":"↓";
            }
            return arrow+" "+RoomName(room);
        }
        static bool Coordinate(JToken value,out float number)
        {
            number=0;if(value==null||value.Type!=JTokenType.Integer&&value.Type!=JTokenType.Float)return false;
            double n=(double)value;if(double.IsNaN(n)||double.IsInfinity(n)||Math.Abs(n)>100000000)return false;
            number=(float)n;return true;
        }
        void AddDestination(NativeRegion exit)
        {
            if(signQuad==null)
            {
                signQuad=new Mesh{name="Destination label board"};
                signQuad.vertices=new[]{new Vector3(-.5f,-.5f),new Vector3(-.5f,.5f),new Vector3(.5f,.5f),new Vector3(.5f,-.5f)};
                signQuad.uv=new[]{Vector2.zero,Vector2.up,Vector2.one,Vector2.right};
                signQuad.colors=new[]{Color.white,Color.white,Color.white,Color.white};
                signQuad.triangles=new[]{0,1,2,0,2,3};signQuad.RecalculateBounds();
            }
            var sign=new DoorSign{exit=exit,destination=Destination(exit),condition=NativeDisplayCopy.Locked(game,exit,(string)exit.Raw["rework"]?["lockedText"])};
            sign.title=Label(sign.destination,exit.X+exit.W/2f,exit.Y-1,Color.white);
            sign.title.fontSize=40;sign.title.characterSize=.18f*Mathf.Min(1,(Mathf.Min(11,game.Room.Cols-1)-.45f)/Mathf.Max(1,ApproximateWidth(sign.destination)));sign.title.GetComponent<MeshRenderer>().sortingOrder=8;
            sign.detail=Label("",exit.X+exit.W/2f,exit.Y-.5f,Color.white);
            sign.detail.fontSize=32;sign.detail.characterSize=.13f;sign.detail.GetComponent<MeshRenderer>().sortingOrder=8;
            var plate=new GameObject("Door destination board "+exit.Id);plate.transform.SetParent(root.transform,false);
            plate.AddComponent<MeshFilter>().sharedMesh=signQuad;sign.plate=plate.AddComponent<MeshRenderer>();
            sign.plate.sharedMaterial=ink;sign.plate.sortingOrder=6;
            sign.plate.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;sign.plate.receiveShadows=false;
            var guide=new GameObject("Door label pointer "+exit.Id);guide.transform.SetParent(root.transform,false);
            sign.leader=guide.AddComponent<LineRenderer>();sign.leader.sharedMaterial=ink;sign.leader.positionCount=2;
            sign.leader.startWidth=sign.leader.endWidth=.025f;sign.leader.sortingOrder=5;
            doors.Add(sign);
        }
        static float ApproximateWidth(string text)
        {
            float length=0;foreach(char c in text)length+=c<128?.32f:.53f;
            return length;
        }
        void RefreshDestinations()
        {
            signBounds.Clear();
            bool paper=game.Course.Kind=="calculus";
            foreach(var sign in doors)
            {
                var exit=sign.exit;
                bool open=game.CampaignExitOpen&&game.ReworkExitOpen(exit);
                float distance=Vector2.Distance(new Vector2((float)game.Player.x/32,(float)game.Player.y/32),new Vector2(exit.X+exit.W/2f,exit.Y+exit.H/2f));
                float emphasis=Mathf.Lerp(.64f,1,Mathf.Clamp01((9-distance)/4));
                // Full destination names remain readable from a distance. Only the short locked
                // condition is proximity-based; walking away never replaces the destination.
                string detail="";
                if(!open&&distance<6)
                {
                    detail=!game.CampaignExitOpen?(NativeDisplayCopy.Active(game)?"还没到齐。":"助手还没跟上"):string.IsNullOrWhiteSpace(sign.condition)?"这边暂时走不通":sign.condition;
                    if(detail.Length>16)detail=detail.Substring(0,15)+"…";
                }
                sign.detail.text=detail;
                float actualWidth=sign.title.GetComponent<MeshRenderer>().bounds.size.x;
                float maxWidth=Mathf.Min(11,game.Room.Cols-1);
                if(actualWidth>maxWidth-.45f)sign.title.characterSize*=(maxWidth-.45f)/actualWidth;
                float width=Mathf.Clamp(Mathf.Max(ApproximateWidth(sign.destination),actualWidth)+.45f,2.6f,maxWidth);
                float height=1.35f;
                float x=Mathf.Clamp(exit.X+exit.W/2f,width/2+.25f,game.Room.Cols-width/2-.25f);
                float y=Mathf.Max(height/2+.2f,exit.Y-1.05f);
                var bounds=new Rect(x-width/2,y-height/2,width,height);
                // Nearby destinations are staggered above their doors, with a short pointer
                // retained so close pairs do not look like one doorway with two names.
                for(int pass=0;pass<doors.Count+1;pass++)
                {
                    bool overlap=false;foreach(var occupied in signBounds)
                        if(bounds.Overlaps(new Rect(occupied.x-.15f,occupied.y-.15f,occupied.width+.3f,occupied.height+.3f))){overlap=true;break;}
                    if(!overlap)break;
                    y=Mathf.Max(height/2+.2f,y-height-.3f);bounds.y=y-height/2;
                }
                signBounds.Add(bounds);
                sign.title.transform.position=Point(x,y-.22f);sign.detail.transform.position=Point(x,y+.37f);
                Color textColor=paper?new Color(.10f,.22f,.24f,emphasis):new Color(.90f,.94f,.82f,emphasis);
                sign.title.color=textColor;
                sign.detail.color=paper?new Color(.37f,.30f,.22f,emphasis):new Color(.82f,.74f,.54f,emphasis);
                sign.plate.transform.position=Point(x,y);sign.plate.transform.localScale=new Vector3(width,height,1);
                sign.colors.SetColor("_Color",paper?new Color(.91f,.88f,.76f,.88f):new Color(.035f,.065f,.085f,.86f));sign.plate.SetPropertyBlock(sign.colors);
                sign.leader.SetPosition(0,Point(x,y+height/2));sign.leader.SetPosition(1,Point(exit.X+exit.W/2f,exit.Y-.1f));
                sign.leader.startColor=sign.leader.endColor=paper?new Color(.23f,.36f,.36f,.65f):new Color(.55f,.78f,.72f,.65f);
            }
        }
        LineRenderer Ring(string name,float radius){var go=new GameObject(name);go.transform.SetParent(root.transform,false);var line=go.AddComponent<LineRenderer>();line.sharedMaterial=ink;line.useWorldSpace=false;line.loop=true;line.positionCount=32;line.startWidth=line.endWidth=.055f;line.sortingOrder=12;for(int i=0;i<32;i++){float a=i*Mathf.PI/16;line.SetPosition(i,new Vector3(Mathf.Cos(a)*radius,Mathf.Sin(a)*radius));}return line;}
        public void Refresh()
        {
            if(game.IsGuided||NativeDisplayCopy.Active(game))RefreshDestinations();
            bool charge=game.CampaignSkill=="charge",burst=game.CampaignSkill=="burst";halo.enabled=game.AI.active&&(charge||burst);halo.transform.position=new Vector3((float)game.AI.x/32,game.Room.Rows-(float)game.AI.y/32,0);halo.transform.localScale=Vector3.one*(charge?1+(float)Math.Sin(game.Elapsed*8)*.16f:1.25f);halo.startColor=halo.endColor=charge?new Color(1,.65f,.2f,.9f):new Color(1,.3f,.2f,.8f);
            portal.enabled=game.AI.warning!=null;if(game.AI.warning!=null){portal.transform.position=new Vector3((float)game.AI.warning.to.x/32,game.Room.Rows-(float)game.AI.warning.to.y/32,0);portal.startColor=portal.endColor=new Color(.85f,.6f,1,.7f+(float)Math.Sin(game.Elapsed*7)*.12f);}
        }
        public void Dispose(){UnityEngine.Object.Destroy(root);UnityEngine.Object.Destroy(ink);if(signQuad!=null)UnityEngine.Object.Destroy(signQuad);}
    }
}
