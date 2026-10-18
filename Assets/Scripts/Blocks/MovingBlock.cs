using UnityEngine;

/// <summary>
/// 按轨迹移动的互动方块：
/// 支持在多点之间平滑往返移动，站在上方时可带动玩家平移
/// </summary>
public class MovingBlock : InteractiveBlock
{
    [Header("Waypoints")]
    public Transform[] waypoints;
    public float moveSpeed = 3.0f;
    public float waitTimeAtWaypoint = 0.5f;

    private int currentTargetIndex = 0;
    private float waitTimer = 0f;
    private bool movingForward = true;

    private void Update()
    {
        if (waypoints == null || waypoints.Length < 2) return;

        if (waitTimer > 0)
        {
            waitTimer -= Time.deltaTime;
            return;
        }

        Transform target = waypoints[currentTargetIndex];
        transform.position = Vector3.MoveTowards(transform.position, target.position, moveSpeed * Time.deltaTime);

        if (Vector3.Distance(transform.position, target.position) < 0.05f)
        {
            waitTimer = waitTimeAtWaypoint;
            SelectNextWaypoint();
        }
    }

    private void SelectNextWaypoint()
    {
        if (movingForward)
        {
            currentTargetIndex++;
            if (currentTargetIndex >= waypoints.Length)
            {
                currentTargetIndex = waypoints.Length - 2;
                movingForward = false;
            }
        }
        else
        {
            currentTargetIndex--;
            if (currentTargetIndex < 0)
            {
                currentTargetIndex = 1;
                movingForward = true;
            }
        }
    }

    protected override void OnCollisionEnter2D(Collision2D collision)
    {
        base.OnCollisionEnter2D(collision);
        if (collision.gameObject.CompareTag("Player"))
        {
            collision.transform.SetParent(transform);
        }
    }

    protected override void OnCollisionExit2D(Collision2D collision)
    {
        base.OnCollisionExit2D(collision);
        if (collision.gameObject.CompareTag("Player"))
        {
            collision.transform.SetParent(null);
        }
    }
}
