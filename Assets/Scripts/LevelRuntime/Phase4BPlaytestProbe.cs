using System.Collections;
using UnityEngine;

// Test-scene fixture only. It exercises existing mechanics without replacing their behavior.
public sealed class Phase4BPlaytestProbe : MonoBehaviour
{
    public PlayerController player;
    public ThermalControllerBlock authority;
    public ThermalControllerBlock linked;
    public IceBlock ice;
    public RailgunBlock railgun;
    private bool resultLogged;

    private IEnumerator Start()
    {
        Debug.Log("PHASE4B_PLAY_STATUS=RUNNING; thermal=NOT_RUN; railgun=NOT_RUN; deathCancel=NOT_RUN");
        if (!Application.companyName.Contains("Phase4A") || !Application.productName.Contains("Phase4A"))
        { Fail("save-isolation"); yield break; }
        if (player==null || authority==null || linked==null || ice==null || railgun==null ||
            railgun.launchEndPoint==null || player.GetComponent<Rigidbody2D>()==null)
        { Fail("fixture-references"); yield break; }
        yield return null;
        if (authority.CurrentTemperature!=ThermalControllerBlock.TemperatureState.Cold || ice.isMelted ||
            !ice.GetComponent<BoxCollider2D>().enabled)
        { Fail("thermal-initial"); yield break; }
        linked.ToggleTemperature();
        if (authority.CurrentTemperature!=ThermalControllerBlock.TemperatureState.Hot || !ice.isMelted ||
            ice.GetComponent<BoxCollider2D>().enabled)
        { Fail("thermal-hot"); yield break; }
        player.transform.position=ice.transform.position;
        Physics2D.SyncTransforms();
        linked.ToggleTemperature();
        if (authority.CurrentTemperature!=ThermalControllerBlock.TemperatureState.Hot || !ice.isMelted)
        { Fail("thermal-overlap-safety"); yield break; }
        player.transform.position=new Vector3(ice.transform.position.x+8f,ice.transform.position.y+8f);
        Physics2D.SyncTransforms();
        linked.ToggleTemperature();
        if (authority.CurrentTemperature!=ThermalControllerBlock.TemperatureState.Cold || ice.isMelted ||
            !ice.GetComponent<BoxCollider2D>().enabled)
        { Fail("thermal-refreeze"); yield break; }
        Debug.Log("PHASE4B_PLAY_THERMAL=PASS; linked toggle, melt, overlap refusal, refreeze");

        var body=player.GetComponent<Rigidbody2D>();
        body.linearVelocity=Vector2.zero;
        player.transform.position=railgun.transform.position+Vector3.left*2f;
        Physics2D.SyncTransforms();
        yield return new WaitForFixedUpdate();
        player.transform.position=railgun.transform.position;
        Physics2D.SyncTransforms();
        yield return new WaitForFixedUpdate();
        yield return new WaitForFixedUpdate();
        if (!player.IsScriptedMotionControlledBy(railgun)) { Fail("railgun-entry"); yield break; }
        Vector3 p0=player.transform.position;
        yield return new WaitForSeconds(.12f);
        Vector3 p1=player.transform.position;
        yield return new WaitForSeconds(.12f);
        Vector3 p2=player.transform.position;
        float first=Vector3.Distance(p0,p1),second=Vector3.Distance(p1,p2);
        if (first<=.005f || second<=first*.85f) { Fail("railgun-acceleration first="+first+" second="+second); yield break; }
        float minimum=Vector3.Distance(player.transform.position,railgun.launchEndPoint.position);
        float deadline=Time.time+4f;
        while (player.IsScriptedMotionControlledBy(railgun) && Time.time<deadline)
        {
            minimum=Mathf.Min(minimum,Vector3.Distance(player.transform.position,railgun.launchEndPoint.position));
            yield return null;
        }
        if (player.IsScriptedMotionControlledBy(railgun) || minimum>.35f ||
            Vector2.Dot(body.linearVelocity,railgun.launchDirection.normalized)<railgun.launchExitSpeed*.6f)
        { Fail("railgun-exit; minimum="+minimum+"; velocity="+body.linearVelocity); yield break; }
        Debug.Log("PHASE4B_PLAY_RAILGUN=PASS; accelerated to endpoint and launched; minimum="+minimum+
            "; velocity="+body.linearVelocity);

        yield return new WaitForSeconds(.7f);
        body.linearVelocity=Vector2.zero;
        player.transform.position=railgun.transform.position+Vector3.left*2f;
        Physics2D.SyncTransforms();
        yield return new WaitForFixedUpdate();
        player.transform.position=railgun.transform.position;
        Physics2D.SyncTransforms();
        yield return new WaitForFixedUpdate();
        yield return new WaitForFixedUpdate();
        if (!player.IsScriptedMotionControlledBy(railgun)) { Fail("railgun-reentry"); yield break; }
        EventBus.TriggerPlayerDied();
        yield return new WaitForFixedUpdate();
        if (player.IsScriptedMotionControlledBy(railgun)) { Fail("railgun-death-cancel"); yield break; }
        Debug.Log("PHASE4B_PLAY_DEATH_CANCEL=PASS; old railgun motion released after death event");
        resultLogged=true;
        Debug.Log("PHASE4B_PLAY_STATUS=PASS; thermal=PASS; railgun=PASS; deathCancel=PASS");
    }

    private void Fail(string stage) { resultLogged=true; Debug.LogError("PHASE4B_PLAY_STATUS=FAIL; stage="+stage); }
    private void OnDisable() { if (!resultLogged) Debug.LogWarning("PHASE4B_PLAY_STATUS=NOT_RUN; interrupted"); }
}
