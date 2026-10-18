using UnityEngine;

/// <summary>
/// 玩家生命与死亡复活组件：
/// 触碰陷阱/敌人时死亡，自动从 SaveManager 临时存档中恢复坐标、分数、Token与冲刺次数
/// </summary>
public class PlayerHealthRespawn : MonoBehaviour
{
    private PlayerController playerController;
    private readonly InvulnerabilityWindow respawnProtection = new InvulnerabilityWindow();
    public float respawnInvulnerability = 1.5f;

    private void Awake()
    {
        playerController = GetComponent<PlayerController>();
    }

    public void Die()
    {
        if (GameManager.Instance != null && GameManager.Instance.CurrentState == GameManager.GameState.LevelClear) return;
        if (!respawnProtection.TryStart(Time.time, respawnInvulnerability)) return;
        Debug.Log("[PlayerHealthRespawn] 玩家触发死亡！");
        EventBus.TriggerPlayerDied();

        RespawnAtLastCheckpoint();
    }

    public void RespawnAtLastCheckpoint()
    {
        if (SaveManager.Instance != null && SaveManager.Instance.TempData.isValid)
        {
            var temp = SaveManager.Instance.TempData;
            if (playerController != null) playerController.ResetMotion();
            transform.position = temp.respawnPosition;

            // 恢复属性
            if (playerController != null)
            {
                playerController.currentTokens = temp.tokensHeld;
                playerController.currentDashCharges = temp.dashChargesRemaining;
                playerController.isFirstDashFree = temp.firstDashFree;
                EventBus.TriggerTokenCountChanged(0, playerController.currentTokens);
                EventBus.TriggerDashChargeChanged(playerController.currentDashCharges, playerController.maxDashCharges);
            }

            // 恢复至保存点时的分数
            if (ScoreManager.Instance != null)
            {
                ScoreManager.Instance.SetScore(temp.scoreAtCheckpoint);
            }
            SaveManager.Instance.RestorePickups();
            SaveManager.Instance.RestoreMechanisms();

            Debug.Log($"[PlayerHealthRespawn] 已在检查点复活: {temp.respawnPosition}");
        }
        else
        {
            // 无检查点时在原地或初始点复活
            Debug.LogWarning("[PlayerHealthRespawn] 未找到有效检查点，无法回滚状态。");
        }

        if (GameManager.Instance != null)
        {
            var temp = SaveManager.Instance != null ? SaveManager.Instance.TempData : null;
            bool fast = temp != null && temp.wasFastPhase;
            GameManager.Instance.CurrentState = fast ? GameManager.GameState.FastPacedPhase : GameManager.GameState.SlowPacedPhase;
            GameManager.Instance.currentAIDifficulty = fast ? temp.aiDifficulty : 1f;
        }
        Physics2D.SyncTransforms();
        EventBus.TriggerPlayerRespawned();
    }

    private void OnTriggerEnter2D(Collider2D collision)
    {
        if (collision.CompareTag("Hazard") || collision.CompareTag("DeadZone"))
        {
            Die();
        }
    }

    private void OnTriggerStay2D(Collider2D collision) => OnTriggerEnter2D(collision);

    private void OnCollisionEnter2D(Collision2D collision)
    {
        if (collision.gameObject.CompareTag("Hazard"))
        {
            Die();
        }
    }

    private void OnCollisionStay2D(Collision2D collision) => OnCollisionEnter2D(collision);
}
