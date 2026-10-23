using UnityEngine;

/// <summary>
/// 房间入口保存点：
/// 玩家进入新房间时触发，向 SaveManager 写入临时存档点数据
/// </summary>
[RequireComponent(typeof(Collider2D))]
public class Checkpoint : MonoBehaviour, ICheckpointState
{
    [Header("Checkpoint Config")]
    public Transform respawnPoint;
    public bool isActivated = false;
    public bool useFlagVisual;

    [Header("Visual Feedback (Optional)")]
    public SpriteRenderer flagRenderer;
    public Color activeColor = Color.green;
    public Color inactiveColor = Color.gray;
    private LineRenderer flagOutline;
    private Material flagMaterial;
    private TextMesh confirmation;
    private float confirmationUntil;

    private void Start()
    {
        if (respawnPoint == null)
        {
            respawnPoint = transform;
        }

        if (useFlagVisual)
        {
            var placeholder = GetComponent<SpriteRenderer>();
            if (placeholder != null) placeholder.enabled = false;
            var flag = new GameObject("Checkpoint flag");
            flag.transform.SetParent(transform, false);
            flagOutline = flag.AddComponent<LineRenderer>();
            flagMaterial = new Material(Shader.Find("Sprites/Default"));
            flagOutline.sharedMaterial = flagMaterial;
            flagOutline.useWorldSpace = true;
            flagOutline.startWidth = flagOutline.endWidth = .065f;
            flagOutline.sortingOrder = 5;
            Vector3 top = transform.position + Vector3.up * .45f;
            flagOutline.positionCount = 5;
            flagOutline.SetPositions(new[] { transform.position + Vector3.down, top,
                top + new Vector3(.65f, -.2f), top + Vector3.down * .4f, top });
            confirmation = MechanismGuideVisuals.CreateLabel(transform, "检查点已保存",
                transform.position + Vector3.up * 2.3f, Color.white, .075f);
            confirmation.gameObject.SetActive(false);
        }
        UpdateFlag();
    }

    private void Update()
    {
        if (confirmation != null) confirmation.gameObject.SetActive(Time.time < confirmationUntil);
    }

    private void UpdateFlag()
    {
        Color color = isActivated ? activeColor : inactiveColor;
        if (flagRenderer != null) flagRenderer.color = color;
        if (flagOutline != null) flagOutline.startColor = flagOutline.endColor = color;
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
        if (isActivated) return;
        isActivated = true;
        confirmationUntil = Time.time + 1.6f;
        UpdateFlag();

        Vector3 spawnPos = respawnPoint != null ? respawnPoint.position : transform.position;

        int tokens = player != null ? player.currentTokens : 0;
        int dash = player != null ? player.currentDashCharges : 0;

        if (SaveManager.Instance != null)
        {
            SaveManager.Instance.UpdateTempCheckpoint(spawnPos, tokens, dash);
        }

        EventBus.TriggerCheckpointReached(spawnPos);
    }

    public object CaptureCheckpointState() => isActivated;

    public void RestoreCheckpointState(object state)
    {
        isActivated = (bool)state;
        confirmationUntil = 0f;
        UpdateFlag();
    }

    private void OnDestroy()
    {
        if (flagMaterial != null) Destroy(flagMaterial);
    }
}
