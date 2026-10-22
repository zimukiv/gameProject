using UnityEngine;

/// <summary>
/// 关卡3（水课）：清醒方块
/// 初始为不可穿透方块，巡查老师穿过/触碰后被激活唤醒（变为Trigger可穿透）；
/// 玩家穿过后获得移速提升加速 Buff。
/// </summary>
public class AwakeBlock : BaseBlock, ICheckpointState
{
    [Header("Awake State")]
    public bool isAwakened = false;
    public float speedBoostMultiplier = 1.6f;
    public float boostDuration = 2.5f;

    [Header("Visual Colors")]
    public Color normalColor = Color.gray;
    public Color awakenedColor = Color.yellow;

    protected override void Awake()
    {
        base.Awake();
        UpdateBlockState();
    }

    private void UpdateBlockState()
    {
        if (boxCollider != null)
        {
            boxCollider.isTrigger = isAwakened;
        }

        if (spriteRenderer != null)
        {
            spriteRenderer.color = isAwakened ? awakenedColor : normalColor;
        }
    }

    private void OnCollisionEnter2D(Collision2D collision)
    {
        CheckInteraction(collision.collider);
    }

    private void OnTriggerEnter2D(Collider2D other)
    {
        CheckInteraction(other);
    }

    private void CheckInteraction(Collider2D other)
    {
        if (other == null) return;

        // 巡查老师穿过唤醒该方块
        if (!isAwakened && (other.GetComponent<PatrolTeacherAI>() != null || other.CompareTag("Teacher")))
        {
            isAwakened = true;
            UpdateBlockState();
            Debug.Log("[AwakeBlock] 巡查老师已穿过，清醒方块被唤醒为可穿透状态！");
        }
        else if (isAwakened && other.CompareTag("Player"))
        {
            PlayerController pc = other.GetComponent<PlayerController>();
            if (pc != null)
            {
                pc.ApplySpeedModifier(this, speedBoostMultiplier, boostDuration);
            }
        }
    }

    public object CaptureCheckpointState() => isAwakened;

    public void RestoreCheckpointState(object state)
    {
        isAwakened = (bool)state;
        UpdateBlockState();
    }
}
