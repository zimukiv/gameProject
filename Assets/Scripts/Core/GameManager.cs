using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif
using UnityEngine.SceneManagement;

/// <summary>
/// 核心游戏状态机：管理游戏生命周期、两段节奏状态与暂停/恢复 (支持混合输入系统)
/// </summary>
public class GameManager : MonoBehaviour
{
    public static GameManager Instance { get; private set; }

    public enum GameState
    {
        MainMenu,
        SlowPacedPhase, // 慢节奏阶段：探索、收集 Token、寻找 AI 启动装置
        FastPacedPhase, // 快节奏阶段：AI 激活、追击、逃生与引领
        Paused,
        GameOver,
        LevelClear
    }

    [Header("State")]
    public GameState CurrentState = GameState.SlowPacedPhase;

    [Header("Pacing")]
    public float currentAIDifficulty = 1f;

    private GameState stateBeforePause;

    private void Awake()
    {
        if (Instance != null && Instance != this)
        {
            Destroy(gameObject);
            return;
        }
        Instance = this;
    }

    private void Start()
    {
        EventBus.OnAIActivated += HandleAIActivated;
        EventBus.OnPlayerDied += HandlePlayerDied;
    }

    private void OnDestroy()
    {
        EventBus.OnAIActivated -= HandleAIActivated;
        EventBus.OnPlayerDied -= HandlePlayerDied;
    }

    private void Update()
    {
        bool escPressed = false;
#if ENABLE_INPUT_SYSTEM
        var kb = Keyboard.current;
        if (kb != null)
        {
            escPressed = kb.escapeKey.wasPressedThisFrame;
        }
#endif
        if (!escPressed)
        {
            try
            {
                escPressed = Input.GetKeyDown(KeyCode.Escape);
            }
            catch { }
        }

        // ESC 暂停菜单逻辑
        if (escPressed)
        {
            if (CurrentState == GameState.Paused)
            {
                ResumeGame();
            }
            else if (CurrentState == GameState.SlowPacedPhase || CurrentState == GameState.FastPacedPhase)
            {
                PauseGame();
            }
        }
    }

    public void PauseGame()
    {
        stateBeforePause = CurrentState;
        CurrentState = GameState.Paused;
        Time.timeScale = 0f;
    }

    public void ResumeGame()
    {
        CurrentState = stateBeforePause;
        Time.timeScale = 1f;
    }

    private void HandleAIActivated(int consumedTokens, float difficulty)
    {
        CurrentState = GameState.FastPacedPhase;
        currentAIDifficulty = difficulty;
        Debug.Log($"[GameManager] 进入快节奏阶段！消耗Token: {consumedTokens}, 难度: {difficulty}");
    }

    private void HandlePlayerDied()
    {
        CurrentState = GameState.GameOver;
        Debug.Log("[GameManager] 玩家阵亡，准备从临时检查点读取存档复活。");
    }

    public void StartNewGame()
    {
        if (SaveManager.Instance != null)
        {
            SaveManager.Instance.ClearGlobalSave();
            SaveManager.Instance.ClearTempSave();
        }
        if (ScoreManager.Instance != null)
        {
            ScoreManager.Instance.ResetAllScore();
        }
        if (SaveManager.Instance != null) SaveManager.Instance.SaveGlobal();
        CurrentState = GameState.SlowPacedPhase;
        Time.timeScale = 1f;
        LevelManager.Instance?.LoadLevel(1);
    }

    public void ContinueGame()
    {
        if (SaveManager.Instance != null && SaveManager.Instance.GlobalData.hasSavedGame)
        {
            int targetLevel = SaveManager.Instance.GlobalData.highestUnlockedLevel;
            CurrentState = GameState.SlowPacedPhase;
            Time.timeScale = 1f;
            LevelManager.Instance?.LoadLevel(targetLevel);
        }
        else
        {
            StartNewGame();
        }
    }
}
