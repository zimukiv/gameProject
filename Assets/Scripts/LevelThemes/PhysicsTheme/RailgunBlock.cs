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

    protected override void OnPlayerStepped(PlayerController player)
    {
        if (!isLaunching && player != null)
        {
            StartCoroutine(RailgunSequence(player));
        }
    }

    private IEnumerator RailgunSequence(PlayerController player)
    {
        isLaunching = true;
        Rigidbody2D rb = player.GetComponent<Rigidbody2D>();
        Collider2D col = player.GetComponent<Collider2D>();

        // 暂时冻结重力与输入控制
        rb.velocity = Vector2.zero;
        rb.gravityScale = 0f;

        Vector3 startPos = transform.position;
        Vector3 endPos = launchEndPoint != null ? launchEndPoint.position : transform.position + (Vector3)launchDirection * 5f;

        float currentSpeed = 0f;
        while (Vector3.Distance(player.transform.position, endPos) > 0.3f)
        {
            currentSpeed += acceleration * Time.deltaTime;
            Vector3 nextPos = Vector3.MoveTowards(player.transform.position, endPos, currentSpeed * Time.deltaTime);
            player.transform.position = nextPos;
            yield return null;
        }

        // 到达末端，猛烈弹射抛出
        rb.gravityScale = 3f; // 恢复重力
        Vector2 finalForce = launchDirection.normalized * launchExitSpeed;
        player.ForceLaunch(finalForce);

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
