using System;
using System.Linq;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace RoomLab.Native.Validation
{
    // The same real-input cases run in the .NET console and Unity Editor assemblies.
    // No substitute parser, JavaScript engine, or synthetic project loader is used.
    public static class NativeDataRepairCases
    {
        public static int Run(JObject validProject)
        {
            int checks=0;string baseline=validProject.ToString(Formatting.None);
            Func<string,string> probe=value=>baseline.Substring(0,baseline.Length-1)+",\"syntaxProbe\":"+value+"}";
            Action<string,bool> reject=(input,grammar)=>{
                try { NativeProjectLoader.LoadBytes(Encoding.UTF8.GetBytes(input),"json"); }
                catch(NativeDataException e) {
                    if(grammar&&!e.Message.StartsWith("JSON语法无效",StringComparison.Ordinal))throw new Exception("Syntax was rejected at the wrong layer: "+e.Message);
                    checks++;return;
                }
                throw new Exception("Invalid JSON/project accepted: "+input.Substring(0,Math.Min(input.Length,100)));
            };
            Action<string> accept=input=>{NativeProjectLoader.LoadBytes(Encoding.UTF8.GetBytes(input),"json");checks++;};
            reject(baseline.Replace("\"version\":2","'version':2"),true);
            reject(baseline.Replace("\"version\":2","version:2"),true);
            reject(baseline.Replace("\"version\":2","\"version\":0x2"),true);
            foreach(var invalid in new[]{"'text'","0x2","-0x2","+2",".2","-.2","2.","02","-02","2e","2e+","2e-","undefined","NaN","Infinity","-Infinity","nullx","True","[1,]","{\"a\":1,}","{a:1}","{\"a\" 1}","[1 2]","\"bad\\x41\"","\"bad\\u12x4\"","\"bad\\u12\"","\"unterminated","\"bad\\v\""})reject(probe(invalid),true);
            reject(probe("\"raw"+(char)0x1f+"control\""),true);
            reject(probe("\"raw\nnewline\""),true);
            reject("/*prefix*/"+baseline,true);
            reject(baseline+"//suffix",true);
            reject(baseline.Substring(0,baseline.Length-1)+",}",true);
            reject(baseline+" true",true);
            reject(baseline+" {}",true);
            reject(probe("{\"same\":1,\"same\":2}"),false); // Tree builder keeps duplicate-key protection.
            reject(probe("1e400"),false); // RFC grammar is valid; native finite-number policy still rejects.
            reject(probe(new string('[',129)+"0"+new string(']',129)),false);
            foreach(var legal in new[]{"2e0","2E+0","-0","0.25","-12.5e-2","true","false","null","[]","{}","[1,2,{\"nested\":null}]","\"https://example.test/a,b?x=/*text*/#//comment\"","\"中文😀, [ ] { } // /* text */\"","\"quote\\\" slash\\/ reverse\\\\ controls\\b\\f\\n\\r\\t unicode\\u4e2d\\uD83D\\uDE00\""})accept(probe(legal));
            accept(" \r\n\t"+baseline+"\t \n");
            accept(probe(new string('[',100)+"0"+new string(']',100)));

            // The original alias is supported, but its normalized target declaration is not.
            var alias=(JObject)validProject.DeepClone();
            foreach(JObject o in alias["courses"].SelectMany(c=>c["rooms"]).SelectMany(r=>r["objects"]))if((string)o["type"]=="common.aiStart")o["type"]="common.aiStartHollow";
            var manifest=(JObject)alias["pluginManifest"];manifest["common.aiStartHollow"]="1.0.0";manifest["common.aiStart"]="9.0.0";
            reject(alias.ToString(Formatting.None),false);
            manifest["common.aiStart"]="1.1.0";accept(alias.ToString(Formatting.None));

            // Friend migration may upgrade known rail 1.x to 2.x, not erase unknown majors.
            var friend=(JObject)validProject.DeepClone();friend.Remove("compatibility");
            var friendManifest=(JObject)friend["pluginManifest"];friendManifest["physics.rail"]="9.0.0";
            reject(friend.ToString(Formatting.None),false);
            friendManifest["physics.rail"]="1.0.0";var migrated=NativeProjectLoader.LoadBytes(Encoding.UTF8.GetBytes(friend.ToString(Formatting.None)),"json");
            if((string)migrated.NormalizedJson["pluginManifest"]["physics.rail"]!="2.0.0")throw new Exception("Known friend rail declaration not upgraded");checks++;
            friendManifest["common.checkpoint"]="9.0.0";reject(friend.ToString(Formatting.None),false);
            friendManifest.Remove("common.checkpoint");migrated=NativeProjectLoader.LoadBytes(Encoding.UTF8.GetBytes(friend.ToString(Formatting.None)),"json");
            if((string)migrated.NormalizedJson["pluginManifest"]["common.checkpoint"]!="1.0.0")throw new Exception("Missing checkpoint declaration not materialized");checks++;
            return checks;
        }
    }
}
