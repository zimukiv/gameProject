using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using N = PhysicsLevelV2Json.Node;

// M1.3B-1 candidate importer. It never copies an existing Scene or interprets
// sourceSerialized as an import instruction. Every native field is applied from
// component.data.fields; every object reference from component.data.references.
// Unsupported serialized properties abort before a test Scene is saved.
public static class PhysicsLevelV3Level1Candidate
{
    const string Marker = "PHYSICS_LEVEL_EDITOR_PHASE4A_ISOLATED";
    const string Company = "MiniGame Team Phase4A Test";
    const string Product = "Physics Level Editor Phase4A Isolated";
    const string SceneSha = "208caa5ee0c2edb7fe3140ece317ccd0156957ad0ae89e2a738a3ccb2d396d34";
    const string LevelId = "unity:8012e3d1cdce7da499fa92e045ffd865";
    const string Candidate = "Levels/Drafts/M1.3B/Level1.v3.rebuild-candidate.json";
    const string EditedCandidate = "Levels/Drafts/M1.3B/Level1.v3.rebuild-edited.json";
    const string SourceDraft = "Levels/Drafts/M1.2/Level1.v3.draft.json";
    const string SourceDraftSha = "360e9cd725ee6f9c8c9ac48862301fd0190a39ea431cfed4ed507fa71d563a93";
    const string Source = "Levels/SourceMaps/Level1.source.json";
    const string ScenePrefix = "Assets/Scenes/LevelEditorM13B_Level1_";
    const string HudId = "8052fc0e-4012-5fba-8138-937c85f7b242";
    const string HudSourceFileId = "43121461";
    const string GuideId = "76a9b388-aac0-5609-b2f5-f6566fc5f049";
    const string GuideSourceFileId = "1759950616";
    const string ChildUiId = "3acaa307-7c5f-5b8d-b2e9-afa364f106cb";
    const string ChildUiSourceFileId = "180290158";
    const string FontObjectId = "9e740d84-f2ae-52c2-a42f-6a54ffed7149";
    const string FontComponentId = "187b1e5f-f498-5619-b47b-1f55bdb68668";
    const string FontSourceFileId = "1149207657";
    static List<string> childUiTrace;
    static List<string> guideCanvasTrace;
    static List<string> fontTrace;
    static string currentAssertStage;
    static bool fontLegacyConflict;
    static int fontSourceMax,fontEffectiveMax,fontOriginalLoadedMax;

    static N Field(N n, string key, string at)
    {
        if (n?.Object == null || !n.Object.TryGetValue(key, out N result))
            throw new InvalidDataException(at + ": missing field " + key);
        return result;
    }
    static List<N> Array(N n, string at) => n?.Array ?? throw new InvalidDataException(at + ": expected array");
    static string Text(N n, string at) => n?.String ?? throw new InvalidDataException(at + ": expected string");
    static double Number(N n, string at) => n?.Value is double d && !double.IsNaN(d) && !double.IsInfinity(d)
        ? d : throw new InvalidDataException(at + ": expected finite number");
    static int Int(N n, string at)
    {
        double value = Number(n, at);
        if (value != Math.Truncate(value) || value < int.MinValue || value > int.MaxValue)
            throw new InvalidDataException(at + ": expected integer");
        return (int)value;
    }
    static bool Bool(N n, string at) => n?.Value is bool value ? value :
        throw new InvalidDataException(at + ": expected boolean");
    static void Require(bool okay, string at)
    {
        if (!okay) throw new InvalidDataException(at);
    }
    static void Keys(N value,string at,params string[] expected)
    {
        Require(value.Object!=null&&value.Object.Keys.OrderBy(x=>x)
            .SequenceEqual(expected.OrderBy(x=>x)),at+": unknown or missing JSON key");
    }
    static string FileAt(string relative) => Path.Combine(Directory.GetParent(Application.dataPath).FullName,
        relative.Replace('/', Path.DirectorySeparatorChar));
    static string Sha(byte[] bytes)
    {
        using (var hash = SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
    }
    static string Sha(string value) => Sha(Encoding.UTF8.GetBytes(value));

    static void Isolation()
    {
        Require(File.Exists(FileAt("Phase4A.IsolatedProject.marker")) &&
            File.ReadAllText(FileAt("Phase4A.IsolatedProject.marker")).Trim() == Marker,
            "M1.3B refuses a project without the exact Phase4A isolation marker");
        Require(PlayerSettings.companyName == Company && PlayerSettings.productName == Product,
            "M1.3B refuses the formal game's Company/Product identity");
        Require(Sha(File.ReadAllBytes(FileAt("Assets/Scenes/Level1.unity"))) == SceneSha,
            "M1.3B isolated Level1 source SHA-256 mismatch");
        Require(!EditorApplication.isPlayingOrWillChangePlaymode && !SceneManager.GetActiveScene().isDirty,
            "M1.3B requires Edit Mode and a clean active Scene");
        Debug.Log("M13B1_ISOLATION_PASS; Company=" + Company + "; Product=" + Product);
    }

    static Vector3 Vec3(N n, string at) => new Vector3((float)Number(Field(n,"x",at),at+".x"),
        (float)Number(Field(n,"y",at),at+".y"),(float)Number(Field(n,"z",at),at+".z"));
    static Vector2 Vec2(N n, string at) => new Vector2((float)Number(Field(n,"x",at),at+".x"),
        (float)Number(Field(n,"y",at),at+".y"));
    static Quaternion Quat(N n, string at) => new Quaternion((float)Number(Field(n,"x",at),at+".x"),
        (float)Number(Field(n,"y",at),at+".y"),(float)Number(Field(n,"z",at),at+".z"),
        (float)Number(Field(n,"w",at),at+".w"));
    static Rect ViewportRect(N n,string at)
    {
        Keys(n,at,"serializedVersion","x","y","width","height");
        Require(Int(Field(n,"serializedVersion",at),at+".serializedVersion")==2,
            at+": unsupported Unity Rect serialization version");
        double x=Number(Field(n,"x",at),at+".x"),y=Number(Field(n,"y",at),at+".y");
        double width=Number(Field(n,"width",at),at+".width");
        double height=Number(Field(n,"height",at),at+".height");
        Require(x>=0&&y>=0&&width>=0&&height>=0&&x<=1&&y<=1&&
            x+width<=1+1e-7&&y+height<=1+1e-7,
            at+": normalized Camera viewport must fit within [0,1]");
        return new Rect((float)x,(float)y,(float)width,(float)height);
    }
    static bool CameraViewport(SerializedProperty property,string path) =>
        path==".m_NormalizedViewPortRect" && property.serializedObject.targetObject is Camera;

    static Type UnityType(N part, string at)
    {
        N serialized=Field(part,"sourceSerialized",at);
        string name=Text(Field(part,"typeId",at),at+".typeId");
        Require(name.StartsWith("unity.",StringComparison.Ordinal),at+": expected audited Unity type");
        string simple=name.Substring(6);
        if (Int(Field(serialized,"classId",at),at+".classId") == 114)
        {
            N script=Field(Field(serialized,"fields",at),"m_Script",at+".m_Script");
            string guid=Text(Field(script,"guid",at),at+".m_Script.guid");
            string path=AssetDatabase.GUIDToAssetPath(guid);
            Require(!string.IsNullOrEmpty(path),at+": missing MonoScript GUID "+guid);
            var type=AssetDatabase.LoadAssetAtPath<MonoScript>(path)?.GetClass();
            Require(type!=null && type.Name==simple && typeof(MonoBehaviour).IsAssignableFrom(type),
                at+": MonoScript GUID resolves to the wrong Unity class "+guid);
            return type;
        }
        foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
            foreach (string ns in new[]{"UnityEngine.","UnityEngine.UI.","UnityEngine.EventSystems."})
            {
                Type type=assembly.GetType(ns+simple,false);
                if (type!=null && typeof(Component).IsAssignableFrom(type)) return type;
            }
        throw new InvalidDataException(at+": Unity component class unavailable "+name);
    }

    static void CheckRaw(N component, string at)
    {
        N raw=Field(component,"sourceSerialized",at);
        string expected=Text(Field(component,"sourceDocumentSha256",at),at+".sourceDocumentSha256");
        Require(Sha(Text(Field(raw,"rawYaml",at),at+".rawYaml"))==expected &&
            Text(Field(raw,"sha256",at),at+".sha256")==expected,
            at+": immutable source YAML backup hash mismatch");
    }

    static bool BlankStringScalar(N component,string path,string at)
    {
        N raw=Field(component,"sourceSerialized",at);
        if(Int(Field(raw,"classId",at),at+".classId")!=114) return false;
        string type=Text(Field(component,"typeId",at),at+".typeId");
        bool name=path==".m_Name";
        bool eventArgument=(type=="unity.Button"||type=="unity.Slider") && Regex.IsMatch(path,
            @"^\.m_On(?:Click|ValueChanged)\.m_PersistentCalls\.m_Calls\[\d+\]\.m_Arguments\."+
            @"(?:m_ObjectArgumentAssemblyTypeName|m_StringArgument)$");
        if(!name&&!eventArgument) return false;
        string leaf=path.Substring(path.LastIndexOf('.')+1);
        string indent=name?"  ":"          ";
        string yaml=Text(Field(raw,"rawYaml",at),at+".rawYaml");
        return Regex.Matches(yaml,"^"+Regex.Escape(indent+leaf)+@":[ \t]*\r?$",
            RegexOptions.Multiline).Count==1;
    }
    static bool SameShape(N actual,N source,N component,string at,string path="")
    {
        if(source.IsNull)
        {
            Require(BlankStringScalar(component,path,at),at+path+": null lacks a confirmed blank Unity string scalar");
            return actual.String!=null;
        }
        if(actual.Object!=null||source.Object!=null)
            return actual.Object!=null&&source.Object!=null&&
                actual.Object.Keys.OrderBy(x=>x).SequenceEqual(source.Object.Keys.OrderBy(x=>x))&&
                actual.Object.All(pair=>SameShape(pair.Value,source.Object[pair.Key],component,at,path+"."+pair.Key));
        if(actual.Array!=null||source.Array!=null)
            return actual.Array!=null&&source.Array!=null&&actual.Array.Count==source.Array.Count&&
                actual.Array.Select((value,index)=>SameShape(value,source.Array[index],component,at,
                    path+"["+index+"]")).All(x=>x);
        return (actual.Value==null&&source.Value==null)||
            (actual.Value!=null&&source.Value!=null&&actual.Value.GetType()==source.Value.GetType());
    }
    static N AtNativePath(N fields,string path,string at)
    {
        N current=fields;
        foreach(Match match in Regex.Matches(path,@"([^\.\[\]]+)|\[(\d+)\]"))
        {
            if(match.Groups[1].Success) current=Field(current,match.Groups[1].Value,at+path);
            else
            {
                int index=int.Parse(match.Groups[2].Value,CultureInfo.InvariantCulture);
                var array=Array(current,at+path);
                Require(index>=0&&index<array.Count,at+path+": reference array index missing");
                current=array[index];
            }
        }
        return current;
    }

    static void CheckHudDrivenEdits(N item,N draftObject,string id)
    {
        if(id!=HudId) return;
        Require(Field(item,"parentId",id).IsNull&&
            Text(Field(item,"ownership",id),id+".ownership")=="C",id+": root Canvas identity changed");
        var parts=Array(Field(item,"components",id),id+".components");
        N rect=parts.Single(x=>Text(Field(x,"typeId",id),id+".typeId")=="unity.RectTransform");
        N canvas=parts.Single(x=>Text(Field(x,"typeId",id),id+".typeId")=="unity.Canvas");
        N scaler=parts.Single(x=>Text(Field(x,"typeId",id),id+".typeId")=="unity.CanvasScaler");
        N rawRect=Field(Field(rect,"sourceSerialized",id),"fields",id);
        foreach(var pair in new[]{
            new {path="localPosition",actual=Field(item,"localPosition",id),source=Field(rawRect,"m_LocalPosition",id)},
            new {path="localScale",actual=Field(item,"localScale",id),source=Field(rawRect,"m_LocalScale",id)},
        })
            Require(PhysicsLevelV2Json.Write(pair.actual)==PhysicsLevelV2Json.Write(pair.source),
                id+"."+pair.path+": engine-driven root Canvas edit is unsupported");
        N layout=Field(item,"rectTransform",id);
        N originalLayout=Field(draftObject,"rectTransform",id);
        foreach(string key in new[]{"anchoredPosition","sizeDelta","pivot","offsetMin","offsetMax"})
            Require(PhysicsLevelV2Json.Write(Field(layout,key,id))==
                PhysicsLevelV2Json.Write(Field(originalLayout,key,id)),
                id+".rectTransform."+key+": engine-driven root Canvas edit is unsupported");
        foreach(var pair in new[]{
            new {part=canvas,keys=new[]{"m_RenderMode"}},
            new {part=scaler,keys=new[]{"m_UiScaleMode","m_ReferenceResolution","m_MatchWidthOrHeight"}},
        })
        {
            N fields=Field(Field(pair.part,"data",id),"fields",id);
            N raw=Field(Field(pair.part,"sourceSerialized",id),"fields",id);
            foreach(string key in pair.keys)
                Require(PhysicsLevelV2Json.Write(Field(fields,key,id))==
                    PhysicsLevelV2Json.Write(Field(raw,key,id)),
                    id+"."+key+": root Canvas layout configuration edit is unsupported");
        }
        Require(Int(Field(Field(Field(canvas,"sourceSerialized",id),"fields",id),"m_RenderMode",id),id)==0&&
            Int(Field(Field(Field(scaler,"sourceSerialized",id),"fields",id),"m_UiScaleMode",id),id)==1,
            id+": audited root Screen Space Overlay Canvas contract changed");
    }

    static bool OrdinaryChildUi(N item,Dictionary<string,N> byId)
    {
        N parent=Field(item,"parentId","object");
        if(parent.IsNull||Field(item,"rectTransform","object").IsNull) return false;
        string pid=Text(parent,"object.parentId");
        if(!byId.TryGetValue(pid,out N parentObject)||
            Field(parentObject,"rectTransform",pid).IsNull) return false;
        return !Array(Field(item,"components","object"),"object.components").Any(c=>
            Text(Field(c,"typeId","part"),"part.typeId")=="unity.Canvas");
    }

    static void CheckOrdinaryUiPositionEdit(N item,N draftObject,N parentObject,string id)
    {
        N current=Field(item,"localPosition",id),original=Field(draftObject,"localPosition",id);
        foreach(string axis in new[]{"x","y"})
            Require(Number(Field(current,axis,id),id+".localPosition."+axis)==
                Number(Field(original,axis,id),id+".source.localPosition."+axis),
                id+".localPosition."+axis+": ordinary UI XY is derived from anchoredPosition; edit that field instead");
        var types=Array(Field(item,"components",id),id+".components")
            .Concat(Array(Field(parentObject,"components",id+".parent"),id+".parent.components"))
            .Select(c=>Text(Field(c,"typeId",id),id+".typeId")).ToList();
        Require(!types.Any(t=>t.Contains("LayoutGroup")||t.Contains("Fitter")),
            id+": layout-driven child UI requires a separate adapter");
    }

    static void CheckFontContract(N fields,N sourceFields,string id)
    {
        N font=Field(fields,"m_FontData",id),original=Field(sourceFields,"m_FontData",id+".source");
        string at=id+".m_FontData";
        int size=Int(Field(font,"m_FontSize",at),at+".m_FontSize");
        int min=Int(Field(font,"m_MinSize",at),at+".m_MinSize");
        int max=Int(Field(font,"m_MaxSize",at),at+".m_MaxSize");
        int bestFit=Int(Field(font,"m_BestFit",at),at+".m_BestFit");
        Require(size>=0&&size<=300&&min>=0&&min<=size&&max>=0&&max<=300&&
            (bestFit==0||bestFit==1),at+": invalid uGUI FontData value");
        bool unchanged=new[]{"m_FontSize","m_MinSize","m_MaxSize","m_BestFit"}.All(key=>
            PhysicsLevelV2Json.Write(Field(font,key,at))==
            PhysicsLevelV2Json.Write(Field(original,key,at+".source")));
        fontLegacyConflict=max<size&&unchanged&&size==46&&min==10&&max==40&&bestFit==0;
        Require(max>=size||fontLegacyConflict,at+
            ": m_MaxSize below m_FontSize; edit both fields to a valid uGUI range");
        fontSourceMax=max;
        fontEffectiveMax=Math.Max(size,max);
    }

    static void Preflight(N level, N source,N draft)
    {
        Keys(level,"$","formatVersion","levelId","roomId","coverage","sourceScene",
            "sceneConfig","objects","events","sourceCalls","resourceIds");
        Keys(Field(level,"sceneConfig","$"),"$.sceneConfig","dataStatus","sourceSceneSha256",
            "data","sourceHeader","sourceDocuments","sourceReferences");
        Require(Int(Field(level,"formatVersion","$"),"$.formatVersion")==3 &&
            Text(Field(level,"roomId","$"),"$.roomId")=="room1" &&
            Text(Field(level,"levelId","$"),"$.levelId")==LevelId &&
            Text(Field(level,"coverage","$"),"$.coverage")=="partial" &&
            Text(Field(Field(level,"sourceScene","$"),"sha256","$.sourceScene"),"$.sourceScene.sha256")==SceneSha,
            "M1.3B requires an audited partial Level1 V3 candidate");
        Require(PhysicsLevelV2Json.Write(Field(level,"sourceCalls","$"))==
            PhysicsLevelV2Json.Write(Field(source,"persistentCalls","source"))&&
            Array(Field(level,"sourceCalls","$"),"$.sourceCalls").Count==5,
            "M1.3B Level1 persistent UnityEvent source calls changed");
        Require(Text(Field(Field(level,"sceneConfig","$"),"dataStatus","$.sceneConfig"),
            "$.sceneConfig.dataStatus")=="sourceOnly",
            "M1.3B scene settings cannot claim mapped behavior yet");
        foreach(string key in new[]{"sourceScene","sceneConfig","events","sourceCalls","resourceIds"})
            Require(PhysicsLevelV2Json.Write(Field(level,key,"$"))==
                PhysicsLevelV2Json.Write(Field(draft,key,"sourceDraft")),
                "$."+key+": source-only V3 data changed without an adapter");
        var objects=Array(Field(level,"objects","$"),"$.objects");
        var candidateById=objects.ToDictionary(x=>Text(Field(x,"id","object"),"object.id"),
            StringComparer.Ordinal);
        var draftObjects=Array(Field(draft,"objects","sourceDraft"),"sourceDraft.objects")
            .ToDictionary(x=>Text(Field(x,"id","source object"),"id"),StringComparer.Ordinal);
        var originals=Array(Field(source,"objects","source"),"source.objects")
            .ToDictionary(x=>Text(Field(x,"objectId","source object"),"objectId"),StringComparer.Ordinal);
        Require(objects.Count==71 && originals.Count==71,"M1.3B Level1 must contain 71 audited objects");
        var ids=new HashSet<string>(StringComparer.Ordinal);
        var componentIds=new HashSet<string>(StringComparer.Ordinal);
        foreach (N item in objects)
        {
            Keys(item,"object","id","sourceFileId","ownership","name","parentId","active",
                "layer","tag","localPosition","localRotation","localScale","rectTransform",
                "responsibility","components","siblingIndex","sourceSerialized","sourceReferences");
            string id=Text(Field(item,"id","object"),"object.id");
            Require(ids.Add(id),id+": duplicate stable object ID");
            if(!originals.TryGetValue(id,out N original))
                throw new InvalidDataException(id+": unknown stable object ID");
            Require(draftObjects.TryGetValue(id,out N draftObject),id+": M1.2 V3 draft object missing");
            foreach(string key in new[]{"ownership","responsibility","sourceSerialized","sourceReferences"})
                Require(PhysicsLevelV2Json.Write(Field(item,key,id))==
                    PhysicsLevelV2Json.Write(Field(draftObject,key,id)),
                    id+"."+key+": immutable V3 source field changed");
            Require(Text(Field(item,"sourceFileId",id),id+".sourceFileId")==
                Text(Field(original,"sourceFileId",id),id+".sourceFileId"),id+": source fileID changed");
            N goRaw=Field(item,"sourceSerialized",id);
            Require(Sha(Text(Field(goRaw,"rawYaml",id),id+".sourceSerialized.rawYaml"))==
                Text(Field(original,"sourceGameObjectSha256",id),id+".sourceGameObjectSha256")&&
                Text(Field(goRaw,"sha256",id),id+".sourceSerialized.sha256")==
                Text(Field(original,"sourceGameObjectSha256",id),id+".sourceGameObjectSha256"),
                id+": immutable source GameObject backup changed");
            var parts=Array(Field(item,"components",id),id+".components");
            var sourceParts=Array(Field(original,"components",id),id+".source.components");
            Require(parts.Count==sourceParts.Count,id+": source component count changed");
            foreach(N part in parts)
            {
                Keys(part,id+".component","componentId","sourceFileId","typeId","version",
                    "enabled","dataStatus","data","sourceDocumentSha256","sourceSerialized",
                    "sourceReferences");
                string cid=Text(Field(part,"componentId",id),id+".componentId");
                N src=sourceParts.SingleOrDefault(x=>Text(Field(x,"componentId",id),"componentId")==cid);
                N draftPart=Array(Field(draftObject,"components",id),id+".draft.components")
                    .SingleOrDefault(x=>Text(Field(x,"componentId",id),"componentId")==cid);
                Require(componentIds.Add(cid) && src!=null,cid+": duplicate/unknown stable component ID");
                Require(draftPart!=null &&
                    PhysicsLevelV2Json.Write(Field(part,"sourceSerialized",cid))==
                    PhysicsLevelV2Json.Write(Field(draftPart,"sourceSerialized",cid)),
                    cid+": immutable V3 source component document changed");
                Require(Text(Field(part,"dataStatus",cid),cid+".dataStatus")=="m13bCandidate" &&
                    Text(Field(part,"sourceFileId",cid),cid+".sourceFileId")==
                    Text(Field(src,"sourceFileId",cid),cid+".sourceFileId") &&
                    Text(Field(part,"typeId",cid),cid+".typeId")==
                    "unity."+Text(Field(src,"unityType",cid),cid+".unityType"),
                    cid+": candidate type/source mismatch");
                Require(Text(Field(part,"sourceDocumentSha256",cid),cid+".sourceDocumentSha256")==
                    Text(Field(src,"sourceDocumentSha256",cid),cid+".source.sourceDocumentSha256"),
                    cid+": immutable source component hash changed");
                CheckRaw(part,cid);
                N data=Field(part,"data",cid);
                Require(data.Object!=null&&data.Object.Keys.OrderBy(x=>x).SequenceEqual(
                    new[]{"fields","references"}),cid+": unknown/missing candidate data key");
                var designRefs=Array(Field(data,"references",cid),cid+".references");
                var sourceRefs=Array(Field(part,"sourceReferences",cid),cid+".sourceReferences");
                Require(PhysicsLevelV2Json.Write(Field(part,"sourceReferences",cid))==
                    PhysicsLevelV2Json.Write(Field(src,"references",cid)),
                    cid+": immutable source reference provenance changed");
                N native=Field(data,"fields",cid);
                N backup=Field(Field(part,"sourceSerialized",cid),"fields",cid);
                if(cid==FontComponentId) CheckFontContract(native,backup,cid);
                Require(SameShape(native,backup,part,cid)&&designRefs.Count==sourceRefs.Count,
                    cid+": structured field/reference type or coverage mismatch");
                string type=Text(Field(part,"typeId",cid),cid+".typeId");
                if(type=="unity.Transform"||type=="unity.RectTransform")
                    Require(PhysicsLevelV2Json.Write(native)==PhysicsLevelV2Json.Write(backup),
                        cid+": Transform must be edited through ObjectV3 fields");
                foreach(string key in Structural)
                    if(backup.Object.ContainsKey(key))
                        Require(PhysicsLevelV2Json.Write(Field(native,key,cid))==
                            PhysicsLevelV2Json.Write(Field(backup,key,cid)),
                            cid+"."+key+": structural source field cannot override V3 authority");
                for(int i=0;i<sourceRefs.Count;i++)
                {
                    Require(designRefs[i].Object!=null&&designRefs[i].Object.Keys.OrderBy(x=>x)
                        .SequenceEqual(new[]{"fieldPath","target"}),cid+": unknown reference entry key");
                    string path=Text(Field(sourceRefs[i],"fieldPath",cid),cid+".source.fieldPath");
                    Require(PhysicsLevelV2Json.Write(AtNativePath(native,path,cid))==
                        PhysicsLevelV2Json.Write(AtNativePath(backup,path,cid)),
                        cid+path+": native fileID cannot override stable reference");
                    Require(Text(Field(designRefs[i],"fieldPath",cid),cid+".data.fieldPath")==path,
                        cid+path+": stable reference field path/order changed");
                    string sourceKind=Text(Field(sourceRefs[i],"kind",cid),cid+path+".source.kind");
                    N target=Field(designRefs[i],"target",cid+path);
                    Require(sourceKind=="null"?target.IsNull:
                        !target.IsNull&&Text(Field(target,"kind",cid+path),cid+path+".kind")==sourceKind,
                        cid+path+": reference null/type semantics changed");
                    if(path==".m_GameObject"||path==".m_Script"||path==".m_Father"||
                        path.StartsWith(".m_Children[",StringComparison.Ordinal)||
                        path==".m_CorrespondingSourceObject"||path==".m_PrefabInstance"||path==".m_PrefabAsset")
                    {
                        if(sourceKind=="object") Require(Text(Field(target,"objectId",cid+path),cid+path+".objectId")==
                            Text(Field(sourceRefs[i],"objectId",cid+path),cid+path+".source.objectId"),
                            cid+path+": structural object binding changed");
                        if(sourceKind=="component") Require(Text(Field(target,"componentId",cid+path),cid+path+".componentId")==
                            Text(Field(sourceRefs[i],"componentId",cid+path),cid+path+".source.componentId"),
                            cid+path+": structural component binding changed");
                        if(sourceKind=="asset") Require(Text(Field(target,"assetId",cid+path),cid+path+".assetId")==
                            Text(Field(sourceRefs[i],"assetId",cid+path),cid+path+".source.assetId"),
                            cid+path+": structural asset binding changed");
                    }
                }
            }
            CheckHudDrivenEdits(item,draftObject,id);
            if(OrdinaryChildUi(item,candidateById)) CheckOrdinaryUiPositionEdit(item,draftObject,
                candidateById[Text(Field(item,"parentId",id),id+".parentId")],id);
        }
        Require(componentIds.Count==254,"M1.3B Level1 must contain 254 audited components");
    }

    static int Priority(N part)
    {
        string type=Text(Field(part,"typeId","part"),"typeId");
        if(type=="unity.Transform"||type=="unity.RectTransform") return 0;
        if(type=="unity.BoxCollider2D"||type=="unity.Rigidbody2D"||type=="unity.CanvasRenderer") return 1;
        if(type=="unity.SpriteRenderer") return 2;
        return 3;
    }
    static int Depth(Transform transform)
    {
        int depth=0;
        while(transform.parent!=null)
        {
            depth++;
            Require(depth<=71,"Level1 hierarchy cycle or unexpected depth");
            transform=transform.parent;
        }
        return depth;
    }

    static void Differences(N before,N after,string path,List<string> changes)
    {
        if(before.Object!=null&&after.Object!=null)
        {
            Require(before.Object.Keys.OrderBy(x=>x).SequenceEqual(after.Object.Keys.OrderBy(x=>x)),
                path+": candidate JSON field set changed");
            foreach(string key in before.Object.Keys) Differences(before.Object[key],after.Object[key],path+"."+key,changes);
        }
        else if(before.Array!=null&&after.Array!=null)
        {
            Require(before.Array.Count==after.Array.Count,path+": candidate JSON array length changed");
            for(int i=0;i<before.Array.Count;i++) Differences(before.Array[i],after.Array[i],path+"["+i+"]",changes);
        }
        else if(!string.Equals(PhysicsLevelV2Json.Write(before),PhysicsLevelV2Json.Write(after),StringComparison.Ordinal))
            changes.Add(path);
    }
    static void VerifyEdited(N baseline,N edited)
    {
        var items=Array(Field(edited,"objects","$"),"$.objects");
        int ground=items.FindIndex(o=>Text(Field(o,"id","object"),"object.id")==
            "46c11342-6027-593d-87d5-ff1d6cb512b2");
        int vent=items.FindIndex(o=>Text(Field(o,"id","object"),"object.id")==
            "fa949e9b-1ebb-54c1-b252-8ae8a737e2b3");
        Require(ground>=0&&vent>=0,"M1.3B edited source IDs missing");
        var ventParts=Array(Field(items[vent],"components","vent"),"vent.components");
        int ventComponent=ventParts.FindIndex(p=>Text(Field(p,"typeId","part"),"typeId")=="unity.AirVentBlock");
        Require(ventComponent>=0,"M1.3B AirVentBlock component missing");
        var changes=new List<string>();Differences(baseline,edited,"$",changes);
        string groundPath="$.objects["+ground+"].localPosition.x";
        string ventPath="$.objects["+vent+"].components["+ventComponent+"].data.fields.upwardForce";
        Require(changes.Count==2&&changes.Contains(groundPath)&&changes.Contains(ventPath),
            "M1.3B edited fixture changed unexpected V3 fields: "+string.Join("; ",changes));
        Require(Math.Abs(Number(Field(Field(items[ground],"localPosition","ground"),"x","ground"),"ground.x")+4.5)<.0001&&
            Math.Abs(Number(Field(Field(Field(ventParts[ventComponent],"data","vent"),"fields","vent"),
                "upwardForce","vent"),"vent.upwardForce")-20)<.0001,
            "M1.3B edited V3 values differ from the planned test");
    }

    [MenuItem("Physics Level Editor/M1.3B-1/Attempt isolated Level1 baseline rebuild")]
    public static void AttemptBaseline() => Attempt(Candidate,false);

    [MenuItem("Physics Level Editor/M1.3B-1/Attempt isolated Level1 edited rebuild")]
    public static void AttemptEdited() => Attempt(EditedCandidate,true);

    // Reads the existing isolated Level1 Scene and V3 candidate. It never applies
    // a property, saves a Scene, or changes the active Scene. A unique TSV report
    // records every candidate field with the actual Unity SerializedPropertyType.
    [MenuItem("Physics Level Editor/M1.3B-1/Audit isolated Level1 property types")]
    public static void AuditPropertyTypes()
    {
        Scene opened=default(Scene);
        try
        {
            Isolation();
            N level=PhysicsLevelV2Json.Parse(File.ReadAllText(FileAt(Candidate)));
            N source=PhysicsLevelV2Json.Parse(File.ReadAllText(FileAt(Source)));
            N draft=PhysicsLevelV2Json.Parse(File.ReadAllText(FileAt(SourceDraft)));
            Preflight(level,source,draft);
            var expected=Array(Field(level,"objects","$"),"$.objects");
            var bySourceFile=new Dictionary<string,N>(StringComparer.Ordinal);
            foreach(N item in expected)
            foreach(N part in Array(Field(item,"components","object"),"components"))
                bySourceFile.Add(Text(Field(part,"sourceFileId","part"),"sourceFileId"),part);
            const string path="Assets/Scenes/Level1.unity";
            Scene scene=SceneManager.GetActiveScene();
            if(scene.path!=path)
            {
                opened=EditorSceneManager.OpenScene(path,OpenSceneMode.Additive);
                scene=opened;
            }
            var rows=new List<string>{"propertyType\tcomponentId\tfieldPath\timport\tvalidation\treadback\tspecial"};
            int objectCount=0,componentCount=0;
            var seen=new HashSet<string>(StringComparer.Ordinal);
            foreach(var transform in scene.GetRootGameObjects().SelectMany(root=>
                root.GetComponentsInChildren<Transform>(true)))
            {
                objectCount++;
                foreach(Component component in transform.GetComponents<Component>())
                {
                    Require(component!=null,"Level1 contains a missing Unity component");
                    string fileId=GlobalObjectId.GetGlobalObjectIdSlow(component).targetObjectId.ToString();
                    Require(bySourceFile.TryGetValue(fileId,out N part),
                        "Level1 component fileID absent from V3 source map: "+fileId);
                    string cid=Text(Field(part,"componentId",fileId),fileId+".componentId");
                    Require(seen.Add(cid),cid+": duplicate source component in Unity Scene");
                    componentCount++;
                    var so=new SerializedObject(component);
                    var refs=new HashSet<string>(Array(Field(Field(part,"data",cid),"references",cid),
                        cid+".references").Select(x=>Text(Field(x,"fieldPath",cid),cid+".fieldPath")),
                        StringComparer.Ordinal);
                    foreach(var field in Field(Field(part,"data",cid),"fields",cid).Object)
                    {
                        if(Structural.Contains(field.Key)) continue;
                        string fieldPath="."+field.Key;
                        var property=so.FindProperty(field.Key);
                        Require(property!=null,cid+fieldPath+": Unity property missing during type audit");
                        AuditProperty(property,field.Value,fieldPath,refs,cid,rows);
                    }
                }
            }
            Require(objectCount==71&&componentCount==254&&seen.Count==254,
                "Level1 audit source coverage differs: objects="+objectCount+", components="+componentCount);
            string report=FileAt("Temp/M13B1SerializedPropertyAudit_"+Guid.NewGuid().ToString("N")+".tsv");
            File.WriteAllLines(report,rows,Encoding.UTF8);
            foreach(var group in rows.Skip(1).Select(line=>line.Split('\t')).GroupBy(parts=>parts[0]))
                Debug.Log("M13B1_PROPERTY_TYPE type="+group.Key+" count="+group.Count()+
                    " unsupported="+group.Count(parts=>parts[3]=="UNSUPPORTED"));
            Debug.Log("M13B1_PROPERTY_AUDIT_STATUS=PASS; objects=71; components=254; fields="+
                (rows.Count-1)+"; report="+report+"; sceneSaved=False; rebuild=NOT_RUN");
        }
        catch(Exception ex)
        {
            Debug.LogError("M13B1_PROPERTY_AUDIT_STATUS=FAIL; rebuild=NOT_RUN; "+ex);
        }
        finally
        {
            if(opened.IsValid()&&opened.isLoaded) EditorSceneManager.CloseScene(opened,true);
        }
    }

    static void AuditProperty(SerializedProperty property,N value,string path,
        HashSet<string> refs,string cid,List<string> rows)
    {
        string type=property.propertyType.ToString();
        string support="UNSUPPORTED",validation="NO",readback="NO",special="";
        if(property.propertyType==SerializedPropertyType.ObjectReference&&refs.Contains(path))
        {
            support="TYPED_REFERENCE";validation="YES";readback="YES";special="Stable ID binding";
        }
        else if(property.propertyType==SerializedPropertyType.Rect&&CameraViewport(property,path))
        {
            support="SUPPORTED";validation="YES";readback="YES";special="Camera viewport Rect v2";
        }
        else if(property.propertyType==SerializedPropertyType.String)
        {
            support="SUPPORTED";validation="YES";readback="YES";special="Blank YAML scalar provenance checked";
        }
        else if(property.propertyType==SerializedPropertyType.Generic&&
            (value.Object!=null||property.isArray&&value.Array!=null))
        {
            support="SUPPORTED";validation="PARTIAL";readback="YES";special="Recursive structure";
        }
        else if(property.propertyType==SerializedPropertyType.Integer||
            property.propertyType==SerializedPropertyType.Boolean||
            property.propertyType==SerializedPropertyType.Float||
            property.propertyType==SerializedPropertyType.Enum||
            property.propertyType==SerializedPropertyType.LayerMask||
            property.propertyType==SerializedPropertyType.Color||
            property.propertyType==SerializedPropertyType.Vector2||
            property.propertyType==SerializedPropertyType.Vector3||
            property.propertyType==SerializedPropertyType.Vector4||
            property.propertyType==SerializedPropertyType.Quaternion)
        {
            support="SUPPORTED";validation="PARTIAL";readback="YES";
            special=property.propertyType==SerializedPropertyType.Float&&path==".m_Density"?
                "Collider density guarded by Rigidbody2D":"";
        }
        rows.Add(type+"\t"+cid+"\t"+path+"\t"+support+"\t"+validation+"\t"+readback+"\t"+special);
        if(property.isArray&&property.propertyType!=SerializedPropertyType.String)
        {
            var items=Array(value,cid+path);
            for(int i=0;i<items.Count;i++)
                AuditProperty(property.GetArrayElementAtIndex(i),items[i],path+"["+i+"]",refs,cid,rows);
        }
        else if(property.propertyType==SerializedPropertyType.Generic&&value.Object!=null)
            foreach(var entry in value.Object)
            {
                var child=property.FindPropertyRelative(entry.Key);
                Require(child!=null,cid+path+"."+entry.Key+": Unity nested property missing during audit");
                AuditProperty(child,entry.Value,path+"."+entry.Key,refs,cid,rows);
            }
    }

    static void Attempt(string path,bool editedFixture)
    {
        Scene scene=default(Scene);
        string output=null;
        childUiTrace=new List<string>();
        guideCanvasTrace=new List<string>();
        fontTrace=new List<string>();
        currentAssertStage=null;
        fontLegacyConflict=false;
        fontSourceMax=fontEffectiveMax=fontOriginalLoadedMax=0;
        try
        {
            Isolation();
            N level=PhysicsLevelV2Json.Parse(File.ReadAllText(FileAt(path)));
            N source=PhysicsLevelV2Json.Parse(File.ReadAllText(FileAt(Source)));
            Require(Sha(File.ReadAllBytes(FileAt(SourceDraft)))==SourceDraftSha,
                "M1.2 Level1 V3 source draft SHA-256 changed");
            N draft=PhysicsLevelV2Json.Parse(File.ReadAllText(FileAt(SourceDraft)));
            Preflight(level,source,draft);
            if(editedFixture)
            {
                N baseline=PhysicsLevelV2Json.Parse(File.ReadAllText(FileAt(Candidate)));
                Preflight(baseline,source,draft);
                VerifyEdited(baseline,level);
                Preflight(level,source,draft); // Restore the edited fixture's font contract.
            }
            HudSnapshot originalHud=CaptureOriginalHud();
            if(fontLegacyConflict)
                Require(fontOriginalLoadedMax==fontEffectiveMax,
                    FontComponentId+".m_FontData.m_MaxSize: original Unity loaded value "+
                    fontOriginalLoadedMax+" differs from audited uGUI normalization "+fontEffectiveMax);
            var objects=Array(Field(level,"objects","$"),"$.objects");
            var candidateById=objects.ToDictionary(x=>Text(Field(x,"id","object"),"object.id"),
                StringComparer.Ordinal);
            output=ScenePrefix+Guid.NewGuid().ToString("N")+".unity";
            Require(!File.Exists(FileAt(output)),"Generated Scene path already exists");
            scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Additive);
            var byId=new Dictionary<string,GameObject>(StringComparer.Ordinal);
            var byComponent=new Dictionary<string,Component>(StringComparer.Ordinal);
            foreach(N item in objects)
            {
                string id=Text(Field(item,"id","object"),"object.id");
                bool rect=Array(Field(item,"components",id),id+".components").Any(c=>
                    Text(Field(c,"typeId",id),id+".typeId")=="unity.RectTransform");
                var go=rect ? new GameObject(Text(Field(item,"name",id),id+".name"),typeof(RectTransform)) :
                    new GameObject(Text(Field(item,"name",id),id+".name"));
                go.SetActive(false);
                SceneManager.MoveGameObjectToScene(go,scene);
                go.tag=Text(Field(item,"tag",id),id+".tag");
                go.layer=Int(Field(item,"layer",id),id+".layer");
                go.AddComponent<LevelObjectId>().SetId(id);
                go.AddComponent<LevelComponentIdMap>();
                if(Text(Field(item,"ownership",id),id+".ownership")=="C")
                {
                    N responsibility=Field(item,"responsibility",id);
                    go.AddComponent<LevelRunnerBindingV3>().Set(
                        Text(Field(responsibility,"templateSlot",id),id+".templateSlot"),
                        Text(Field(responsibility,"configPath",id),id+".configPath"));
                }
                byId.Add(id,go);
                if(id==HudId) TraceHud("GO_CREATED",go);
                if(id==GuideId) TraceGuideCanvas("GO_CREATED",go);
                if(id==ChildUiId) TraceChildUi("GO_CREATED",go);
            }
            foreach(N item in objects)
            {
                string id=Text(Field(item,"id","object"),"object.id");
                N parent=Field(item,"parentId",id);
                if(!parent.IsNull)
                {
                    string pid=Text(parent,id+".parentId");
                    Require(byId.TryGetValue(pid,out GameObject p),id+": parent ID missing "+pid);
                    if(id==ChildUiId) TraceChildUi("BEFORE_SETPARENT_FALSE",byId[id]);
                    byId[id].transform.SetParent(p.transform,false);
                    if(id==ChildUiId) TraceChildUi("AFTER_SETPARENT_FALSE",byId[id]);
                }
            }
            foreach(N item in objects.OrderBy(x=>Depth(byId[Text(Field(x,"id","object"),"id")].transform)))
            {
                string id=Text(Field(item,"id","object"),"object.id");
                var go=byId[id];
                if(go.transform is RectTransform rect)
                {
                    N data=Field(item,"rectTransform",id);
                    Require(!data.IsNull,id+": missing RectTransform design data");
                    rect.anchorMin=Vec2(Field(data,"anchorMin",id),id+".anchorMin");
                    rect.anchorMax=Vec2(Field(data,"anchorMax",id),id+".anchorMax");
                    if(id==ChildUiId) TraceChildUi("AFTER_ANCHORS_WRITTEN",go);
                    bool childUi=OrdinaryChildUi(item,candidateById);
                    if(!childUi)
                    {
                        if(id==ChildUiId) TraceChildUi("BEFORE_ANCHORED_POSITION_WRITE",go);
                        rect.anchoredPosition=Vec2(Field(data,"anchoredPosition",id),id+".anchoredPosition");
                        if(id==ChildUiId) TraceChildUi("AFTER_ANCHORED_POSITION_WRITE",go);
                    }
                    rect.sizeDelta=Vec2(Field(data,"sizeDelta",id),id+".sizeDelta");
                    if(id==ChildUiId) TraceChildUi("AFTER_SIZE_DELTA_WRITE",go);
                    rect.pivot=Vec2(Field(data,"pivot",id),id+".pivot");
                    if(id==ChildUiId) TraceChildUi("AFTER_PIVOT_WRITE",go);
                }
                // For ordinary child UI, Unity couples local XY to anchoredPosition.
                // V3 local XY preserves source YAML provenance; anchoredPosition drives layout.
                if(id==ChildUiId) TraceChildUi("BEFORE_LOCAL_POSITION_WRITE",go);
                go.transform.localPosition=Vec3(Field(item,"localPosition",id),id+".localPosition");
                if(id==ChildUiId) TraceChildUi("AFTER_LOCAL_POSITION_WRITE",go);
                if(go.transform is RectTransform childRect && OrdinaryChildUi(item,candidateById))
                {
                    if(id==ChildUiId) TraceChildUi("BEFORE_ANCHORED_POSITION_WRITE_FINAL",go);
                    childRect.anchoredPosition=Vec2(Field(Field(item,"rectTransform",id),
                        "anchoredPosition",id),id+".rectTransform.anchoredPosition");
                    if(id==ChildUiId) TraceChildUi("AFTER_ANCHORED_POSITION_WRITE_FINAL",go);
                }
                go.transform.localRotation=Quat(Field(item,"localRotation",id),id+".localRotation");
                go.transform.localScale=Vec3(Field(item,"localScale",id),id+".localScale");
                if(id==HudId) TraceHud("RECT_FIELDS_WRITTEN",go);
                if(id==GuideId) TraceGuideCanvas("REBUILT_FIELDS_WRITTEN",go);
                if(id==ChildUiId) TraceChildUi("RECT_FIELDS_WRITTEN",go);
                foreach(N part in Array(Field(item,"components",id),id+".components").OrderBy(Priority))
                {
                    string cid=Text(Field(part,"componentId",id),id+".componentId");
                    Type type=UnityType(part,cid);
                    Component instance=type==typeof(Transform)||type==typeof(RectTransform)?go.transform:go.GetComponent(type);
                    if(instance==null) instance=go.AddComponent(type);
                    Require(instance!=null && !byComponent.ContainsKey(cid),cid+": component creation failed");
                    byComponent.Add(cid,instance);
                    go.GetComponent<LevelComponentIdMap>().Add(cid,Text(Field(part,"typeId",cid),cid+".typeId"),instance);
                }
                if(id==HudId) TraceHud("COMPONENTS_CREATED",go);
                if(id==GuideId) TraceGuideCanvas("COMPONENTS_CREATED",go);
                if(id==ChildUiId) TraceChildUi("COMPONENTS_CREATED",go);
                if(id==FontObjectId) TraceFont("COMPONENTS_CREATED",byComponent[FontComponentId]);
            }
            // Set order only after every sibling exists; source document order is not hierarchy order.
            foreach(var group in objects.GroupBy(x=>Field(x,"parentId","object").IsNull?
                "root":Text(Field(x,"parentId","object"),"parentId")))
            foreach(N item in group.OrderBy(x=>Int(Field(x,"siblingIndex","object"),"siblingIndex")))
            {
                string id=Text(Field(item,"id","object"),"id");
                byId[id].transform.SetSiblingIndex(Int(Field(item,"siblingIndex",id),id+".siblingIndex"));
            }
            foreach(N item in objects)
            foreach(N part in Array(Field(item,"components","object"),"components"))
            {
                string cid=Text(Field(part,"componentId","part"),"componentId");
                if(cid==FontComponentId) TraceFont("BEFORE_COMPONENT_CONFIG",byComponent[cid]);
                if(Text(Field(item,"id","object"),"object.id")==HudId)
                    TraceHud("BEFORE_COMPONENT_CONFIG_"+Text(Field(part,"typeId",cid),cid+".typeId"),byId[HudId]);
                ApplyFields(byComponent[cid],part,cid);
                if(cid==FontComponentId) TraceFont("AFTER_COMPONENT_CONFIG",byComponent[cid]);
                if(Text(Field(item,"id","object"),"object.id")==HudId)
                    TraceHud("AFTER_COMPONENT_CONFIG_"+Text(Field(part,"typeId",cid),cid+".typeId"),byId[HudId]);
                if(Text(Field(item,"id","object"),"object.id")==GuideId)
                    TraceGuideCanvas("AFTER_COMPONENT_CONFIG_"+
                        Text(Field(part,"typeId",cid),cid+".typeId"),byId[GuideId]);
                if(Text(Field(item,"id","object"),"object.id")==ChildUiId)
                    TraceChildUi("AFTER_COMPONENT_CONFIG_"+Text(Field(part,"typeId",cid),cid+".typeId"),byId[ChildUiId]);
            }
            foreach(N item in objects)
            foreach(N part in Array(Field(item,"components","object"),"components"))
            {
                string cid=Text(Field(part,"componentId","part"),"componentId");
                BindReferences(byComponent[cid],part,byId,byComponent,cid);
                if(cid==FontComponentId) TraceFont("AFTER_REFERENCE_BINDING",byComponent[cid]);
            }
            TraceHud("REFERENCES_BOUND",byId[HudId]);
            TraceGuideCanvas("REFERENCES_BOUND",byId[GuideId]);
            TraceChildUi("REFERENCES_BOUND",byId[ChildUiId]);
            foreach(N item in objects)
            {
                string id=Text(Field(item,"id","object"),"object.id");
                if(id==HudId)
                {
                    TraceHud("BEFORE_HUD_SET_ACTIVE",byId[id]);
                    TraceChildUi("BEFORE_PARENT_CANVAS_SET_ACTIVE",byId[ChildUiId]);
                }
                if(id==ChildUiId) TraceChildUi("BEFORE_CHILD_SET_ACTIVE",byId[id]);
                if(id==GuideId) TraceGuideCanvas("BEFORE_SET_ACTIVE",byId[id]);
                if(id==FontObjectId) TraceFont("BEFORE_OBJECT_SET_ACTIVE",byComponent[FontComponentId]);
                byId[id].SetActive(Bool(Field(item,"active",id),id+".active"));
                if(id==GuideId) TraceGuideCanvas("AFTER_SET_ACTIVE",byId[id]);
                if(id==FontObjectId) TraceFont("AFTER_OBJECT_SET_ACTIVE",byComponent[FontComponentId]);
                if(id==HudId)
                {
                    TraceHud("AFTER_HUD_SET_ACTIVE",byId[id]);
                    TraceChildUi("AFTER_PARENT_CANVAS_SET_ACTIVE",byId[ChildUiId]);
                }
                if(id==ChildUiId) TraceChildUi("AFTER_CHILD_SET_ACTIVE",byId[id]);
            }
            TraceHud("AFTER_ALL_ACTIVATIONS_BEFORE_LAYOUT",byId[HudId]);
            TraceGuideCanvas("AFTER_ALL_ACTIVATIONS_BEFORE_LAYOUT",byId[GuideId]);
            TraceChildUi("AFTER_ALL_ACTIVATIONS_BEFORE_LAYOUT",byId[ChildUiId]);
            Canvas.ForceUpdateCanvases();
            TraceFont("BEFORE_PRE_SAVE_ASSERT_AFTER_LAYOUT",byComponent[FontComponentId]);
            TraceHud("BEFORE_PRE_SAVE_ASSERT_AFTER_LAYOUT",byId[HudId]);
            TraceGuideCanvas("PRE_SAVE",byId[GuideId]);
            TraceChildUi("BEFORE_PRE_SAVE_ASSERT_AFTER_LAYOUT",byId[ChildUiId]);
            AssertCounts(scene,objects,byComponent);
            currentAssertStage="PRE_SAVE";
            AssertValues(scene,objects,"PRE_SAVE",originalHud);
            currentAssertStage=null;
            Require(EditorSceneManager.SaveScene(scene,output,false),"Unity did not save M1.3B Scene");
            EditorSceneManager.CloseScene(scene,true);scene=default(Scene);
            EditorSceneManager.OpenScene(output,OpenSceneMode.Single);
            var reopenedHud=SceneManager.GetActiveScene().GetRootGameObjects().SelectMany(root=>
                root.GetComponentsInChildren<LevelObjectId>(true)).Single(x=>x.ObjectId==HudId).gameObject;
            TraceHud("POST_REOPEN_BEFORE_LAYOUT",reopenedHud);
            var reopenedGuide=SceneManager.GetActiveScene().GetRootGameObjects().SelectMany(root=>
                root.GetComponentsInChildren<LevelObjectId>(true)).Single(x=>x.ObjectId==GuideId).gameObject;
            TraceGuideCanvas("POST_REOPEN_BEFORE_LAYOUT",reopenedGuide);
            var reopenedChild=SceneManager.GetActiveScene().GetRootGameObjects().SelectMany(root=>
                root.GetComponentsInChildren<LevelObjectId>(true)).Single(x=>x.ObjectId==ChildUiId).gameObject;
            TraceChildUi("POST_REOPEN_BEFORE_LAYOUT",reopenedChild);
            var reopenedFont=SceneManager.GetActiveScene().GetRootGameObjects().SelectMany(root=>
                root.GetComponentsInChildren<LevelObjectId>(true)).Single(x=>x.ObjectId==FontObjectId)
                .GetComponent<LevelComponentIdMap>().Entries.Single(x=>x.componentId==FontComponentId).target;
            TraceFont("POST_REOPEN_BEFORE_LAYOUT",reopenedFont);
            Canvas.ForceUpdateCanvases();
            TraceFont("POST_REOPEN_BEFORE_ASSERT_AFTER_LAYOUT",reopenedFont);
            TraceHud("POST_REOPEN_BEFORE_ASSERT_AFTER_LAYOUT",reopenedHud);
            TraceGuideCanvas("POST_REOPEN",reopenedGuide);
            TraceChildUi("POST_REOPEN_BEFORE_ASSERT_AFTER_LAYOUT",reopenedChild);
            currentAssertStage="POST_REOPEN";
            AssertValues(SceneManager.GetActiveScene(),objects,"POST_REOPEN",originalHud);
            currentAssertStage=null;
            Debug.Log("M13B1_CANDIDATE_STATUS=PASS; scene="+output+"; fixture="+
                (editedFixture?"edited":"baseline")+"; objects=71; sourceComponents=254; nativeFields=COMPARED; references=COMPARED");
            Debug.Log("M13B1_DATA_STATUS=INCOMPLETE; sceneConfig=SOURCE_ONLY; runnerTemplates=UNVERIFIED");
            Debug.Log("M13B1_PLAY_STATUS=NOT_RUN");
        }
        catch(Exception ex)
        {
            if(scene.IsValid()&&scene.isLoaded) EditorSceneManager.CloseScene(scene,true);
            string firstMismatch=ex.Message.Split('\n').FirstOrDefault(line=>
                line.StartsWith("VALUE_MISMATCH ",StringComparison.Ordinal)||
                line.StartsWith("MISSING ",StringComparison.Ordinal)||
                line.StartsWith("TYPE_MISMATCH ",StringComparison.Ordinal)||
                line.StartsWith("REFERENCE_MISMATCH ",StringComparison.Ordinal))??ex.Message.Split('\n')[0];
            string relevantSteps=childUiTrace==null?"none":string.Join(" | ",childUiTrace.Where(line=>
                line.Contains("SETPARENT")||line.Contains("POSITION_WRITE")||
                line.Contains("SET_ACTIVE")||line.Contains("BEFORE_PRE_SAVE_ASSERT")));
            string relevantFontSteps=fontTrace==null?"none":string.Join(" | ",fontTrace);
            string relevantGuideSteps=guideCanvasTrace==null?"none":string.Join(" | ",guideCanvasTrace.Where(
                line=>line.Contains("ORIGINAL_LEVEL1")||line.Contains("REBUILT_FIELDS_WRITTEN")||
                    line.Contains("BEFORE_SET_ACTIVE")||line.Contains("AFTER_SET_ACTIVE")||
                    line.Contains("PRE_SAVE")||line.Contains("POST_REOPEN")));
            Debug.LogError("M13B1_CANDIDATE_STATUS=FAIL; M13B1_DATA_STATUS=INCOMPLETE; M13B1_PLAY_STATUS=NOT_RUN; generatedScene="+
                (output??"none")+"; stage="+(currentAssertStage??"BEFORE_ASSERT")+
                "; firstMismatch="+firstMismatch+"; relevantWriteSteps="+relevantSteps+
                "; fontFieldSteps="+relevantFontSteps+
                "; guideCanvasSteps="+relevantGuideSteps+"; "+ex);
        }
        finally { childUiTrace=null; guideCanvasTrace=null; fontTrace=null; currentAssertStage=null;
            fontLegacyConflict=false; fontSourceMax=fontEffectiveMax=fontOriginalLoadedMax=0; }
    }

    static void TraceFont(string stage,Component component)
    {
        var text=component as Text;
        var property=component==null?null:new SerializedObject(component).FindProperty("m_FontData.m_MaxSize");
        string row=stage+"(objectId="+FontObjectId+",componentId="+FontComponentId+
            ",active="+(component==null?"N/A":component.gameObject.activeSelf.ToString())+
            ",propertyType="+(property==null?"MISSING":property.propertyType.ToString())+
            ",serializedMax="+(property==null ||
                (property.propertyType!=SerializedPropertyType.Integer&&
                property.propertyType!=SerializedPropertyType.Enum)?"N/A":
                property.longValue.ToString(CultureInfo.InvariantCulture))+
            ",fontSize="+(text==null?"N/A":text.fontSize.ToString(CultureInfo.InvariantCulture))+
            ",bestFit="+(text==null?"N/A":text.resizeTextForBestFit.ToString())+
            ",publicMax="+(text==null?"N/A":text.resizeTextMaxSize.ToString(CultureInfo.InvariantCulture))+")";
        if(fontTrace!=null) fontTrace.Add(row);
        Debug.Log("M13B1_FONT_TRACE "+row);
    }

    static void TraceHud(string stage,GameObject go) => TraceRootCanvas("HUD",stage,go);
    static void TraceGuideCanvas(string stage,GameObject go) => TraceRootCanvas("GUIDE_CANVAS",stage,go);

    static void TraceRootCanvas(string label,string stage,GameObject go)
    {
        var rect=go.transform as RectTransform;
        var canvas=go.GetComponent<Canvas>();
        var scaler=go.GetComponent<CanvasScaler>();
        if(label=="GUIDE_CANVAS" && guideCanvasTrace!=null) guideCanvasTrace.Add(stage+
            "(local="+PhysicsLevelV2Json.Write(Point(go.transform.localPosition))+
            ",scale="+PhysicsLevelV2Json.Write(Point(go.transform.localScale))+
            ",anchor="+(rect==null?"N/A":PhysicsLevelV2Json.Write(Point(rect.anchoredPosition)))+
            ",active="+go.activeSelf+")");
        Debug.Log("M13B1_"+label+"_TRACE stage="+stage+" active="+go.activeSelf+
            " transformType="+go.transform.GetType().Name+
            " parent="+(go.transform.parent==null?"null":go.transform.parent.name)+
            " siblingIndex="+go.transform.GetSiblingIndex()+
            " localPosition="+PhysicsLevelV2Json.Write(Point(go.transform.localPosition))+
            " localRotation="+PhysicsLevelV2Json.Write(Point(go.transform.localRotation))+
            " localScale="+PhysicsLevelV2Json.Write(Point(go.transform.localScale))+
            " anchorMin="+(rect==null?"N/A":PhysicsLevelV2Json.Write(Point(rect.anchorMin)))+
            " anchorMax="+(rect==null?"N/A":PhysicsLevelV2Json.Write(Point(rect.anchorMax)))+
            " anchoredPosition="+(rect==null?"N/A":PhysicsLevelV2Json.Write(Point(rect.anchoredPosition)))+
            " sizeDelta="+(rect==null?"N/A":PhysicsLevelV2Json.Write(Point(rect.sizeDelta)))+
            " pivot="+(rect==null?"N/A":PhysicsLevelV2Json.Write(Point(rect.pivot)))+
            " offsetMinDerived="+(rect==null?"N/A":PhysicsLevelV2Json.Write(Point(rect.offsetMin)))+
            " offsetMaxDerived="+(rect==null?"N/A":PhysicsLevelV2Json.Write(Point(rect.offsetMax)))+
            " canvas="+(canvas==null?"none":canvas.renderMode.ToString())+
            " canvasEnabled="+(canvas==null?"N/A":canvas.enabled.ToString())+
            " scaler="+(scaler==null?"none":scaler.uiScaleMode.ToString()+
                "/reference="+PhysicsLevelV2Json.Write(Point(scaler.referenceResolution))+
                "/screenMatchMode="+scaler.screenMatchMode+
                "/match="+scaler.matchWidthOrHeight.ToString("R",CultureInfo.InvariantCulture))+
            " screen="+Screen.width+"x"+Screen.height);
    }

    static void TraceChildUi(string stage,GameObject go)
    {
        var rect=go.transform as RectTransform;
        var parent=go.transform.parent as RectTransform;
        string layout=(go.GetComponent<LayoutGroup>()!=null?"LayoutGroup,":"")+
            (go.GetComponent<ContentSizeFitter>()!=null?"ContentSizeFitter,":"")+
            (go.GetComponent<AspectRatioFitter>()!=null?"AspectRatioFitter,":"");
        string parentLayout=go.transform.parent==null?"none":
            (go.transform.parent.GetComponent<LayoutGroup>()!=null?"LayoutGroup,":"")+
            (go.transform.parent.GetComponent<ContentSizeFitter>()!=null?"ContentSizeFitter,":"")+
            (go.transform.parent.GetComponent<AspectRatioFitter>()!=null?"AspectRatioFitter,":"");
        if(childUiTrace!=null) childUiTrace.Add(stage+"(local="+
            PhysicsLevelV2Json.Write(Point(go.transform.localPosition))+",anchor="+
            (rect==null?"N/A":PhysicsLevelV2Json.Write(Point(rect.anchoredPosition)))+
            ",active="+go.activeSelf+")");
        Debug.Log("M13B1_CHILD_UI_TRACE stage="+stage+" activeSelf="+go.activeSelf+
            " activeInHierarchy="+go.activeInHierarchy+
            " parent="+(go.transform.parent==null?"null":go.transform.parent.name)+
            " parentObjectId="+(go.transform.parent==null?"null":
                go.transform.parent.GetComponent<LevelObjectId>()?.ObjectId??"source-only")+
            " parentRectSize="+(parent==null?"N/A":PhysicsLevelV2Json.Write(Point(parent.rect.size)))+
            " localPosition="+PhysicsLevelV2Json.Write(Point(go.transform.localPosition))+
            " localScale="+PhysicsLevelV2Json.Write(Point(go.transform.localScale))+
            " anchorMin="+(rect==null?"N/A":PhysicsLevelV2Json.Write(Point(rect.anchorMin)))+
            " anchorMax="+(rect==null?"N/A":PhysicsLevelV2Json.Write(Point(rect.anchorMax)))+
            " anchoredPosition="+(rect==null?"N/A":PhysicsLevelV2Json.Write(Point(rect.anchoredPosition)))+
            " sizeDelta="+(rect==null?"N/A":PhysicsLevelV2Json.Write(Point(rect.sizeDelta)))+
            " pivot="+(rect==null?"N/A":PhysicsLevelV2Json.Write(Point(rect.pivot)))+
            " layout="+(layout==""?"none":layout)+
            " parentLayout="+(parentLayout==""?"none":parentLayout));
    }

    sealed class HudSnapshot
    {
        internal Vector3 localPosition,localScale;
        internal Vector2 anchoredPosition,sizeDelta,pivot;
        internal int screenWidth,screenHeight;
        internal RenderMode renderMode;
        internal CanvasScaler.ScaleMode scaleMode;
        internal Vector2 referenceResolution;
        internal float matchWidthOrHeight;
    }

    static HudSnapshot CaptureOriginalHud()
    {
        Scene opened=default(Scene);
        try
        {
            const string path="Assets/Scenes/Level1.unity";
            Scene scene=SceneManager.GetSceneByPath(path);
            if(!scene.IsValid()||!scene.isLoaded)
            {
                opened=EditorSceneManager.OpenScene(path,OpenSceneMode.Additive);
                scene=opened;
            }
            Require(!scene.isDirty,"Original Level1 Scene is dirty; refusing HUD comparison");
            var matches=scene.GetRootGameObjects().SelectMany(root=>
                root.GetComponentsInChildren<Transform>(true)).Select(t=>t.gameObject).Where(go=>
                GlobalObjectId.GetGlobalObjectIdSlow(go).targetObjectId.ToString()==HudSourceFileId).ToList();
            Require(matches.Count==1,"Original Level1 HUD source fileID "+HudSourceFileId+
                " resolved to "+matches.Count+" objects");
            GameObject go=matches[0];
            var guideMatches=scene.GetRootGameObjects().SelectMany(root=>
                root.GetComponentsInChildren<Transform>(true)).Select(t=>t.gameObject).Where(item=>
                GlobalObjectId.GetGlobalObjectIdSlow(item).targetObjectId.ToString()==
                GuideSourceFileId).ToList();
            Require(guideMatches.Count==1,"Original Level1 Guide Canvas source fileID "+
                GuideSourceFileId+" resolved to "+guideMatches.Count+" objects");
            GameObject guide=guideMatches[0];
            var childMatches=scene.GetRootGameObjects().SelectMany(root=>
                root.GetComponentsInChildren<Transform>(true)).Select(t=>t.gameObject).Where(item=>
                GlobalObjectId.GetGlobalObjectIdSlow(item).targetObjectId.ToString()==ChildUiSourceFileId).ToList();
            Require(childMatches.Count==1&&childMatches[0].transform.parent==go.transform,
                "Original Level1 child UI source fileID "+ChildUiSourceFileId+
                " missing or attached to wrong parent");
            GameObject child=childMatches[0];
            var sourceFonts=scene.GetRootGameObjects().SelectMany(root=>
                root.GetComponentsInChildren<Text>(true)).Where(component=>
                GlobalObjectId.GetGlobalObjectIdSlow(component).targetObjectId.ToString()==
                FontSourceFileId).ToList();
            Require(sourceFonts.Count==1 &&
                GlobalObjectId.GetGlobalObjectIdSlow(sourceFonts[0].gameObject).targetObjectId.ToString()==
                "1149207655","Original Level1 Text source component/fileID mismatch");
            fontOriginalLoadedMax=new SerializedObject(sourceFonts[0])
                .FindProperty("m_FontData.m_MaxSize").intValue;
            TraceFont("ORIGINAL_LEVEL1_LOADED",sourceFonts[0]);
            TraceHud("ORIGINAL_LEVEL1_LOADED",go);
            TraceGuideCanvas("ORIGINAL_LEVEL1_LOADED",guide);
            TraceChildUi("ORIGINAL_LEVEL1_LOADED",child);
            Canvas.ForceUpdateCanvases();
            TraceFont("ORIGINAL_LEVEL1_LAYOUT_UPDATED",sourceFonts[0]);
            TraceHud("ORIGINAL_LEVEL1_LAYOUT_UPDATED",go);
            TraceGuideCanvas("ORIGINAL_LEVEL1_LAYOUT_UPDATED",guide);
            TraceChildUi("ORIGINAL_LEVEL1_LAYOUT_UPDATED",child);
            var rect=go.transform as RectTransform;
            var canvas=go.GetComponent<Canvas>();
            var scaler=go.GetComponent<CanvasScaler>();
            Require(go.activeSelf&&go.transform.parent==null&&rect!=null&&canvas!=null&&scaler!=null&&
                canvas.renderMode==RenderMode.ScreenSpaceOverlay&&
                scaler.uiScaleMode==CanvasScaler.ScaleMode.ScaleWithScreenSize,
                "Original HUD is not the audited root Screen Space Overlay Canvas");
            Require(!scene.isDirty,"Original Level1 Scene became dirty during read-only inspection");
            return new HudSnapshot {
                localPosition=rect.localPosition,localScale=rect.localScale,
                anchoredPosition=rect.anchoredPosition,sizeDelta=rect.sizeDelta,pivot=rect.pivot,
                screenWidth=Screen.width,screenHeight=Screen.height,
                renderMode=canvas.renderMode,scaleMode=scaler.uiScaleMode,
                referenceResolution=scaler.referenceResolution,
                matchWidthOrHeight=scaler.matchWidthOrHeight
            };
        }
        finally
        {
            if(opened.IsValid()&&opened.isLoaded) EditorSceneManager.CloseScene(opened,true);
        }
    }

    [MenuItem("Physics Level Editor/M1.3B-1/Inspect isolated original Level1 HUD Canvas")]
    public static void InspectOriginalHud()
    {
        try
        {
            Isolation();
            CaptureOriginalHud();
            Debug.Log("M13B1_ORIGINAL_HUD_STATUS=PASS; sceneSaved=False; sourceFileId="+HudSourceFileId);
        }
        catch(Exception ex)
        {
            Debug.LogError("M13B1_ORIGINAL_HUD_STATUS=FAIL; sceneSaved=False; "+ex);
        }
    }

    [MenuItem("Physics Level Editor/M1.3B-1/Inspect isolated original Level1 Guide Canvas")]
    public static void InspectOriginalGuideCanvas()
    {
        try
        {
            Isolation();
            CaptureOriginalHud(); // Opens the audited source additively and closes it without saving.
            Debug.Log("M13B1_ORIGINAL_GUIDE_STATUS=PASS; sceneSaved=False; sourceFileId="+
                GuideSourceFileId+"; layoutSemantics=UNVERIFIED");
        }
        catch(Exception ex)
        {
            Debug.LogError("M13B1_ORIGINAL_GUIDE_STATUS=FAIL; sceneSaved=False; "+ex);
        }
    }

    static readonly HashSet<string> Structural=new HashSet<string>(StringComparer.Ordinal) {
        "m_ObjectHideFlags","m_CorrespondingSourceObject","m_PrefabInstance","m_PrefabAsset",
        "m_GameObject","m_Script","m_Enabled","m_EditorClassIdentifier",
        "m_EditorHideFlags","serializedVersion"
    };
    static void ApplyFields(Component component,N part,string at)
    {
        var type=Text(Field(part,"typeId",at),at+".typeId");
        if(type=="unity.Transform"||type=="unity.RectTransform") return;
        N data=Field(part,"data",at);
        var fields=Field(data,"fields",at).Object;
        var references=new HashSet<string>(Array(Field(data,"references",at),at+".references")
            .Select(x=>Text(Field(x,"fieldPath",at),at+".fieldPath")),StringComparer.Ordinal);
        var so=new SerializedObject(component);
        foreach(var pair in fields)
        {
            if(Structural.Contains(pair.Key)) continue;
            string path="."+pair.Key;
            SerializedProperty property=so.FindProperty(pair.Key);
            Require(property!=null,at+path+": Unity SerializedProperty unavailable; no Scene saved");
            if(component is Collider2D collider && pair.Key=="m_Density")
            {
                var body=collider.GetComponent<Rigidbody2D>();
                if(body==null||body.bodyType!=RigidbodyType2D.Dynamic||!body.useAutoMass)
                {
                    Require(Near(property.doubleValue,Number(pair.Value,at+path)),
                        at+path+": static/non-auto-mass collider density differs; Unity 6 forbids setting it");
                    continue;
                }
            }
            ApplyValue(property,pair.Value,path,references,at);
        }
        if(at==FontComponentId)
        {
            var pendingSize=so.FindProperty("m_FontData.m_FontSize");
            var pendingMax=so.FindProperty("m_FontData.m_MaxSize");
            Require(pendingSize!=null&&pendingMax!=null,at+": FontData pending property missing");
            string row="BEFORE_APPLY_MODIFIED_PROPERTIES(pendingFontSize="+
                pendingSize.longValue.ToString(CultureInfo.InvariantCulture)+
                ",pendingMax="+pendingMax.longValue.ToString(CultureInfo.InvariantCulture)+")";
            fontTrace?.Add(row);
            Debug.Log("M13B1_FONT_TRACE "+row);
        }
        so.ApplyModifiedPropertiesWithoutUndo();
        if(at==FontComponentId) TraceFont("AFTER_APPLY_MODIFIED_PROPERTIES",component);
        bool enabled=Bool(Field(part,"enabled",at),at+".enabled");
        if(component is Behaviour behaviour) behaviour.enabled=enabled;
        else if(component is Renderer renderer) renderer.enabled=enabled;
    }

    static void ApplyValue(SerializedProperty property,N value,string path,HashSet<string> references,string at)
    {
        if(references.Contains(path)) return; // The ID-based binding pass owns this value.
        if(property.isArray && property.propertyType!=SerializedPropertyType.String)
        {
            var items=Array(value,at+path);
            property.arraySize=items.Count;
            for(int i=0;i<items.Count;i++)
                ApplyValue(property.GetArrayElementAtIndex(i),items[i],path+"["+i+"]",references,at);
            return;
        }
        switch(property.propertyType)
        {
            case SerializedPropertyType.Integer: property.longValue=(long)Number(value,at+path); break;
            case SerializedPropertyType.Boolean:
                property.boolValue=value.Value is bool flag?flag:Int(value,at+path)!=0;break;
            case SerializedPropertyType.Float: property.doubleValue=Number(value,at+path);break;
            case SerializedPropertyType.String: property.stringValue=Text(value,at+path);break;
            case SerializedPropertyType.Enum: property.intValue=Int(value,at+path);break;
            case SerializedPropertyType.LayerMask:
                Require(value.Object!=null&&value.Object.ContainsKey("m_Bits"),at+path+": invalid LayerMask");
                double bits=Number(Field(value,"m_Bits",at+path),at+path+".m_Bits");
                Require(bits>=0&&bits<=uint.MaxValue&&bits==Math.Truncate(bits),at+path+": invalid LayerMask bits");
                property.intValue=unchecked((int)(uint)bits);break;
            case SerializedPropertyType.Color:
                property.colorValue=new Color((float)Number(Field(value,"r",at+path),at+path+".r"),
                    (float)Number(Field(value,"g",at+path),at+path+".g"),
                    (float)Number(Field(value,"b",at+path),at+path+".b"),
                    (float)Number(Field(value,"a",at+path),at+path+".a"));break;
            case SerializedPropertyType.Vector2: property.vector2Value=Vec2(value,at+path);break;
            case SerializedPropertyType.Vector3: property.vector3Value=Vec3(value,at+path);break;
            case SerializedPropertyType.Vector4:
                property.vector4Value=new Vector4((float)Number(Field(value,"x",at+path),at+path+".x"),
                    (float)Number(Field(value,"y",at+path),at+path+".y"),
                    (float)Number(Field(value,"z",at+path),at+path+".z"),
                    (float)Number(Field(value,"w",at+path),at+path+".w"));break;
            case SerializedPropertyType.Quaternion: property.quaternionValue=Quat(value,at+path);break;
            case SerializedPropertyType.Rect:
                Require(CameraViewport(property,path),at+path+": unsupported Rect field contract");
                property.rectValue=ViewportRect(value,at+path);break;
            case SerializedPropertyType.ObjectReference:
                throw new InvalidDataException(at+path+": object reference lacks stable ID binding");
            case SerializedPropertyType.Generic:
                Require(value.Object!=null,at+path+": expected structured Unity field");
                foreach(var entry in value.Object)
                {
                    var child=property.FindPropertyRelative(entry.Key);
                    Require(child!=null,at+path+"."+entry.Key+": Unity nested property unavailable");
                    ApplyValue(child,entry.Value,path+"."+entry.Key,references,at);
                }
                break;
            default: throw new InvalidDataException(at+path+": unsupported SerializedProperty type "+property.propertyType);
        }
    }

    static UnityEngine.Object Asset(string assetId,string at)
    {
        var parts=assetId.Split(':');
        Require(parts.Length==3 && parts[0]=="unity",at+": invalid asset ID "+assetId);
        string path=AssetDatabase.GUIDToAssetPath(parts[1]);
        string[] paths=string.IsNullOrEmpty(path)?
            new[]{"Resources/unity_builtin_extra","Library/unity default resources"}:new[]{path};
        foreach(string candidate in paths)
            foreach(var obj in AssetDatabase.LoadAllAssetsAtPath(candidate))
                if(AssetDatabase.TryGetGUIDAndLocalFileIdentifier(obj,out string guid,out long localId) &&
                    guid==parts[1] && localId.ToString(CultureInfo.InvariantCulture)==parts[2]) return obj;
        throw new InvalidDataException(at+": asset localFileId unavailable "+assetId);
    }
    static void BindReferences(Component component,N part,Dictionary<string,GameObject> objects,
        Dictionary<string,Component> components,string at)
    {
        var so=new SerializedObject(component);
        foreach(N entry in Array(Field(Field(part,"data",at),"references",at),at+".references"))
        {
            string path=Text(Field(entry,"fieldPath",at),at+".fieldPath");
            if(path==".m_GameObject"||path==".m_Script"||path==".m_Father"||path.StartsWith(".m_Children[",StringComparison.Ordinal)||
                path==".m_CorrespondingSourceObject"||path==".m_PrefabInstance"||path==".m_PrefabAsset") continue;
            string propertyPath=path.TrimStart('.').Replace("[",".Array.data[");
            var property=so.FindProperty(propertyPath);
            Require(property!=null && property.propertyType==SerializedPropertyType.ObjectReference,
                at+path+": referenced Unity field unavailable or wrong type");
            N target=Field(entry,"target",at+path);
            UnityEngine.Object resolved=null;
            if(!target.IsNull)
            {
                string kind=Text(Field(target,"kind",at+path),at+path+".kind");
                if(kind=="object"||kind=="component")
                    Require(Text(Field(target,"levelId",at+path),at+path+".levelId")==LevelId,
                        at+path+": cross-room reference rejected");
                if(kind=="object")
                {
                    string id=Text(Field(target,"objectId",at+path),at+path+".objectId");
                    Require(objects.TryGetValue(id,out GameObject go),at+path+": missing object ID "+id);
                    resolved=go;
                }
                else if(kind=="component")
                {
                    string id=Text(Field(target,"componentId",at+path),at+path+".componentId");
                    Require(components.TryGetValue(id,out Component found) &&
                        Text(Field(target,"objectId",at+path),at+path+".objectId")==
                        found.GetComponent<LevelObjectId>().ObjectId &&
                        Text(Field(target,"componentTypeId",at+path),at+path+".componentTypeId")==
                        "unity."+found.GetType().Name,
                        at+path+": missing/wrong component ID "+id);
                    resolved=found;
                }
                else if(kind=="asset") resolved=Asset(Text(Field(target,"assetId",at+path),at+path+".assetId"),at+path);
                else throw new InvalidDataException(at+path+": unsupported reference kind "+kind);
            }
            property.objectReferenceValue=resolved;
        }
        so.ApplyModifiedPropertiesWithoutUndo();
    }

    static void AssertCounts(Scene scene,List<N> source,Dictionary<string,Component> components)
    {
        var objects=scene.GetRootGameObjects().SelectMany(go=>go.GetComponentsInChildren<LevelObjectId>(true)).ToList();
        Require(objects.Count==71 && objects.Select(x=>x.ObjectId).Distinct().Count()==71,
            "M1.3B rebuilt GameObject count/IDs differ");
        Require(components.Count==254,"M1.3B rebuilt source component count differs");
        foreach(N item in source)
        {
            string id=Text(Field(item,"id","object"),"object.id");
            var go=objects.Single(x=>x.ObjectId==id).gameObject;
            int expected=Array(Field(item,"components",id),id+".components").Count;
            int actual=go.GetComponents<Component>().Count(c=>c!=null && !(c is LevelObjectId) &&
                !(c is LevelComponentIdMap) && !(c is LevelRunnerBindingV3));
            Require(expected==actual,id+": unexpected auto-added/missing component: expected "+expected+", actual "+actual);
        }
    }

    static bool Near(double actual,double expected) => Math.Abs(actual-expected)<.0001;
    static void CompareValue(SerializedProperty property,N expected,string path,HashSet<string> references,string at)
    {
        if(references.Contains(path)) return;
        if(property.isArray && property.propertyType!=SerializedPropertyType.String)
        {
            var items=Array(expected,at+path);
            Require(property.arraySize==items.Count,at+path+": saved array length differs");
            for(int i=0;i<items.Count;i++)
                CompareValue(property.GetArrayElementAtIndex(i),items[i],path+"["+i+"]",references,at);
            return;
        }
        switch(property.propertyType)
        {
            case SerializedPropertyType.Integer:
            case SerializedPropertyType.Enum:
                if(at==FontComponentId&&path==".m_FontData.m_MaxSize"&&fontLegacyConflict)
                {
                    Require((long)Number(expected,at+path)==fontSourceMax&&
                        fontOriginalLoadedMax==fontEffectiveMax&&
                        property.longValue==fontEffectiveMax,at+path+
                        ": audited uGUI FontData normalization differs; sourceExpected="+
                        PhysicsLevelV2Json.Write(expected)+"; originalLoaded="+
                        fontOriginalLoadedMax+"; expectedEffective="+fontEffectiveMax+
                        "; actual="+property.longValue.ToString(CultureInfo.InvariantCulture)+
                        "; propertyType="+property.propertyType);
                    break;
                }
                Require(property.longValue==(long)Number(expected,at+path),at+path+
                    ": saved integer differs; expected="+PhysicsLevelV2Json.Write(expected)+
                    "; actual="+property.longValue.ToString(CultureInfo.InvariantCulture)+
                    "; propertyType="+property.propertyType);break;
            case SerializedPropertyType.LayerMask:
                Require(unchecked((uint)property.intValue)==
                    (uint)Number(Field(expected,"m_Bits",at+path),at+path+".m_Bits"),
                    at+path+": saved LayerMask differs");break;
            case SerializedPropertyType.Boolean:
                Require(property.boolValue==(expected.Value is bool flag?flag:Int(expected,at+path)!=0),
                    at+path+": saved boolean differs");break;
            case SerializedPropertyType.Float:
                Require(Near(property.doubleValue,Number(expected,at+path)),at+path+": saved number differs");break;
            case SerializedPropertyType.String:
                Require(property.stringValue==Text(expected,at+path),at+path+": saved string differs");break;
            case SerializedPropertyType.Color:
                var color=property.colorValue;
                Require(Near(color.r,Number(Field(expected,"r",at+path),at+path+".r"))&&
                    Near(color.g,Number(Field(expected,"g",at+path),at+path+".g"))&&
                    Near(color.b,Number(Field(expected,"b",at+path),at+path+".b"))&&
                    Near(color.a,Number(Field(expected,"a",at+path),at+path+".a")),at+path+": saved color differs");break;
            case SerializedPropertyType.Vector2:
                Require((property.vector2Value-Vec2(expected,at+path)).sqrMagnitude<1e-8f,
                    at+path+": saved Vector2 differs");break;
            case SerializedPropertyType.Vector3:
                Require((property.vector3Value-Vec3(expected,at+path)).sqrMagnitude<1e-8f,
                    at+path+": saved Vector3 differs");break;
            case SerializedPropertyType.Vector4:
                var v=property.vector4Value;
                Require(Near(v.x,Number(Field(expected,"x",at+path),at+path+".x"))&&
                    Near(v.y,Number(Field(expected,"y",at+path),at+path+".y"))&&
                    Near(v.z,Number(Field(expected,"z",at+path),at+path+".z"))&&
                    Near(v.w,Number(Field(expected,"w",at+path),at+path+".w")),at+path+": saved Vector4 differs");break;
            case SerializedPropertyType.Quaternion:
                Require(Quaternion.Angle(property.quaternionValue,Quat(expected,at+path))<.001f,
                    at+path+": saved Quaternion differs");break;
            case SerializedPropertyType.Rect:
                Require(CameraViewport(property,path),at+path+": unsupported Rect field contract");
                var expectedRect=ViewportRect(expected,at+path);
                var actualRect=property.rectValue;
                Require(Near(actualRect.x,expectedRect.x)&&Near(actualRect.y,expectedRect.y)&&
                    Near(actualRect.width,expectedRect.width)&&Near(actualRect.height,expectedRect.height),
                    at+path+": saved Rect differs");break;
            case SerializedPropertyType.Generic:
                Require(expected.Object!=null,at+path+": saved generic data shape differs");
                foreach(var pair in expected.Object)
                {
                    var child=property.FindPropertyRelative(pair.Key);
                    Require(child!=null,at+path+"."+pair.Key+": saved property missing");
                    CompareValue(child,pair.Value,path+"."+pair.Key,references,at);
                }
                break;
            case SerializedPropertyType.ObjectReference:
                throw new InvalidDataException(at+path+": missing typed reference in saved comparison");
            default: throw new InvalidDataException(at+path+": unsupported saved property type "+property.propertyType);
        }
    }

    static N Point(Vector2 value) => PhysicsLevelV2Json.Obj("x",(double)value.x,"y",(double)value.y);
    static N Point(Vector3 value) => PhysicsLevelV2Json.Obj("x",(double)value.x,"y",(double)value.y,
        "z",(double)value.z);
    static N Point(Quaternion value) => PhysicsLevelV2Json.Obj("x",(double)value.x,"y",(double)value.y,
        "z",(double)value.z,"w",(double)value.w);
    static string JsonType(N value) => value==null||value.IsNull?"Null":value.Object!=null?"Object":
        value.Array!=null?"Array":value.Value is string?"String":value.Value is bool?"Boolean":
        value.Value is double?"Number":value.Value.GetType().Name;
    static void ObjectField(List<string> details,string path,N expected,N actual,
        UnityEngine.Object target,string unityPath,SerializedPropertyType expectedUnityType,
        bool equal,bool reference=false,bool derivedInfo=false,N engineExpected=null,N coupledExpected=null)
    {
        var property=unityPath==null?null:new SerializedObject(target).FindProperty(unityPath);
        bool derived=unityPath==null;
        string actualType=derived?"N/A (Unity API/computed)":
            property==null?"MISSING":property.propertyType.ToString();
        string status=derivedInfo?"DERIVED_INFO":
            !derived&&property==null?"MISSING":!derived&&property.propertyType!=expectedUnityType?"TYPE_MISMATCH":
            JsonType(expected)!=JsonType(actual)?"TYPE_MISMATCH":
            engineExpected!=null?(equal?"ENGINE_DRIVEN_MATCH":"ENGINE_DRIVEN_MISMATCH"):
            coupledExpected!=null?(equal?"UI_POSITION_MATCH":"UI_POSITION_MISMATCH"):equal?"PASS":
            reference?"REFERENCE_MISMATCH":"VALUE_MISMATCH";
        details.Add(status+" path="+path+" expected="+PhysicsLevelV2Json.Write(expected)+
            " actual="+PhysicsLevelV2Json.Write(actual)+" expectedJsonType="+JsonType(expected)+
            " actualJsonType="+JsonType(actual)+" expectedUnityType="+expectedUnityType+
            " actualUnityType="+actualType+
            (engineExpected==null?"":" originalLoaded="+PhysicsLevelV2Json.Write(engineExpected))+
            (coupledExpected==null?"":" derivedFromAnchoredPosition="+
                PhysicsLevelV2Json.Write(coupledExpected)));
    }
    static void AssertObjectAndTransform(N item,GameObject go,string id,int index,string stage,
        HudSnapshot originalHud)
    {
        string at="$.objects["+index+"]";
        bool driven=id==HudId;
        var parentRect=go.transform.parent as RectTransform;
        bool ordinaryUi=go.transform is RectTransform&&parentRect!=null&&
            go.GetComponent<Canvas>()==null;
        Vector3 coupledPosition=Vector3.zero;
        if(ordinaryUi)
        {
            var childRect=(RectTransform)go.transform;
            N designRect=Field(item,"rectTransform",id);
            Vector2 anchor=childRect.anchorMin+Vector2.Scale(
                childRect.anchorMax-childRect.anchorMin,childRect.pivot);
            Vector2 anchorReference=Vector2.Scale(parentRect.rect.size,anchor-parentRect.pivot);
            Vector2 xy=Vec2(Field(designRect,"anchoredPosition",id),id+".rectTransform.anchoredPosition")+
                anchorReference;
            coupledPosition=new Vector3(xy.x,xy.y,Vec3(Field(item,"localPosition",id),
                id+".localPosition").z);
        }
        if(driven)
        {
            var canvas=go.GetComponent<Canvas>();
            var scaler=go.GetComponent<CanvasScaler>();
            Require(originalHud!=null&&go.transform is RectTransform&&go.transform.parent==null&&
                canvas!=null&&scaler!=null&&canvas.renderMode==originalHud.renderMode&&
                scaler.uiScaleMode==originalHud.scaleMode&&
                (scaler.referenceResolution-originalHud.referenceResolution).sqrMagnitude<1e-8f&&
                Math.Abs(scaler.matchWidthOrHeight-originalHud.matchWidthOrHeight)<1e-6f&&
                Screen.width==originalHud.screenWidth&&Screen.height==originalHud.screenHeight,
                id+": "+stage+" original/rebuilt root Canvas layout environment differs");
        }
        var details=new List<string>();
        N expected=Field(item,"name",id);
        ObjectField(details,at+".name",expected,PhysicsLevelV2Json.Wrap(go.name),go,
            "m_Name",SerializedPropertyType.String,go.name==Text(expected,at+".name"));
        expected=Field(item,"active",id);
        ObjectField(details,at+".active",expected,PhysicsLevelV2Json.Wrap(go.activeSelf),go,
            "m_IsActive",SerializedPropertyType.Boolean,go.activeSelf==Bool(expected,at+".active"));
        expected=Field(item,"layer",id);
        ObjectField(details,at+".layer",expected,PhysicsLevelV2Json.Wrap((double)go.layer),go,
            "m_Layer",SerializedPropertyType.Integer,go.layer==Int(expected,at+".layer"));
        expected=Field(item,"tag",id);
        ObjectField(details,at+".tag",expected,PhysicsLevelV2Json.Wrap(go.tag),go,
            "m_TagString",SerializedPropertyType.String,go.tag==Text(expected,at+".tag"));
        expected=Field(item,"localPosition",id);
        ObjectField(details,at+".localPosition",expected,Point(go.transform.localPosition),go.transform,
            "m_LocalPosition",SerializedPropertyType.Vector3,
            (go.transform.localPosition-(driven?originalHud.localPosition:
                ordinaryUi?coupledPosition:
                Vec3(expected,at+".localPosition"))).sqrMagnitude<1e-8f,
            false,false,driven?Point(originalHud.localPosition):null,
            ordinaryUi?Point(coupledPosition):null);
        expected=Field(item,"localRotation",id);
        ObjectField(details,at+".localRotation",expected,Point(go.transform.localRotation),go.transform,
            "m_LocalRotation",SerializedPropertyType.Quaternion,
            Quaternion.Angle(go.transform.localRotation,Quat(expected,at+".localRotation"))<.001f);
        expected=Field(item,"localScale",id);
        ObjectField(details,at+".localScale",expected,Point(go.transform.localScale),go.transform,
            "m_LocalScale",SerializedPropertyType.Vector3,
            (go.transform.localScale-(driven?originalHud.localScale:
                Vec3(expected,at+".localScale"))).sqrMagnitude<1e-8f,
            false,false,driven?Point(originalHud.localScale):null);
        expected=Field(item,"parentId",id);
        string actualParent=go.transform.parent==null?null:
            go.transform.parent.GetComponent<LevelObjectId>()?.ObjectId;
        ObjectField(details,at+".parentId",expected,PhysicsLevelV2Json.Wrap(actualParent),go.transform,
            "m_Father",SerializedPropertyType.ObjectReference,
            expected.IsNull?actualParent==null:actualParent==Text(expected,at+".parentId"),true);
        expected=Field(item,"siblingIndex",id);
        ObjectField(details,at+".siblingIndex",expected,
            PhysicsLevelV2Json.Wrap((double)go.transform.GetSiblingIndex()),go.transform,
            null,SerializedPropertyType.Integer,
            go.transform.GetSiblingIndex()==Int(expected,at+".siblingIndex"));
        N rectData=Field(item,"rectTransform",id);
        var rect=go.transform as RectTransform;
        string expectedKind=rectData.IsNull?"unity.Transform":"unity.RectTransform";
        string actualKind=rect==null?"unity.Transform":"unity.RectTransform";
        string kindStatus=expectedKind==actualKind?"PASS":"TYPE_MISMATCH";
        details.Add(kindStatus+" path="+at+".components[Transform].typeId expected=\""+
            expectedKind+"\" actual=\""+actualKind+"\" expectedUnityType="+expectedKind+
            " actualUnityType="+actualKind);
        if(!rectData.IsNull&&rect!=null)
        {
            foreach(var pair in new[]{
                new {json="anchorMin",unity="m_AnchorMin",actual=rect.anchorMin},
                new {json="anchorMax",unity="m_AnchorMax",actual=rect.anchorMax},
                new {json="anchoredPosition",unity="m_AnchoredPosition",actual=rect.anchoredPosition},
                new {json="sizeDelta",unity="m_SizeDelta",actual=rect.sizeDelta},
                new {json="pivot",unity="m_Pivot",actual=rect.pivot},
                new {json="offsetMin",unity=(string)null,actual=rect.offsetMin},
                new {json="offsetMax",unity=(string)null,actual=rect.offsetMax},
            })
            {
                expected=Field(rectData,pair.json,at+".rectTransform");
                N originalValue=driven?pair.json=="anchoredPosition"?Point(originalHud.anchoredPosition):
                    pair.json=="sizeDelta"?Point(originalHud.sizeDelta):
                    pair.json=="pivot"?Point(originalHud.pivot):null:null;
                ObjectField(details,at+".rectTransform."+pair.json,expected,Point(pair.actual),rect,
                    pair.unity,SerializedPropertyType.Vector2,
                    (pair.actual-(originalValue==null?Vec2(expected,at+".rectTransform."+pair.json):
                        Vec2(originalValue,at+".originalLoaded."+pair.json))).sqrMagnitude<1e-8f,
                    false,pair.unity==null,originalValue);
            }
        }
        else if(!rectData.IsNull)
            details.Add("MISSING path="+at+".rectTransform expected="+PhysicsLevelV2Json.Write(rectData)+
                " actual=null expectedJsonType=Object actualJsonType=Null expectedUnityType=RectTransform"+
                " actualUnityType="+actualKind);
        int failed=details.Count(line=>!line.StartsWith("PASS ",StringComparison.Ordinal)&&
            !line.StartsWith("DERIVED_INFO ",StringComparison.Ordinal)&&
            !line.StartsWith("ENGINE_DRIVEN_MATCH ",StringComparison.Ordinal)&&
            !line.StartsWith("UI_POSITION_MATCH ",StringComparison.Ordinal));
        if(failed>0) throw new InvalidDataException(id+": "+stage+" object/Transform mismatch count="+
            failed+"; all fields:\n"+string.Join("\n",details));
    }

    static void AssertValues(Scene scene,List<N> source,string stage,HudSnapshot originalHud)
    {
        var objects=scene.GetRootGameObjects().SelectMany(go=>go.GetComponentsInChildren<LevelObjectId>(true))
            .ToDictionary(x=>x.ObjectId,x=>x.gameObject,StringComparer.Ordinal);
        Require(objects.Count==71,"Saved Level1 candidate lost source objects");
        var components=new Dictionary<string,Component>(StringComparer.Ordinal);
        foreach(var go in objects.Values)
            foreach(var entry in go.GetComponent<LevelComponentIdMap>().Entries)
            {
                Require(entry.target!=null && !components.ContainsKey(entry.componentId),
                    "Saved stable component ID missing/duplicate "+entry.componentId);
                components.Add(entry.componentId,entry.target);
            }
        Require(components.Count==254,"Saved Level1 candidate lost source components");
        for(int index=0;index<source.Count;index++)
        {
            N item=source[index];
            string id=Text(Field(item,"id","object"),"object.id");
            Require(objects.TryGetValue(id,out GameObject go),id+": saved object missing");
            AssertObjectAndTransform(item,go,id,index,stage,originalHud);
            if(id==HudId) Debug.Log("M13B1_HUD_ENGINE_DRIVEN_STATUS=PASS; stage="+stage+
                "; source=V3_WRITTEN; originalLoaded=COMPARED; screen="+
                originalHud.screenWidth+"x"+originalHud.screenHeight);
            if(Text(Field(item,"ownership",id),id+".ownership")=="C")
            {
                var binding=go.GetComponent<LevelRunnerBindingV3>();
                N responsibility=Field(item,"responsibility",id);
                Require(binding!=null &&
                    binding.TemplateSlot==Text(Field(responsibility,"templateSlot",id),id+".templateSlot")&&
                    binding.ConfigPath==Text(Field(responsibility,"configPath",id),id+".configPath"),
                    id+": public runner binding slot/config path differs");
            }
            foreach(N part in Array(Field(item,"components",id),id+".components"))
            {
                string cid=Text(Field(part,"componentId",id),id+".componentId");
                Require(components.TryGetValue(cid,out Component instance)&&instance.gameObject==go,
                    cid+": saved component ownership differs");
                string type=Text(Field(part,"typeId",cid),cid+".typeId");
                if(type=="unity.Transform"||type=="unity.RectTransform") continue;
                bool enabled=Bool(Field(part,"enabled",cid),cid+".enabled");
                if(instance is Behaviour behaviour) Require(behaviour.enabled==enabled,cid+": saved enabled differs");
                else if(instance is Renderer renderer) Require(renderer.enabled==enabled,cid+": saved Renderer enabled differs");
                var fields=Field(Field(part,"data",cid),"fields",cid).Object;
                var refs=Array(Field(Field(part,"data",cid),"references",cid),cid+".references");
                var paths=new HashSet<string>(refs.Select(x=>Text(Field(x,"fieldPath",cid),cid+".fieldPath")),
                    StringComparer.Ordinal);
                var so=new SerializedObject(instance);
                foreach(var pair in fields)
                {
                    if(Structural.Contains(pair.Key)) continue;
                    var property=so.FindProperty(pair.Key);
                    Require(property!=null,cid+"."+pair.Key+": saved Unity property missing");
                    CompareValue(property,pair.Value,"."+pair.Key,paths,cid);
                }
                foreach(N entry in refs)
                {
                    string path=Text(Field(entry,"fieldPath",cid),cid+".fieldPath");
                    if(path==".m_GameObject"||path==".m_Script"||path==".m_Father"||
                        path.StartsWith(".m_Children[",StringComparison.Ordinal)||
                        path==".m_CorrespondingSourceObject"||path==".m_PrefabInstance"||path==".m_PrefabAsset") continue;
                    var property=so.FindProperty(path.TrimStart('.').Replace("[",".Array.data["));
                    Require(property!=null&&property.propertyType==SerializedPropertyType.ObjectReference,
                        cid+path+": saved reference property missing");
                    N target=Field(entry,"target",cid+path);
                    UnityEngine.Object expected=null;
                    if(!target.IsNull)
                    {
                        string kind=Text(Field(target,"kind",cid+path),cid+path+".kind");
                        if(kind=="object") expected=objects[Text(Field(target,"objectId",cid+path),cid+path+".objectId")];
                        else if(kind=="component") expected=components[Text(Field(target,"componentId",cid+path),cid+path+".componentId")];
                        else if(kind=="asset") expected=Asset(Text(Field(target,"assetId",cid+path),cid+path+".assetId"),cid+path);
                    }
                    Require(property.objectReferenceValue==expected,cid+path+": saved reference differs from stable ID target");
                }
            }
        }
    }
}
