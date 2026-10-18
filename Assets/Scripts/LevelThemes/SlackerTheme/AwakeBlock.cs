using System.Collections;
using UnityEngine;

/// <summary>
/// 关卡3（水课）：清醒方块
/// 初始为不可穿透方块，巡查老师穿过/触碰后被激活唤醒（变为Trigger可穿透）；
/// 玩家穿过后获得移速提升加速 Buff。
/// </summary>
public class AwakeBlock : BaseBlock
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

    private void OnTriggerEnter2D(Collider2D other)
    {
        // 巡查老师穿过唤醒该方块
        if (other.GetComponent<PatrolTeacherAI>() != null || other.CompareTag("Teacher"))
        {
            if (!isAwakened)
            {
                isAwakened = true;
                UpdateBlockState();
                Debug.Log("[AwakeBlock] 巡查老师已穿过，清醒方块被唤醒为可穿透状态！");
            }
        }
        else if (isAwakened && other.CompareTag("Player"))
        {
            PlayerController pc = other.GetComponent<PlayerController>();
            if (pc != null)
            {
                StartCoroutine(ApplySpeedBoost(pc));
            }
        }
    }

    private IEnumerator ApplySpeedBoost(PlayerController pc)
    {
        float originalSpeed = pc.moveSpeed;
        pc.moveSpeed *= speedBoostMultiplier;
        Debug.Log($"[AwakeBlock] 穿过清醒方块！获得加速 Buff (x{speedBoostMultiplier})！");

        yield return new WaitForSeconds(boostDuration);

        pc.moveSpeed = originalSpeed;
    }
}
