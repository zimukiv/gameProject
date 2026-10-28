using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
namespace RoomLab.Native
{
    // Versioned checkpoint continuation, not a diagnostic Snapshot replay. No simulation changes.
    public sealed partial class NativeMotion
    {
        static bool Finite(double value){return !double.IsNaN(value)&&!double.IsInfinity(value);}
        public JObject ExportContinuation()
        {
            if(DeveloperEnabled||DeveloperFlight||Completed)throw new InvalidOperationException("开发或已结算状态不能写入继续存档");
            var serializer=new JsonSerializer();
            return new JObject{{"version",2},{"current",JToken.FromObject(CaptureRoom(),serializer)},{"source",Project.SourceSha256},{"rules",Rules.ToString()},{"course",Course.Id},{"room",Room.Id},{"entry",Entry.Id},{"checkpoint",JToken.FromObject(Checkpoint,serializer)},{"caches",JToken.FromObject(roomCaches,serializer)},{"baselines",JToken.FromObject(lifeBaselines,serializer)},{"elapsed",Elapsed},{"deaths",Deaths},{"steals",Steals}};
        }
        public static NativeMotion FromContinuation(NativeProject project,JObject saved,NativeGameplayRules rules)
        {
            if((int?)saved["version"]!=2||(string)saved["source"]!=project.SourceSha256||(string)saved["rules"]!=rules.ToString())throw new NativeDataException("存档版本或项目来源已变化");
            foreach(var token in saved.Descendants())if(token.Type==JTokenType.Float){double n=token.Value<double>();if(double.IsNaN(n)||double.IsInfinity(n))throw new NativeDataException("存档含无效数字");}
            var g=new NativeMotion(project,(string)saved["course"],(string)saved["room"],rules);
            if(g.Course.Id!=(string)saved["course"]||g.Room.Id!=(string)saved["room"]||!g.Room.Entries.Exists(e=>e.Id==(string)saved["entry"]))throw new NativeDataException("存档房间或入口无效");
            var cpJson=saved["checkpoint"] as JObject??throw new NativeDataException("存档点状态缺失");
            foreach(string key in new[]{"face","tokens","charges","recharge","score","tier","life","dashCount"})if(cpJson[key]?.Type!=JTokenType.Integer)throw new NativeDataException("存档整数类型无效："+key);
            foreach(string key in new[]{"active","freeDash","paidDashUsed"})if(cpJson[key]?.Type!=JTokenType.Boolean)throw new NativeDataException("存档布尔类型无效："+key);
            foreach(string key in new[]{"x","y"})if(cpJson[key]==null||cpJson[key].Type!=JTokenType.Null&&cpJson[key].Type!=JTokenType.Float&&cpJson[key].Type!=JTokenType.Integer)throw new NativeDataException("存档坐标类型无效");
            var cp=cpJson.ToObject<NativeCheckpoint>();
            if(cp==null||cp.state==null||cp.credited==null||cp.tokens<0||cp.tokens>1000000||cp.charges<0||cp.charges>g.PaidStockCap||cp.recharge<0||cp.recharge>=(rules==NativeGameplayRules.Editor255Compat?10:3)||cp.score<0||cp.score>1000000000||cp.face!=1&&cp.face!=-1||cp.tier<0||cp.tier>2||cp.life<1||cp.life>1000000000||cp.dashCount<0||cp.dashCount>2||cp.phase!="slow"&&cp.phase!="fast"||cp.x.HasValue!=cp.y.HasValue)throw new NativeDataException("存档状态无效");
            foreach(var o in g.Room.Objects)if(!cp.state.objects.ContainsKey(o.Id))throw new NativeDataException("存档机关不完整");
            foreach(var z in g.Room.Zones)if(!cp.state.zones.ContainsKey(z.Id))throw new NativeDataException("存档温区不完整");
            foreach(var m in g.Room.Movables)if(!cp.state.movables.ContainsKey(m.Id))throw new NativeDataException("存档移动平台不完整");
            if(cp.id!=null&&!g.Room.Objects.Exists(o=>o.Id==cp.id&&o.Type=="common.checkpoint"))throw new NativeDataException("存档点已不存在");
            var caches=saved["caches"].ToObject<Dictionary<string,NativeRoomState>>();var baselines=saved["baselines"].ToObject<Dictionary<string,NativeRoomState>>();
            void ValidateState(string id,NativeRoomState state){var room=g.Course.Rooms.Find(r=>r.Id==id);if(room==null||state==null||state.objects==null||state.zones==null||state.movables==null||state.environment!="cold"&&state.environment!="hot")throw new NativeDataException("存档房间状态无效");if(state.objects.Count!=room.Objects.Count||state.zones.Count!=room.Zones.Count||state.movables.Count!=room.Movables.Count)throw new NativeDataException("存档状态数量不一致");foreach(var o in room.Objects)if(!state.objects.TryGetValue(o.Id,out var st)||st==null||!Finite(st.cooldown)||!Finite(st.standing)||!Finite(st.respawnRemaining)||st.cooldown<0||st.standing<0||st.respawnRemaining<0||st.generation<0||st.generation>1000000000||st.lastTemperature!=null&&st.lastTemperature!="cold"&&st.lastTemperature!="hot")throw new NativeDataException("存档机关状态无效");foreach(var z in room.Zones)if(!state.zones.TryGetValue(z.Id,out var temperature)||temperature!="cold"&&temperature!="hot")throw new NativeDataException("存档温区状态无效");foreach(var m in room.Movables)if(!state.movables.TryGetValue(m.Id,out var value)||value==null||!Finite(value.progress)||value.progress<0||value.progress>1||!Finite(value.angle)||value.anim!=null&&(!Finite(value.anim.t)||!Finite(value.anim.from)||!Finite(value.anim.to)||value.anim.t<0||value.anim.t>.45||value.anim.kind!="angle"&&value.anim.kind!="progress"))throw new NativeDataException("存档平台状态无效");}
            var current=saved["current"]?.ToObject<NativeRoomState>()??throw new NativeDataException("存档当前房间状态缺失");ValidateState(g.Room.Id,current);ValidateState(g.Room.Id,cp.state);foreach(var state in caches)ValidateState(state.Key,state.Value);foreach(var state in baselines)ValidateState(state.Key,state.Value);
            g.roomCaches.Clear();foreach(var v in caches)g.roomCaches.Add(v.Key,v.Value);g.lifeBaselines.Clear();foreach(var v in baselines)g.lifeBaselines.Add(v.Key,v.Value);
            g.Checkpoint=cp;g.Tokens=cp.tokens;g.Charges=cp.charges;g.Recharge=cp.recharge;g.Score=cp.score;g.CourseAIActive=cp.active;g.CourseAITier=cp.tier;g.CourseAIId=cp.aiId;g.Phase=cp.phase;g.Life=cp.life;
            g.Credited.Clear();foreach(var v in cp.credited){bool exists=false;foreach(var cr in g.Course.Rooms)foreach(var o in cr.Objects)if(v==cr.Id+"/"+o.Id&&(o.Type=="common.small"||o.Type=="common.coin"||o.Type=="common.collectible"))exists=true;if(!exists)throw new NativeDataException("存档拾取记录无效");g.Credited.Add(v);}g.roomCaches[g.Room.Id]=cp.state.Copy();var room=g.Room.Id;g.Room=null;g.LoadGameplayRoom(room,(string)saved["entry"],null,cp);
            g.Checkpoint=cp;g.RestoreRoom(current);g.RespawnRemaining=0;g.Mode="playing";g.RetryGameplay("从检查点继续");
            foreach(string key in new[]{"deaths","steals"})if(saved[key]?.Type!=JTokenType.Integer||(long)saved[key]<0||(long)saved[key]>1000000000)throw new NativeDataException("存档计数无效");
            if(saved["elapsed"]==null||saved["elapsed"].Type!=JTokenType.Float&&saved["elapsed"].Type!=JTokenType.Integer)throw new NativeDataException("存档时间无效");
            g.Elapsed=(double?)saved["elapsed"]??0;g.Deaths=(int?)saved["deaths"]??0;g.Steals=(int?)saved["steals"]??0;
            if(double.IsNaN(g.Elapsed)||double.IsInfinity(g.Elapsed)||g.Elapsed<0||g.Elapsed>1e12||!g.SafePosition(g.Player.x,g.Player.y))throw new NativeDataException("存档位置或时间无效");
            g.RespawnRemaining=.5;g.Mode="paused";return g;
        }
    }
}
