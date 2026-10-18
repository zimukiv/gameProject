using UnityEngine;

/// <summary>
/// 冰块：
/// 踩上去很滑，站上去 1s 融化（碰撞体禁用），过 3s 重新结冰。
/// 支持被热反应方块外部直接强制融化/结冰。
/// </summary>
public class IceBlock : InteractiveBlock, ICheckpointState
{
    [Header("Ice Timers")]
    public float meltDelay = 1.0f;
    public float refreezeDelay = 3.0f;

    [Header("State")]
    public bool isMelted = false;

    [Header("Visuals")]
    public Color solidColor = new Color(0.6f, 0.9f, 1f, 1f);
    public Color meltedColor = new Color(0.6f, 0.9f, 1f, 0.15f);

    private float meltRemaining = -1f;
    private float refreezeRemaining = -1f;
    private bool heldMelted;

    protected override void Awake()
    {
        base.Awake();
        if (boxCollider != null) boxCollider.enabled = !isMelted;
        if (spriteRenderer != null)
        {
            spriteRenderer.color = isMelted ? meltedColor : solidColor;
        }

        // 默认附加低摩擦力材质
        if (boxCollider != null && boxCollider.sharedMaterial == null)
        {
            PhysicsMaterial2D slipperyMat = new PhysicsMaterial2D("SlipperyMat")
            {
                friction = 0.02f,
                bounciness = 0f
            };
            boxCollider.sharedMaterial = slipperyMat;
        }
    }

    protected override void OnPlayerStepped(PlayerController player)
    {
        if (!isMelted && meltRemaining < 0f) meltRemaining = meltDelay;
    }

    private void Update()
    {
        if (heldMelted) return;
        if (meltRemaining >= 0f)
        {
            meltRemaining -= Time.deltaTime;
            if (meltRemaining <= 0f)
            {
                Melt();
                refreezeRemaining = refreezeDelay;
            }
        }
        else if (refreezeRemaining >= 0f)
        {
            refreezeRemaining -= Time.deltaTime;
            if (refreezeRemaining <= 0f) Refreeze();
        }
    }

    public void Melt()
    {
        meltRemaining = -1f;
        isMelted = true;
        if (boxCollider != null) boxCollider.enabled = false;
        if (spriteRenderer != null) spriteRenderer.color = meltedColor;
    }

    public void Refreeze()
    {
        meltRemaining = refreezeRemaining = -1f;
        isMelted = false;
        if (boxCollider != null) boxCollider.enabled = true;
        if (spriteRenderer != null) spriteRenderer.color = solidColor;
    }

    public void SetTemperature(bool hot)
    {
        heldMelted = hot;
        if (hot) { Melt(); refreezeRemaining = -1f; }
        else Refreeze();
    }

    public object CaptureCheckpointState() => (isMelted, heldMelted, meltRemaining, refreezeRemaining);

    public void RestoreCheckpointState(object state)
    {
        var saved = ((bool melted, bool hot, float meltTime, float refreezeTime))state;
        if (saved.melted) Melt(); else Refreeze();
        heldMelted = saved.hot;
        meltRemaining = saved.meltTime;
        refreezeRemaining = saved.refreezeTime;
    }
}
