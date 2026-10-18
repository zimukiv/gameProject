using UnityEngine;

/// <summary>
/// 关卡1（物理）：热反应方块
/// 踩踏或交互后切换房间冷热状态：
/// - 炎热 (Hot)：融化范围内所有冰块，画面滤镜/背景变为橙色调
/// - 寒冷 (Cold)：重新制造/冻结所有冰块，画面滤镜/背景变为蓝色调
/// </summary>
public class ThermalControllerBlock : InteractiveBlock, ICheckpointState
{
    public enum TemperatureState { Cold, Hot }

    [Header("Thermal State")]
    public TemperatureState currentState = TemperatureState.Cold;
    public float controlRadius = 20.0f;

    [Header("Visual Filter")]
    public SpriteRenderer roomFilterOverlay;
    public Color coldFilterColor = new Color(0.2f, 0.5f, 1f, 0.25f); // 蓝色滤镜
    public Color hotFilterColor = new Color(1f, 0.45f, 0.1f, 0.25f);  // 橙色滤镜
    private IceBlock[] controlledIce;

    protected override void Awake()
    {
        base.Awake();
        UpdateColors();
    }

    private void Start() => ApplyStateEffects();

    protected override void OnPlayerStepped(PlayerController player)
    {
        ToggleTemperature();
    }

    public void ToggleTemperature()
    {
        currentState = (currentState == TemperatureState.Cold) ? TemperatureState.Hot : TemperatureState.Cold;
        ApplyStateEffects();
    }

    private void ApplyStateEffects()
    {
        // 查找范围内的冰块并联动
        if (controlledIce == null) controlledIce = FindObjectsOfType<IceBlock>(true);
        foreach (var ice in controlledIce)
        {
            if (ice != null && ice.gameObject.scene == gameObject.scene &&
                (ice.transform.position - transform.position).sqrMagnitude <= controlRadius * controlRadius)
            {
                ice.SetTemperature(currentState == TemperatureState.Hot);
            }
        }
        UpdateColors();
    }

    private void UpdateColors()
    {
        // 更新滤镜颜色
        if (roomFilterOverlay != null)
        {
            roomFilterOverlay.color = (currentState == TemperatureState.Hot) ? hotFilterColor : coldFilterColor;
        }

        if (spriteRenderer != null)
        {
            spriteRenderer.color = (currentState == TemperatureState.Hot) ? Color.red : Color.blue;
        }
    }

    public object CaptureCheckpointState() => currentState;

    public void RestoreCheckpointState(object state)
    {
        currentState = (TemperatureState)state;
        // Ice restores its own timers; do not overwrite them here.
        UpdateColors();
    }

    private void OnDrawGizmosSelected()
    {
        Gizmos.color = (currentState == TemperatureState.Hot) ? Color.red : Color.cyan;
        Gizmos.DrawWireSphere(transform.position, controlRadius);
    }
}
