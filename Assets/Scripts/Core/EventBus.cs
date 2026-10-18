using System;
using UnityEngine;

/// <summary>
/// 全局事件总线，用于降低系统耦合度
/// </summary>
public static class EventBus
{
    // 分数事件 (增加量, 当前累计总分)
    public static event Action<int, int> OnScoreChanged;
    public static void TriggerScoreChanged(int added, int total) => OnScoreChanged?.Invoke(added, total);

    // Token 收集与消耗事件 (变动量, 当前持有量)
    public static event Action<int, int> OnTokenCountChanged;
    public static void TriggerTokenCountChanged(int delta, int current) => OnTokenCountChanged?.Invoke(delta, current);

    // 冲刺次数变动 (当前次数, 最大次数)
    public static event Action<int, int> OnDashChargeChanged;
    public static void TriggerDashChargeChanged(int current, int max) => OnDashChargeChanged?.Invoke(current, max);

    // 临时存档触发 (存档点坐标)
    public static event Action<Vector3> OnCheckpointReached;
    public static void TriggerCheckpointReached(Vector3 pos) => OnCheckpointReached?.Invoke(pos);

    // 玩家死亡与复活
    public static event Action OnPlayerDied;
    public static void TriggerPlayerDied() => OnPlayerDied?.Invoke();

    public static event Action OnPlayerRespawned;
    public static void TriggerPlayerRespawned() => OnPlayerRespawned?.Invoke();

    // AI 启动装置激活 (消耗token数, 难度系数)
    public static event Action<int, float> OnAIActivated;
    public static void TriggerAIActivated(int consumedTokens, float difficulty) => OnAIActivated?.Invoke(consumedTokens, difficulty);

    // 关卡完成
    public static event Action<int> OnLevelCompleted;
    public static void TriggerLevelCompleted(int levelIndex) => OnLevelCompleted?.Invoke(levelIndex);
}
