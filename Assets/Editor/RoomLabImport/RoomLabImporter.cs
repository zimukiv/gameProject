using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using Object=UnityEngine.Object;

public static class RoomLabImporter
{
    private const string Template="Assets/Scenes/Level1.unity";
    private static Sprite sprite;
    [MenuItem("RoomLab/Import prepared project")]
    public static void Choose()
    {
        if(!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())return;
        string file=EditorUtility.OpenFilePanel("Select project.unity.json (run Tools/RoomLabImport/prepare.py first)","Assets/RoomLabImports","json");
        if(!string.IsNullOrEmpty(file))Import(file);
    }
    // Batch entry point operates only on an explicitly selected prepared copy.
    public static void Batch()
    {
        string source=Environment.GetEnvironmentVariable("ROOMLAB_IMPORT_JSON");
        if(string.IsNullOrEmpty(source))throw new InvalidOperationException("ROOMLAB_IMPORT_JSON is required");
        Import(source);
    }
    public static void Import(string path)
    {
        string root=Path.GetFullPath("Assets/RoomLabImports")+Path.DirectorySeparatorChar;
        string full=Path.GetFullPath(path);
        if(!full.StartsWith(root,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("Copy prepared project into Assets/RoomLabImports first");
        var data=JsonUtility.FromJson<RoomLabProjectData>(File.ReadAllText(full));
        if(data==null||data.importVersion!=1||data.rooms==null||data.rooms.Length==0)throw new InvalidDataException("Not a prepared RoomLab project");
        string folder=Path.GetDirectoryName(full).Replace('\\','/');
        string cwd=Path.GetFullPath(".").Replace('\\','/')+"/";
        folder=folder.Substring(cwd.Length)+"/Scenes";
        if(Directory.Exists(folder)&&Directory.GetFiles(folder,"*.unity").Length>0)
            throw new IOException("Generated scenes already exist; retain manual adjustments and use a new import directory");
        Directory.CreateDirectory(folder);AssetDatabase.Refresh();
        string[] paths=data.rooms.Select((r,i)=>folder+"/Room"+(i+1).ToString("D2")+".unity").ToArray();
        sprite=AssetDatabase.LoadAssetAtPath<Sprite>("Assets/WhiteSquare.png");
        if(sprite==null)throw new InvalidDataException("WhiteSquare sprite missing");
        for(int i=0;i<data.rooms.Length;i++)Build(data,i,paths);
        File.WriteAllText(Path.GetDirectoryName(full)+"/scene-index.json",JsonUtility.ToJson(new SceneIndex{names=data.rooms.Select(r=>r.name).ToArray(),paths=paths},true));
        AssetDatabase.Refresh();EditorSceneManager.OpenScene(paths[0]);
        Debug.Log("ROOMLAB_IMPORT_PASS rooms="+data.rooms.Length+" tiles="+data.rooms.Sum(r=>r.tiles.Length)+" objects="+data.rooms.Sum(r=>r.objects.Length));
    }
    [Serializable] private class SceneIndex { public string[] names,paths; }
    private static GameObject Box(string name,Vector3 position,Vector2 size,Color color,bool collider,bool trigger=false)
    {
        var go=new GameObject(name);go.transform.position=position;go.transform.localScale=new Vector3(size.x,size.y,1);
        var sr=go.AddComponent<SpriteRenderer>();sr.sprite=sprite;sr.color=color;
        if(collider){go.AddComponent<BoxCollider2D>().isTrigger=trigger;if(!trigger)go.layer=8;}
        return go;
    }
    private static Vector3 Center(RoomLabRoomData r,float x,float y,float w=1,float h=1)=>RoomLabCoordinates.Center(x,y,w,h,r.rows);
    private static void Build(RoomLabProjectData project,int index,string[] paths)
    {
        var r=project.rooms[index];
        Scene scene=EditorSceneManager.OpenScene(Template,OpenSceneMode.Single);
        var keep=new HashSet<string>{"Main Camera","Player","AI pursuer","Scene Bootstrap"};
        foreach(var go in scene.GetRootGameObjects())if(!keep.Contains(go.name))Object.DestroyImmediate(go);
        var actor=Object.FindObjectOfType<PlayerController>();
        var ai=Object.FindObjectOfType<EnemyAI>();
        var boot=Object.FindObjectOfType<SceneBootstrap>();
        if(actor==null||ai==null||boot==null)throw new InvalidDataException("Missing game template actors");
        float spawnLift=actor.GetComponent<BoxCollider2D>().size.y*Mathf.Abs(actor.transform.localScale.y)/2f-.5f+.025f;
        Vector3 spawn=Center(r,r.entries[0].x,r.entries[0].y)+Vector3.up*spawnLift;
        actor.transform.position=spawn;
        ai.transform.position=spawn+Vector3.left*8;
        ai.teleportNodes=Array.Empty<Transform>();ai.isHunting=false;
        boot.spawnPosition=spawn;boot.levelIndex=1;
        var camera=Object.FindObjectOfType<Camera>();camera.orthographicSize=8.5f;
        var follow=camera.GetComponent<CameraFollow>();follow.target=actor.transform;
        follow.minBounds=Vector2.zero;follow.maxBounds=new Vector2(r.cols,r.rows);
        camera.transform.position=spawn+Vector3.back*10;

        var container=new GameObject("RoomLab · "+r.name);
        var context=container.AddComponent<RoomLabRoom>();
        context.roomId=r.id;context.roomName=r.name;context.phase=r.phase;context.aiPolicy=r.aiPolicy;
        context.roomIds=project.rooms.Select(x=>x.id).ToArray();context.roomNames=project.rooms.Select(x=>x.name).ToArray();context.scenePaths=paths;
        context.entryIds=r.entries.Select(e=>e.id).ToArray();context.entryPositions=r.entries.Select(e=>Center(r,e.x,e.y)+Vector3.up*spawnLift).ToArray();
        context.tileCount=r.tiles.Length;context.objectCount=r.objects.Length;
        var terrain=new GameObject("Terrain");terrain.transform.SetParent(container.transform);
        foreach(var t in r.tiles)
        {
            var go=Box($"Tile {t.x},{t.y}",Center(r,t.x,t.y),Vector2.one,new Color(.22f,.32f,.4f),t.collision);
            go.transform.SetParent(terrain.transform,true);
            if(t.collision)go.AddComponent<BaseBlock>();
        }
        var objects=new GameObject("Objects");objects.transform.SetParent(container.transform);
        var temperatures=container.AddComponent<RoomLabTemperature>();temperatures.roomHot=r.environment=="hot";
        temperatures.zones=r.zones.Select(z=>new RoomLabTemperature.Zone{id=z.id,hot=z.initial=="hot",
            bounds=new Rect(z.x,r.rows-z.y-z.h,z.w,z.h)}).ToArray();
        var terminals=new List<RoomLabTemperature.Terminal>();var ice=new List<IceBlock>();
        var outputs=new Dictionary<string,Transform>();var inputs=new List<(RoomLabPortal portal,string route)>();
        foreach(var o in r.objects)
        {
            bool pad=o.type=="physics.jet"||o.type=="physics.thermal"||o.type=="physics.rail";
            Vector3 pos=Center(r,o.x,o.y,o.w,o.h);
            Vector2 size=new Vector2(o.w,o.h);
            if(pad){size.y=.2f;pos.y=r.rows-o.y-.1f;}
            bool solid=o.collision&&(pad||o.type=="physics.ice"||o.type=="common.aiStart");
            var go=Box(o.name,pos,size,Color.white,true,!solid);go.transform.SetParent(objects.transform,true);
            var metadata=go.AddComponent<RoomLabSourceObject>();metadata.sourceId=o.id;metadata.sourceType=o.type;metadata.originalJson=o.sourceJson;
            var sr=go.GetComponent<SpriteRenderer>();var p=o.config??new RoomLabConfig();
            switch(o.type)
            {
                case "common.coin": go.AddComponent<BigTokenItem>();sr.color=Color.yellow;break;
                case "common.small": go.AddComponent<TokenItem>();sr.color=new Color(1,.65f,0);break;
                case "common.collectible":
                    var collectible=go.AddComponent<CollectibleItem>();collectible.collectibleName=o.name;
                    collectible.requiresAINearby=o.trigger!=null&&o.trigger.requiresAI;
                    collectible.requiredAIDistance=o.trigger==null?5:o.trigger.distance;sr.color=Color.magenta;break;
                case "common.spike": go.tag="Hazard";sr.color=new Color(1,.2f,.2f);break;
                case "physics.ice":
                    var b=go.AddComponent<IceBlock>();b.isMelted=temperatures.roomHot;ice.Add(b);sr.color=new Color(.45f,.85f,1);break;
                case "physics.jet":
                    var jet=go.AddComponent<AirVentBlock>();var impulse=new Vector2(p.launchX,-p.launchY)/32f;
                    jet.ventDirection=impulse.normalized;jet.upwardForce=impulse.magnitude;
                    jet.guideText="喷气";sr.color=Color.yellow;break;
                case "physics.thermal":
                    terminals.Add(new RoomLabTemperature.Terminal{point=go.transform,zoneId=p.zoneId,mode=p.mode});
                    var zone=Array.Find(temperatures.zones,z=>z.id==p.zoneId);
                    if(p.initialState=="hot"||p.initialState=="cold")
                    {if(zone==null)temperatures.roomHot=p.initialState=="hot";else zone.hot=p.initialState=="hot";}
                    sr.color=Color.cyan;break;
                case "physics.rail":
                    var rail=go.AddComponent<RailgunBlock>();
                    go.layer=8;go.GetComponent<BoxCollider2D>().isTrigger=false;
                    var body=go.GetComponent<Rigidbody2D>();body.bodyType=RigidbodyType2D.Kinematic;body.gravityScale=0;
                    rail.acceleration=Mathf.Max(.1f,p.acceleration/32f);rail.launchExitSpeed=Mathf.Max(1,p.maxSpeed/32f);rail.travelSpeedLimit=rail.launchExitSpeed;
                    var nodes=p.path??Array.Empty<RoomLabPoint>();
                    if(nodes.Length<2)
                    {
                        rail.enabled=false;rail.routePoints=Array.Empty<Transform>();sr.color=Color.gray;
                        Debug.LogWarning("ROOMLAB_INCOMPLETE_RAIL "+r.name+" / "+o.id+" needs at least two nodes");
                        break;
                    }
                    var points=new List<Transform>();Vector3 first=new Vector3(nodes[0].x,r.rows-nodes[0].y,0);
                    for(int n=1;n<nodes.Length;n++)
                    {
                        var point=new GameObject(o.id+" · node "+n);point.transform.SetParent(container.transform);
                        point.transform.position=pos+new Vector3(nodes[n].x,r.rows-nodes[n].y,0)-first;points.Add(point.transform);
                    }
                    rail.routePoints=points.ToArray();rail.launchEndPoint=points.Last();
                    float dx=nodes[nodes.Length-1].x-nodes[nodes.Length-2].x;
                    rail.launchDirection=dx<0?Vector2.left:Vector2.right;sr.color=new Color(1,.65f,.05f);break;
                case "common.aiStart": case "common.aiStartHollow":
                    GameObject trigger=go;
                    if(solid){trigger=new GameObject("AI activation surface");trigger.transform.SetParent(go.transform,false);
                        var col=trigger.AddComponent<BoxCollider2D>();col.isTrigger=true;col.size=new Vector2(1,.2f);col.offset=new Vector2(0,.55f);}
                    var device=trigger.AddComponent<AIActivatorDevice>();device.autoActivateOnContact=true;device.difficultyPerToken=.03f;device.deviceRenderer=sr;
                    sr.color=new Color(.75f,.4f,1);break;
                case "common.portalOut":
                    if(outputs.ContainsKey(p.routeId))throw new InvalidDataException("Ambiguous AI portal route "+p.routeId);
                    outputs.Add(p.routeId,go.transform);sr.color=new Color(.3f,1,.4f);break;
                case "common.portalIn":
                    inputs.Add((go.AddComponent<RoomLabPortal>(),p.routeId));sr.color=new Color(.4f,.5f,1);break;
                default: throw new InvalidDataException("Unsupported type "+o.type);
            }
        }
        foreach(var pair in inputs)if(outputs.TryGetValue(pair.route,out var target))pair.portal.destination=target;
        temperatures.ice=ice.ToArray();temperatures.terminals=terminals.ToArray();
        foreach(var exit in r.exits)
        {
            var go=Box("Exit · "+exit.name,Center(r,exit.x,exit.y,exit.w,exit.h),new Vector2(exit.w,exit.h),new Color(.2f,1,.4f,.45f),true,true);
            go.transform.SetParent(container.transform);var portal=go.AddComponent<RoomLabExit>();portal.room=context;
            var wire=project.connections.FirstOrDefault(c=>c.from.roomId==r.id&&c.from.exitId==exit.id);
            if(wire!=null){portal.targetRoom=wire.to.roomId;portal.targetEntry=wire.to.entryId;portal.keepVelocity=wire.velocity=="keep";}
        }
        var death=Box("Fall death",new Vector3(r.cols/2f,-4),new Vector2(r.cols+100,2),Color.clear,true,true);death.tag="DeadZone";death.transform.SetParent(container.transform);
        if(!EditorSceneManager.SaveScene(scene,paths[index]))throw new IOException("Scene save failed");
    }
}
