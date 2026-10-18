using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// 地图分叉点导航标记：
/// 玩家穿过/触发后激活该标记，敌人 AI 在分叉路口感知到被激活的标记后，将自动调整寻路方向朝向该标记移动
/// </summary>
[RequireComponent(typeof(Collider2D))]
public class NavigationMarker : MonoBehaviour, ICheckpointState
{
    internal static readonly HashSet<NavigationMarker> ActiveMarkers = new HashSet<NavigationMarker>();

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
    private static void ResetRegistry() => ActiveMarkers.Clear();

    private void OnEnable() => ActiveMarkers.Add(this);
    private void OnDisable() => ActiveMarkers.Remove(this);
    [Header("Marker Config")]
    public int markerId;
    public bool isTriggeredByPlayer = false;
    public float activeTimeWindow = 10f; // 标记有效记忆窗口

    private float timer = 0f;

    public object CaptureCheckpointState() => (isTriggeredByPlayer, timer);

    public void RestoreCheckpointState(object state)
    {
        var saved = ((bool triggered, float remaining))state;
        isTriggeredByPlayer = saved.triggered;
        timer = saved.remaining;
    }

    private void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Player"))
        {
            isTriggeredByPlayer = true;
            timer = activeTimeWindow;
            Debug.Log($"[NavigationMarker] 玩家触发分叉路标记 #{markerId}，AI 寻路偏好已更新。");
        }
    }

    private void Update()
    {
        if (isTriggeredByPlayer)
        {
            timer -= Time.deltaTime;
            if (timer <= 0)
            {
                isTriggeredByPlayer = false;
            }
        }
    }

    private void OnDrawGizmos()
    {
        Gizmos.color = isTriggeredByPlayer ? Color.green : Color.yellow;
        Gizmos.DrawWireCube(transform.position, Vector3.one * 0.8f);
    }
}
