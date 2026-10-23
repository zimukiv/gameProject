using System.Collections;
using UnityEngine;

// Test fixture only. This component belongs to the isolated roundtrip scene, not a game level.
public sealed class Phase1PlaytestProbe : MonoBehaviour
{
    public PlayerController player;
    public BoxCollider2D platform;
    public AirVentBlock vent;
    public TokenItem token;
    private bool started;
    private bool resultLogged;

    private IEnumerator Start()
    {
        started = true;
        Debug.Log("PHASE1_PLAY_STATUS=RUNNING; platform=NOT_RUN; vent=NOT_RUN; token=NOT_RUN");
        Debug.Log("PHASE1_PLAY_PERSISTENT_DATA_PATH=" + Application.persistentDataPath);
        if (Application.companyName == "MiniGame Team" && Application.productName == "AI 大人，拜托了")
        {
            resultLogged = true;
            Debug.LogError("PHASE1_PLAY_STATUS=FAIL; stage=save-isolation; test project still shares the formal game's persistent data path");
            yield break;
        }
        if (player == null || platform == null || vent == null || token == null)
        {
            resultLogged = true;
            Debug.LogError("PHASE1_PLAY_STATUS=FAIL; stage=fixture; references missing");
            yield break;
        }
        var body = player.GetComponent<Rigidbody2D>();
        var playerCollider = player.GetComponent<BoxCollider2D>();
        if (body == null || playerCollider == null)
        {
            resultLogged = true;
            Debug.LogError("PHASE1_PLAY_STATUS=FAIL; stage=fixture; player physics components missing");
            yield break;
        }
        body.linearVelocity = Vector2.zero;
        player.transform.position = new Vector3(platform.transform.position.x, -1f, 0f);
        Physics2D.SyncTransforms();
        yield return new WaitForSeconds(1f);
        if (!Physics2D.IsTouching(playerCollider, platform) || body.linearVelocity.y < -1f)
        {
            resultLogged = true;
            Debug.LogError("PHASE1_PLAY_STATUS=FAIL; stage=platform; touching=" +
                Physics2D.IsTouching(playerCollider, platform) + "; velocity=" + body.linearVelocity);
            yield break;
        }
        Debug.Log("PHASE1_PLAY_PLATFORM=PASS; touching=true; velocity=" + body.linearVelocity);

        body.linearVelocity = Vector2.zero;
        player.transform.position = vent.transform.position;
        Physics2D.SyncTransforms();
        yield return new WaitForFixedUpdate();
        yield return new WaitForFixedUpdate();
        if (body.linearVelocity.y < 10f)
        {
            resultLogged = true;
            Debug.LogError("PHASE1_PLAY_STATUS=FAIL; stage=vent; velocity=" + body.linearVelocity);
            yield break;
        }
        Debug.Log("PHASE1_PLAY_VENT=PASS; velocity=" + body.linearVelocity);

        var scoreManager = ScoreManager.Instance;
        if (scoreManager == null || !token.gameObject.activeSelf)
        {
            resultLogged = true;
            Debug.LogError("PHASE1_PLAY_STATUS=FAIL; stage=token; score manager missing or token already inactive");
            yield break;
        }
        int scoreBefore = scoreManager.TotalScore;
        int tokensBefore = player.currentTokens;
        int chargesBefore = player.currentDashCharges;
        int progressBefore = player.dashChargeProgress;
        var expectedChargeMeter = new DashChargeMeter();
        expectedChargeMeter.Restore(chargesBefore, progressBefore);
        expectedChargeMeter.Collect(token.tokenAmount);

        body.linearVelocity = Vector2.zero;
        player.transform.position = token.transform.position;
        Physics2D.SyncTransforms();
        yield return new WaitForFixedUpdate();
        yield return new WaitForFixedUpdate();
        int scoreAfter = scoreManager.TotalScore;
        int scoreDelta = scoreAfter - scoreBefore;
        int expectedDelta = token.scoreAmount;
        int tokensAfter = player.currentTokens;
        int chargesAfter = player.currentDashCharges;
        int progressAfter = player.dashChargeProgress;
        string audit = "; scoreBefore=" + scoreBefore + "; scoreAfter=" + scoreAfter +
            "; scoreDelta=" + scoreDelta + "; expectedDelta=" + expectedDelta +
            "; tokensBefore=" + tokensBefore + "; tokensAfter=" + tokensAfter +
            "; expectedTokensAfter=" + (tokensBefore + Mathf.Max(0, token.tokenAmount)) +
            "; chargesBefore=" + chargesBefore + "; chargesAfter=" + chargesAfter +
            "; expectedChargesAfter=" + expectedChargeMeter.Charges +
            "; progressBefore=" + progressBefore + "; progressAfter=" + progressAfter +
            "; expectedProgressAfter=" + expectedChargeMeter.Progress;
        if (token.gameObject.activeSelf || scoreDelta != expectedDelta ||
            tokensAfter != tokensBefore + Mathf.Max(0, token.tokenAmount) ||
            chargesAfter != expectedChargeMeter.Charges || progressAfter != expectedChargeMeter.Progress)
        {
            resultLogged = true;
            Debug.LogError("PHASE1_PLAY_STATUS=FAIL; stage=token; active=" + token.gameObject.activeSelf +
                audit);
            yield break;
        }
        Debug.Log("PHASE1_PLAY_TOKEN=PASS; active=false" + audit);
        resultLogged = true;
        Debug.Log("PHASE1_PLAY_STATUS=PASS; platform=PASS; vent=PASS; token=PASS");
    }

    private void OnDisable()
    {
        if (started && !resultLogged)
            Debug.LogWarning("PHASE1_PLAY_STATUS=NOT_RUN; playtest interrupted before a result.");
    }
}
