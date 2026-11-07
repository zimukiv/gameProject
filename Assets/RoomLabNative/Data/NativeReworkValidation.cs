using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
namespace RoomLab.Native
{
    public static class NativeReworkValidation
    {
        static void Need(bool ok,string why){if(!ok)throw new NativeDataException("重做关卡："+why);}
        static double Number(JToken p,string key,double fallback=0){var n=p?[key];Need(n==null||n.Type==JTokenType.Integer||n.Type==JTokenType.Float,"数字类型错误 "+key);double value=n==null?fallback:(double)n;Need(!double.IsNaN(value)&&!double.IsInfinity(value),"非有限数字");return value;}
        static HashSet<string> Names(JToken data){var a=data as JArray;Need(a!=null&&a.Count<=32,"开关列表无效");var result=new HashSet<string>();foreach(var n in a){Need(n.Type==JTokenType.String&&!string.IsNullOrEmpty((string)n)&&((string)n).Length<=48&&result.Add((string)n),"开关名称重复或无效");}return result;}
        static void Rule(JToken m,HashSet<string> signals,HashSet<string> switches)
        {
            if(m==null)return;Need(m is JObject,"规则应为对象");
            foreach(string key in new[]{"band"})if(m[key]!=null)Need(new[]{"all","dream","haze","awake"}.Contains((string)m[key]),"清醒层无效");
            foreach(string key in new[]{"signal","visibleSignal"})if(m[key]!=null)Need(signals.Contains((string)m[key]),"未知跨房开关 "+m[key]);
            if(m["allSwitches"]!=null){Need(m["allSwitches"] is JArray,"多开关条件无效");foreach(var key in (JArray)m["allSwitches"])Need(key.Type==JTokenType.String&&switches.Contains((string)key),"多开关条件含未知名称");}if(m["switch"]!=null)Need(switches.Contains((string)m["switch"]),"未知本房开关");
            foreach(string key in new[]{"value","visibleValue"})if(m[key]!=null)Need(m[key].Type==JTokenType.Boolean,"开关值须为布尔");
            foreach(string key in new[]{"states","signals"})if(m[key]!=null){Need(m[key] is JObject,"组合状态须为对象");foreach(var state in ((JObject)m[key]).Properties())Need((key=="states"?switches:signals).Contains(state.Name)&&state.Value.Type==JTokenType.Boolean,"组合状态含未知开关或非布尔值");}
            if(m["clarityDelta"]!=null)Need(Number(m,"clarityDelta")>=-100&&Number(m,"clarityDelta")<=100&&Number(m,"clarityDelta")!=0,"资源变化无效");
            if(m["clarityTarget"]!=null)Need(Number(m,"clarityTarget")>=0&&Number(m,"clarityTarget")<=100,"清醒目标越界");
        }
        static void Rect(JToken p,NativeRoom r,string x="x",string y="y")
        {
            double a=Number(p,x,Number(p,"x")),b=Number(p,y,Number(p,"y")),w=Number(p,"w",1),h=Number(p,"h",1);
            Need(w>=.25&&h>=.25&&a>=0&&b>=0&&a+w<=r.Cols&&b+h<=r.Rows,"平台越界 "+p["id"]);
        }
        public static bool IsAuthoredPhysics(NativeProject project,NativeCourse course) => course!=null&&course.Kind=="physics"&&(string)project.OriginalJson["nativeCampaign"]?["saveMode"]=="contact-auto-v1"&&project.OriginalJson["nativeCampaign"]?["authoredCourses"] is JArray authored&&authored.Any(v=>v.Type==JTokenType.String&&(string)v==course.Id);
        public static void Validate(NativeProject project)
        {
            if((string)project.OriginalJson["nativeCampaign"]?["id"]!="deadline-rework-v2")return;
            foreach(var c in project.Courses){if(IsAuthoredPhysics(project,c))continue;var signals=Names(c.Raw["nativeCampaign"]?["signals"]);foreach(var r in c.Rooms){var meta=r.Raw["nativeCampaign"] as JObject;Need(meta!=null,"房间缺少规则");var switches=Names(meta["switches"]);Need(Number(meta,"awareness",50)>=0&&Number(meta,"awareness",50)<=100,"初始清醒度越界");
                Need(Number(meta,"pulseBudget",1)>=0&&Number(meta,"pulseBudget",1)<=3&&Number(meta,"pulseBudget",1)%1==0,"脉冲次数无效");
                var platforms=meta["platforms"] as JArray;Need(platforms!=null&&platforms.Count<=128,"平台数量无效");var ids=new HashSet<string>();
                foreach(var p in platforms){Need(p is JObject&&p["id"]?.Type==JTokenType.String&&ids.Add((string)p["id"]),"平台标识无效");Need(!string.IsNullOrEmpty((string)p["id"])&&p["x"]!=null&&p["y"]!=null,"平台缺少标识或坐标");Need(!r.Objects.Any(o=>o.Id==(string)p["id"])&&!r.Movables.Any(o=>o.Id==(string)p["id"]),"平台与已有实体ID冲突");Rect(p,r);Rect(p,r,"toX","toY");Need(Number(p,"seconds",.9)>=.1&&Number(p,"seconds",.9)<=10,"变形时长越界");Rule(p,signals,switches);if(p["foldOnReturnAfterSwitch"]!=null)Need(p["foldOnReturnAfterSwitch"].Type==JTokenType.String&&switches.Contains((string)p["foldOnReturnAfterSwitch"]),"原位收起条件须为已知本房开关");}
                var patrols=meta["patrols"] as JArray;Need(patrols!=null&&patrols.Count<=4,"巡逻数量无效");foreach(var p in patrols){Need(p is JObject,"巡逻定义无效");var nodes=p["nodes"] as JArray;Need(nodes!=null&&nodes.Count>=2&&nodes.Count<=16,"巡逻节点数量无效");Need(Number(p,"speed",100)>=30&&Number(p,"speed",100)<=220,"巡逻速度越界");foreach(var n in nodes)Need(Number(n,"x")>=.5&&Number(n,"x")<=r.Cols-.5&&Number(n,"y")>=.5&&Number(n,"y")<=r.Rows-.5,"巡逻节点越界");}
                foreach(var o in r.Objects){Rule(o.Raw["rework"],signals,switches);if(o.Raw["rework"]?["clarityDelta"]!=null)Need((bool?)c.Raw["nativeCampaign"]?["resourceAwareness"]==true&&(bool?)o.Trigger["once"]==true&&o.ResetPolicy=="checkpoint","资源道具必须一次性且随检查点回退");}foreach(var e in r.Exits)Rule(e.Raw["rework"],signals,switches);foreach(var t in r.Tiles)Rule(t.Raw["rework"],signals,switches);foreach(var m in r.Movables)Rule(m.Raw["rework"],signals,switches);
                int checkins=(int)Number(meta,"checkins");Need(checkins>=0&&checkins<=r.Objects.Count(o=>o.Type=="slacker.checkin"),"签到目标无效");
                if((bool?)meta["requireAI"]==true)Need(r.Objects.Any(o=>o.Type=="common.aiStart"||o.Type=="common.aiStartHollow"),"缺少助手终端");
            }}
        }
        public static void ValidateSignals(NativeCourse c,JObject values)
        {
            Need(values!=null,"存档缺少跨房开关");var names=Names(c.Raw["nativeCampaign"]?["signals"]);foreach(var p in values.Properties())Need(names.Contains(p.Name)&&p.Value.Type==JTokenType.Boolean,"存档跨房开关无效");
        }
        public static void ValidateState(NativeRoom r,object value)
        {
            Need(r!=null&&value!=null,"存档房间无效");var state=JObject.FromObject(value);double awareness=Number(state,"awareness",-1);Need(awareness>=0&&awareness<=100,"存档清醒度越界");
            if(state["pendingAwareness"]!=null&&state["pendingAwareness"].Type!=JTokenType.Null)Need(Number(state,"pendingAwareness")>=0&&Number(state,"pendingAwareness")<=100,"待生效资源越界");Need(Number(state,"awarenessWait")>=0&&Number(state,"awarenessWait")<=.7,"资源等待无效");
            Need(Number(state,"awarenessPulses")>=0&&Number(state,"awarenessPulses")<=3&&Number(state,"awarenessPulses")%1==0,"脉冲存档无效");
            var names=Names(r.Raw["nativeCampaign"]?["switches"]);var switches=state["switches"] as JObject;Need(switches!=null,"存档开关缺失");foreach(var p in switches.Properties())Need(names.Contains(p.Name)&&p.Value.Type==JTokenType.Boolean,"存档本房开关无效");
            var platforms=state["platforms"] as JObject;Need(platforms!=null,"存档平台缺失");var allowed=new HashSet<string>(((JArray)r.Raw["nativeCampaign"]["platforms"]).Select(p=>(string)p["id"]));foreach(var p in platforms.Properties())Need(allowed.Contains(p.Name)&&(p.Value.Type==JTokenType.Float||p.Value.Type==JTokenType.Integer)&&(double)p.Value>=0&&(double)p.Value<=1,"存档平台进度无效");
        }
    }
}
