using UnityEngine;
using UnityEngine.Events;

/// <summary>
/// 关卡3（水课）：AI 近身距离触发机制
/// 核心玩法规则：玩家独自一人无法触发机关，必须引领/吸引 AI 到达足够近的距离（如 < 5m）才能成功触发机关！
/// </summary>
public class DistanceTriggerMechanism : MonoBehaviour, ICheckpointState
{
    [Header("Distance Requirement")]
    public float requiredAIDistance = 5.0f; // 暂定 5m
    public KeyCode interactKey = KeyCode.E;
    public bool autoTriggerWhenNear = true;

    [Header("State")]
    public bool isTriggered = false;

    [Header("Events")]
    public UnityEvent onMechanismActivated = new UnityEvent();
    public UnityEvent onConditionFailed = new UnityEvent();

    private bool playerInRange = false;

    private void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Player"))
        {
            playerInRange = true;
            if (autoTriggerWhenNear)
            {
                TryActivate();
            }
        }
    }

    private void OnTriggerExit2D(Collider2D other)
    {
        if (other.CompareTag("Player"))
        {
            playerInRange = false;
        }
    }

    private void Update()
    {
        if (playerInRange && !isTriggered)
        {
            if (autoTriggerWhenNear)
            {
                TryActivate();
            }
            else if (GameInput.WasPressed(interactKey))
            {
                TryActivate();
            }
        }
    }

    public void TryActivate()
    {
        if (isTriggered) return;

        // 寻找附近的 AI
        EnemyAI ai = EnemyAI.Instance;
        if (ai != null)
        {
            float dist = Vector2.Distance(transform.position, ai.transform.position);
            if (dist <= requiredAIDistance)
            {
                isTriggered = true;
                Debug.Log($"[DistanceTriggerMechanism] AI 距离为 {dist:F2}m (<= {requiredAIDistance}m)，成功激活特殊机关！");
                onMechanismActivated?.Invoke();
                return;
            }
        }

        onConditionFailed?.Invoke();
    }

    public object CaptureCheckpointState() => isTriggered;

    public void RestoreCheckpointState(object state)
    {
        isTriggered = (bool)state;
        playerInRange = false;
    }

    private void OnDrawGizmosSelected()
    {
        Gizmos.color = Color.cyan;
        Gizmos.DrawWireSphere(transform.position, requiredAIDistance);
    }
}
