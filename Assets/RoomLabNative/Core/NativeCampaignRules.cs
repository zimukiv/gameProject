using System;
using Newtonsoft.Json.Linq;
namespace RoomLab.Native
{
    public sealed partial class NativeMotion
    {
        public bool IsCampaign => !IsAuthoredPhysics&&(Rules==NativeGameplayRules.DemoPhysics&&(string)Project.OriginalJson["nativeCampaign"]?["id"]=="deadline-night-v1"||IsRework);
        public string CampaignSkill { get; private set; } = "";
        double campaignSkillTime, campaignSkillClock;
        string campaignSkillRoom;
        public int CampaignCollected {get{int n=0;foreach(var r in Course.Rooms)foreach(var o in r.Objects)if(o.Type=="common.collectible"&&Credited.Contains(r.Id+"/"+o.Id))n++;return n;}}
        public string CampaignObjective {
            get{if(!IsCampaign)return "";int need=(int?)Room.Raw["nativeCampaign"]?["checkins"]??0,done=0;foreach(var o in Room.Objects)if(o.Type=="slacker.checkin"&&ObjectStates[o.Id].signIns>0)done++;
                if(need>done)return "签到 "+done+" / "+need+" · 每个站点只算一次";
                if((bool?)Room.Raw["nativeCampaign"]?["requireAI"]==true&&!AI.active)return "找到终端，按交互键上供 Token 启动 AI";
                return (string)Room.Raw["nativeCampaign"]?["objective"]??"抵达提交口 · 藏品可选";
            }
        }
        public bool CampaignExitOpen {get{if(!IsCampaign)return true;int need=(int?)Room.Raw["nativeCampaign"]?["checkins"]??0,done=0;foreach(var o in Room.Objects)if(o.Type=="slacker.checkin"&&ObjectStates[o.Id].signIns>0)done++;return done>=need&&((bool?)Room.Raw["nativeCampaign"]?["requireAI"]!=true||AI.active);}}
        bool CampaignCanExit(){if(CampaignExitOpen)return true;Message=CampaignObjective;if(IsRework){BlockedExit="course";BlockedExitUntil=Elapsed+2;}return false;}
        void TickCampaignSkill(double dt)
        {
            if(IsRework){TickReworkSkill(dt);return;}if(!IsCampaign)return;
            if(campaignSkillRoom!=Room.Id||RoomTime<campaignSkillClock){campaignSkillRoom=Room.Id;CampaignSkill="";campaignSkillTime=0;}
            campaignSkillClock=RoomTime;
            AI.speed=210+AI.tier*7;
            if(!AI.active)return;
            if(CampaignSkill=="charge"){
                campaignSkillTime-=dt;AI.speed=120;
                if(campaignSkillTime<=0){CampaignSkill="burst";campaignSkillTime=.85;Emit("ai-burst");}
            }else if(CampaignSkill=="burst"){
                AI.speed=350;campaignSkillTime-=dt;if(campaignSkillTime<=0){CampaignSkill="recover";campaignSkillTime=1.2;Emit("ai-recover");}
            }else if(CampaignSkill=="recover"){
                AI.speed=95;campaignSkillTime-=dt;if(campaignSkillTime<=0){CampaignSkill="";campaignSkillTime=6.5;}
            }else{
                campaignSkillTime-=dt;double distance=Hypot(AI.x-PlayerCenter.x,AI.y-PlayerCenter.y);
                if(Course.Kind=="physics"&&RoomTime>4&&campaignSkillTime<=0&&distance>80&&distance<320&&AiProcessing<=0){CampaignSkill="charge";campaignSkillTime=.9;Emit("ai-charge");}
            }
        }
    }
}
