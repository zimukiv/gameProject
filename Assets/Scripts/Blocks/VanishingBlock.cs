using UnityEngine;

/// <summary>
/// 消失方块：支持随时间周期性出现/消失，或踩踏后延时消失并自动重置
/// </summary>
public class VanishingBlock : InteractiveBlock, ICheckpointState
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
    private float remaining;
    private bool timerRunning;

    private void Start()
    {
        SetVisibility(true);
        timerRunning = mode == VanishMode.PeriodicBlink;
        remaining = Mathf.Max(.01f, visibleDuration);
    }

    private void Update()
    {
        if (!timerRunning) return;
        remaining -= Time.deltaTime;
        if (remaining > 0f) return;
        SetVisibility(!isCurrentlyVisible);
        if (mode == VanishMode.PeriodicBlink)
            remaining = Mathf.Max(.01f, isCurrentlyVisible ? visibleDuration : invisibleDuration);
        else if (!isCurrentlyVisible) remaining = Mathf.Max(.01f, respawnDelay);
        else timerRunning = false;
    }

    protected override void OnPlayerStepped(PlayerController player)
    {
        if (mode != VanishMode.TriggerOnStep || !isCurrentlyVisible || timerRunning) return;
        remaining = Mathf.Max(.01f, stepVanishDelay);
        timerRunning = true;
    }

    private void SetVisibility(bool visible)
    {
        isCurrentlyVisible = visible;
        if (boxCollider != null) boxCollider.enabled = visible;
        if (spriteRenderer != null) spriteRenderer.color = visible ? visibleColor : vanishColor;
    }

    public object CaptureCheckpointState() => (isCurrentlyVisible, remaining, timerRunning);

    public void RestoreCheckpointState(object state)
    {
        var saved = ((bool visible, float time, bool running))state;
        SetVisibility(saved.visible);
        remaining = saved.time;
        timerRunning = saved.running;
    }
}
