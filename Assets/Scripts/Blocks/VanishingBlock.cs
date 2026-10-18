using System.Collections;
using UnityEngine;

/// <summary>
/// 消失方块：支持随时间周期性出现/消失，或踩踏后延时消失并自动重置
/// </summary>
public class VanishingBlock : InteractiveBlock
{
    public enum VanishMode
    {
        PeriodicBlink, // 随时间周期性闪烁
        TriggerOnStep  // 踩踏后延时消失
    }

    [Header("Mode")]
    public VanishMode mode = VanishMode.PeriodicBlink;

    [Header("Periodic Timing")]
    public float visibleDuration = 2.0f;
    public float invisibleDuration = 2.0f;

    [Header("Step Trigger Timing")]
    public float stepVanishDelay = 0.8f;
    public float respawnDelay = 3.0f;

    [Header("Visual Feedback")]
    public Color visibleColor = Color.white;
    public Color vanishColor = new Color(1f, 1f, 1f, 0.1f);

    private bool isCurrentlyVisible = true;

    protected override void Awake()
    {
        base.Awake();
        if (mode == VanishMode.PeriodicBlink)
        {
            StartCoroutine(PeriodicCycle());
        }
    }

    private IEnumerator PeriodicCycle()
    {
        while (true)
        {
            SetVisibility(true);
            yield return new WaitForSeconds(visibleDuration);

            SetVisibility(false);
            yield return new WaitForSeconds(invisibleDuration);
        }
    }

    protected override void OnPlayerStepped(PlayerController player)
    {
        if (mode == VanishMode.TriggerOnStep && isCurrentlyVisible)
        {
            StartCoroutine(StepVanishSequence());
        }
    }

    private IEnumerator StepVanishSequence()
    {
        yield return new WaitForSeconds(stepVanishDelay);
        SetVisibility(false);

        yield return new WaitForSeconds(respawnDelay);
        SetVisibility(true);
    }

    private void SetVisibility(bool visible)
    {
        isCurrentlyVisible = visible;
        if (boxCollider != null) boxCollider.enabled = visible;
        if (spriteRenderer != null) spriteRenderer.color = visible ? visibleColor : vanishColor;
    }
}
