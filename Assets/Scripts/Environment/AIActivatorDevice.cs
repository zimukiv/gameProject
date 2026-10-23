using UnityEngine;

/// <summary>
/// AI 启动装置：
/// 关卡快慢两段的分水岭。
/// 玩家触碰/交互后，消耗当前持有的所有 Token 为 AI 充能并激活对应难度，进入快节奏追击/逃生。
/// </summary>
[RequireComponent(typeof(Collider2D))]
public class AIActivatorDevice : MonoBehaviour, ICheckpointState
{
    [Header("Activation Config")]
    public bool isActivated = false;
    public KeyCode interactKey = KeyCode.E;
    public bool autoActivateOnContact = false;
    public bool showInteractionGuide;

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
    private TextMesh guide;
    private LineRenderer coreOutline;
    private Material coreMaterial;
    private string lastGuideText;

    private void Start()
    {
        if (!showInteractionGuide) return;
        if (deviceRenderer != null) deviceRenderer.enabled = false;
        var frame = new GameObject("AI core frame");
        frame.transform.SetParent(transform, false);
        coreOutline = frame.AddComponent<LineRenderer>();
        coreMaterial = new Material(Shader.Find("Sprites/Default"));
        coreOutline.sharedMaterial = coreMaterial;
        coreOutline.useWorldSpace = true;
        coreOutline.loop = true;
        coreOutline.positionCount = 6;
        coreOutline.startWidth = coreOutline.endWidth = .07f;
        coreOutline.sortingOrder = 5;
        for (int i = 0; i < 6; i++)
        {
            float angle = i * Mathf.PI / 3;
            coreOutline.SetPosition(i, transform.position + new Vector3(Mathf.Cos(angle) * .55f, Mathf.Sin(angle) * .65f));
        }
        MechanismGuideVisuals.CreateLabel(transform, "AI", transform.position, Color.white, .1f);
        guide = MechanismGuideVisuals.CreateLabel(transform, "", transform.position + Vector3.up * 1.35f,
            Color.white, .075f);
    }

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

    private void OnTriggerStay2D(Collider2D other)
    {
        if (other.CompareTag("Player") && !isActivated)
        {
            playerInRange = true;
            if (cachedPlayer == null) cachedPlayer = other.GetComponent<PlayerController>();

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
            if (GameInput.WasPressed(interactKey))
            {
                TryActivateFromInteraction();
            }
        }
        if (guide != null)
        {
            string text = isActivated ? "追逐已启动 →" : playerInRange
                ? "[" + interactKey + "] 启动 AI\n消耗全部 Token，开始追逐"
                : autoActivateOnContact ? "AI 启动器\n接触后开始追逐" : "AI 启动器\n靠近按 " + interactKey + "，准备后再出发";
            if (text != lastGuideText) { guide.text = text; lastGuideText = text; }
            Color color = isActivated ? new Color(1f, .6f, .25f) : new Color(.8f, .6f, 1f);
            guide.color = color;
            coreOutline.startColor = coreOutline.endColor = color;
        }
    }

    private bool CanActivateNow() => Time.timeScale > 0f && (GameManager.Instance == null ||
        GameManager.Instance.CurrentState == GameManager.GameState.SlowPacedPhase ||
        GameManager.Instance.CurrentState == GameManager.GameState.FastPacedPhase);

    public bool TryActivateFromInteraction()
    {
        if (!playerInRange || isActivated || autoActivateOnContact || !CanActivateNow()) return false;
        TriggerActivation();
        return isActivated;
    }

    public void TriggerActivation()
    {
        if (isActivated || !CanActivateNow()) return;
        if (cachedPlayer == null) cachedPlayer = PlayerController.Instance;
        if (cachedPlayer == null) return;

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

    public object CaptureCheckpointState() => (isActivated, deviceRenderer != null ? deviceRenderer.color : Color.cyan,
        activeVFX != null && activeVFX.activeSelf);

    public void RestoreCheckpointState(object state)
    {
        var saved = ((bool activated, Color color, bool vfx))state;
        isActivated = saved.activated;
        playerInRange = false;
        cachedPlayer = null;
        if (activationAudio != null) activationAudio.Stop();
        if (deviceRenderer != null) deviceRenderer.color = saved.color;
        if (activeVFX != null) activeVFX.SetActive(saved.vfx);
    }

    private void OnDestroy()
    {
        if (coreMaterial != null) Destroy(coreMaterial);
    }
}
