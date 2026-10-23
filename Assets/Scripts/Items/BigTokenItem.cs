using UnityEngine;

/// <summary>
/// 大 Token：+1000 分，增加 5 Token；充能遵循同一套单槽上限规则。
/// </summary>
[RequireComponent(typeof(Collider2D))]
public class BigTokenItem : MonoBehaviour
{
    public int scoreAmount = 1000;
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
