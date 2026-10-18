using System;
using UnityEngine;
using UnityEngine.Events;

/// <summary>
/// 关卡3（水课）：签到方块
/// 踩上去完成签到，全局/区域内踩满 5 个不同签到方块后开启通关大门或隐藏弹跳机关
/// </summary>
public class AttendanceBlock : InteractiveBlock, ICheckpointState
{
    public static int TotalCheckedInCount = 0;
    public const int REQUIRED_ATTENDANCE = 5;
    public static event Action<int> OnAttendanceChanged;

    [Header("Attendance State")]
    public bool hasCheckedIn = false;
    public Color signedColor = Color.green;

    [Header("Event on 5 Check-ins")]
    public UnityEvent onAllAttendanceCompleted = new UnityEvent();

    protected override void OnPlayerStepped(PlayerController player)
    {
        if (!hasCheckedIn)
        {
            hasCheckedIn = true;
            TotalCheckedInCount++;

            if (spriteRenderer != null)
            {
                spriteRenderer.color = signedColor;
            }

            OnAttendanceChanged?.Invoke(TotalCheckedInCount);
            Debug.Log($"[AttendanceBlock] 签到成功！当前签到进度: {TotalCheckedInCount}/{REQUIRED_ATTENDANCE}");

            if (TotalCheckedInCount >= REQUIRED_ATTENDANCE)
            {
                Debug.Log("[AttendanceBlock] 签到已满 5 次！触发装置开启。");
                onAllAttendanceCompleted?.Invoke();
            }
        }
    }

    public static void ResetAttendance()
    {
        TotalCheckedInCount = 0;
    }

    public object CaptureCheckpointState() => (hasCheckedIn, TotalCheckedInCount, spriteRenderer != null ? spriteRenderer.color : Color.white);

    public void RestoreCheckpointState(object state)
    {
        var saved = ((bool signed, int count, Color color))state;
        hasCheckedIn = saved.signed;
        TotalCheckedInCount = saved.count;
        if (spriteRenderer != null) spriteRenderer.color = saved.color;
        OnAttendanceChanged?.Invoke(TotalCheckedInCount);
    }
}
