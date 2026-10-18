using UnityEngine;

/// <summary>
/// AI 启动装置：
/// 关卡快慢两段的分水岭。
/// 玩家触碰/交互后，消耗当前持有的所有 Token 为 AI 充能并激活对应难度，进入快节奏追击/逃生。
/// </summary>
[RequireComponent(typeof(Collider2D))]
public class AIActivatorDevice : MonoBehaviour
{
    [Header("Activation Config")]
    public bool isActivated = false;
    public KeyCode interactKey = KeyCode.E;
    public bool autoActivateOnContact = false;

    [Header("Difficulty Formula")]
    public float baseDifficulty = 1.0f;
    public float difficultyPerToken = 0.1f; // 投入 Token 越多，AI 能力/难度系数越高

    [Header("Feedback")]
    public GameObject activeVFX;
    public AudioSource activationAudio;
    public SpriteRenderer deviceRenderer;
    public Color activeColor = Color.cyan;

    private bool playerInRange = false;
    private PlayerController cachedPlayer;

    private void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Player") && !isActivated)
        {
            playerInRange = true;
            cachedPlayer = other.GetComponent<PlayerController>();

            if (autoActivateOnContact)
            {
                TriggerActivation();
            }
        }
    }

    private void OnTriggerExit2D(Collider2D other)
    {
        if (other.CompareTag("Player"))
        {
            playerInRange = false;
            cachedPlayer = null;
        }
    }

    private void Update()
    {
        if (playerInRange && !isActivated && !autoActivateOnContact)
        {
            if (Input.GetKeyDown(interactKey))
            {
                TriggerActivation();
            }
        }
    }

    public void TriggerActivation()
    {
        if (isActivated || cachedPlayer == null) return;

        isActivated = true;
        int tokens = cachedPlayer.ConsumeAllTokens();
        float calculatedDifficulty = baseDifficulty + (tokens * difficultyPerToken);

        if (activeVFX != null) activeVFX.SetActive(true);
        if (activationAudio != null) activationAudio.Play();
        if (deviceRenderer != null) deviceRenderer.color = activeColor;

        EventBus.TriggerAIActivated(tokens, calculatedDifficulty);
        Debug.Log($"[AIActivatorDevice] AI 装置已启动！消耗 Token: {tokens}, 最终难度: {calculatedDifficulty}");
    }

    public void ResetActivation()
    {
        isActivated = false;
        playerInRange = false;
        cachedPlayer = null;
        if (activeVFX != null) activeVFX.SetActive(false);
        if (deviceRenderer != null) deviceRenderer.color = Color.cyan;
    }
}
