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

    [Header("Optional Route Guide")]
    public bool showGuide;
    public float warningDuration = .6f;
    public CollectibleItem optionalCollectible;

    private bool isCurrentlyVisible = true;
    private float remaining;
    private bool timerRunning;
    private TextMesh ruleLabel;
    private TextMesh stateLabel;
    private TextMesh collectibleLabel;
    private TextMesh cycleSymbol;
    private LineRenderer progress;
    private LineRenderer progressTrack;
    private LineRenderer[] ghostOutline;
    private Material guideMaterial;

    private void Start()
    {
        SetVisibility(true);
        timerRunning = mode == VanishMode.PeriodicBlink;
        remaining = Mathf.Max(.01f, visibleDuration);
        if (showGuide) BuildGuide();
        UpdateGuide();
    }

    private void Update()
    {
        if (timerRunning)
        {
            remaining -= Time.deltaTime;
            if (remaining <= 0f)
            {
                SetVisibility(!isCurrentlyVisible);
                if (mode == VanishMode.PeriodicBlink)
                    remaining = Mathf.Max(.01f, isCurrentlyVisible ? visibleDuration : invisibleDuration);
                else if (!isCurrentlyVisible) remaining = Mathf.Max(.01f, respawnDelay);
                else timerRunning = false;
            }
        }
        UpdateGuide();
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
        UpdateGuide();
    }

    private void BuildGuide()
    {
        guideMaterial = new Material(Shader.Find("Sprites/Default"));
        ruleLabel = MechanismGuideVisuals.CreateLabel(transform,
            mode == VanishMode.PeriodicBlink
                ? $"周期平台\n出现 {visibleDuration:0.#} 秒 / 消失 {invisibleDuration:0.#} 秒"
                : $"限时平台\n踩上后 {stepVanishDelay:0.#} 秒消失",
            transform.position + new Vector3(-1.4f, 1.5f), Color.white, .075f);
        ruleLabel.gameObject.name = "Platform rule";
        stateLabel = MechanismGuideVisuals.CreateLabel(transform, "",
            transform.position + Vector3.down * .75f, Color.white, .07f);
        stateLabel.gameObject.name = "Platform countdown";
        cycleSymbol = MechanismGuideVisuals.CreateLabel(transform, "↻", transform.position,
            new Color(.15f, .2f, .3f), .065f);
        MechanismGuideVisuals.CreateLabel(transform, "下方直走 → 通关",
            transform.position + new Vector3(3.2f, -1.25f), new Color(.65f, 1f, .75f), .075f);
        if (optionalCollectible != null)
        {
            collectibleLabel = MechanismGuideVisuals.CreateLabel(optionalCollectible.transform, "",
                optionalCollectible.transform.position + Vector3.up * 1.2f, new Color(1f, .7f, 1f), .07f);
            collectibleLabel.gameObject.name = "Optional collectible guide";
        }
        progressTrack = GuideLine("Cycle progress track", new Color(.35f, .4f, .5f), .06f);
        Bounds bounds = boxCollider.bounds;
        Vector3 left = new Vector3(bounds.min.x + .1f, bounds.max.y + .25f);
        Vector3 right = new Vector3(bounds.max.x - .1f, bounds.max.y + .25f);
        progressTrack.SetPositions(new[] { left, right });
        progress = GuideLine("Cycle progress", Color.white, .065f);
        progress.sortingOrder = 6;
        progress.SetPositions(new[] { left, right });
        // Broken edges communicate that the remaining outline is not solid.
        Vector3[] corners = { new Vector3(bounds.min.x, bounds.min.y), new Vector3(bounds.max.x, bounds.min.y),
            new Vector3(bounds.max.x, bounds.max.y), new Vector3(bounds.min.x, bounds.max.y) };
        ghostOutline = new LineRenderer[8];
        for (int edge = 0; edge < 4; edge++)
            for (int dash = 0; dash < 2; dash++)
            {
                var line = GuideLine("Non-solid outline", new Color(.65f, .8f, 1f, .45f), .035f);
                line.SetPositions(new[] {
                    Vector3.Lerp(corners[edge], corners[(edge+1)%4], dash * .6f),
                    Vector3.Lerp(corners[edge], corners[(edge+1)%4], dash * .6f + .4f) });
                ghostOutline[edge * 2 + dash] = line;
            }
    }

    private LineRenderer GuideLine(string label, Color color, float width)
    {
        var child = new GameObject(label);
        child.transform.SetParent(transform, false);
        var line = child.AddComponent<LineRenderer>();
        line.sharedMaterial = guideMaterial;
        line.useWorldSpace = true;
        line.positionCount = 2;
        line.startWidth = line.endWidth = width;
        line.startColor = line.endColor = color;
        line.sortingOrder = 5;
        return line;
    }

    private void UpdateGuide()
    {
        if (stateLabel == null) return;
        bool warning = isCurrentlyVisible && timerRunning && remaining <= warningDuration;
        float seconds = Mathf.Ceil(Mathf.Max(0f, remaining) * 10f) / 10f;
        Color ink = warning ? new Color(1f, .7f, .25f) : isCurrentlyVisible
            ? Color.white : new Color(.65f, .8f, 1f);
        string text = !timerRunning ? "可站立 · 踩上后计时" : isCurrentlyVisible
            ? warning ? $"即将消失！{seconds:0.0} 秒" : $"可站立 · {seconds:0.0} 秒后消失"
            : $"暂不可站立 · {seconds:0.0} 秒后恢复";
        if (stateLabel.text != text) stateLabel.text = text;
        stateLabel.color = ink;
        if (spriteRenderer != null && isCurrentlyVisible)
        {
            float pulse = warning ? .5f + .5f * Mathf.Sin(remaining * Mathf.PI * 8f) : 0f;
            spriteRenderer.color = Color.Lerp(visibleColor, new Color(1f, .6f, .15f, visibleColor.a), pulse);
        }
        cycleSymbol.gameObject.SetActive(isCurrentlyVisible);
        foreach (var line in ghostOutline) line.enabled = !isCurrentlyVisible;
        float duration = mode == VanishMode.PeriodicBlink ? isCurrentlyVisible ? visibleDuration : invisibleDuration
            : isCurrentlyVisible ? stepVanishDelay : respawnDelay;
        float ratio = !timerRunning ? 1f : Mathf.Clamp01(remaining / Mathf.Max(.01f, duration));
        if (!isCurrentlyVisible) ratio = 1f - ratio;
        progress.SetPosition(1, Vector3.Lerp(progressTrack.GetPosition(0), progressTrack.GetPosition(1), ratio));
        progress.startColor = progress.endColor = ink;
        if (collectibleLabel != null && optionalCollectible != null)
        {
            bool ready = !optionalCollectible.requiresAINearby || (EnemyAI.Instance != null &&
                Vector2.Distance(optionalCollectible.transform.position, EnemyAI.Instance.transform.position)
                    <= optionalCollectible.requiredAIDistance);
            string hint = !optionalCollectible.requiresAINearby ? "可选收藏\n跳上高台拾取"
                : ready ? "可选收藏\nAI 已靠近，可拾取" : "可选收藏\n需要引 AI 靠近";
            if (collectibleLabel.text != hint) collectibleLabel.text = hint;
            collectibleLabel.color = ready ? new Color(.65f, 1f, .75f) : new Color(1f, .7f, 1f);
        }
    }

    private void OnDestroy()
    {
        if (guideMaterial != null) Destroy(guideMaterial);
    }
}
