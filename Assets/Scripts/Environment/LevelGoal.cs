using UnityEngine;
using UnityEngine.SceneManagement;

/// <summary>
/// 终点通关门/旗帜：
/// 玩家触碰后触发 LevelManager 结算通关奖励 (+50000分)，并向 EventBus 广播通关事件
/// </summary>
[RequireComponent(typeof(BoxCollider2D))]
public class LevelGoal : MonoBehaviour
{
    [Header("Goal Config")]
    public int nextLevelIndex = 2;
    public bool autoLoadNextLevel = false;
    public bool requiresAIActivation = true;
    public float delayBeforeNextLevel = 2.0f;

    [Header("Visual Feedback")]
    public SpriteRenderer goalRenderer;
    public Color completedColor = Color.green;
    private bool isCleared = false;

    private void Awake()
    {
        var col = GetComponent<BoxCollider2D>();
        col.isTrigger = true;
    }

    private void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Player") && !isCleared &&
            (!requiresAIActivation || (GameManager.Instance != null && GameManager.Instance.CurrentState == GameManager.GameState.FastPacedPhase)))
        {
            TriggerClear();
        }
    }

    public void TriggerClear()
    {
        isCleared = true;
        if (goalRenderer != null) goalRenderer.color = completedColor;

        Debug.Log("[LevelGoal] 🎉 恭喜通关当前关卡！");
        LevelManager.Instance?.CompleteCurrentLevel();
        if (GameManager.Instance != null) GameManager.Instance.CurrentState = GameManager.GameState.LevelClear;

        if (autoLoadNextLevel && LevelManager.Instance != null)
        {
            Invoke(nameof(LoadNext), delayBeforeNextLevel);
        }
    }

    private void LoadNext()
    {
        if (nextLevelIndex > LevelManager.TOTAL_LEVELS) SceneManager.LoadScene("MainMenu");
        else LevelManager.Instance?.LoadLevel(nextLevelIndex);
    }
}
