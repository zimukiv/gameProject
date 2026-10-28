using System.Text;
using Newtonsoft.Json.Linq;
namespace RoomLab.Native
{
    // Editor255Compat: faithful 2.5.5 project settings. LatestPhysics: the planning document profile.
    // DemoPhysics: authored level content driven by the current design intent for the shipped demo
    // (paid dash stock 1 starting at 0, AI eats collectibles, E to boot the AI, two AI catches kill).
    public enum NativeGameplayRules {Editor255Compat,LatestPhysics,DemoPhysics}
    public static class NativeRuleSets
    {
        public static bool IsManualInteraction(this NativeGameplayRules rules,string type)
        {
            if(rules==NativeGameplayRules.LatestPhysics)return type=="physics.thermal"||type=="common.aiStart"||type=="common.aiStartHollow";
            if(rules==NativeGameplayRules.DemoPhysics)return type=="common.aiStart"||type=="common.aiStartHollow";
            return false;
        }
        public static bool BankedRecharge(this NativeGameplayRules rules){return rules!=NativeGameplayRules.Editor255Compat;}
    }
    public static class NativePhysicsDemo
    {
        public const string PlanningSha256="6d5d5628d1c3ef9ab51790d6f695ff786c07784b98be191ce7683a14ee8adb64";
        // Derive a separate read-only demo document. Imported designer files retain explicit parameters.
        public static NativeProject Derive(NativeProject source)
        {
            var p=(JObject)source.OriginalJson.DeepClone();p["nativeDemoRules"]=new JObject{{"profile","LatestPhysics"},{"sourceSha256",source.SourceSha256},{"planningSha256",PlanningSha256},{"iceMeltSeconds",1},{"iceRespawnSeconds",3},{"paidStockCap",1},{"smallCoinsPerCharge",3}};
            p["settings"]["paidStockCap"]=1;var defaults=p["blockDefaults"] as JObject;if(defaults!=null&&defaults["physics.ice"] is JObject iceDefaults){var parameters=iceDefaults["params"] as JObject??new JObject();parameters["meltAfter"]=1;parameters["respawnDelay"]=3;iceDefaults["params"]=parameters;}
            foreach(JObject c in (JArray)p["courses"])foreach(JObject r in (JArray)c["rooms"])foreach(JObject o in (JArray)r["objects"])if((string)o["type"]=="physics.ice"){var par=o["params"] as JObject??new JObject();par["meltAfter"]=1;par["respawnDelay"]=3;o["params"]=par;}
            return NativeProjectLoader.LoadBytes(Encoding.UTF8.GetBytes(p.ToString()),"json",new ImportOptions{Profile=ImportProfile.CustomDdl13Preserve});
        }
    }
}
