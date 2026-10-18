using System.Collections;
using UnityEngine;

/// <summary>
/// 关卡1（物理）：电磁炮方块
/// 踩到起点方块后，玩家进入导轨由零匀加速，到达终点将玩家高速弹射抛出！
/// </summary>
public class RailgunBlock : InteractiveBlock
{
    [Header("Railgun Acceleration")]
    public Transform launchEndPoint;
    public float acceleration = 30f;
    public float launchExitSpeed = 32f;
    public Vector2 launchDirection = Vector2.right;

    private bool isLaunching = false;
    private PlayerController launchPlayer;

    private void OnEnable() => EventBus.OnPlayerDied += CancelLaunch;

    private void OnDisable()
    {
        EventBus.OnPlayerDied -= CancelLaunch;
        CancelLaunch();
    }

    private void CancelLaunch()
    {
        StopAllCoroutines();
        if (launchPlayer != null) launchPlayer.CancelScriptedMotion(this);
        launchPlayer = null;
        isLaunching = false;
    }

    protected override void OnPlayerStepped(PlayerController player)
    {
        if (!isLaunching && player != null && acceleration > 0f && player.TryBeginScriptedMotion(this))
        {
            isLaunching = true;
            launchPlayer = player;
            StartCoroutine(RailgunSequence(player));
        }
    }

    private IEnumerator RailgunSequence(PlayerController player)
    {
        Vector3 endPos = launchEndPoint != null ? launchEndPoint.position : transform.position + (Vector3)launchDirection * 5f;

        float currentSpeed = 0f;
        while (player != null && player.IsScriptedMotionControlledBy(this) &&
            Vector3.Distance(player.transform.position, endPos) > 0.3f)
        {
            currentSpeed += acceleration * Time.deltaTime;
            Vector3 nextPos = Vector3.MoveTowards(player.transform.position, endPos, currentSpeed * Time.deltaTime);
            player.transform.position = nextPos;
            yield return null;
        }

        // 到达末端，猛烈弹射抛出
        Vector2 finalForce = launchDirection.normalized * launchExitSpeed;
        if (player != null) player.CompleteScriptedMotion(this, finalForce);
        launchPlayer = null;

        yield return new WaitForSeconds(0.5f);
        isLaunching = false;
    }

    private void OnDrawGizmosSelected()
    {
        Gizmos.color = Color.yellow;
        Vector3 end = launchEndPoint != null ? launchEndPoint.position : transform.position + (Vector3)launchDirection * 5f;
        Gizmos.DrawLine(transform.position, end);
        Gizmos.DrawWireSphere(end, 0.3f);
    }
}
