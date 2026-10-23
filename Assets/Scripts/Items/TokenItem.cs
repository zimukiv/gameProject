using UnityEngine;

/// <summary>
/// 普通 Token：+100 分，增加 1 Token 并贡献 1/3 冲刺充能。
/// </summary>
[RequireComponent(typeof(Collider2D))]
public class TokenItem : MonoBehaviour
{
    public int scoreAmount = 100;
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
