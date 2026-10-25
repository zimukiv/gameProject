using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using N = PhysicsLevelV2Json.Node;

public static class PhysicsLevelV2Tests
{
    public const string FixturePath = "Levels/Physics/Level1.phase4a.json";
    public const string Fixture4BPath = "Levels/Physics/Level1.phase4b.json";
    private const string IsolationMarker = "PHYSICS_LEVEL_EDITOR_PHASE4A_ISOLATED";
    private static string ProjectFile(string relative) => Path.Combine(
        Path.GetFullPath(Path.Combine(Application.dataPath,"..")),relative);

    [MenuItem("Physics Level Editor/Phase 4A/Run isolated data roundtrip")]
    public static void RunIsolatedDataRoundtrip()
    {
        try
        {
            CheckIsolation();
            if (SceneManager.GetActiveScene().isDirty) throw new InvalidOperationException("Save or discard the active scene first.");
            string json=File.ReadAllText(ProjectFile(FixturePath));
            PhysicsLevelV2Validation.Validate(json);
            string scene=PhysicsLevelV2ImportExport.ImportNewScene(json);
            string exported=PhysicsLevelV2ImportExport.ExportActiveScene();
            EqualDocument(PhysicsLevelV2Json.Parse(json),PhysicsLevelV2Json.Parse(exported));
            var objectWithId=SceneManager.GetActiveScene().GetRootGameObjects()
                .SelectMany(go=>go.GetComponentsInChildren<LevelObjectId>(true)).First();
            var extra=objectWithId.gameObject.AddComponent<AudioSource>();
            try
            {
                EditorSceneManager.SaveScene(SceneManager.GetActiveScene());
                try { PhysicsLevelV2ImportExport.ExportActiveScene();
                    throw new Exception("Unknown AudioSource was silently omitted"); }
                catch (InvalidDataException) { }
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(extra);
                EditorSceneManager.SaveScene(SceneManager.GetActiveScene());
            }
            Debug.Log("PHASE4A_DATA_STATUS=PASS; scene="+scene+"; objects=5; epsilon=0.0001");
            Debug.Log("PHASE4A_PLAY_STATUS=NOT_RUN; IceBlock and VanishingBlock behavior require isolated Play Mode inspection");
        }
        catch (Exception ex)
        {
            Debug.LogError("PHASE4A_DATA_STATUS=FAIL; PHASE4A_PLAY_STATUS=NOT_RUN; "+ex);
        }
    }

    [MenuItem("Physics Level Editor/Phase 4A/Run isolated rejection tests")]
    public static void RunIsolatedRejectionTests()
    {
        try
        {
            CheckIsolation();
            string original=File.ReadAllText(ProjectFile(FixturePath));
            var root=PhysicsLevelV2Json.Parse(original);
            ExpectReject("duplicate key",original.Replace("\"formatVersion\": 2", "\"formatVersion\": 2, \"formatVersion\": 2"),false);
            N first=root.Object["objects"].Array[0];
            first.Object.Add("unknownProperty",PhysicsLevelV2Json.Wrap(1d));
            ExpectReject("unknown field",PhysicsLevelV2Json.Write(root),false);
            first.Object.Remove("unknownProperty");
            var components=first.Object["components"].Array;
            N sprite=components.Single(c=>c.Object["typeId"].String=="visual.sprite");
            string guid=sprite.Object["sprite"].Object["assetGuid"].String;
            sprite.Object["sprite"].Object["assetGuid"]=PhysicsLevelV2Json.Wrap("00000000000000000000000000000000");
            ExpectReject("missing Sprite",PhysicsLevelV2Json.Write(root),true);
            sprite.Object["sprite"].Object["assetGuid"]=PhysicsLevelV2Json.Wrap(guid);
            N behavior=components.Single(c=>PhysicsLevelV2Validation.Behaviours.Contains(c.Object["typeId"].String));
            string type=behavior.Object["typeId"].String;
            behavior.Object["typeId"]=PhysicsLevelV2Json.Wrap("mechanism.thermalController");
            ExpectReject("unsupported component",PhysicsLevelV2Json.Write(root),false);
            behavior.Object["typeId"]=PhysicsLevelV2Json.Wrap(type);
            behavior.Object["version"]=PhysicsLevelV2Json.Wrap(99d);
            ExpectReject("unknown component version",PhysicsLevelV2Json.Write(root),false);
            behavior.Object["version"]=PhysicsLevelV2Json.Wrap(1d);
            first.Object["parentId"]=PhysicsLevelV2Json.Wrap("11111111-1111-4111-8111-111111111111");
            ExpectReject("missing parent",PhysicsLevelV2Json.Write(root),false);
            first.Object["parentId"]=PhysicsLevelV2Json.Wrap(null);
            N vanishing=root.Object["objects"].Array.Single(o=>o.Object["components"].Array.Any(
                c=>c.Object["typeId"].String=="mechanism.vanishing"));
            N vanish=vanishing.Object["components"].Array.Single(c=>c.Object["typeId"].String=="mechanism.vanishing");
            vanish.Object["vanishing"].Object["optionalCollectible"]=PhysicsLevelV2Json.Obj(
                "kind","sceneComponent","objectId",first.Object["id"].String,
                "componentTypeId","item.collectible","instanceId",null);
            ExpectReject("unsupported scene reference",PhysicsLevelV2Json.Write(root),false);
            Debug.Log("PHASE4A_REJECTION_STATUS=PASS; duplicate/unknown/version/missing-asset/missing-parent/reference rejected");
        }
        catch (Exception ex) { Debug.LogError("PHASE4A_REJECTION_STATUS=FAIL; "+ex); }
    }

    [MenuItem("Physics Level Editor/Phase 4B/Run isolated thermal and railgun data roundtrip")]
    public static void RunIsolatedPhase4BRoundtrip()
    {
        try
        {
            CheckIsolation();
            if (SceneManager.GetActiveScene().isDirty) throw new InvalidOperationException("Save or discard active scene edits first.");
            string json=File.ReadAllText(ProjectFile(Fixture4BPath));
            PhysicsLevelV2Validation.Validate(json);
            string scene=PhysicsLevelV2ImportExport.ImportNewScene(json);
            string exported=PhysicsLevelV2ImportExport.ExportActiveScene();
            EqualDocument(PhysicsLevelV2Json.Parse(json),PhysicsLevelV2Json.Parse(exported));
            SessionState.SetString("Phase4B.DataScene",scene);
            SessionState.SetBool("Phase4B.DataPassed",true);
            Debug.Log("PHASE4B_DATA_STATUS=PASS; scene="+scene+"; objects=9; epsilon=0.0001");
            Debug.Log("PHASE4B_PLAY_STATUS=NOT_RUN");
        }
        catch (Exception ex)
        {
            SessionState.SetBool("Phase4B.DataPassed",false);
            Debug.LogError("PHASE4B_DATA_STATUS=FAIL; PHASE4B_PLAY_STATUS=NOT_RUN; "+ex);
        }
    }

    [MenuItem("Physics Level Editor/Phase 4B/Run isolated reference rejection tests")]
    public static void RunIsolatedPhase4BRejections()
    {
        try
        {
            CheckIsolation();
            N root=PhysicsLevelV2Json.Parse(File.ReadAllText(ProjectFile(Fixture4BPath)));
            AssertFixtureLookupRegressions(root);
            N thermal=root.Object["objects"].Array.SelectMany(o=>o.Object["components"].Array)
                .First(c=>c.Object["typeId"].String=="mechanism.thermalController").Object["thermal"];
            N linked=thermal.Object["linkedController"];
            thermal.Object["linkedController"]=PhysicsLevelV2Json.Obj("kind","sceneComponent",
                "objectId","11111111-1111-4111-8111-111111111111",
                "componentTypeId","mechanism.thermalController","instanceId",null);
            ExpectReject("missing thermal target",PhysicsLevelV2Json.Write(root),false);
            thermal.Object["linkedController"]=linked;
            var ice=thermal.Object["controlledIce"].Array[0];
            ice.Object["componentTypeId"]=PhysicsLevelV2Json.Wrap("item.token");
            ExpectReject("wrong ice component type",PhysicsLevelV2Json.Write(root),false);
            ice.Object["componentTypeId"]=PhysicsLevelV2Json.Wrap("mechanism.ice");
            thermal.Object["roomFilterOverlay"]=PhysicsLevelV2Json.Obj("kind","sceneComponent",
                "objectId",root.Object["objects"].Array[0].Object["id"].String,
                "componentTypeId","visual.sprite","instanceId",null);
            ExpectReject("unsupported overlay",PhysicsLevelV2Json.Write(root),false);
            thermal.Object["roomFilterOverlay"]=PhysicsLevelV2Json.Wrap(null);
            N rail=root.Object["objects"].Array.SelectMany(o=>o.Object["components"].Array)
                .First(c=>c.Object["typeId"].String=="mechanism.railgun").Object["railgun"];
            N endpoint=rail.Object["launchEndPoint"];
            rail.Object["launchEndPoint"]=PhysicsLevelV2Json.Obj("kind","transform",
                "objectId","11111111-1111-4111-8111-111111111111");
            ExpectReject("missing rail endpoint",PhysicsLevelV2Json.Write(root),false);
            rail.Object["launchEndPoint"]=PhysicsLevelV2Json.Obj("kind","transform",
                "objectId",root.Object["objects"].Array[0].Object["id"].String);
            ExpectReject("wrong rail endpoint target",PhysicsLevelV2Json.Write(root),false);
            rail.Object["launchEndPoint"]=PhysicsLevelV2Json.Wrap(null);
            ExpectRejectDetails("required rail endpoint null",PhysicsLevelV2Json.Write(root),
                "mechanism.railgun","railgun.launchEndPoint");
            rail.Object["launchEndPoint"]=endpoint;
            PhysicsLevelV2Validation.Validate(PhysicsLevelV2Json.Write(root));
            string validJson=PhysicsLevelV2Json.Write(root);
            var parsed=JsonUtility.FromJson<LevelDataV2>(validJson);
            PhysicsLevelV2ImportExport.NormalizeDecodedReferences(root,parsed);
            var thermalParts=parsed.objects.SelectMany(o=>o.components)
                .Where(c=>c.typeId=="mechanism.thermalController").ToArray();
            if (thermalParts.Length!=2 || thermalParts[0].thermal.linkedController!=null ||
                thermalParts[0].thermal.controlledIce.Length!=1 ||
                thermalParts[1].thermal.linkedController?.objectId!=
                    root.Object["objects"].Array.First(o=>o.Object["components"].Array.Any(
                        c=>c.Object["typeId"].String=="mechanism.thermalController")).Object["id"].String)
                throw new Exception("Optional null or required forward references changed during JsonUtility decode");
            var decodedRail=parsed.objects.SelectMany(o=>o.components).Single(c=>c.typeId=="mechanism.railgun");
            if (decodedRail.railgun.launchEndPoint?.objectId!=endpoint.Object["objectId"].String)
                throw new Exception("Railgun endpoint changed during JsonUtility decode");
            thermalParts[1].thermal.linkedController=new SceneComponentRefV2();
            ExpectDecodedReject("lost linked controller ID",root,parsed,"thermal.linkedController");
            // Restore from validated JSON so subsequent cases are independent.
            parsed=JsonUtility.FromJson<LevelDataV2>(validJson);
            thermalParts=parsed.objects.SelectMany(o=>o.components)
                .Where(c=>c.typeId=="mechanism.thermalController").ToArray();
            thermalParts[0].thermal.controlledIce[0].objectId=null;
            ExpectDecodedReject("lost controlledIce ID",root,parsed,"thermal.controlledIce");
            parsed=JsonUtility.FromJson<LevelDataV2>(validJson);
            parsed.objects.SelectMany(o=>o.components).Single(c=>c.typeId=="mechanism.railgun")
                .railgun.launchEndPoint.objectId=null;
            ExpectDecodedReject("lost Railgun endpoint ID",root,parsed,"railgun.launchEndPoint");
            Debug.Log("PHASE4B_REFERENCE_STATUS=PASS; missing/wrong thermal, ice, overlay and rail targets rejected");
        }
        catch (Exception ex) { Debug.LogError("PHASE4B_REFERENCE_STATUS=FAIL; "+ex); }
    }

    [MenuItem("Physics Level Editor/Phase 4B/Prepare and play isolated mechanics scene")]
    public static void PrepareAndPlayPhase4B()
    {
        string source=null,playPath=null;
        bool prepared=false;
        try
        {
            CheckIsolation();
            if (EditorApplication.isPlayingOrWillChangePlaymode || SceneManager.GetActiveScene().isDirty)
                throw new InvalidOperationException("Exit Play Mode and save or discard active scene edits first.");
            source=SessionState.GetString("Phase4B.DataScene","");
            if (!SessionState.GetBool("Phase4B.DataPassed",false) ||
                !source.StartsWith(PhysicsLevelV2ImportExport.TestScenePrefix,StringComparison.Ordinal) ||
                !File.Exists(PhysicsLevelV2ImportExport.ProjectPath(source)))
                throw new InvalidOperationException("Run Phase 4B isolated data roundtrip in this Editor session first.");
            EditorSceneManager.OpenScene(source,OpenSceneMode.Single);
            playPath=PhysicsLevelV2ImportExport.TestScenePrefix+"Play_"+Guid.NewGuid().ToString("N")+".unity";
            if (File.Exists(PhysicsLevelV2ImportExport.ProjectPath(playPath))) throw new IOException("Generated Play scene path exists: "+playPath);
            var scene=SceneManager.GetActiveScene();
            if (!EditorSceneManager.SaveScene(scene,playPath,true)) throw new IOException("Could not copy Play scene.");
            scene=EditorSceneManager.OpenScene(playPath,OpenSceneMode.Single);
            var imported=scene.GetRootGameObjects().SelectMany(go=>go.GetComponentsInChildren<LevelObjectId>(true)).ToArray();
            N fixture=PhysicsLevelV2Validation.Validate(File.ReadAllText(ProjectFile(Fixture4BPath)));
            string authorityId=FindFixtureObjectId(fixture,"unlinked thermal authority","mechanism.thermalController",
                c=>c.Object["thermal"].Object["linkedController"].IsNull);
            string linkedId=FindFixtureObjectId(fixture,"linked thermal terminal","mechanism.thermalController",
                c=>!c.Object["thermal"].Object["linkedController"].IsNull);
            string iceId=FindFixtureObjectId(fixture,"controlled ice","mechanism.ice");
            string railgunId=FindFixtureObjectId(fixture,"railgun launcher","mechanism.railgun");
            var authority=FindImported<ThermalControllerBlock>(imported,authorityId,"unlinked thermal authority");
            var linked=FindImported<ThermalControllerBlock>(imported,linkedId,"linked thermal terminal");
            var ice=FindImported<IceBlock>(imported,iceId,"controlled ice");
            var railgun=FindImported<RailgunBlock>(imported,railgunId,"railgun launcher");
            var player=new GameObject("Phase 4B test player");
            player.tag="Player";
            player.transform.position=new Vector3(-5f,-1f,0f);
            player.transform.localScale=new Vector3(.8f,1.3f,1f);
            player.AddComponent<SpriteRenderer>().sprite=AssetDatabase.LoadAssetAtPath<Sprite>("Assets/WhiteSquare.png");
            var body=player.AddComponent<Rigidbody2D>();
            body.gravityScale=3f; body.freezeRotation=true;
            body.collisionDetectionMode=CollisionDetectionMode2D.Continuous;
            player.AddComponent<BoxCollider2D>();
            var controller=player.AddComponent<PlayerController>();
            controller.groundLayer=1<<8;
            controller.normalColliderSize=Vector2.one;
            controller.crouchColliderSize=new Vector2(1f,.55f);
            controller.crouchColliderOffset=new Vector2(0f,-.22f);
            var foot=new GameObject("Ground Check");
            foot.transform.SetParent(player.transform,false);
            foot.transform.localPosition=new Vector3(0f,-.55f,0f);
            controller.groundCheck=foot.transform;
            var bootstrap=new GameObject("Phase 4B test bootstrap").AddComponent<SceneBootstrap>();
            bootstrap.levelIndex=1;
            bootstrap.spawnPosition=player.transform.position;
            var probe=new GameObject("Phase 4B mechanics probe").AddComponent<Phase4BPlaytestProbe>();
            probe.player=controller; probe.authority=authority; probe.linked=linked; probe.ice=ice; probe.railgun=railgun;
            if (!EditorSceneManager.SaveScene(scene)) throw new IOException("Could not save isolated Play fixture.");
            prepared=true;
            Debug.Log("PHASE4B_PLAY_STATUS=RUNNING; scene="+playPath);
            EditorApplication.isPlaying=true;
        }
        catch (Exception ex)
        {
            if (!prepared && !string.IsNullOrEmpty(playPath))
            {
                if (!string.IsNullOrEmpty(source) && File.Exists(PhysicsLevelV2ImportExport.ProjectPath(source)))
                    EditorSceneManager.OpenScene(source,OpenSceneMode.Single);
                if (File.Exists(PhysicsLevelV2ImportExport.ProjectPath(playPath))) AssetDatabase.DeleteAsset(playPath);
            }
            Debug.LogError("PHASE4B_PLAY_STATUS=NOT_RUN; reason="+ex);
        }
    }

    private static void ExpectReject(string label,string json,bool resolveAsset)
    {
        try { PhysicsLevelV2Validation.Validate(json,resolveAsset); }
        catch (InvalidDataException) { return; }
        throw new Exception(label+" was accepted");
    }
    private static void ExpectRejectDetails(string label,string json,string type,string field)
    {
        try { PhysicsLevelV2Validation.Validate(json,false); }
        catch (InvalidDataException error) when (error.Message.Contains(type) && error.Message.Contains(field)) { return; }
        throw new Exception(label+" was accepted or lacked object/component/field context");
    }
    private static void ExpectDecodedReject(string label,N raw,LevelDataV2 decoded,string path)
    {
        try { PhysicsLevelV2ImportExport.NormalizeDecodedReferences(raw,decoded); }
        catch (InvalidDataException error) when (error.Message.Contains(path)) { return; }
        throw new Exception(label+" was accepted or did not report "+path);
    }

    internal static string FindFixtureObjectId(N fixture,string purpose,string expectedType,Func<N,bool> predicate=null)
    {
        var objects=fixture.Object["objects"].Array;
        var candidates=objects.Select(o=>new {Object=o,
            Components=o.Object["components"].Array.Where(c=>c.Object["typeId"].String==expectedType).ToArray()})
            .Where(x=>x.Components.Length!=0).ToArray();
        var matches=candidates.Where(x=>x.Components.Length==1 && (predicate==null || predicate(x.Components[0])))
            .Select(x=>x.Object).ToArray();
        if (matches.Length!=1)
        {
            string inventory=string.Join("; ",objects.Select(o=>
                o.Object["id"].String+" name="+o.Object["name"].String+" components=["+
                string.Join(",",o.Object["components"].Array.Select(c=>c.Object["typeId"].String))+"]"));
            throw new InvalidDataException("Phase 4B fixture object lookup failed: purpose="+purpose+
                "; expectedType="+expectedType+"; predicate="+(predicate==null?"type only":"typed reference condition")+
                "; matches="+matches.Length+"; candidates="+inventory);
        }
        return matches[0].Object["id"].String;
    }

    internal static void AssertFixtureLookupRegressions(N fixture)
    {
        Func<N,bool> unlinked=c=>c.Object["thermal"].Object["linkedController"].IsNull;
        Func<N,bool> linked=c=>!c.Object["thermal"].Object["linkedController"].IsNull;
        string root=FindFixtureObjectId(fixture,"unlinked thermal authority","mechanism.thermalController",unlinked);
        string terminal=FindFixtureObjectId(fixture,"linked thermal terminal","mechanism.thermalController",linked);
        string ice=FindFixtureObjectId(fixture,"controlled ice","mechanism.ice");
        string rail=FindFixtureObjectId(fixture,"railgun launcher","mechanism.railgun");
        if (root==terminal || ice==rail) throw new Exception("Phase 4B fixture IDs are not distinct");
        N reordered=PhysicsLevelV2Json.Parse(PhysicsLevelV2Json.Write(fixture));
        reordered.Object["objects"].Array.Reverse();
        if (FindFixtureObjectId(reordered,"unlinked thermal authority","mechanism.thermalController",unlinked)!=root ||
            FindFixtureObjectId(reordered,"linked thermal terminal","mechanism.thermalController",linked)!=terminal ||
            FindFixtureObjectId(reordered,"controlled ice","mechanism.ice")!=ice ||
            FindFixtureObjectId(reordered,"railgun launcher","mechanism.railgun")!=rail)
            throw new Exception("Fixture lookup changed after object reordering");
        N missing=PhysicsLevelV2Json.Parse(PhysicsLevelV2Json.Write(fixture));
        missing.Object["objects"].Array.RemoveAll(o=>o.Object["id"].String==root);
        ExpectLookupFailure(missing,"unlinked thermal authority","mechanism.thermalController",unlinked,"matches=0");
        N duplicate=PhysicsLevelV2Json.Parse(PhysicsLevelV2Json.Write(fixture));
        N linkedObject=duplicate.Object["objects"].Array.Find(o=>o.Object["id"].String==terminal);
        N linkedComponent=linkedObject?.Object["components"].Array.Find(c=>
            c.Object["typeId"].String=="mechanism.thermalController");
        if (linkedComponent==null) throw new InvalidDataException("Regression fixture lost linked terminal "+terminal);
        linkedComponent.Object["thermal"].Object["linkedController"]=PhysicsLevelV2Json.Wrap(null);
        ExpectLookupFailure(duplicate,"unlinked thermal authority","mechanism.thermalController",unlinked,"matches=2");
    }

    private static void ExpectLookupFailure(N fixture,string purpose,string type,Func<N,bool> predicate,string count)
    {
        try { FindFixtureObjectId(fixture,purpose,type,predicate); }
        catch (InvalidDataException error) when (error.Message.Contains(purpose) &&
            error.Message.Contains(type) && error.Message.Contains(count) && error.Message.Contains("candidates="))
        { return; }
        throw new Exception("Fixture lookup did not reject "+count+" with clear context");
    }

    private static T FindImported<T>(LevelObjectId[] imported,string id,string purpose) where T:Component
    {
        var candidates=imported.Where(identity=>identity!=null && identity.ObjectId==id).ToArray();
        var typed=candidates.SelectMany(identity=>identity.GetComponents<T>())
            .Where(component=>component.GetType()==typeof(T)).ToArray();
        if (candidates.Length!=1 || typed.Length!=1)
        {
            string inventory=string.Join("; ",imported.Where(identity=>identity!=null).Select(identity=>
                identity.ObjectId+" name="+identity.gameObject.name+" components=["+
                string.Join(",",identity.GetComponents<Component>().Select(component=>
                    component==null?"MISSING":component.GetType().Name))+"]"));
            throw new InvalidDataException("Phase 4B imported object lookup failed: purpose="+purpose+
                "; expectedId="+id+"; expectedType="+typeof(T).Name+
                "; ID matches="+candidates.Length+"; typed matches="+typed.Length+"; candidates="+inventory);
        }
        return typed[0];
    }

    internal static void CheckIsolation()
    {
        string project=Path.GetFullPath(Path.Combine(Application.dataPath,".."));
        string marker=Path.Combine(project,"Phase4A.IsolatedProject.marker");
        if (!File.Exists(marker) || File.ReadAllText(marker).Trim()!=IsolationMarker ||
            Application.companyName=="MiniGame Team" ||
            Application.productName=="AI 大人，拜托了" ||
            !Application.companyName.Contains("Phase4A") || !Application.productName.Contains("Phase4A"))
            throw new InvalidOperationException("Isolation guard failed: use a separate copied project, exact marker, and Phase4A Company/Product settings.");
        string source=Path.GetFullPath(@"C:\Users\Kayla\Desktop\gameProject-physics-phase4");
        string original=Path.GetFullPath(@"C:\Users\Kayla\Desktop\gameProject-physics");
        if (string.Equals(project.TrimEnd(Path.DirectorySeparatorChar),source,StringComparison.OrdinalIgnoreCase) ||
            string.Equals(project.TrimEnd(Path.DirectorySeparatorChar),original,StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Isolation guard failed: active project is a development or formal worktree.");
        Debug.Log("PHASE4A_ISOLATION_PASS project="+project+"; Company="+Application.companyName+"; Product="+Application.productName);
    }

    internal static void EqualDocument(N before,N after)
    {
        var a=before.Object["objects"].Array;
        var b=after.Object["objects"].Array;
        a.Sort((x,y)=>string.CompareOrdinal(x.Object["id"].String,y.Object["id"].String));
        b.Sort((x,y)=>string.CompareOrdinal(x.Object["id"].String,y.Object["id"].String));
        foreach (N obj in a) obj.Object["components"].Array.Sort((x,y)=>
            string.CompareOrdinal(x.Object["typeId"].String,y.Object["typeId"].String));
        foreach (N obj in b) obj.Object["components"].Array.Sort((x,y)=>
            string.CompareOrdinal(x.Object["typeId"].String,y.Object["typeId"].String));
        Equal(before,after,"$");
    }
    private static void Equal(N a,N b,string path)
    {
        if (a.Object!=null)
        {
            if (b.Object==null || a.Object.Count!=b.Object.Count) throw new Exception(path+": object field count differs");
            foreach (var pair in a.Object)
            {
                if (!b.Object.TryGetValue(pair.Key,out N value)) throw new Exception(path+"."+pair.Key+": field missing");
                Equal(pair.Value,value,path+"."+pair.Key);
            }
        }
        else if (a.Array!=null)
        {
            if (b.Array==null || a.Array.Count!=b.Array.Count) throw new Exception(path+": array length differs");
            for (int i=0;i<a.Array.Count;i++) Equal(a.Array[i],b.Array[i],path+"["+i+"]");
        }
        else if (a.Value is double left && b.Value is double right)
        {
            if (Math.Abs(left-right)>0.0001) throw new Exception(path+": "+left+" != "+right);
        }
        else if (!Equals(a.Value,b.Value)) throw new Exception(path+": "+a.Value+" != "+b.Value);
    }
}
