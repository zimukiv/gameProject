// Copy into an isolated Unity project's Assets to run. Never rebuilds game scenes.
#if UNITY_EDITOR
using System;
using System.Collections;
using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

[InitializeOnLoad]
public static class PhysicsLauncherPlaytest
{
    private const string ActiveKey = "PhysicsLauncherPlaytest.Active";
    static PhysicsLauncherPlaytest()
    {
        EditorApplication.playModeStateChanged += state =>
        {
            if (state == PlayModeStateChange.EnteredPlayMode && SessionState.GetBool(ActiveKey, false))
                new GameObject("Physics launcher integration checks").AddComponent<PhysicsLauncherTestRunner>();
        };
    }

    public static void Run()
    {
        SessionState.SetBool(ActiveKey, true);
        EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        EditorApplication.EnterPlaymode();
    }
}

public class PhysicsLauncherTestRunner : MonoBehaviour
{
    private int checks;
    private PlayerController player;
    private Rigidbody2D body;
    private readonly BindingFlags privateInstance = BindingFlags.NonPublic | BindingFlags.Instance;

    private IEnumerator Start()
    {
        var test = RunChecks();
        while (true)
        {
            object current;
            try
            {
                if (!test.MoveNext()) break;
                current = test.Current;
            }
            catch (Exception error)
            {
                Debug.LogException(error);
                File.WriteAllText("physics-launcher-result.txt", "FAIL\n" + error);
                EditorApplication.Exit(1);
                yield break;
            }
            yield return current;
        }
        File.WriteAllText("physics-launcher-result.txt", "PASS " + checks + " integration checks\n");
        Debug.Log("PHYSICS LAUNCHER PASS: " + checks);
        EditorApplication.Exit(0);
    }

    private IEnumerator RunChecks()
    {
        Physics2D.simulationMode = SimulationMode2D.Script;
        var actor = new GameObject("Test player");
        actor.tag = "Player";
        body = actor.AddComponent<Rigidbody2D>();
        body.gravityScale = 0f;
        body.freezeRotation = true;
        actor.AddComponent<BoxCollider2D>();
        player = actor.AddComponent<PlayerController>();
        player.enabled = false; // Feed deterministic inputs directly to the real FixedUpdate.

        var ventObject = new GameObject("Test air vent");
        var ventCollider = ventObject.AddComponent<BoxCollider2D>();
        ventCollider.size = new Vector2(2f, .4f);
        ventCollider.isTrigger = true;
        var vent = ventObject.AddComponent<AirVentBlock>();
        vent.isContinuous = true;
        yield return null; // Build runtime guide visuals.

        actor.transform.position = new Vector3(0f, .6f);
        body.linearVelocity = new Vector2(5f, 0f);
        Simulate();
        Check(Mathf.Abs(body.linearVelocity.y - 22f) < .01f, "Trigger contact launches upward");
        Check(Mathf.Abs(body.linearVelocity.x - 5f) < .01f, "Vent preserves sideways momentum");
        FixedInput(-1);
        Check(body.linearVelocity.x < 5f && body.linearVelocity.y > 0f, "Immediate left steering after launch");

        for (int i = 0; i < 4; i++)
        {
            actor.transform.position = new Vector3(0f, .6f);
            body.linearVelocity = Vector2.zero;
            Simulate();
            Check(body.linearVelocity.y == 0f, "Staying in vent does not relaunch: " + i);
        }
        actor.transform.position = new Vector3(10f, .6f);
        Simulate();
        actor.transform.position = new Vector3(0f, .6f);
        Simulate();
        Check(body.linearVelocity.y > 21f, "Exit and re-entry rearm the vent");

        body.linearVelocity = Vector2.zero;
        actor.transform.position = new Vector3(0f, .6f);
        EventBus.TriggerPlayerRespawned();
        Simulate();
        Check(body.linearVelocity.y > 21f, "Respawn inside trigger can launch again");

        object owner = new object();
        player.ResetMotion();
        EventBus.TriggerPlayerRespawned();
        actor.transform.position = new Vector3(0f, .6f);
        Check(player.TryBeginScriptedMotion(owner), "Rail ownership can begin");
        Simulate();
        Check(body.linearVelocity == Vector2.zero, "Vent does not interrupt scripted movement");
        player.CancelScriptedMotion(owner);
        Simulate();
        Check(body.linearVelocity.y > 21f, "Vent retries when scripted movement ends");

        player.ResetMotion();
        actor.transform.position = new Vector3(5f, .7f);
        Check(player.TryBeginScriptedMotion(owner), "Rail ownership can begin again");
        player.CompleteScriptedMotion(owner, new Vector2(32f, 0f));
        FixedInput(-1);
        Check(body.linearVelocity.x < 32f && body.linearVelocity.x > 0f,
            "Rail exit accepts steering immediately and retains launch momentum");
        Check(!player.IsScriptedMotionControlledBy(owner), "Rail releases ownership");

        player.ForceLaunch(new Vector2(10f, 0f));
        FixedInput(-1);
        Check(Mathf.Abs(body.linearVelocity.x - 10f) < .01f, "Hostile knockback still locks control");

        player.ResetMotion();
        var railObject = new GameObject("Test railgun");
        railObject.transform.position = new Vector3(5f, 0f);
        railObject.AddComponent<BoxCollider2D>();
        var rail = railObject.AddComponent<RailgunBlock>();
        rail.launchEndPoint = new GameObject("Rail endpoint").transform;
        rail.launchEndPoint.position = new Vector3(8f, .7f);
        typeof(RailgunBlock).GetMethod("OnPlayerStepped", privateInstance).Invoke(rail, new object[] { player });
        Check(player.IsScriptedMotionControlledBy(rail), "Actual rail entry takes ownership");
        float deadline = Time.realtimeSinceStartup + 3f;
        while (player.IsScriptedMotionControlledBy(rail) && Time.realtimeSinceStartup < deadline)
            yield return null;
        Check(!player.IsScriptedMotionControlledBy(rail), "Actual rail coroutine reaches exit");
        Check(Mathf.Abs(body.linearVelocity.x - 32f) < .01f, "Actual rail exit applies configured speed");
        FixedInput(-1);
        Check(body.linearVelocity.x < 32f, "Actual rail coroutine restores input");

        Check(vent.GetComponentsInChildren<LineRenderer>().Length == 3, "Vent creates visible airflow");
        Check(rail.GetComponentsInChildren<LineRenderer>().Length == 3, "Rail creates track and exit arrow");
        Check(vent.GetComponentInChildren<TextMesh>().text.Contains("喷气口"), "Vent has Chinese sign");
        Check(rail.GetComponentInChildren<TextMesh>().text.Contains("电磁炮"), "Rail has Chinese sign");

        var camera = new GameObject("Preview camera").AddComponent<Camera>();
        camera.orthographic = true;
        camera.orthographicSize = 3f;
        camera.transform.position = new Vector3(3.5f, 1.5f, -10f);
        camera.backgroundColor = new Color(.12f, .18f, .28f);
        camera.clearFlags = CameraClearFlags.SolidColor;
        var target = new RenderTexture(1280, 720, 24);
        camera.targetTexture = target;
        camera.Render();
        RenderTexture.active = target;
        var screenshot = new Texture2D(1280, 720, TextureFormat.RGB24, false);
        screenshot.ReadPixels(new Rect(0, 0, 1280, 720), 0, 0);
        screenshot.Apply();
        File.WriteAllBytes("physics-launcher-preview.png", screenshot.EncodeToPNG());
        RenderTexture.active = null;
        camera.targetTexture = null;
        target.Release();
        Destroy(target);
        Destroy(screenshot);
    }

    private void FixedInput(int horizontal)
    {
        var buffer = (PlayerInputBuffer)typeof(PlayerController).GetField("inputBuffer", privateInstance).GetValue(player);
        buffer.Sample(horizontal < 0, horizontal > 0, false, false, false, false);
        typeof(PlayerController).GetMethod("FixedUpdate", privateInstance).Invoke(player, null);
    }

    private void Simulate()
    {
        Physics2D.SyncTransforms();
        Physics2D.Simulate(.02f);
    }

    private void Check(bool condition, string message)
    {
        if (!condition) throw new Exception("Physics launcher check failed: " + message);
        checks++;
        Debug.Log("PASS: " + message);
    }
}
#endif
