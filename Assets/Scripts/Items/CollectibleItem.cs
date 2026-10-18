using UnityEngine;

/// <summary>
/// 收藏品：+10000 分。
/// 位于高难度/隐蔽区域，引领 AI 到达或玩家精妙操作获取。
/// </summary>
[RequireComponent(typeof(Collider2D))]
public class CollectibleItem : MonoBehaviour
{
    public int scoreAmount = 10000;
    public string collectibleName = "稀有论文初稿";

    [Header("AI 引领机制 (可选)")]
    public bool requiresAINearby = false;
    public float requiredAIDistance = 5.0f;

    public GameObject collectVFX;
    public AudioClip collectSFX;

    private void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Player"))
        {
            if (requiresAINearby)
            {
                // 检查场景中的 AI 距离
                var enemyAI = EnemyAI.Instance;
                if (enemyAI == null || Vector2.Distance(transform.position, enemyAI.transform.position) > requiredAIDistance)
                {
                    Debug.Log("[CollectibleItem] 尚未引领 AI 靠近，收藏品处于锁定保护状态！");
                    return;
                }
            }

            if (ScoreManager.Instance != null)
            {
                ScoreManager.Instance.AddScore(scoreAmount);
            }

            if (collectSFX != null)
            {
                AudioSource.PlayClipAtPoint(collectSFX, transform.position);
            }

            if (collectVFX != null)
            {
                Instantiate(collectVFX, transform.position, Quaternion.identity);
            }

            Debug.Log($"[CollectibleItem] 获得珍贵收藏品: {collectibleName} (+{scoreAmount}分)！");
            gameObject.SetActive(false);
        }
    }
}
