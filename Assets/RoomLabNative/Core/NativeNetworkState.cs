using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
namespace RoomLab.Native
{
    public sealed class NativeResourceAnchor
    {
        public string room,entry;
        public NativeCheckpoint checkpoint;
        public Dictionary<string,NativeRoomState> rooms=new Dictionary<string,NativeRoomState>();
    }
    public sealed partial class NativeMotion
    {
        public bool IsNetwork=>IsRework&&Course.Kind!="physics"&&(bool?)Project.OriginalJson["nativeCampaign"]?["network"]==true;
        public bool IsAwarenessResource=>IsNetwork&&(bool?)Course.Raw["nativeCampaign"]?["resourceAwareness"]==true;
        bool networkExitPressed;
        public NativeRegion NearbyExit {get{if(!IsNetwork&&!IsContactAutosave)return null;foreach(var e in Room.Exits)if(MotionRect.Overlap(Player.Rect,new MotionRect(null,e.X*32-24,e.Y*32-8,e.W*32+48,e.H*32+16)))return e;return null;}}
        public readonly HashSet<string> VisitedRooms=new HashSet<string>();
        public readonly HashSet<string> TraversedConnections=new HashSet<string>();
        public NativeResourceAnchor ResourceAnchor {get;private set;}
        public string ResourceAnchorRoom=>ResourceAnchor?.room;
        public bool IsSpent(NativeObject o)=>IsAwarenessResource&&o.Raw["rework"]?["clarityDelta"]!=null&&ObjectStates[o.Id].used;
        void RememberNetworkRoom(){if(!IsNetwork)return;VisitedRooms.Add(Room.Id);if(IsAwarenessResource&&ResourceAnchor==null)SaveResourceAnchor();}
        void SaveResourceAnchor()
        {
            if(!IsAwarenessResource)return;
            var anchor=new NativeResourceAnchor{room=Room.Id,entry=Entry.Id,checkpoint=JObject.FromObject(Checkpoint).ToObject<NativeCheckpoint>()};
            foreach(var r in roomCaches)anchor.rooms[r.Key]=r.Value.Copy();anchor.rooms[Room.Id]=CaptureRoom();ResourceAnchor=anchor;
        }
        bool RetryResourceAnchor(string reason)
        {
            if(!IsAwarenessResource||ResourceAnchor==null)return false;
            var a=ResourceAnchor;var cp=a.checkpoint;Deaths++;AiHits=0;
            roomCaches.Clear();foreach(var r in a.rooms)roomCaches[r.Key]=r.Value.Copy();lifeBaselines.Clear();
            Score=cp.score;Tokens=cp.tokens;Charges=cp.charges;Recharge=cp.recharge;Credited.Clear();foreach(var c in cp.credited)Credited.Add(c);
            CourseAIActive=cp.active;CourseAITier=cp.tier;CourseAIId=cp.aiId;Phase=cp.phase;Life=cp.life+1;
            ReworkSignals.Clear();foreach(var s in cp.signals)ReworkSignals[s.Key]=s.Value;
            Room=null;LoadGameplayRoom(a.room,a.entry,null,cp);Checkpoint=JObject.FromObject(cp).ToObject<NativeCheckpoint>();ResourceAnchor=a;
            Player.freeDash=true;Player.dashCount=0;Player.paidDashUsed=false;RespawnRemaining=.5;Message=reason;Emit("retry",new JObject{{"reason",reason},{"resourceAnchor",a.room}});return true;
        }
        void WriteNetwork(JObject saved)
        {
            if(!IsNetwork)return;saved["visitedRooms"]=JArray.FromObject(VisitedRooms);saved["traversedConnections"]=JArray.FromObject(TraversedConnections);
            if(IsAwarenessResource)saved["resourceAnchor"]=JObject.FromObject(ResourceAnchor);
        }
        static void ValidateResourceStateJson(JToken state)
        {
            if(!(state is JObject))throw new NativeDataException("资源房间状态缺失");
            foreach(string key in new[]{"awareness","awarenessWait"})if(state[key]==null||state[key].Type!=JTokenType.Integer&&state[key].Type!=JTokenType.Float)throw new NativeDataException("资源存档数字类型无效 "+key);
            var pending=state["pendingAwareness"];if(pending!=null&&pending.Type!=JTokenType.Null&&pending.Type!=JTokenType.Integer&&pending.Type!=JTokenType.Float)throw new NativeDataException("待生效资源类型无效");
            if(state["awarenessPulses"]?.Type!=JTokenType.Integer)throw new NativeDataException("资源脉冲类型无效");
            if(!(state["objects"] is JObject objects))throw new NativeDataException("资源道具状态缺失");foreach(var item in objects.Properties())if(item.Value?["used"]?.Type!=JTokenType.Boolean)throw new NativeDataException("道具消耗类型无效");
        }
        void ValidateNetworkSaveJson(JObject saved)
        {
            if(!IsAwarenessResource)return;ValidateResourceStateJson(saved["current"]);ValidateResourceStateJson(saved["checkpoint"]?["state"]);
            foreach(string group in new[]{"caches","baselines"}){if(!(saved[group] is JObject states))throw new NativeDataException("资源房间集合无效");foreach(var room in states.Properties())ValidateResourceStateJson(room.Value);}
        }
        static void ValidateAnchorJson(JObject anchor)
        {
            var checkpoint=anchor["checkpoint"];foreach(string key in new[]{"x","y"}){var v=checkpoint?[key];if(v==null||v.Type!=JTokenType.Null&&v.Type!=JTokenType.Integer&&v.Type!=JTokenType.Float)throw new NativeDataException("资源存档坐标类型无效");}
            ValidateResourceStateJson(checkpoint?["state"]);
            if(!(anchor["rooms"] is JObject rooms))throw new NativeDataException("资源房间类型无效");foreach(var room in rooms.Properties())ValidateResourceStateJson(room.Value);
            if(!JToken.DeepEquals(checkpoint["state"],rooms[(string)anchor["room"]??""]))throw new NativeDataException("资源锚点快照不一致");
        }
        void ReadNetwork(JObject saved,Action<string,NativeRoomState> validate)
        {
            if(!IsNetwork)return;
            var visits=saved["visitedRooms"] as JArray;var paths=saved["traversedConnections"] as JArray;
            if(visits==null||paths==null||visits.Count>Course.Rooms.Count||paths.Count>Course.Connections.Count)throw new NativeDataException("探索记录无效");
            VisitedRooms.Clear();foreach(var id in visits){if(id.Type!=JTokenType.String||!Course.Rooms.Exists(r=>r.Id==(string)id)||!VisitedRooms.Add((string)id))throw new NativeDataException("探索房间无效");}
            TraversedConnections.Clear();foreach(var id in paths){var edge=Course.Connections.Find(e=>e.Id==(string)id);if(id.Type!=JTokenType.String||edge==null||!VisitedRooms.Contains(edge.FromRoomId)||!VisitedRooms.Contains(edge.ToRoomId)||!TraversedConnections.Add((string)id))throw new NativeDataException("探索连线无效");}
            if(!VisitedRooms.Contains(Room.Id))throw new NativeDataException("当前房间未在探索记录中");
            if(!IsAwarenessResource)return;
            var anchor=saved["resourceAnchor"] as JObject??throw new NativeDataException("资源存档点缺失");ValidateAnchorJson(anchor);var a=anchor.ToObject<NativeResourceAnchor>();var room=Course.Rooms.Find(r=>r.Id==a.room);
            if(room==null||!room.Entries.Exists(e=>e.Id==a.entry)||a.checkpoint==null||a.rooms==null||!a.rooms.ContainsKey(a.room)||!VisitedRooms.Contains(a.room))throw new NativeDataException("资源存档点位置无效");
            foreach(var item in a.rooms)validate(item.Key,item.Value);validate(a.room,a.checkpoint.state);
            NativeReworkValidation.ValidateSignals(Course,JObject.FromObject(a.checkpoint.signals));
            var cp=a.checkpoint;var cpJson=anchor["checkpoint"];foreach(string key in new[]{"face","tokens","charges","recharge","score","tier","life","dashCount"})if(cpJson[key]?.Type!=JTokenType.Integer)throw new NativeDataException("资源存档整数无效");foreach(string key in new[]{"active","freeDash","paidDashUsed"})if(cpJson[key]?.Type!=JTokenType.Boolean)throw new NativeDataException("资源存档布尔无效");if(cp.credited==null||cp.tokens<0||cp.tokens>1000000||cp.score>1000000000||cp.life>1000000000||cp.dashCount<0||cp.dashCount>2||cp.charges<0||cp.charges>PaidStockCap||cp.recharge<0||cp.recharge>=3||cp.score<0||cp.face!=1&&cp.face!=-1||cp.tier<0||cp.tier>2||cp.life<1||cp.phase!="slow"&&cp.phase!="fast"||cp.x.HasValue!=cp.y.HasValue||cp.x.HasValue&&(!Finite(cp.x.Value)||!Finite(cp.y.Value)||cp.x<0||cp.y<0||cp.x+24>room.Cols*32||cp.y+28>room.Rows*32)||cp.id!=null&&!room.Objects.Exists(o=>o.Id==cp.id&&o.Type=="common.checkpoint"))throw new NativeDataException("资源存档点内容无效");
            foreach(string key in cp.credited)if(!Course.Rooms.Exists(r=>r.Objects.Exists(o=>key==r.Id+"/"+o.Id&&(o.Type=="common.small"||o.Type=="common.coin"||o.Type=="common.collectible"))))throw new NativeDataException("资源存档点藏品无效");
            ResourceAnchor=a;
        }
    }
}
