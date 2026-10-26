// Isolated Unity validation only. Copy to Assets and run HorizontalDashPlaytest.Run.
#if UNITY_EDITOR
using System;
using System.Collections;
using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

[InitializeOnLoad]
public static class HorizontalDashPlaytest
{
    static HorizontalDashPlaytest()
    {
        EditorApplication.playModeStateChanged += state => {
            if(state==PlayModeStateChange.EnteredPlayMode && SessionState.GetBool("HorizontalDash.Test",false))
                new GameObject("Horizontal dash validation").AddComponent<HorizontalDashTestRunner>();
        };
    }
    public static void Run()
    {
        foreach(string key in new[] { "TemperatureRoute.Test", "ThermalPreview", "VentRoute.Test", "PlatformGuide.Preview" })
            SessionState.SetBool(key,false);
        SessionState.SetBool("HorizontalDash.Test",true);
        EditorSceneManager.OpenScene("Assets/Scenes/Level1.unity");
        EditorApplication.EnterPlaymode();
    }
}

public class HorizontalDashTestRunner : MonoBehaviour
{
    private int checks;
    private PlayerController player;
    private Rigidbody2D body;
    private PlayerInputBuffer input;
    private MethodInfo fixedUpdate;

    private IEnumerator Start()
    {
        DontDestroyOnLoad(gameObject);
        var run=Checks();
        while(true)
        {
            object next;
            try { if(!run.MoveNext()) break; next=run.Current; }
            catch(Exception error)
            {
                Debug.LogException(error);
                File.WriteAllText("horizontal-dash-result.txt","FAIL\n"+error);
                EditorApplication.Exit(1);
                yield break;
            }
            yield return next;
        }
        File.WriteAllText("horizontal-dash-result.txt","PASS "+checks+" Unity dash checks\n");
        EditorApplication.Exit(0);
    }

    private IEnumerator Checks()
    {
        yield return null;
        Physics2D.simulationMode=SimulationMode2D.Script;
        player=PlayerController.Instance;
        body=player.GetComponent<Rigidbody2D>();
        player.enabled=false;
        var flags=BindingFlags.Instance|BindingFlags.NonPublic;
        input=(PlayerInputBuffer)typeof(PlayerController).GetField("inputBuffer",flags).GetValue(player);
        fixedUpdate=typeof(PlayerController).GetMethod("FixedUpdate",flags);
        var ui=UIManager.Instance;
        Check(player.currentDashCharges==0 && player.dashChargeProgress==0 && player.currentTokens==0,"New run starts empty");
        Check(player.maxDashCharges==1 && ui.dashChargeSlots.Length==1,"Single slot in player and actual scene HUD");
        Check(ui.dashStatusText.text.Contains("0/3"),"HUD begins at zero thirds");
        Capture("dash-empty.png");
        player.transform.position=new Vector3(0,12);
        body.gravityScale=0;
        Physics2D.SyncTransforms();
        Command(1,false,false,true);
        Check(!player.isDashing,"No opening free dash");
        int initialScore=ScoreManager.Instance.TotalScore;
        Pickup(false);
        Check(player.currentTokens==1 && player.currentDashCharges==0 && player.dashChargeProgress==1,"First real Token contributes one third");
        Pickup(false);
        Check(player.dashChargeProgress==2 && ui.dashStatusText.text.Contains("2/3"),"Second real Token updates HUD progress");
        Capture("dash-two-thirds.png");
        Pickup(false);
        Check(player.currentDashCharges==1 && player.dashChargeProgress==0,"Third real Token fills the charge");
        Check(ui.dashStatusText.text.Contains("1/1"),"HUD displays ready charge");
        Pickup(false);
        Pickup(true);
        Check(player.currentTokens==9 && ScoreManager.Instance.TotalScore==initialScore+1400,"Full-capacity pickups still add Token value and score");
        Check(player.currentDashCharges==1 && player.dashChargeProgress==0,"Full-capacity energy and Big Token overflow are discarded");
        Capture("dash-ready.png");
        Command(1,true,false,true);
        Check(player.isDashing && body.linearVelocity.x>0 && body.linearVelocity.y==0,"W+D+Shift is a right horizontal dash");
        Check(player.currentDashCharges==0,"A dash consumes the sole charge");
        FinishDash();
        Command(1,false,false,true);
        Check(!player.isDashing && player.dashChargeProgress==0,"No banked follow-up charge after full-capacity pickups");
        Pickup(false);
        Pickup(false);
        Check(player.currentDashCharges==0 && player.dashChargeProgress==2,"After spending, two new Tokens still cannot dash");
        Command(1,false,false,true);
        Check(!player.isDashing,"Two-thirds energy cannot dash");
        player.transform.position=new Vector3(18,-2.35f);
        body.linearVelocity=Vector2.zero;
        Physics2D.SyncTransforms();
        Command(0,false,false,false);
        Check(player.isGrounded && player.currentDashCharges==0 && player.dashChargeProgress==2,"Landing does not refill or erase energy");
        player.transform.position=new Vector3(0,12);
        body.gravityScale=0;
        Physics2D.SyncTransforms();
        Pickup(false);
        Command(-1,true,false,true);
        Check(player.isDashing && body.linearVelocity.x<0 && body.linearVelocity.y==0,"W+A+Shift is a left horizontal dash");
        FinishDash();
        Pickup(true);
        Command(0,true,false,true);
        Check(player.isDashing && body.linearVelocity.x<0 && body.linearVelocity.y==0,"Vertical-only input falls back to left facing");
        FinishDash();
        Pickup(true);
        Command(1,true,true,true);
        Check(player.isDashing && body.linearVelocity.x>0 && body.linearVelocity.y==0,"Both vertical keys cannot tilt a right dash");
        FinishDash();
        Pickup(true);
        Command(0,false,true,true);
        Check(player.isDashing && body.linearVelocity.x>0 && body.linearVelocity.y==0,"Down input falls back to right facing");
        FinishDash();

        var enemy=EnemyAI.Instance;
        enemy.enabled=false;
        enemy.GetComponent<Collider2D>().enabled=false;
        var device=GameObject.Find("AI activation device").GetComponent<AIActivatorDevice>();
        CheckTokenWeakening();
        player.RestoreRunResources(5,0,2);
        device.TriggerActivation();
        Check(device.isActivated && player.currentTokens==0,"Actual AI activation still consumes held Tokens");
        Check(player.currentDashCharges==0 && player.dashChargeProgress==2,"AI gives no free charge and preserves partial energy");
        device.ResetActivation();
        GameManager.Instance.CurrentState=GameManager.GameState.SlowPacedPhase;
        player.RestoreRunResources(8,1,0);
        device.TriggerActivation();
        Check(player.currentDashCharges==1 && player.dashChargeProgress==0,"AI activation preserves, but cannot stack, a ready charge");
        device.ResetActivation();
        GameManager.Instance.CurrentState=GameManager.GameState.SlowPacedPhase;
        GameManager.Instance.PauseGame();
        Command(1,false,false,true);
        Check(player.currentDashCharges==1 && !player.isDashing,"Paused Shift cannot consume energy");
        GameManager.Instance.ResumeGame();
        Command(0,false,false,false);
        Check(!player.isDashing,"Resuming does not replay paused dash input");

        player.ResetMotion();
        player.RestoreRunResources(2,0,2);
        player.transform.position=new Vector3(-4,12);
        body.gravityScale=0;
        var pending=NewPickup(false,new Vector3(4,12));
        var save=SaveManager.Instance;
        save.UpdateTempCheckpoint(player.transform.position,player.currentTokens,player.currentDashCharges);
        player.transform.position=new Vector3(4,12);
        Physics2D.SyncTransforms();
        Physics2D.Simulate(.02f);
        Check(player.currentDashCharges==1 && !pending.activeSelf,"Third Token collected after checkpoint");
        Command(1,false,false,true);
        player.GetComponent<PlayerHealthRespawn>().Die();
        Check(player.currentTokens==2 && player.currentDashCharges==0 && player.dashChargeProgress==2,"Death restores exact partial resource snapshot");
        Check(pending.activeSelf && ui.dashStatusText.text.Contains("2/3"),"Pickup and HUD roll back with resources");
        Check(!player.isDashing && body.gravityScale==3,"Death during dash restores movement and gravity");
        player.RestoreRunResources(7,1,0);
        save.UpdateTempCheckpoint(player.transform.position,player.currentTokens,player.currentDashCharges);
        Command(-1,false,false,true);
        player.GetComponent<PlayerHealthRespawn>().RespawnAtLastCheckpoint();
        Check(player.currentDashCharges==1 && player.dashChargeProgress==0,"Full-charge checkpoint restores exactly one charge");

        foreach(string level in new[] { "Level2", "Level3" })
        {
            SceneManager.LoadScene(level);
            yield return null;
            yield return null;
            var next=PlayerController.Instance;
            Check(next.currentTokens==0 && next.currentDashCharges==0 && next.dashChargeProgress==0,level+" resets run resources");
            Check(UIManager.Instance.dashChargeSlots.Length==1 && UIManager.Instance.dashStatusText.text.Contains("0/3"),level+" uses single-slot progress HUD");
            CheckTokenWeakening();
        }
    }

    private void CheckTokenWeakening()
    {
        var currentPlayer=PlayerController.Instance;
        var currentEnemy=EnemyAI.Instance;
        var currentDevice=GameObject.Find("AI activation device").GetComponent<AIActivatorDevice>();
        var initialPosition=currentEnemy.transform.position;
        float previous=float.PositiveInfinity;
        foreach(int tokens in new[] { 0,3,7,12 })
        {
            currentDevice.ResetActivation();
            GameManager.Instance.CurrentState=GameManager.GameState.SlowPacedPhase;
            currentPlayer.RestoreRunResources(tokens,0,2);
            currentDevice.TriggerActivation();
            float expected=currentEnemy.baseChaseSpeed*TokenChaseSpeed.Calculate(tokens,currentDevice.baseDifficulty,currentDevice.difficultyPerToken);
            Check(Mathf.Abs(currentEnemy.currentSpeed-expected)<.0001f && currentEnemy.currentSpeed<previous
                && currentEnemy.currentSpeed>=currentPlayer.moveSpeed*1.2f,
                SceneManager.GetActiveScene().name+" AI slows with "+tokens+" Tokens but remains at least 20% faster than player");
            Check(currentPlayer.currentTokens==0 && currentPlayer.currentDashCharges==0 && currentPlayer.dashChargeProgress==2,
                "Weakening consumes held Tokens without altering dash energy");
            previous=currentEnemy.currentSpeed;
        }
        var save=SaveManager.Instance;
        save.UpdateTempCheckpoint(currentPlayer.transform.position,currentPlayer.currentTokens,currentPlayer.currentDashCharges);
        currentEnemy.currentSpeed=99f;
        GameManager.Instance.currentAIDifficulty=99f;
        currentPlayer.GetComponent<PlayerHealthRespawn>().RespawnAtLastCheckpoint();
        Check(Mathf.Abs(currentEnemy.currentSpeed-previous)<.0001f,"Chase checkpoint restores weakened AI speed");
        Check(currentEnemy.isHunting && Vector3.Distance(currentEnemy.transform.position,
            currentPlayer.transform.position+Vector3.left*8f)<.001f,
            "Chase checkpoint keeps AI behind the player");
        currentDevice.ResetActivation();
        currentEnemy.ResetChase();
        GameManager.Instance.CurrentState=GameManager.GameState.SlowPacedPhase;
        currentPlayer.RestoreRunResources(7,1,0);
        var checkpoint=GameObject.Find("Room 3 checkpoint").transform.position;
        save.UpdateTempCheckpoint(checkpoint,currentPlayer.currentTokens,currentPlayer.currentDashCharges);
        currentDevice.TriggerActivation();
        currentEnemy.transform.position=new Vector3(50,8);
        currentEnemy.GetComponent<Rigidbody2D>().linearVelocity=new Vector2(14,2);
        currentPlayer.GetComponent<PlayerHealthRespawn>().RespawnAtLastCheckpoint();
        Check(Vector3.Distance(currentEnemy.transform.position,initialPosition)<.001f,
            "Exploration checkpoint restores original scene AI position");
        Check(!currentEnemy.isHunting && !currentDevice.isActivated &&
            GameManager.Instance.CurrentState==GameManager.GameState.SlowPacedPhase,
            "Exploration respawn restores dormant AI and unstarted core");
        Check(currentEnemy.GetComponent<Rigidbody2D>().linearVelocity==Vector2.zero &&
            currentEnemy.currentSpeed==currentEnemy.baseChaseSpeed && currentEnemy.difficultyMultiplier==1f,
            "Exploration respawn clears chase velocity and previous speed multiplier");
        Check(currentPlayer.currentTokens==7 && currentPlayer.currentDashCharges==1,
            "Exploration respawn preserves checkpoint Tokens and dash");
        currentDevice.TriggerActivation();
        Check(currentEnemy.isHunting && currentDevice.isActivated &&
            Mathf.Abs(currentEnemy.currentSpeed-currentEnemy.baseChaseSpeed*TokenChaseSpeed.Calculate(7,currentDevice.baseDifficulty,currentDevice.difficultyPerToken))<.0001f,
            "AI can restart from its original position with restored Token weakening");
        currentPlayer.GetComponent<PlayerHealthRespawn>().RespawnAtLastCheckpoint();
        Check(Vector3.Distance(currentEnemy.transform.position,initialPosition)<.001f && !currentEnemy.isHunting,
            "Repeated exploration rollback returns AI to the same initial position");
    }

    private void Command(int horizontal,bool up,bool down,bool dash)
    {
        input.Sample(horizontal<0,horizontal>0,up,down,false,dash);
        fixedUpdate.Invoke(player,null);
    }
    private void FinishDash()
    {
        for(int i=0;i<20;i++) { Command(0,false,false,false); Physics2D.Simulate(.02f); }
        body.gravityScale=0;
        body.linearVelocity=Vector2.zero;
    }
    private GameObject NewPickup(bool big,Vector3 position)
    {
        var token=new GameObject(big?"Test big Token":"Test Token");
        token.transform.position=position;
        token.AddComponent<BoxCollider2D>().isTrigger=true;
        if(big) token.AddComponent<BigTokenItem>(); else token.AddComponent<TokenItem>();
        return token;
    }
    private void Pickup(bool big)
    {
        var token=NewPickup(big,player.transform.position);
        body.linearVelocity=Vector2.zero;
        Physics2D.SyncTransforms();
        Physics2D.Simulate(.02f);
        if(token.activeSelf) throw new Exception("Real Token trigger did not collect");
    }
    private void Check(bool condition,string description)
    {
        if(!condition) throw new Exception(description);
        checks++;
        Debug.Log("PASS: "+description);
    }
    private void Capture(string filename)
    {
        var camera=Camera.main;
        var canvas=GameObject.Find("HUD Canvas").GetComponent<Canvas>();
        canvas.renderMode=RenderMode.ScreenSpaceCamera;
        canvas.worldCamera=camera;
        canvas.planeDistance=1;
        var target=new RenderTexture(1600,900,24);
        camera.targetTexture=target;
        Canvas.ForceUpdateCanvases();
        camera.Render();
        RenderTexture.active=target;
        var pixels=new Texture2D(1600,900,TextureFormat.RGB24,false);
        pixels.ReadPixels(new Rect(0,0,1600,900),0,0);
        pixels.Apply();
        File.WriteAllBytes(filename,pixels.EncodeToPNG());
        RenderTexture.active=null;
        camera.targetTexture=null;
        canvas.renderMode=RenderMode.ScreenSpaceOverlay;
        target.Release();
        Destroy(target);
        Destroy(pixels);
    }
}
#endif
