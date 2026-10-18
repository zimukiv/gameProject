using System.Collections;
using UnityEngine;

/// <summary>
/// 冰块：
/// 踩上去很滑，站上去 1s 融化（碰撞体禁用），过 3s 重新结冰。
/// 支持被热反应方块外部直接强制融化/结冰。
/// </summary>
public class IceBlock : InteractiveBlock
{
    [Header("Ice Timers")]
    public float meltDelay = 1.0f;
    public float refreezeDelay = 3.0f;

    [Header("State")]
    public bool isMelted = false;

    [Header("Visuals")]
    public Color solidColor = new Color(0.6f, 0.9f, 1f, 1f);
    public Color meltedColor = new Color(0.6f, 0.9f, 1f, 0.15f);

    private Coroutine meltCoroutine;

    protected override void Awake()
    {
        base.Awake();
        if (spriteRenderer != null)
        {
            spriteRenderer.color = solidColor;
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
        if (!isMelted && meltCoroutine == null)
        {
            meltCoroutine = StartCoroutine(MeltSequence());
        }
    }

    private IEnumerator MeltSequence()
    {
        yield return new WaitForSeconds(meltDelay);
        Melt();

        yield return new WaitForSeconds(refreezeDelay);
        Refreeze();
        meltCoroutine = null;
    }

    public void Melt()
    {
        isMelted = true;
        if (boxCollider != null) boxCollider.enabled = false;
        if (spriteRenderer != null) spriteRenderer.color = meltedColor;
    }

    public void Refreeze()
    {
        isMelted = false;
        if (boxCollider != null) boxCollider.enabled = true;
        if (spriteRenderer != null) spriteRenderer.color = solidColor;
    }
}
