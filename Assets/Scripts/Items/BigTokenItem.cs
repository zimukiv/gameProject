using UnityEngine;

/// <summary>
/// 大 Token：+1000 分，充能 2 次冲刺，增加玩家 5 个 Token
/// </summary>
[RequireComponent(typeof(Collider2D))]
public class BigTokenItem : MonoBehaviour
{
    public int scoreAmount = 1000;
    public int dashRechargeAmount = 2;
    public int tokenAmount = 5;

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
