using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using N = PhysicsLevelV2Json.Node;

public static class PhysicsLevelV2ImportExport
{
    public const string TestScenePrefix = "Assets/Scenes/LevelEditorRoundTrip_Phase4A_";
    public const string ExportFolder = "Levels/Physics/Phase4AExports";
    internal static string ProjectPath(string relative) => Path.Combine(
        Path.GetFullPath(Path.Combine(Application.dataPath,"..")),relative);

    [MenuItem("Physics Level Editor/Phase 4A/Import V2 as new test scene")]
    public static void ImportFromDialog()
    {
        string path=EditorUtility.OpenFilePanel("Select validated V2 JSON",Application.dataPath,"json");
        if (string.IsNullOrEmpty(path)) return;
        try { Debug.Log("PHASE4A_IMPORT_PASS scene="+ImportNewScene(File.ReadAllText(path))); }
        catch (Exception ex) { Debug.LogError("PHASE4A_IMPORT_FAIL "+ex); }
    }

    [MenuItem("Physics Level Editor/Phase 4A/Export active test scene as V2")]
    public static void ExportFromMenu()
    {
        try
        {
            string json=ExportActiveScene();
            string folder=ProjectPath(ExportFolder);
            Directory.CreateDirectory(folder);
            string path=Path.Combine(folder,"phase4a_"+Guid.NewGuid().ToString("N")+".json");
            using (var stream=new FileStream(path,FileMode.CreateNew,FileAccess.Write))
            using (var writer=new StreamWriter(stream)) writer.Write(json);
            AssetDatabase.Refresh();
            Debug.Log("PHASE4A_EXPORT_PASS path="+path);
        }
        catch (Exception ex) { Debug.LogError("PHASE4A_EXPORT_FAIL "+ex); }
    }

    public static string ImportNewScene(string json)
    {
        PhysicsLevelV2Tests.CheckIsolation();
        N validated=PhysicsLevelV2Validation.Validate(json); // Includes asset resolution. Do not mutate a scene before this point.
        if (EditorApplication.isPlayingOrWillChangePlaymode) throw new InvalidOperationException("Exit Play Mode before V2 import.");
        if (SceneManager.GetActiveScene().isDirty) throw new InvalidOperationException("Save or discard current scene edits before V2 import.");
        LevelDataV2 data=JsonUtility.FromJson<LevelDataV2>(json);
        if (data==null || data.objects==null) throw new InvalidDataException("JsonUtility could not read prevalidated V2 document.");
        NormalizeDecodedReferences(validated,data);
        string scenePath=TestScenePrefix+Guid.NewGuid().ToString("N")+".unity";
        if (File.Exists(ProjectPath(scenePath))) throw new IOException("Generated test scene path already exists: "+scenePath);
        Scene previous=SceneManager.GetActiveScene();
        Scene scene=default(Scene);
        bool completed=false;
        try
        {
            scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Additive);
            var marker=new GameObject("Phase 4A level identity");
            SceneManager.MoveGameObjectToScene(marker,scene);
            var info=marker.AddComponent<LevelSceneV2>();
            info.levelId=data.levelId; info.coverage=data.coverage; info.sourceSceneGuid=data.sourceSceneGuid;
            var byId=new Dictionary<string,GameObject>(StringComparer.Ordinal);
            foreach (var item in data.objects)
            {
                var go=new GameObject(item.name);
                go.SetActive(false);
                SceneManager.MoveGameObjectToScene(go,scene);
                go.layer=item.layer;
                go.AddComponent<LevelObjectId>().SetId(item.id);
                byId.Add(item.id,go);
            }
            // Stage 2: parent references, exact components, and design fields after every object ID exists.
            foreach (var item in data.objects)
            {
                var go=byId[item.id];
                if (!string.IsNullOrEmpty(item.parentId)) go.transform.SetParent(byId[item.parentId].transform,false);
                go.transform.localPosition=item.localPosition;
                go.transform.localEulerAngles=new Vector3(0,0,item.localRotationZ);
                go.transform.localScale=item.localScale;
                foreach (var part in item.components) AddComponent(go,part);
            }
            // Stage 3: bind validated forward references only after every target component exists.
            foreach (var item in data.objects)
                foreach (var part in item.components) BindReferences(byId[item.id],part,byId);
            foreach (var item in data.objects) byId[item.id].SetActive(item.active);
            if (!EditorSceneManager.SaveScene(scene,scenePath,false)) throw new IOException("Unity did not save test scene "+scenePath);
            EditorSceneManager.CloseScene(scene,true);
            EditorSceneManager.OpenScene(scenePath,OpenSceneMode.Single);
            AssetDatabase.Refresh();
            completed=true;
            return scenePath;
        }
        catch
        {
            if (scene.IsValid() && scene.isLoaded) EditorSceneManager.CloseScene(scene,true);
            if (!completed && File.Exists(ProjectPath(scenePath)))
            {
                // Only a path generated by this invocation may be removed after a failed save.
                AssetDatabase.DeleteAsset(scenePath);
            }
            if (previous.IsValid() && previous.isLoaded) SceneManager.SetActiveScene(previous);
            throw;
        }
    }

    private static void AddComponent(GameObject go,LevelComponentV2 part)
    {
        switch (part.typeId)
        {
            case "core.marker": break;
            case "visual.sprite":
                var sprite=go.AddComponent<SpriteRenderer>();
                sprite.sprite=PhysicsLevelV2Validation.ResolveSprite(part.sprite.assetGuid,
                    long.Parse(part.sprite.localFileId,CultureInfo.InvariantCulture),go.name);
                sprite.color=part.sprite.color; sprite.sortingOrder=part.sprite.sortingOrder; sprite.enabled=part.enabled;
                break;
            case "physics.boxCollider2d":
                var collider=go.AddComponent<BoxCollider2D>();
                collider.size=part.collider.size; collider.offset=part.collider.offset;
                collider.isTrigger=part.collider.isTrigger; collider.enabled=part.enabled;
                break;
            case "physics.platform": go.AddComponent<BaseBlock>().enabled=part.enabled; break;
            case "physics.airVent":
                var vent=go.AddComponent<AirVentBlock>();
                vent.ventDirection=part.airVent.ventDirection; vent.upwardForce=part.airVent.upwardForce;
                vent.isInteractable=part.airVent.isInteractable; vent.guideText=part.airVent.guideText;
                vent.isContinuous=part.airVent.isContinuous; vent.enabled=part.enabled;
                break;
            case "item.token":
                var token=go.AddComponent<TokenItem>();
                token.scoreAmount=part.token.scoreAmount; token.tokenAmount=part.token.tokenAmount; token.enabled=part.enabled;
                break;
            case "mechanism.ice":
                var ice=go.AddComponent<IceBlock>();
                ice.isMelted=part.ice.isMelted; ice.solidColor=part.ice.solidColor;
                ice.meltedColor=part.ice.meltedColor; ice.enabled=part.enabled;
                break;
            case "mechanism.vanishing":
                var vanish=go.AddComponent<VanishingBlock>();
                vanish.mode=(VanishingBlock.VanishMode)Enum.Parse(typeof(VanishingBlock.VanishMode),part.vanishing.mode);
                vanish.visibleDuration=part.vanishing.visibleDuration; vanish.invisibleDuration=part.vanishing.invisibleDuration;
                vanish.stepVanishDelay=part.vanishing.stepVanishDelay; vanish.respawnDelay=part.vanishing.respawnDelay;
                vanish.visibleColor=part.vanishing.visibleColor; vanish.vanishColor=part.vanishing.vanishColor;
                vanish.showGuide=part.vanishing.showGuide; vanish.warningDuration=part.vanishing.warningDuration;
                vanish.enabled=part.enabled;
                break;
            case "mechanism.thermalController":
                var thermal=go.AddComponent<ThermalControllerBlock>();
                thermal.currentState=(ThermalControllerBlock.TemperatureState)Enum.Parse(
                    typeof(ThermalControllerBlock.TemperatureState),part.thermal.currentState);
                thermal.terminalName=part.thermal.terminalName;
                thermal.interactionRadius=part.thermal.interactionRadius;
                thermal.controlRadius=part.thermal.controlRadius;
                thermal.coldFilterColor=part.thermal.coldFilterColor;
                thermal.hotFilterColor=part.thermal.hotFilterColor;
                thermal.enabled=part.enabled;
                break;
            case "mechanism.railgun":
                var railgun=go.AddComponent<RailgunBlock>();
                railgun.acceleration=part.railgun.acceleration;
                railgun.launchExitSpeed=part.railgun.launchExitSpeed;
                railgun.launchDirection=part.railgun.launchDirection;
                railgun.enabled=part.enabled;
                break;
            default: throw new InvalidDataException("Unsupported V2 component: "+part.typeId);
        }
    }

    // JsonUtility can materialize a JSON null as an empty serializable class. The validated raw
    // document is authoritative for optional nulls; all non-null decoded IDs must still match it.
    internal static void NormalizeDecodedReferences(N raw,LevelDataV2 decoded)
    {
        var rawObjects=raw.Object["objects"].Array;
        if (decoded?.objects==null || decoded.objects.Length!=rawObjects.Count)
            throw new InvalidDataException("$.objects: JsonUtility changed object count");
        for (int i=0;i<rawObjects.Count;i++)
        {
            N source=rawObjects[i]; LevelObjectV2 item=decoded.objects[i];
            string id=source.Object["id"].String;
            string path="$.objects["+i+"]("+id+")";
            if (item==null || item.id!=id || item.components==null ||
                item.components.Length!=source.Object["components"].Array.Count)
                throw new InvalidDataException(path+": JsonUtility changed object identity or component count");
            for (int j=0;j<item.components.Length;j++)
            {
                var part=item.components[j]; N sourcePart=source.Object["components"].Array[j];
                string type=sourcePart.Object["typeId"].String;
                string cp=path+".components["+j+"]("+type+")";
                if (part==null || part.typeId!=type) throw new InvalidDataException(cp+": JsonUtility changed component type");
                if (type=="mechanism.thermalController")
                {
                    if (part.thermal==null) throw new InvalidDataException(cp+".thermal: JsonUtility lost payload");
                    N thermal=sourcePart.Object["thermal"];
                    N linked=thermal.Object["linkedController"];
                    if (linked.IsNull) part.thermal.linkedController=null;
                    else AssertComponentRef(linked,part.thermal.linkedController,cp+".thermal.linkedController");
                    var ice=thermal.Object["controlledIce"].Array;
                    if (part.thermal.controlledIce==null || part.thermal.controlledIce.Length!=ice.Count)
                        throw new InvalidDataException(cp+".thermal.controlledIce: JsonUtility changed array length");
                    for (int k=0;k<ice.Count;k++)
                        AssertComponentRef(ice[k],part.thermal.controlledIce[k],cp+".thermal.controlledIce["+k+"]");
                }
                if (type=="mechanism.railgun")
                {
                    if (part.railgun==null) throw new InvalidDataException(cp+".railgun: JsonUtility lost payload");
                    N endpoint=sourcePart.Object["railgun"].Object["launchEndPoint"];
                    string expected=endpoint.Object["objectId"].String;
                    if (part.railgun.launchEndPoint==null || part.railgun.launchEndPoint.kind!="transform" ||
                        part.railgun.launchEndPoint.objectId!=expected)
                        throw new InvalidDataException(cp+".railgun.launchEndPoint.objectId: required reference lost or changed; expected "+expected);
                }
            }
        }
    }

    private static void AssertComponentRef(N source,SceneComponentRefV2 decoded,string path)
    {
        string expected=source.Object["objectId"].String;
        string type=source.Object["componentTypeId"].String;
        if (decoded==null || decoded.kind!="sceneComponent" || decoded.objectId!=expected ||
            decoded.componentTypeId!=type || !string.IsNullOrEmpty(decoded.instanceId))
            throw new InvalidDataException(path+".objectId: reference lost or changed; expected "+expected+" / "+type);
    }

    private static void BindReferences(GameObject go,LevelComponentV2 part,Dictionary<string,GameObject> byId)
    {
        if (part.typeId=="mechanism.thermalController")
        {
            var thermal=go.GetComponent<ThermalControllerBlock>();
            thermal.linkedController=part.thermal.linkedController==null?null:
                ResolveComponent<ThermalControllerBlock>(byId,part.thermal.linkedController.objectId,
                    go.GetComponent<LevelObjectId>().ObjectId,"mechanism.thermalController","thermal.linkedController");
            thermal.controlledIce=part.thermal.controlledIce.Select(reference=>
                ResolveComponent<IceBlock>(byId,reference?.objectId,go.GetComponent<LevelObjectId>().ObjectId,
                    "mechanism.thermalController","thermal.controlledIce")).ToArray();
        }
        if (part.typeId=="mechanism.railgun")
        {
            string id=part.railgun.launchEndPoint?.objectId;
            string owner=go.GetComponent<LevelObjectId>().ObjectId;
            if (string.IsNullOrEmpty(id) || !byId.TryGetValue(id,out GameObject target) || target==null ||
                target.GetComponents<Component>().Length!=2)
                throw new InvalidDataException(owner+"/mechanism.railgun/railgun.launchEndPoint: required Marker missing or invalid: "+id);
            go.GetComponent<RailgunBlock>().launchEndPoint=target.transform;
        }
    }

    private static T ResolveComponent<T>(Dictionary<string,GameObject> byId,string id,string owner,
        string type,string field) where T:Component
    {
        string path=owner+"/"+type+"/"+field;
        if (string.IsNullOrEmpty(id) || !byId.TryGetValue(id,out GameObject target) || target==null)
            throw new InvalidDataException(path+": referenced object ID missing: "+id);
        T result=target.GetComponent<T>();
        if (result==null || result.GetType()!=typeof(T))
            throw new InvalidDataException(path+": referenced object has wrong component type: "+id);
        return result;
    }

    public static string ExportActiveScene()
    {
        PhysicsLevelV2Tests.CheckIsolation();
        Scene scene=SceneManager.GetActiveScene();
        if (!scene.IsValid() || !scene.path.StartsWith(TestScenePrefix,StringComparison.Ordinal) ||
            !scene.path.EndsWith(".unity",StringComparison.Ordinal))
            throw new InvalidOperationException("Only Phase 4A generated test scenes may be exported.");
        if (scene.isDirty) throw new InvalidOperationException("Save test scene changes before export.");
        var roots=scene.GetRootGameObjects();
        var markers=roots.Where(go=>go.GetComponent<LevelSceneV2>()!=null).ToArray();
        if (markers.Length!=1) throw new InvalidDataException("Exactly one LevelSceneV2 marker required.");
        if (markers[0].GetComponents<Component>().Any(c=>c==null || c.GetType()!=typeof(Transform) && c.GetType()!=typeof(LevelSceneV2)) ||
            markers[0].transform.childCount!=0) throw new InvalidDataException("Unsupported component or child on V2 scene marker.");
        if (!markers[0].activeSelf || markers[0].layer!=0 || markers[0].tag!="Untagged" || markers[0].isStatic ||
            markers[0].transform.localPosition!=Vector3.zero || markers[0].transform.localScale!=Vector3.one ||
            markers[0].transform.localRotation!=Quaternion.identity)
            throw new InvalidDataException("Unsupported state on V2 scene marker.");
        var info=markers[0].GetComponent<LevelSceneV2>();
        var all=new List<GameObject>();
        foreach (var root in roots) if (root!=markers[0]) Collect(root.transform,all);
        if (all.Count==0) throw new InvalidDataException("Test scene has no level objects.");
        var ids=new Dictionary<GameObject,string>();
        foreach (var go in all)
        {
            var identity=go.GetComponent<LevelObjectId>();
            if (identity==null || !Guid.TryParseExact(identity.ObjectId,"D",out _))
                throw new InvalidDataException("Object has no valid LevelObjectId: "+go.name);
            if (ids.ContainsValue(identity.ObjectId)) throw new InvalidDataException("Duplicate LevelObjectId: "+identity.ObjectId);
            ids.Add(go,identity.ObjectId);
        }
        var objects=all.OrderBy(go=>ids[go],StringComparer.Ordinal).Select(go=>ReadObject(go,ids)).ToArray();
        N document=PhysicsLevelV2Json.Obj("formatVersion",2d,"levelId",info.levelId,"coverage",info.coverage,
            "sourceSceneGuid",info.sourceSceneGuid,"objects",PhysicsLevelV2Json.Arr(objects));
        string json=PhysicsLevelV2Json.Write(document);
        PhysicsLevelV2Validation.Validate(json);
        return json;
    }

    private static void Collect(Transform transform,List<GameObject> all)
    {
        all.Add(transform.gameObject);
        foreach (Transform child in transform) Collect(child,all);
    }

    private static N ReadObject(GameObject go,Dictionary<GameObject,string> ids)
    {
        if (go.tag!="Untagged" || go.isStatic || PrefabUtility.IsPartOfPrefabInstance(go))
            throw new InvalidDataException("Unsupported GameObject tag, static or prefab state on "+ids[go]);
        Vector3 euler=go.transform.localEulerAngles;
        if (Mathf.Abs(Mathf.DeltaAngle(euler.x,0))>0.0001f || Mathf.Abs(Mathf.DeltaAngle(euler.y,0))>0.0001f)
            throw new InvalidDataException("V2 only represents Z rotation on "+ids[go]);
        var all=go.GetComponents<Component>();
        if (all.Any(c=>c==null)) throw new InvalidDataException("Missing MonoBehaviour on "+ids[go]);
        if (all.Length==2 && all.Any(c=>c.GetType()==typeof(Transform)) &&
            all.Any(c=>c.GetType()==typeof(LevelObjectId)))
            return PhysicsLevelV2Json.Obj("id",ids[go],"name",go.name,"parentId",
                go.transform.parent==null?null:ids[go.transform.parent.gameObject],"active",go.activeSelf,
                "layer",(double)go.layer,"localPosition",Vec(go.transform.localPosition),
                "localRotationZ",(double)go.transform.localEulerAngles.z,"localScale",Vec(go.transform.localScale),
                "components",PhysicsLevelV2Json.Arr(new[]{Component("core.marker",true)}),
                "rules",PhysicsLevelV2Json.Arr(new N[0]));
        var allowed=new HashSet<Type> {typeof(Transform),typeof(LevelObjectId),typeof(SpriteRenderer),typeof(BoxCollider2D),
            typeof(BaseBlock),typeof(AirVentBlock),typeof(TokenItem),typeof(IceBlock),typeof(VanishingBlock),
            typeof(ThermalControllerBlock),typeof(RailgunBlock)};
        foreach (var c in all) if (!allowed.Contains(c.GetType()))
            throw new InvalidDataException("Unsupported Unity component "+c.GetType().FullName+" on "+ids[go]);
        var behaviour=all.Where(c=>c.GetType()==typeof(BaseBlock)||c.GetType()==typeof(AirVentBlock)||
            c.GetType()==typeof(TokenItem)||c.GetType()==typeof(IceBlock)||
            c.GetType()==typeof(VanishingBlock)||c.GetType()==typeof(ThermalControllerBlock)||
            c.GetType()==typeof(RailgunBlock)).ToArray();
        if (behaviour.Length!=1) throw new InvalidDataException("Exactly one supported behaviour required on "+ids[go]);
        var sprite=go.GetComponent<SpriteRenderer>(); var collider=go.GetComponent<BoxCollider2D>();
        if (sprite==null || collider==null || go.GetComponents<SpriteRenderer>().Length!=1 ||
            go.GetComponents<BoxCollider2D>().Length!=1 || go.GetComponents<LevelObjectId>().Length!=1)
            throw new InvalidDataException("Duplicate or missing required component on "+ids[go]);
        if (sprite.sprite==null || !AssetDatabase.TryGetGUIDAndLocalFileIdentifier(sprite.sprite,out string guid,out long local))
            throw new InvalidDataException("Sprite asset cannot be represented on "+ids[go]);
        var defaultSpriteMaterial=AssetDatabase.GetBuiltinExtraResource<Material>("Sprites-Default.mat");
        if (sprite.drawMode!=SpriteDrawMode.Simple || sprite.flipX || sprite.flipY || sprite.maskInteraction!=SpriteMaskInteraction.None ||
            sprite.sortingLayerID!=0 || sprite.sharedMaterial!=null && sprite.sharedMaterial!=defaultSpriteMaterial)
            throw new InvalidDataException("Unsupported SpriteRenderer setting on "+ids[go]);
        if (collider.sharedMaterial!=null || collider.usedByEffector ||
            collider.compositeOperation!=Collider2D.CompositeOperation.None || collider.edgeRadius!=0)
            throw new InvalidDataException("Unsupported BoxCollider2D setting on "+ids[go]);
        var components=new List<N> {
            Component("visual.sprite",sprite.enabled,"sprite",PhysicsLevelV2Json.Obj("assetGuid",guid,
                "localFileId",local.ToString(CultureInfo.InvariantCulture),"color",Color(sprite.color),"sortingOrder",(double)sprite.sortingOrder)),
            Component("physics.boxCollider2d",collider.enabled,"collider",PhysicsLevelV2Json.Obj("size",Vec(collider.size),
                "offset",Vec(collider.offset),"isTrigger",collider.isTrigger))
        };
        Component behaviourComponent=behaviour[0];
        if (behaviourComponent.GetType()==typeof(BaseBlock)) components.Add(Component("physics.platform",((BaseBlock)behaviourComponent).enabled));
        else if (behaviourComponent.GetType()==typeof(AirVentBlock))
        {
            var c=(AirVentBlock)behaviourComponent;
            if (c.ventParticles!=null) throw new InvalidDataException("Unsupported AirVentBlock.ventParticles on "+ids[go]);
            components.Add(Component("physics.airVent",c.enabled,"airVent",PhysicsLevelV2Json.Obj(
                "ventDirection",Vec(c.ventDirection),"upwardForce",(double)c.upwardForce,
                "isInteractable",c.isInteractable,"guideText",c.guideText,"isContinuous",c.isContinuous)));
        }
        else if (behaviourComponent.GetType()==typeof(TokenItem))
        {
            var c=(TokenItem)behaviourComponent;
            if (c.collectVFX!=null || c.collectSFX!=null) throw new InvalidDataException("Unsupported Token VFX/SFX on "+ids[go]);
            components.Add(Component("item.token",c.enabled,"token",PhysicsLevelV2Json.Obj(
                "scoreAmount",(double)c.scoreAmount,"tokenAmount",(double)c.tokenAmount)));
        }
        else if (behaviourComponent.GetType()==typeof(IceBlock))
        {
            var c=(IceBlock)behaviourComponent;
            if (!c.isInteractable) throw new InvalidDataException("Unsupported IceBlock.isInteractable=false on "+ids[go]);
            components.Add(Component("mechanism.ice",c.enabled,"ice",PhysicsLevelV2Json.Obj(
                "isMelted",c.isMelted,"solidColor",Color(c.solidColor),"meltedColor",Color(c.meltedColor))));
        }
        else if (behaviourComponent.GetType()==typeof(VanishingBlock))
        {
            var c=(VanishingBlock)behaviourComponent;
            if (!c.isInteractable || c.optionalCollectible!=null)
                throw new InvalidDataException("Unsupported VanishingBlock reference/interaction field on "+ids[go]);
            components.Add(Component("mechanism.vanishing",c.enabled,"vanishing",PhysicsLevelV2Json.Obj(
                "mode",c.mode.ToString(),"visibleDuration",(double)c.visibleDuration,
                "invisibleDuration",(double)c.invisibleDuration,"stepVanishDelay",(double)c.stepVanishDelay,
                "respawnDelay",(double)c.respawnDelay,"visibleColor",Color(c.visibleColor),
                "vanishColor",Color(c.vanishColor),"showGuide",c.showGuide,
                "warningDuration",(double)c.warningDuration,"optionalCollectible",null)));
        }
        else if (behaviourComponent.GetType()==typeof(ThermalControllerBlock))
        {
            var c=(ThermalControllerBlock)behaviourComponent;
            if (!c.isInteractable || c.roomFilterOverlay!=null)
                throw new InvalidDataException("Unsupported ThermalControllerBlock interaction/overlay on "+ids[go]);
            N linked=c.linkedController==null?null:ComponentRef(c.linkedController.gameObject,
                "mechanism.thermalController",ids,ids[go]+"/linkedController");
            var ice=new List<N>();
            foreach (var target in c.controlledIce??Array.Empty<IceBlock>())
            {
                if (target==null) throw new InvalidDataException("Null controlledIce on "+ids[go]);
                ice.Add(ComponentRef(target.gameObject,"mechanism.ice",ids,ids[go]+"/controlledIce"));
            }
            components.Add(Component("mechanism.thermalController",c.enabled,"thermal",PhysicsLevelV2Json.Obj(
                "currentState",c.currentState.ToString(),"linkedController",linked,
                "controlledIce",PhysicsLevelV2Json.Arr(ice),"terminalName",c.terminalName,
                "interactionRadius",(double)c.interactionRadius,"controlRadius",(double)c.controlRadius,
                "roomFilterOverlay",null,"coldFilterColor",Color(c.coldFilterColor),
                "hotFilterColor",Color(c.hotFilterColor))));
        }
        else if (behaviourComponent.GetType()==typeof(RailgunBlock))
        {
            var c=(RailgunBlock)behaviourComponent;
            if (!c.isInteractable || c.launchEndPoint==null ||
                !ids.TryGetValue(c.launchEndPoint.gameObject,out string endpoint))
                throw new InvalidDataException("Missing or external Railgun launchEndPoint on "+ids[go]);
            components.Add(Component("mechanism.railgun",c.enabled,"railgun",PhysicsLevelV2Json.Obj(
                "launchEndPoint",PhysicsLevelV2Json.Obj("kind","transform","objectId",endpoint),
                "acceleration",(double)c.acceleration,"launchExitSpeed",(double)c.launchExitSpeed,
                "launchDirection",Vec(c.launchDirection))));
        }
        string parent=null;
        if (go.transform.parent!=null && !ids.TryGetValue(go.transform.parent.gameObject,out parent))
            throw new InvalidDataException("Parent has no V2 object identity on "+ids[go]);
        return PhysicsLevelV2Json.Obj("id",ids[go],"name",go.name,"parentId",parent,"active",go.activeSelf,
            "layer",(double)go.layer,"localPosition",Vec(go.transform.localPosition),
            "localRotationZ",(double)go.transform.localEulerAngles.z,"localScale",Vec(go.transform.localScale),
            "components",PhysicsLevelV2Json.Arr(components),"rules",PhysicsLevelV2Json.Arr(new N[0]));
    }
    private static N Component(string type,bool enabled,string payload=null,N data=null)
    {
        return payload==null ? PhysicsLevelV2Json.Obj("typeId",type,"version",1d,"enabled",enabled) :
            PhysicsLevelV2Json.Obj("typeId",type,"version",1d,"enabled",enabled,payload,data);
    }
    private static N ComponentRef(GameObject target,string type,Dictionary<GameObject,string> ids,string path)
    {
        if (!ids.TryGetValue(target,out string id)) throw new InvalidDataException("External scene reference "+path);
        return PhysicsLevelV2Json.Obj("kind","sceneComponent","objectId",id,
            "componentTypeId",type,"instanceId",null);
    }
    private static N Vec(Vector2 v) => PhysicsLevelV2Json.Obj("x",(double)v.x,"y",(double)v.y);
    private static N Vec(Vector3 v) => PhysicsLevelV2Json.Obj("x",(double)v.x,"y",(double)v.y,"z",(double)v.z);
    private static N Color(Color c) => PhysicsLevelV2Json.Obj("r",(double)c.r,"g",(double)c.g,"b",(double)c.b,"a",(double)c.a);
}
