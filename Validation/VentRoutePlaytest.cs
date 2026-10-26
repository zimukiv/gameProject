// Copy to an isolated project's Assets; run -executeMethod VentRoutePlaytest.Run.
#if UNITY_EDITOR
using System;
using System.Collections;
using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

[InitializeOnLoad]
public static class VentRoutePlaytest
{
    static VentRoutePlaytest()
    {
        EditorApplication.playModeStateChanged += state =>
        {
            if (state == PlayModeStateChange.EnteredPlayMode && SessionState.GetBool("VentRoute.Test",false))
                new GameObject("Vent route integration checks").AddComponent<VentRouteTestRunner>();
        };
    }
    public static void Run()
    {
        SessionState.SetBool("TemperatureRoute.Test",false);
        SessionState.SetBool("ThermalPreview",false);
        foreach(string key in new[] { "HorizontalDash.Test", "IceRecovery.Test", "PlatformGuide.Preview" })
            SessionState.SetBool(key,false);
        SessionState.SetBool("VentRoute.Test",true);
        EditorSceneManager.OpenScene("Assets/Scenes/Level1.unity");
        EditorApplication.EnterPlaymode();
    }
}

public class VentRouteTestRunner : MonoBehaviour
{
    private int checks;
    private PlayerController player;
    private Rigidbody2D body;
    private PlayerInputBuffer inputs;
    private MethodInfo fixedUpdate;

    private IEnumerator Start()
    {
        var test=RunChecks();
        while (true)
        {
            object next;
            try { if (!test.MoveNext()) break; next=test.Current; }
            catch (Exception error)
            {
                Debug.LogException(error);
                File.WriteAllText("vent-route-result.txt","FAIL\n"+error);
                EditorApplication.Exit(1);
                yield break;
            }
            yield return next;
        }
        File.WriteAllText("vent-route-result.txt","PASS "+checks+" Unity integration checks\n");
        Debug.Log("VENT ROUTE PASS: "+checks);
        EditorApplication.Exit(0);
    }

    private IEnumerator RunChecks()
    {
        yield return null;
        Physics2D.simulationMode=SimulationMode2D.Script;
        player=PlayerController.Instance;
        player.enabled=false;
        body=player.GetComponent<Rigidbody2D>();
        var flags=BindingFlags.Instance|BindingFlags.NonPublic;
        inputs=(PlayerInputBuffer)typeof(PlayerController).GetField("inputBuffer",flags).GetValue(player);
        fixedUpdate=typeof(PlayerController).GetMethod("FixedUpdate",flags);
        var device=GameObject.Find("AI activation device").GetComponent<AIActivatorDevice>();
        var checkpoint=GameObject.Find("Room 3 checkpoint").GetComponent<Checkpoint>();
        var platform=GameObject.Find("Chase platform").GetComponent<BoxCollider2D>();
        var rail=GameObject.Find("Railgun").GetComponent<RailgunBlock>();
        Check(GameObject.Find("Moving platform")==null,"Purple moving platform removed");
        Check(!device.TryActivateFromInteraction(),"AI cannot be activated from outside its range");
        Check(GameObject.Find("Room 2 checkpoint")==null && FindObjectsOfType<Checkpoint>().Length==1,
            "Only the pre-vent checkpoint remains");
        var start=SaveManager.Instance.TempData.respawnPosition;
        player.transform.position=new Vector3(6,3);
        Physics2D.SyncTransforms();
        GameObject.Find("Thermal controller A").GetComponent<ThermalControllerBlock>().ToggleTemperature();
        player.AddTokens(3);
        Tick(0);
        player.GetComponent<PlayerHealthRespawn>().RespawnAtLastCheckpoint();
        Check(Vector3.Distance(player.transform.position,start)<.01f && player.currentTokens==0 &&
            GameObject.Find("Thermal controller A").GetComponent<ThermalControllerBlock>().CurrentTemperature==ThermalControllerBlock.TemperatureState.Hot,
            "Before the vent flag, death restores level start and initial resources/temperature");
        player.ResetMotion();
        player.transform.position=new Vector3(23,-2.35f);
        Physics2D.SyncTransforms();
        Tick(0);
        Check(checkpoint.isActivated,"Real contact saves checkpoint before vent");
        Check(!checkpoint.GetComponent<SpriteRenderer>().enabled,"Green rectangle hidden");
        Check(checkpoint.GetComponentInChildren<LineRenderer>()!=null,"Flag outline exists");
        Check(SaveManager.Instance.TempData.respawnPosition.x==23,"Checkpoint saves safe runway position");

        bool launched=false,landed=false;
        float peak=body.position.y;
        for (int i=0;i<200;i++)
        {
            Tick(1);
            peak=Mathf.Max(peak,body.position.y);
            if (body.linearVelocity.y>18) launched=true;
            if (launched && player.isGrounded && body.position.y>2 && body.position.x>29)
            { landed=true; break; }
            if (i%10==0) yield return null;
        }
        Check(launched,"Approaching vent triggers launch");
        Check(landed,"Holding right lands on elevated platform without jumping or waiting");
        Check(body.position.x>platform.bounds.min.x+.3f && body.position.x<platform.bounds.max.x-.3f,
            "Landing has edge margin");
        Check(peak>3,"Clear flight path allows full upward travel");
        Check(!GameObject.Find("Big token"),"Landing-route reward was collected");
        for (int i=0;i<12;i++) Tick(0);
        Check(!device.isActivated,"Walking into core does not start chase");
        Check(GameManager.Instance.CurrentState==GameManager.GameState.SlowPacedPhase,"Learning remains in exploration phase");
        yield return null;
        Capture("vent-route-ready.png");

        Time.timeScale=0;
        Check(!device.TryActivateFromInteraction(),"Paused interaction cannot start chase");
        Time.timeScale=1;
        Check(device.TryActivateFromInteraction(),"Explicit interaction at core starts chase");
        Check(GameManager.Instance.CurrentState==GameManager.GameState.FastPacedPhase,"Interaction changes game phase");
        Check(player.currentTokens==0,"AI activation consumes held Tokens");
        var enemy=GameObject.Find("AI pursuer");
        enemy.GetComponent<EnemyAI>().enabled=false;
        enemy.GetComponent<Collider2D>().enabled=false;
        yield return null;
        Capture("vent-route-active.png");

        bool enteredRail=false, jumpedToBoard=false;
        Vector3 railStart=rail.transform.position;
        for (int i=0;i<250;i++)
        {
            bool jump=!jumpedToBoard && body.position.x>=38.4f && player.isGrounded;
            if(jump) jumpedToBoard=true;
            Tick(body.position.x<40.9f ? 1 : 0,jump);
            if (player.IsScriptedMotionControlledBy(rail)) { enteredRail=true; break; }
            if (i%10==0) yield return null;
        }
        Check(enteredRail && jumpedToBoard,"Jumping onto the solid carrier starts the rail launch");
        Vector3 riderOffset=player.transform.position-rail.transform.position;
        GameManager.Instance.PauseGame();
        Vector3 pausedPlatform=rail.transform.position;
        Tick(0,true);
        Check(player.IsScriptedMotionControlledBy(rail),"Paused jump cannot detach from carrier");
        yield return new WaitForSecondsRealtime(.08f);
        Check(Vector3.Distance(rail.transform.position,pausedPlatform)<.001f,"Pause freezes the loaded carrier");
        GameManager.Instance.ResumeGame();
        int dashBeforeRide=player.currentDashCharges;
        inputs.Sample(false,true,false,false,false,true);
        fixedUpdate.Invoke(player,null);
        Check(player.currentDashCharges==dashBeforeRide,"Transport ignores Shift without consuming dash energy");
        bool carried=false,riderStayed=true,capturedCarrier=false;
        float deadline=Time.realtimeSinceStartup+3;
        while (player.IsScriptedMotionControlledBy(rail) && Time.realtimeSinceStartup<deadline)
        {
            Tick(1);
            if(Vector3.Distance(rail.transform.position,railStart)>.1f)
            {
                riderStayed &= Vector3.Distance(player.transform.position-rail.transform.position,riderOffset)<.08f
                    && Mathf.Abs(rail.transform.position.y-railStart.y)<.001f;
                if(!capturedCarrier && Vector3.Distance(rail.transform.position,railStart)>1.2f)
                {
                    Capture("rail-carrier-active.png");
                    capturedCarrier=true;
                }
                carried=true;
            }
            yield return null;
        }
        Check(carried,"The visible carrier travels with the player");
        Check(riderStayed,"Rider stays on the platform along a horizontal path");
        Check(!player.IsScriptedMotionControlledBy(rail),"Rail sequence releases player");
        Check(body.position.x>43.5f,"Rail reaches its exit");
        Check(body.linearVelocity.x>25 && Mathf.Abs(body.linearVelocity.y)<.001f,"Rail applies horizontal exit velocity without upward force");
        float speed=body.linearVelocity.x;
        Tick(-1);
        Check(body.linearVelocity.x<speed,"Steering responds immediately after rail exit");
        Check(player.transform.parent==null,"Carrier never changes player parent or scale");
        yield return new WaitForSeconds(1.2f);
        Check(Vector3.Distance(rail.transform.position,railStart)<.001f && rail.GetComponent<Collider2D>().enabled,
            "Empty carrier automatically returns and becomes solid again");

        player.GetComponent<PlayerHealthRespawn>().Die();
        Check(Mathf.Abs(player.transform.position.x-23)<.01f,"Death restores checkpoint before lesson");
        Check(!device.isActivated,"Death restores unstarted AI core");
        Check(GameManager.Instance.CurrentState==GameManager.GameState.SlowPacedPhase,"Death restores exploration phase");
        Check(!player.IsScriptedMotionControlledBy(rail),"Respawn leaves no rail ownership");
        Check(Vector3.Distance(rail.transform.position,railStart)<.001f,"Death returns carrier to its boarding position");
        yield return new WaitForSeconds(.7f);
        Check(Mathf.Abs(player.transform.position.x-23)<.01f,"Old rail coroutine cannot pull respawned player back");

        player.ResetMotion();
        player.transform.position=railStart+new Vector3(-1.8f,.55f);
        Physics2D.SyncTransforms();
        for(int i=0;i<25;i++) Tick(1);
        Check(!player.IsScriptedMotionControlledBy(rail),"Touching the carrier side does not trigger launch");
        player.ResetMotion();
        player.transform.position=railStart+Vector3.up*1.1f;
        Physics2D.SyncTransforms();
        for(int i=0;i<50 && !player.IsScriptedMotionControlledBy(rail);i++) Tick(0);
        Check(player.IsScriptedMotionControlledBy(rail),"Reset carrier can be boarded again");
        yield return new WaitForFixedUpdate();
        int dashBeforeJump=player.currentDashCharges;
        float carrierSpeed=(float)typeof(RailgunBlock).GetField("currentSpeed",flags).GetValue(rail);
        Vector3 jumpPosition=rail.transform.position;
        Tick(0,true);
        Check(!player.IsScriptedMotionControlledBy(rail) && body.linearVelocity.y>14f,
            "Buffered jump detaches rider and applies normal jump velocity");
        Check(Mathf.Abs(body.linearVelocity.x-carrierSpeed)<.001f && body.gravityScale==3f,
            "Jump inherits carrier horizontal speed and restores gravity");
        Check(player.currentDashCharges==dashBeforeJump,"Jumping off does not consume dash energy");
        Tick(1);
        Check(body.linearVelocity.x>carrierSpeed,"Horizontal control responds immediately after jump-off");
        float previousJumpSpeed=body.linearVelocity.y;
        Tick(0,true);
        Check(body.linearVelocity.y<previousJumpSpeed,"A second airborne jump cannot restart carrier jump");
        yield return new WaitForFixedUpdate();
        Check(rail.transform.position.x>jumpPosition.x && !player.IsScriptedMotionControlledBy(rail),
            "Empty carrier keeps moving without pulling the jumping player back");
        yield return new WaitForSeconds(1.5f);
        Check(Vector3.Distance(rail.transform.position,railStart)<.001f,"Carrier returns normally after rider jumps off");
        player.GetComponent<PlayerHealthRespawn>().RespawnAtLastCheckpoint();
        player.ResetMotion();
        player.transform.position=railStart+Vector3.up*1.1f;
        Physics2D.SyncTransforms();
        for(int i=0;i<50 && !player.IsScriptedMotionControlledBy(rail);i++) Tick(0);
        Check(player.IsScriptedMotionControlledBy(rail),"Carrier can be boarded after an early jump-off");
        yield return new WaitForFixedUpdate();
        player.GetComponent<PlayerHealthRespawn>().RespawnAtLastCheckpoint();
        Check(Vector3.Distance(rail.transform.position,railStart)<.001f && !player.IsScriptedMotionControlledBy(rail),
            "Respawning during transport resets platform and releases rider");
        yield return new WaitForSeconds(.5f);
        Check(Mathf.Abs(player.transform.position.x-23)<.01f && Vector3.Distance(rail.transform.position,railStart)<.001f,
            "Cancelled carrier cannot move player or platform after respawn");
    }

    private void Tick(int horizontal,bool jump=false)
    {
        inputs.Sample(horizontal<0,horizontal>0,false,false,jump,false);
        fixedUpdate.Invoke(player,null);
        Physics2D.SyncTransforms();
        Physics2D.Simulate(.02f);
    }

    private void Capture(string filename)
    {
        if (SystemInfo.graphicsDeviceType==UnityEngine.Rendering.GraphicsDeviceType.Null) return;
        var camera=Camera.main;
        camera.GetComponent<CameraFollow>().enabled=false;
        camera.orthographicSize=7.5f;
        camera.transform.position=new Vector3(31,1,-10);
        if(filename.StartsWith("rail-"))
        {
            camera.orthographicSize=3.5f;
            camera.transform.position=new Vector3(42,-.5f,-10);
        }
        var target=new RenderTexture(1600,900,24);
        camera.targetTexture=target;
        camera.Render();
        RenderTexture.active=target;
        var pixels=new Texture2D(1600,900,TextureFormat.RGB24,false);
        pixels.ReadPixels(new Rect(0,0,1600,900),0,0);
        pixels.Apply();
        File.WriteAllBytes(filename,pixels.EncodeToPNG());
        RenderTexture.active=null;
        camera.targetTexture=null;
        target.Release();
        Destroy(target);
        Destroy(pixels);
    }

    private void Check(bool condition,string description)
    {
        if (!condition) throw new Exception(description);
        checks++;
        Debug.Log("PASS: "+description);
    }
}
#endif
