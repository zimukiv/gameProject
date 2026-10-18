using System;
using UnityEngine;
using UnityEngine.SceneManagement;

/// <summary>
/// 关卡管理器：管理3关流程、解锁状态及通关高亮显示逻辑
/// </summary>
public class LevelManager : MonoBehaviour
{
    public static LevelManager Instance { get; private set; }

    public const int TOTAL_LEVELS = 3;

    [Header("Current Level")]
    public int currentLevelIndex = 1;

    public enum LevelState
    {
        Locked,       // 灰色
        Unlocked,     // 彩色（已通过）
        ActiveLatest  // 高亮（最新可玩）
    }

    private void Awake()
    {
        if (Instance != null && Instance != this)
        {
            Destroy(gameObject);
            return;
        }
        Instance = this;
        DontDestroyOnLoad(gameObject);
    }

    /// <summary>
    /// 获取指定关卡在关卡选择界面的显示状态
    /// </summary>
    public LevelState GetLevelDisplayState(int levelIndex, bool isNewGame)
    {
        if (isNewGame)
        {
            if (levelIndex == 1) return LevelState.ActiveLatest;
            return LevelState.Locked;
        }

        var globalSave = SaveManager.Instance != null ? SaveManager.Instance.GlobalData : null;
        if (globalSave == null || !globalSave.hasSavedGame)
        {
            return levelIndex == 1 ? LevelState.ActiveLatest : LevelState.Locked;
        }

        if (globalSave.isGameFullyCompleted)
        {
            // 若已完整通关则均为彩色
            return LevelState.Unlocked;
        }

        // 若未完整通关
        if (levelIndex < globalSave.highestUnlockedLevel)
        {
            return LevelState.Unlocked; // 已通过关卡为彩色
        }
        else if (levelIndex == globalSave.highestUnlockedLevel)
        {
            return LevelState.ActiveLatest; // 高亮最新关卡
        }
        else
        {
            return LevelState.Locked; // 未解锁关卡为灰色
        }
    }

    /// <summary>
    /// 触发关卡通关
    /// </summary>
    public void CompleteCurrentLevel()
    {
        // 通关 +50000
        if (ScoreManager.Instance != null)
        {
            ScoreManager.Instance.AddScore(ScoreManager.LEVEL_CLEAR_SCORE);
        }

        EventBus.TriggerLevelCompleted(currentLevelIndex);

        if (SaveManager.Instance != null)
        {
            var data = SaveManager.Instance.GlobalData;
            data.committedScore = data.currentScore;
            if (currentLevelIndex >= TOTAL_LEVELS)
            {
                data.isGameFullyCompleted = true;
                Debug.Log("[LevelManager] 恭喜全关卡通关！");
            }
            else
            {
                data.highestUnlockedLevel = Mathf.Max(data.highestUnlockedLevel, currentLevelIndex + 1);
            }
            SaveManager.Instance.SaveGlobal();
        }
    }

    public void LoadLevel(int levelIndex)
    {
        if (levelIndex < 1 || levelIndex > TOTAL_LEVELS) return;
        if (SaveManager.Instance != null && ScoreManager.Instance != null)
            ScoreManager.Instance.SetScore(SaveManager.Instance.GlobalData.committedScore);
        currentLevelIndex = levelIndex;
        // 实际项目可根据命名载入如 "Level1", "Level2", "Level3"
        string sceneName = "Level" + levelIndex;
        Debug.Log($"[LevelManager] 加载关卡场景: {sceneName}");
        if (Application.CanStreamedLevelBeLoaded(sceneName))
        {
            SceneManager.LoadScene(sceneName);
        }
    }
}
