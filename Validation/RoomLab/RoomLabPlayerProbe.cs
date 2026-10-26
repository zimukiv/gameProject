using System;
using System.Collections;
using System.Linq;
using UnityEngine;
using UnityEngine.SceneManagement;

public class RoomLabPlayerProbe : MonoBehaviour
{
    private int checks;
    private bool finished;
    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    private static void Install()
    {
        if(!Environment.GetCommandLineArgs().Contains("-roomLabVerify"))return;
        var go=new GameObject("RoomLab verification");DontDestroyOnLoad(go);go.AddComponent<RoomLabPlayerProbe>();
    }
    private void Check(bool okay,string name)
    {
        if(!okay){Debug.LogError("ROOMLAB_RUNTIME_FAIL "+name);finished=true;Application.Quit(2);throw new Exception(name);}
        checks++;
    }
    private IEnumerator Start()
    {
        yield return null;yield return null;
        string[] paths=FindObjectOfType<RoomLabRoom>().scenePaths;
        int total=0;
        foreach(string path in paths)
        {
            yield return SceneManager.LoadSceneAsync(path);
            yield return null;yield return null;yield return new WaitForFixedUpdate();
            var room=FindObjectOfType<RoomLabRoom>();var player=PlayerController.Instance;
            Check(room!=null&&player!=null&&EnemyAI.Instance!=null,"room actors "+path);
            Check(player.moveSpeed==8&&player.jumpVelocity==15&&player.maxDashCharges==1,"movement unchanged");
            Check(EnemyAI.Instance.baseChaseSpeed==14,"AI baseline unchanged");
            Check(SaveManager.Instance.TempData.isValid,"entry checkpoint");
            Check(FindObjectsOfType<RoomLabSourceObject>(true).Length==room.objectCount,"runtime source objects");
            total+=room.objectCount;
            Vector3 checkpoint=SaveManager.Instance.TempData.respawnPosition;
            player.transform.position+=Vector3.up*2;
            player.GetComponent<PlayerHealthRespawn>().RespawnAtLastCheckpoint();
            Check(Vector3.Distance(player.transform.position,checkpoint)<.001f,"room respawn");
        }
        Check(total==571,"all source objects loaded");
        yield return SceneManager.LoadSceneAsync(paths[0]);yield return null;yield return null;
        var first=FindObjectOfType<RoomLabRoom>();
        PlayerController.Instance.AddTokens(7);
        first.ExitTo("rail-room","rail-room-entry",false);
        yield return null;yield return null;yield return null;yield return null;
        Check(FindObjectOfType<RoomLabRoom>().roomId=="rail-room","authored room connection");
        Check(PlayerController.Instance.currentTokens==0,"new chase consumes carried Tokens");
        Check(Mathf.Abs(EnemyAI.Instance.currentSpeed-14f/1.21f)<.01f,"carried Tokens weaken real Unity AI");
        Check(PlayerController.Instance.currentDashCharges==1,"single dash carried across room");
        Check(SaveManager.Instance.TempData.wasFastPhase,"fast-room respawn checkpoint");
        EnemyAI.Instance.enabled=false;
        GameManager.Instance.CurrentState=GameManager.GameState.SlowPacedPhase;
        var rider=PlayerController.Instance;rider.ResetMotion();
        var platform=new GameObject("Verification carrier");platform.layer=8;
        platform.transform.position=new Vector3(80,10);platform.transform.localScale=new Vector3(2,.2f,1);
        platform.AddComponent<BoxCollider2D>();var body=platform.AddComponent<Rigidbody2D>();body.bodyType=RigidbodyType2D.Kinematic;
        var rail=platform.AddComponent<RailgunBlock>();rail.acceleration=30;rail.launchExitSpeed=32;
        var corner=new GameObject("Corner");corner.transform.position=new Vector3(84,10);
        var end=new GameObject("End");end.transform.position=new Vector3(84,16);
        rail.routePoints=new[]{corner.transform,end.transform};rail.launchEndPoint=end.transform;
        rider.transform.position=new Vector3(80,11.2f);rider.GetComponent<Rigidbody2D>().linearVelocity=Vector2.down;
        Physics2D.SyncTransforms();
        float deadline=Time.time+2;
        while(!rail.IsLaunching&&Time.time<deadline)yield return new WaitForFixedUpdate();
        Check(rail.IsLaunching&&rider.IsScriptedMotionControlledBy(rail),"carrier boards via real collision");
        deadline=Time.time+2;
        while(platform.transform.position.y<10.5f&&rail.IsLaunching&&Time.time<deadline)yield return new WaitForFixedUpdate();
        Check(platform.transform.position.y>=10.5f&&rider.IsScriptedMotionControlledBy(rail),"carrier traverses second route segment");
        Check(rail.TryJumpOff(rider),"jump off imported multi-node rail");
        Check(Mathf.Abs(rider.GetComponent<Rigidbody2D>().linearVelocity.y-rider.jumpVelocity)<.001f,"current Unity jump retained");
        EventBus.TriggerPlayerRespawned();
        Check(Vector3.Distance(platform.transform.position,new Vector3(80,10))<.001f&&!rail.IsLaunching,"rail reset after respawn");
        finished=true;Debug.Log("ROOMLAB_RUNTIME_PASS checks="+checks+" rooms=17 objects=571");Application.Quit(0);
    }
    private void Update()
    {
        if(!finished&&Time.realtimeSinceStartup>100){Debug.LogError("ROOMLAB_RUNTIME_FAIL timeout");Application.Quit(3);}
    }
}
