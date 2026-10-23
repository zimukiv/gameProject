// Copy to an isolated project's Assets; run -batchmode -executeMethod TemperatureRoutePlaytest.Run.
#if UNITY_EDITOR
using System;
using System.Collections;
using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

[InitializeOnLoad]
public static class TemperatureRoutePlaytest
{
    static TemperatureRoutePlaytest()
    {
        EditorApplication.playModeStateChanged += state =>
        {
            if (state == PlayModeStateChange.EnteredPlayMode && SessionState.GetBool("TemperatureRoute.Test", false))
                new GameObject("Temperature integration checks").AddComponent<TemperatureRouteTestRunner>();
        };
    }

    public static void Run()
    {
        SessionState.SetBool("TemperatureRoute.Test", true);
        EditorSceneManager.OpenScene("Assets/Scenes/Level1.unity");
        EditorApplication.EnterPlaymode();
    }
}

public class TemperatureRouteTestRunner : MonoBehaviour
{
    private int checks;
    private IEnumerator Start()
    {
        var run = Checks();
        while (true)
        {
            object next;
            try
            {
                if (!run.MoveNext()) break;
                next = run.Current;
            }
            catch (Exception error)
            {
                Debug.LogException(error);
                File.WriteAllText("temperature-route-result.txt", "FAIL\n"+error);
                EditorApplication.Exit(1);
                yield break;
            }
            yield return next;
        }
        File.WriteAllText("temperature-route-result.txt", "PASS "+checks+" Unity integration checks\n");
        Debug.Log("TEMPERATURE ROUTE PASS: "+checks);
        EditorApplication.Exit(0);
    }

    private IEnumerator Checks()
    {
        yield return null;
        var a = GameObject.Find("Thermal controller A").GetComponent<ThermalControllerBlock>();
        var b = GameObject.Find("Thermal controller B").GetComponent<ThermalControllerBlock>();
        var player = PlayerController.Instance;
        player.enabled = false;
        var body = player.GetComponent<Rigidbody2D>();
        body.bodyType = RigidbodyType2D.Kinematic;
        body.gravityScale = 0;
        player.transform.position = new Vector3(6, 3);
        Physics2D.SyncTransforms();
        var save = SaveManager.Instance;
        Check(a.controlledIce.Length == 4, "Scene binds three steps and one wall");
        State(a,b,true,"Initial room");

        a.ToggleTemperature();
        State(a,b,false,"A freezes shared route");
        typeof(InteractiveBlock).GetMethod("OnPlayerStepped",BindingFlags.Instance|BindingFlags.NonPublic)
            .Invoke(a,new object[] { player });
        State(a,b,false,"Stepping does not toggle temperature");
        typeof(InteractiveBlock).GetMethod("OnPlayerStepped",BindingFlags.Instance|BindingFlags.NonPublic)
            .Invoke(a.controlledIce[0],new object[] { player });
        yield return new WaitForSeconds(1.2f);
        State(a,b,false,"Ice does not melt after standing delay");

        save.UpdateTempCheckpoint(new Vector3(6,3),0,3);
        b.ToggleTemperature();
        State(a,b,true,"B melts shared route");
        yield return new WaitForSeconds(3.2f);
        State(a,b,true,"Hot ice does not auto-refreeze");
        save.RestoreMechanisms();
        State(a,b,false,"Real checkpoint restores cold room");

        b.ToggleTemperature();
        save.UpdateTempCheckpoint(new Vector3(6,3),0,3);
        a.ToggleTemperature();
        save.RestoreMechanisms();
        State(a,b,true,"Real checkpoint restores hot room");

        var wall = GameObject.Find("Ice wall").GetComponent<IceBlock>();
        player.transform.position = wall.transform.position;
        Physics2D.SyncTransforms();
        a.ToggleTemperature();
        State(a,b,true,"Freeze rejects overlapping player");
        player.transform.position = new Vector3(6,3);
        Physics2D.SyncTransforms();
        b.ToggleTemperature();
        State(a,b,false,"Freeze works after player leaves ice volume");

        // Restore participants in both directions, independent of scene object enumeration.
        object cold = a.CaptureCheckpointState();
        b.ToggleTemperature();
        for (int i = a.controlledIce.Length-1; i >= 0; i--) a.controlledIce[i].RestoreCheckpointState(false);
        b.RestoreCheckpointState(cold);
        a.RestoreCheckpointState(cold);
        State(a,b,false,"Ice-first restore stays synchronized");
        a.RestoreCheckpointState(ThermalControllerBlock.TemperatureState.Hot);
        b.RestoreCheckpointState(ThermalControllerBlock.TemperatureState.Hot);
        foreach (var ice in a.controlledIce) ice.RestoreCheckpointState(true);
        State(a,b,true,"Controllers-first restore stays synchronized");
    }

    private void State(ThermalControllerBlock a,ThermalControllerBlock b,bool hot,string label)
    {
        Check((a.CurrentTemperature == ThermalControllerBlock.TemperatureState.Hot) == hot,label+": A");
        Check(a.CurrentTemperature == b.CurrentTemperature,label+": B synchronized");
        foreach (var ice in a.controlledIce)
            Check(ice.isMelted == hot && ice.GetComponent<BoxCollider2D>().enabled != hot,label+": "+ice.name);
    }

    private void Check(bool condition,string description)
    {
        if (!condition) throw new Exception(description);
        checks++;
        Debug.Log("PASS: "+description);
    }
}
#endif
