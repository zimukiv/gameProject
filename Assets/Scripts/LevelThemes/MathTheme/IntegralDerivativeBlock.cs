using System.Collections;
using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// 关卡2（高数）：积分/求导方块
/// - 积分状态 (Integral)：将周围游离方块聚拢吸附为规整平台
/// - 求导状态 (Derivative)：将聚拢的方块拆散、推离回原始离散轨道
/// </summary>
public class IntegralDerivativeBlock : InteractiveBlock, ICheckpointState
{
    public enum MathMode { Integral, Derivative }

    [Header("Mode Configuration")]
    public MathMode currentMode = MathMode.Integral;

    [Header("Controlled Blocks")]
    public List<Transform> targetBlocks = new List<Transform>();
    public List<Vector3> assembledOffsets = new List<Vector3>(); // 聚拢时的相对坐标
    private List<Vector3> originalPositions = new List<Vector3>(); // 拆散时的原始坐标

    public float transitionSpeed = 5.0f;
    private bool isTransitioning = false;

    protected override void Awake()
    {
        base.Awake();
        foreach (var block in targetBlocks)
        {
            originalPositions.Add(block != null ? block.position : Vector3.zero);
        }
    }

    protected override void OnPlayerStepped(PlayerController player)
    {
        if (!isTransitioning)
        {
            ToggleMode();
        }
    }

    public void ToggleMode()
    {
        if (isTransitioning || transitionSpeed <= 0f) return;
        currentMode = (currentMode == MathMode.Integral) ? MathMode.Derivative : MathMode.Integral;
        StartCoroutine(TransitionBlocks());
    }

    public object CaptureCheckpointState()
    {
        var positions = new Vector3[targetBlocks.Count];
        for (int i = 0; i < targetBlocks.Count; i++)
            if (targetBlocks[i] != null) positions[i] = targetBlocks[i].position;
        return (currentMode, positions, isTransitioning);
    }

    public void RestoreCheckpointState(object state)
    {
        var saved = ((MathMode mode, Vector3[] positions, bool transitioning))state;
        StopAllCoroutines();
        isTransitioning = false;
        currentMode = saved.mode;
        for (int i = 0; i < targetBlocks.Count && i < saved.positions.Length; i++)
            if (targetBlocks[i] != null) targetBlocks[i].position = saved.positions[i];
        if (saved.transitioning && isActiveAndEnabled) StartCoroutine(TransitionBlocks());
    }

    private IEnumerator TransitionBlocks()
    {
        isTransitioning = true;
        float progress = 0f;

        while (progress < 1f)
        {
            progress += Time.deltaTime * transitionSpeed;
            for (int i = 0; i < targetBlocks.Count; i++)
            {
                if (targetBlocks[i] == null) continue;

                Vector3 targetPos;
                if (currentMode == MathMode.Integral)
                {
                    // 聚拢到以此方块为基准的位置
                    Vector3 offset = (i < assembledOffsets.Count) ? assembledOffsets[i] : new Vector3((i + 1) * 1.2f, 0, 0);
                    targetPos = transform.position + offset;
                }
                else
                {
                    // 拆散回原始位置
                    targetPos = (i < originalPositions.Count) ? originalPositions[i] : transform.position;
                }

                targetBlocks[i].position = Vector3.Lerp(targetBlocks[i].position, targetPos, progress);
            }
            yield return null;
        }

        isTransitioning = false;
    }
}
