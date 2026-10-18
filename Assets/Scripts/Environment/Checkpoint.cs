using UnityEngine;

/// <summary>
/// 房间入口保存点：
/// 玩家进入新房间时触发，向 SaveManager 写入临时存档点数据
/// </summary>
[RequireComponent(typeof(Collider2D))]
public class Checkpoint : MonoBehaviour
{
    [Header("Checkpoint Config")]
    public Transform respawnPoint;
    public bool isActivated = false;

    [Header("Visual Feedback (Optional)")]
    public SpriteRenderer flagRenderer;
    public Color activeColor = Color.green;
    public Color inactiveColor = Color.gray;

    private void Start()
    {
        if (respawnPoint == null)
        {
            respawnPoint = transform;
        }

        if (flagRenderer != null)
        {
            flagRenderer.color = isActivated ? activeColor : inactiveColor;
        }
    }

    private void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Player") && !isActivated)
        {
            ActivateCheckpoint(other.GetComponent<PlayerController>());
        }
    }

    public void ActivateCheckpoint(PlayerController player)
    {
        isActivated = true;
        if (flagRenderer != null) flagRenderer.color = activeColor;

        Vector3 spawnPos = respawnPoint != null ? respawnPoint.position : transform.position;

        int tokens = player != null ? player.currentTokens : 0;
        int dash = player != null ? player.currentDashCharges : 3;

        if (SaveManager.Instance != null)
        {
            SaveManager.Instance.UpdateTempCheckpoint(spawnPos, tokens, dash);
        }

        EventBus.TriggerCheckpointReached(spawnPos);
    }
}
