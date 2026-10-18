using UnityEngine;

/// <summary>
/// 关卡3（水课）：巡查老师
/// 沿预定轨迹巡逻，触碰玩家扣除积分；穿过清醒方块时可唤醒清醒方块
/// </summary>
public class PatrolTeacherAI : MonoBehaviour
{
    [Header("Patrol Trajectory")]
    public Transform[] patrolWaypoints;
    public float patrolSpeed = 4.0f;
    public int scorePenaltyOnCatch = 500;

    [Header("Trajectory Line Visualizer")]
    public LineRenderer trajectoryLine;

    private int currentTargetIndex = 0;

    private void Start()
    {
        if (trajectoryLine != null && patrolWaypoints != null && patrolWaypoints.Length > 0)
        {
            trajectoryLine.positionCount = patrolWaypoints.Length;
            for (int i = 0; i < patrolWaypoints.Length; i++)
            {
                if (patrolWaypoints[i] != null)
                {
                    trajectoryLine.SetPosition(i, patrolWaypoints[i].position);
                }
            }
        }
    }

    private void Update()
    {
        if (patrolWaypoints == null || patrolWaypoints.Length < 2) return;

        Transform target = patrolWaypoints[currentTargetIndex];
        transform.position = Vector3.MoveTowards(transform.position, target.position, patrolSpeed * Time.deltaTime);

        if (Vector3.Distance(transform.position, target.position) < 0.1f)
        {
            currentTargetIndex = (currentTargetIndex + 1) % patrolWaypoints.Length;
        }
    }

    private void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Player"))
        {
            CatchPlayer(other.GetComponent<PlayerController>());
        }
    }

    private void OnCollisionEnter2D(Collision2D collision)
    {
        if (collision.gameObject.CompareTag("Player"))
        {
            CatchPlayer(collision.gameObject.GetComponent<PlayerController>());
        }
    }

    private void CatchPlayer(PlayerController player)
    {
        if (ScoreManager.Instance != null)
        {
            ScoreManager.Instance.DeductScore(scorePenaltyOnCatch);
            Debug.Log($"[PatrolTeacherAI] 惨遭巡查老师抓住！扣除 {scorePenaltyOnCatch} 积分！");
        }
    }

    private void OnDrawGizmos()
    {
        if (patrolWaypoints != null && patrolWaypoints.Length > 1)
        {
            Gizmos.color = Color.magenta;
            for (int i = 0; i < patrolWaypoints.Length - 1; i++)
            {
                if (patrolWaypoints[i] != null && patrolWaypoints[i + 1] != null)
                {
                    Gizmos.DrawLine(patrolWaypoints[i].position, patrolWaypoints[i + 1].position);
                }
            }
            if (patrolWaypoints[0] != null && patrolWaypoints[patrolWaypoints.Length - 1] != null)
            {
                Gizmos.DrawLine(patrolWaypoints[patrolWaypoints.Length - 1].position, patrolWaypoints[0].position);
            }
        }
    }
}
