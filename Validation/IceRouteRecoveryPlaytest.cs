// Isolated Unity validation only; copy to Assets and run IceRouteRecoveryPlaytest.Run.
#if UNITY_EDITOR
using System;
using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

[InitializeOnLoad]
public static class IceRouteRecoveryPlaytest
{
    static IceRouteRecoveryPlaytest()
    {
        EditorApplication.playModeStateChanged += state => {
            if (state == PlayModeStateChange.EnteredPlayMode && SessionState.GetBool("IceRecovery.Test", false))
                new GameObject("Ice route recovery checks").AddComponent<IceRouteRecoveryRunner>();
        };
    }

    public static void Run()
    {
        foreach (string key in new[] { "TemperatureRoute.Test", "ThermalPreview", "VentRoute.Test", "PlatformGuide.Preview", "HorizontalDash.Test" })
            SessionState.SetBool(key, false);
        SessionState.SetBool("IceRecovery.Test", true);
        EditorSceneManager.OpenScene("Assets/Scenes/Level1.unity");
        EditorApplication.EnterPlaymode();
    }
}

public class IceRouteRecoveryRunner : MonoBehaviour
{
    private int checks;
    private PlayerController player;
    private Rigidbody2D body;
    private PlayerInputBuffer input;
    private MethodInfo tick;

    private System.Collections.IEnumerator Start()
    {
        yield return null;
        try
        {
            player = PlayerController.Instance;
            player.enabled = false;
            body = player.GetComponent<Rigidbody2D>();
            var flags = BindingFlags.Instance | BindingFlags.NonPublic;
            input = (PlayerInputBuffer)typeof(PlayerController).GetField("inputBuffer", flags).GetValue(player);
            tick = typeof(PlayerController).GetMethod("FixedUpdate", flags);
            Physics2D.simulationMode = SimulationMode2D.Script;
            var a = GameObject.Find("Thermal controller A").GetComponent<ThermalControllerBlock>();
            foreach (var state in new[] { ThermalControllerBlock.TemperatureState.Cold, ThermalControllerBlock.TemperatureState.Hot })
            {
                a.RestoreCheckpointState(state);
                foreach (float dropX in new[] { 3.5f, 1f, -.5f })
                {
                    player.ResetMotion();
                    player.RestoreRunResources(0, 0, 0);
                    player.transform.position = new Vector3(dropX, -1.6f);
                    Physics2D.SyncTransforms();
                    for (int i = 0; i < 55; i++) Step(0);
                    Check(player.isGrounded, state + " fall reaches safe ground at " + dropX);
                    for (int i = 0; i < 120 && player.transform.position.x > -4.7f; i++) Step(-1);
                    Check(player.transform.position.x <= -4.7f,
                        state + " can walk back to A without crouch or dash from " + dropX + "; actual x=" + player.transform.position.x);
                    Check(!player.isCrouching && !player.isDashing && player.currentDashCharges == 0,
                        "Recovery requires no crouch or dash");
                }
            }
            // Re-enter the lesson from the safe side and land on the raised first step.
            player.ResetMotion();
            player.RestoreRunResources(0, 0, 0);
            player.transform.position = new Vector3(-4f, -2.3f);
            Physics2D.SyncTransforms();
            a.RestoreCheckpointState(ThermalControllerBlock.TemperatureState.Cold);
            for (int i = 0; i < 20; i++) Step(0);
            Step(1, true);
            for (int i = 0; i < 17; i++) Step(1);
            for (int i = 0; i < 70 && !player.isGrounded; i++) Step(0);
            var step = GameObject.Find("Ice step 1").GetComponent<Collider2D>().bounds;
            var feet = player.GetComponent<Collider2D>().bounds.min.y;
            Check(player.isGrounded && Mathf.Abs(feet - step.max.y) < .1f,
                "First ice step remains reachable with an ordinary jump; player=" + player.transform.position);
            File.WriteAllText("ice-route-recovery-result.txt", "PASS " + checks + " Unity recovery checks\n");
            SessionState.SetBool("IceRecovery.Test", false);
            EditorApplication.Exit(0);
        }
        catch (Exception error)
        {
            Debug.LogException(error);
            File.WriteAllText("ice-route-recovery-result.txt", "FAIL\n" + error);
            SessionState.SetBool("IceRecovery.Test", false);
            EditorApplication.Exit(1);
        }
    }

    private void Step(int move, bool jump = false)
    {
        input.Sample(move < 0, move > 0, false, false, jump, false);
        tick.Invoke(player, null);
        Physics2D.Simulate(.02f);
    }

    private void Check(bool condition, string description)
    {
        if (!condition) throw new Exception(description);
        checks++;
        Debug.Log("PASS: " + description);
    }
}
#endif
