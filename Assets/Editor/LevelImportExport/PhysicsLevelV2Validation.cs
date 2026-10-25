using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;
using N = PhysicsLevelV2Json.Node;

// Fail-closed Unity-supported subset of LevelDataV2. No JsonUtility call may precede this validation.
internal static class PhysicsLevelV2Validation
{
    internal static readonly string[] Behaviours = { "physics.platform", "physics.airVent", "item.token", "mechanism.ice", "mechanism.vanishing", "mechanism.thermalController", "mechanism.railgun" };
    private static readonly Dictionary<string, string> Payloads = new Dictionary<string, string> {
        {"core.marker",null},
        {"visual.sprite","sprite"},{"physics.boxCollider2d","collider"},{"physics.platform",null},
        {"physics.airVent","airVent"},{"item.token","token"},{"mechanism.ice","ice"},
        {"mechanism.vanishing","vanishing"},{"mechanism.thermalController","thermal"},
        {"mechanism.railgun","railgun"}
    };

    internal static N Validate(string json, bool resolveAssets = true)
    {
        N root = PhysicsLevelV2Json.Parse(json);
        Shape(root, "$", "formatVersion", "levelId", "coverage", "sourceSceneGuid", "objects");
        Integer(Field(root,"formatVersion","$"), "$.formatVersion", 2, 2);
        Text(Field(root,"levelId","$"), "$.levelId", true);
        Choice(Field(root,"coverage","$"), "$.coverage", "partial", "full");
        Guid32(Field(root,"sourceSceneGuid","$"), "$.sourceSceneGuid");
        var objects = List(Field(root,"objects","$"), "$.objects", true);
        var ids = new HashSet<string>(StringComparer.Ordinal);
        var parents = new Dictionary<string,string>(StringComparer.Ordinal);
        var typesById = new Dictionary<string,HashSet<string>>(StringComparer.Ordinal);
        var objectById = new Dictionary<string,N>(StringComparer.Ordinal);
        for (int i=0;i<objects.Count;i++)
        {
            string path="$.objects["+i+"]"; N item=objects[i];
            Shape(item,path,"id","name","parentId","active","layer","localPosition","localRotationZ","localScale","components","rules");
            string id=ObjectId(Field(item,"id",path),path+".id");
            path+="("+id+")";
            if (!ids.Add(id)) Fail(path+".id","duplicate object ID");
            objectById.Add(id,item);
            Text(Field(item,"name",path),path+".name",true);
            N parent=Field(item,"parentId",path);
            parents.Add(id,parent.IsNull?null:ObjectId(parent,path+".parentId"));
            Boolean(Field(item,"active",path),path+".active");
            int layer=Integer(Field(item,"layer",path),path+".layer",0,31);
            Vector(Field(item,"localPosition",path),path+".localPosition",3);
            Number(Field(item,"localRotationZ",path),path+".localRotationZ");
            N scale=Field(item,"localScale",path);
            Vector(scale,path+".localScale",3);
            if (Number(Field(scale,"x",path+".localScale"),path+".localScale.x")==0 ||
                Number(Field(scale,"y",path+".localScale"),path+".localScale.y")==0)
                Fail(path+".localScale","zero X/Y scale");
            if (List(Field(item,"rules",path),path+".rules").Count!=0)
                Fail(path+".rules","event rules are design-only; P4.2A cannot import or export them");
            var components=List(Field(item,"components",path),path+".components",true);
            var types=new HashSet<string>(StringComparer.Ordinal);
            N collider=null; string behaviour=null;
            for (int j=0;j<components.Count;j++)
            {
                string cp=path+".components["+j+"]"; N component=components[j];
                if (component.Object==null) Fail(cp,"expected component object");
                string type=Text(Field(component,"typeId",cp),cp+".typeId",true);
                cp+="("+type+")";
                if (!Payloads.TryGetValue(type,out string payload)) Fail(cp+".typeId","unsupported V2 Unity component "+type);
                Shape(component,cp,payload==null?new[]{"typeId","version","enabled"}:new[]{"typeId","version","enabled",payload});
                Integer(Field(component,"version",cp),cp+".version",1,1);
                Boolean(Field(component,"enabled",cp),cp+".enabled");
                if (!types.Add(type)) Fail(cp+".typeId","duplicate component");
                if (Behaviours.Contains(type))
                {
                    if (behaviour!=null) Fail(cp+".typeId","multiple primary behaviours");
                    behaviour=type;
                }
                if (payload!=null) ValidatePayload(type,Field(component,payload,cp),cp+"."+payload,resolveAssets);
                if (type=="physics.boxCollider2d") collider=Field(component,"collider",cp);
            }
            typesById.Add(id,types);
            if (types.Contains("core.marker"))
            {
                if (types.Count!=1 || !Boolean(Field(components[0],"enabled",path),path+".components[0].enabled"))
                    Fail(path+".components","core.marker must be standalone and enabled");
                continue;
            }
            if (!types.Contains("visual.sprite") || !types.Contains("physics.boxCollider2d") || behaviour==null || types.Count!=3)
                Fail(path+".components","P4.2A requires SpriteRenderer, BoxCollider2D and one supported behaviour");
            bool trigger=Boolean(Field(collider,"isTrigger",path),path+".collider.isTrigger");
            if (trigger != (behaviour=="physics.airVent" || behaviour=="item.token" || behaviour=="mechanism.railgun"))
                Fail(path+".components","Collider trigger role does not match "+behaviour);
            if (behaviour=="physics.platform" && layer!=8) Fail(path+".layer","platform requires Ground layer 8");
        }
        foreach (var pair in parents)
        {
            var visited=new HashSet<string>(StringComparer.Ordinal) {pair.Key}; string parent=pair.Value;
            while (parent!=null)
            {
                if (!parents.ContainsKey(parent)) Fail("$.objects["+pair.Key+"].parentId","missing parent "+parent);
                if (!visited.Add(parent)) Fail("$.objects["+pair.Key+"].parentId","parent cycle");
                parent=parents[parent];
            }
        }
        // All IDs are known before checking target types, so forward references are supported.
        foreach (var pair in objectById)
        {
            foreach (var component in Field(pair.Value,"components","$.objects["+pair.Key+"]").Array)
            {
                string type=Field(component,"typeId","component").String;
                if (type=="mechanism.thermalController")
                {
                    N thermal=Field(component,"thermal",pair.Key);
                    N linked=Field(thermal,"linkedController",pair.Key+".thermal");
                    if (!linked.IsNull)
                    {
                        string target=SceneComponentRef(linked,pair.Key+"/mechanism.thermalController/thermal.linkedController","mechanism.thermalController",typesById);
                        if (target==pair.Key) Fail(pair.Key+".thermal.linkedController","controller cannot link to itself");
                        N targetComponent=Field(objectById[target],"components",target).Array.Single(c=>
                            Field(c,"typeId",target).String=="mechanism.thermalController");
                        if (!Field(Field(targetComponent,"thermal",target),"linkedController",target).IsNull)
                            Fail(pair.Key+".thermal.linkedController","linked controller must be an unlinked authority");
                    }
                    var iceIds=new HashSet<string>(StringComparer.Ordinal);
                    foreach (N ice in Field(thermal,"controlledIce",pair.Key+".thermal").Array)
                    {
                        string target=SceneComponentRef(ice,pair.Key+"/mechanism.thermalController/thermal.controlledIce","mechanism.ice",typesById);
                        if (!iceIds.Add(target)) Fail(pair.Key+".thermal.controlledIce","duplicate ice reference");
                    }
                }
                if (type=="mechanism.railgun")
                {
                    N endpoint=Field(Field(component,"railgun",pair.Key),"launchEndPoint",pair.Key+".railgun");
                    string target=TransformRef(endpoint,pair.Key+"/mechanism.railgun/railgun.launchEndPoint",typesById);
                    if (target==pair.Key) Fail(pair.Key+".railgun.launchEndPoint","endpoint cannot be the railgun itself");
                }
            }
        }
        return root;
    }

    private static void ValidatePayload(string type,N data,string path,bool resolveAssets)
    {
        if (type=="visual.sprite")
        {
            Shape(data,path,"assetGuid","localFileId","color","sortingOrder");
            string guid=Guid32(Field(data,"assetGuid",path),path+".assetGuid");
            string local=Text(Field(data,"localFileId",path),path+".localFileId",true);
            if (!long.TryParse(local,NumberStyles.None,CultureInfo.InvariantCulture,out long fileId) || fileId<=0 || local[0]=='0')
                Fail(path+".localFileId","expected positive local file ID");
            Color(Field(data,"color",path),path+".color");
            Integer(Field(data,"sortingOrder",path),path+".sortingOrder",int.MinValue,int.MaxValue);
            if (resolveAssets) ResolveSprite(guid,fileId,path);
        }
        else if (type=="physics.boxCollider2d")
        {
            Shape(data,path,"size","offset","isTrigger");
            N size=Field(data,"size",path); Vector(size,path+".size",2);
            if (Number(Field(size,"x",path),path+".size.x")<=0 || Number(Field(size,"y",path),path+".size.y")<=0)
                Fail(path+".size","collider size must be positive");
            Vector(Field(data,"offset",path),path+".offset",2);
            Boolean(Field(data,"isTrigger",path),path+".isTrigger");
        }
        else if (type=="physics.airVent")
        {
            Shape(data,path,"ventDirection","upwardForce","isInteractable","guideText","isContinuous");
            N direction=Field(data,"ventDirection",path); Vector(direction,path+".ventDirection",2);
            double x=Number(Field(direction,"x",path),path+".ventDirection.x");
            double y=Number(Field(direction,"y",path),path+".ventDirection.y");
            if (x*x+y*y==0) Fail(path+".ventDirection","zero direction");
            if (Number(Field(data,"upwardForce",path),path+".upwardForce")<=0) Fail(path+".upwardForce","must be positive");
            Boolean(Field(data,"isInteractable",path),path+".isInteractable");
            Text(Field(data,"guideText",path),path+".guideText");
            Boolean(Field(data,"isContinuous",path),path+".isContinuous");
        }
        else if (type=="item.token")
        {
            Shape(data,path,"scoreAmount","tokenAmount");
            Integer(Field(data,"scoreAmount",path),path+".scoreAmount",0,int.MaxValue);
            Integer(Field(data,"tokenAmount",path),path+".tokenAmount",0,int.MaxValue);
        }
        else if (type=="mechanism.ice")
        {
            Shape(data,path,"isMelted","solidColor","meltedColor");
            Boolean(Field(data,"isMelted",path),path+".isMelted");
            Color(Field(data,"solidColor",path),path+".solidColor");
            Color(Field(data,"meltedColor",path),path+".meltedColor");
        }
        else if (type=="mechanism.vanishing")
        {
            Shape(data,path,"mode","visibleDuration","invisibleDuration","stepVanishDelay","respawnDelay",
                "visibleColor","vanishColor","showGuide","warningDuration","optionalCollectible");
            Choice(Field(data,"mode",path),path+".mode","PeriodicBlink","TriggerOnStep");
            foreach (string key in new[]{"visibleDuration","invisibleDuration","stepVanishDelay","respawnDelay"})
                if (Number(Field(data,key,path),path+"."+key)<=0) Fail(path+"."+key,"must be positive");
            Color(Field(data,"visibleColor",path),path+".visibleColor");
            Color(Field(data,"vanishColor",path),path+".vanishColor");
            Boolean(Field(data,"showGuide",path),path+".showGuide");
            if (Number(Field(data,"warningDuration",path),path+".warningDuration")<0)
                Fail(path+".warningDuration","must be nonnegative");
            if (!Field(data,"optionalCollectible",path).IsNull)
                Fail(path+".optionalCollectible","P4.2A does not bind collectible references");
        }
        else if (type=="mechanism.thermalController")
        {
            Shape(data,path,"currentState","linkedController","controlledIce","terminalName","interactionRadius",
                "controlRadius","roomFilterOverlay","coldFilterColor","hotFilterColor");
            Choice(Field(data,"currentState",path),path+".currentState","Cold","Hot");
            Text(Field(data,"terminalName",path),path+".terminalName");
            foreach (string key in new[]{"interactionRadius","controlRadius"})
                if (Number(Field(data,key,path),path+"."+key)<=0) Fail(path+"."+key,"must be positive");
            List(Field(data,"controlledIce",path),path+".controlledIce");
            Color(Field(data,"coldFilterColor",path),path+".coldFilterColor");
            Color(Field(data,"hotFilterColor",path),path+".hotFilterColor");
            if (!Field(data,"roomFilterOverlay",path).IsNull)
                Fail(path+".roomFilterOverlay","overlay scene reference is not supported by P4.2B");
        }
        else if (type=="mechanism.railgun")
        {
            Shape(data,path,"launchEndPoint","acceleration","launchExitSpeed","launchDirection");
            if (Number(Field(data,"acceleration",path),path+".acceleration")<=0)
                Fail(path+".acceleration","must be positive");
            if (Number(Field(data,"launchExitSpeed",path),path+".launchExitSpeed")<0)
                Fail(path+".launchExitSpeed","must be nonnegative");
            N direction=Field(data,"launchDirection",path); Vector(direction,path+".launchDirection",2);
            double x=Number(Field(direction,"x",path),path+".launchDirection.x");
            double y=Number(Field(direction,"y",path),path+".launchDirection.y");
            if (x*x+y*y==0) Fail(path+".launchDirection","zero direction");
        }
    }

    private static string SceneComponentRef(N node,string path,string expected,Dictionary<string,HashSet<string>> typesById)
    {
        Shape(node,path,"kind","objectId","componentTypeId","instanceId");
        Choice(Field(node,"kind",path),path+".kind","sceneComponent");
        string id=ObjectId(Field(node,"objectId",path),path+".objectId");
        Choice(Field(node,"componentTypeId",path),path+".componentTypeId",expected);
        if (!Field(node,"instanceId",path).IsNull) Fail(path+".instanceId","only single-instance components supported");
        if (!typesById.TryGetValue(id,out var types)) Fail(path+".objectId","missing target "+id);
        if (!types.Contains(expected)) Fail(path+".objectId","target lacks "+expected);
        return id;
    }
    private static string TransformRef(N node,string path,Dictionary<string,HashSet<string>> typesById)
    {
        Shape(node,path,"kind","objectId");
        Choice(Field(node,"kind",path),path+".kind","transform");
        string id=ObjectId(Field(node,"objectId",path),path+".objectId");
        if (!typesById.TryGetValue(id,out var types)) Fail(path+".objectId","missing target "+id);
        if (!types.Contains("core.marker")) Fail(path+".objectId","railgun endpoint must be a core.marker object");
        return id;
    }

    internal static Sprite ResolveSprite(string guid,long localId,string path)
    {
        string assetPath=AssetDatabase.GUIDToAssetPath(guid);
        if (string.IsNullOrEmpty(assetPath)) Fail(path+".assetGuid","Sprite GUID not found: "+guid);
        foreach (var asset in AssetDatabase.LoadAllAssetsAtPath(assetPath))
            if (asset is Sprite sprite && AssetDatabase.TryGetGUIDAndLocalFileIdentifier(sprite,out string found,out long id)
                && found==guid && id==localId) return sprite;
        Fail(path+".localFileId","Sprite localFileId not found: "+localId);
        return null;
    }
    private static void Shape(N node,string path,params string[] keys)
    {
        if (node==null || node.Object==null) Fail(path,"expected object");
        foreach (string key in keys) if (!node.Object.ContainsKey(key)) Fail(path+"."+key,"required field missing");
        foreach (string key in node.Object.Keys) if (!keys.Contains(key)) Fail(path+"."+key,"unknown field");
    }
    private static N Field(N node,string key,string path)
    {
        N value=null;
        if (node?.Object==null || !node.Object.TryGetValue(key,out value)) Fail(path+"."+key,"required field missing");
        return value;
    }
    private static List<N> List(N node,string path,bool nonempty=false)
    {
        if (node?.Array==null || nonempty && node.Array.Count==0) Fail(path,"expected nonempty array");
        return node.Array;
    }
    private static string Text(N node,string path,bool nonempty=false)
    {
        if (node?.String==null || nonempty && node.String.Length==0) Fail(path,"expected string");
        return node.String;
    }
    private static string Choice(N node,string path,params string[] choices)
    {
        string value=Text(node,path); if (!choices.Contains(value)) Fail(path,"unsupported enum value "+value); return value;
    }
    private static bool Boolean(N node,string path)
    {
        if (node==null || !(node.Value is bool)) Fail(path,"expected boolean"); return (bool)node.Value;
    }
    private static double Number(N node,string path)
    {
        if (node==null || !(node.Value is double)) Fail(path,"expected number");
        double value=(double)node.Value;
        if (double.IsInfinity(value) || double.IsNaN(value) || Math.Abs(value)>float.MaxValue) Fail(path,"number is outside Unity float range");
        return value;
    }
    private static int Integer(N node,string path,int min,int max)
    {
        double number=Number(node,path);
        if (number!=Math.Truncate(number) || number<min || number>max) Fail(path,"expected integer in range");
        return (int)number;
    }
    private static void Vector(N node,string path,int dimensions)
    {
        Shape(node,path,dimensions==2?new[]{"x","y"}:new[]{"x","y","z"});
        foreach (string key in node.Object.Keys) Number(Field(node,key,path),path+"."+key);
    }
    private static void Color(N node,string path)
    {
        Shape(node,path,"r","g","b","a");
        foreach (string key in node.Object.Keys) Number(Field(node,key,path),path+"."+key);
    }
    private static string ObjectId(N node,string path)
    {
        string value=Text(node,path,true);
        if (!Guid.TryParseExact(value,"D",out _)) Fail(path,"expected UUID object ID");
        return value;
    }
    private static string Guid32(N node,string path)
    {
        string value=Text(node,path,true);
        if (value.Length!=32 || !value.All(Uri.IsHexDigit)) Fail(path,"expected 32-character asset GUID");
        return value;
    }
    private static void Fail(string path,string reason) { throw new InvalidDataException(path+": "+reason); }
}
