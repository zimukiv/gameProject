using UnityEngine;

/// <summary>
/// 普通 Token：+100 分，充能 1 次冲刺，增加玩家持有 Token 数量
/// </summary>
[RequireComponent(typeof(Collider2D))]
public class TokenItem : MonoBehaviour
{
    public int scoreAmount = 100;
    public int dashRechargeAmount = 1;
    public int tokenAmount = 1;

    public GameObject collectVFX;
    public AudioClip collectSFX;

    private void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Player"))
        {
            PlayerController pc = other.GetComponent<PlayerController>();
            if (pc != null)
            {
                pc.RechargeDash(dashRechargeAmount);
                pc.AddTokens(tokenAmount);
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

            gameObject.SetActive(false);
        }
    }
}
