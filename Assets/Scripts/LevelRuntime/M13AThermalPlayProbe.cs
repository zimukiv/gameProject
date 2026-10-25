using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

// Test-scene-only probe. PASS is emitted only after real Play Mode mechanics complete.
public sealed class M13AThermalPlayProbe : MonoBehaviour
{
    const string A = "0c53c967-c623-50f2-9d5d-98de4129232d";
    const string B = "0c00697d-0470-5e5d-940b-b0645f0c858e";
    const string Ice2 = "1263c26b-67be-5071-8ada-a79b35fdc71c";
    const string Backdrop = "4a942db3-88db-5728-b2db-f49f66c969ee";
    readonly List<string> errors = new List<string>();

    void OnEnable() { Application.logMessageReceived += RecordError; }
    void OnDisable() { Application.logMessageReceived -= RecordError; }
    void RecordError(string message, string trace, LogType type)
    {
        if (type == LogType.Exception || type == LogType.Error || type == LogType.Assert)
            errors.Add(message);
    }
    static void Ensure(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }

    IEnumerator Start()
    {
        yield return null; // Allow original IceBlock/ThermalControllerBlock Start methods to run.
        try
        {
            var byId = gameObject.scene.GetRootGameObjects()
                .SelectMany(root => root.GetComponentsInChildren<LevelObjectId>(true))
                .ToDictionary(item => item.ObjectId, item => item.gameObject, StringComparer.Ordinal);
            Ensure(byId.Count == 7, "Expected seven V3-rebuilt source objects.");
            var a = byId[A].GetComponent<ThermalControllerBlock>();
            var b = byId[B].GetComponent<ThermalControllerBlock>();
            var overlay = byId[Backdrop].GetComponent<SpriteRenderer>();
            Ensure(a != null && b != null && a.linkedController == null && b.linkedController == a,
                "Controller authority link differs from typed V3 reference.");
            var ice = a.controlledIce;
            Ensure(ice != null && ice.Length == 4 && ice.Distinct().Count() == 4 &&
                b.controlledIce != null && b.controlledIce.SequenceEqual(ice) &&
                a.roomFilterOverlay == overlay && b.roomFilterOverlay == overlay,
                "Four IceBlock or backdrop references differ from typed V3 order.");
            Ensure(Mathf.Abs(byId[Ice2].transform.localPosition.x - .75f) < .0001f &&
                Mathf.Abs(byId[Ice2].GetComponent<BoxCollider2D>().size.y - 1.25f) < .0001f,
                "Edited V3 position/Collider size did not survive Play Mode.");
            Ensure(a.CurrentTemperature == ThermalControllerBlock.TemperatureState.Hot &&
                ice.All(item => item.isMelted && !item.GetComponent<BoxCollider2D>().enabled),
                "Initial hot temperature did not melt all four ice blocks.");
            a.ToggleTemperature();
            Ensure(a.CurrentTemperature == ThermalControllerBlock.TemperatureState.Cold &&
                b.CurrentTemperature == ThermalControllerBlock.TemperatureState.Cold &&
                ice.All(item => !item.isMelted && item.GetComponent<BoxCollider2D>().enabled),
                "Cold toggle did not refreeze all four ice blocks.");
            b.ToggleTemperature();
            Ensure(a.CurrentTemperature == ThermalControllerBlock.TemperatureState.Hot &&
                b.CurrentTemperature == ThermalControllerBlock.TemperatureState.Hot &&
                ice.All(item => item.isMelted && !item.GetComponent<BoxCollider2D>().enabled),
                "Linked controller did not remelt all four ice blocks.");
            Ensure(errors.Count == 0, "Unity logged an error during the thermal test: " + string.Join(" | ", errors));
            Debug.Log("M13A_PLAY_STATUS=PASS; controllers=2; ice=4; linked=PASS; cold=PASS; hot=PASS; editedPosition=PASS; editedCollider=PASS");
        }
        catch (Exception ex)
        {
            Debug.LogError("M13A_PLAY_STATUS=FAIL; " + ex);
        }
    }
}
