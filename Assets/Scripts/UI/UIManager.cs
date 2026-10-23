using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// 统一 UI 管理器：
/// - HUD (累计总分、Token 持有量、单槽冲刺与三 Token 充能进度)
/// - ESC 暂停菜单与设置面板
/// - 主菜单及 3 关解锁状态渲染（新游戏高亮第1关/灰度其余，继续游戏已通彩色/高亮最新/未解锁灰色）
/// </summary>
public class UIManager : MonoBehaviour
{
    public static UIManager Instance { get; private set; }

    [Header("In-Game HUD")]
    public GameObject hudRoot;
    public Text totalScoreText;
    public Text tokenCountText;
    public Image[] dashChargeSlots;
    public Text dashStatusText;
    public Text phaseText;
    public GameObject levelCompletePanel;
    public Text completionScoreText;
    public Color dashSlotActiveColor = Color.cyan;
    public Color dashSlotEmptyColor = new Color(0.3f, 0.3f, 0.3f, 0.5f);

    [Header("Pause Menu")]
    public GameObject pauseMenuPanel;
    public GameObject settingsPanel;

    [Header("Main Menu & Level Selection")]
    public GameObject mainMenuRoot;
    public Button continueGameButton;
    public Button newGameButton;
    public Text bestScoreText;
    public Image[] levelCards; // 对应 Level 1, Level 2, Level 3
    public Color levelHighlightColor = Color.yellow;
    public Color levelClearedColor = Color.green;
    public Color levelLockedColor = Color.gray;

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
        // 注册事件
        EventBus.OnScoreChanged += UpdateScoreUI;
        EventBus.OnTokenCountChanged += UpdateTokenUI;
        EventBus.OnDashChargeChanged += UpdateDashUI;
        EventBus.OnAIActivated += UpdatePhaseUI;
        EventBus.OnLevelCompleted += ShowLevelComplete;
        EventBus.OnPlayerRespawned += RefreshPhaseUI;

        // 初始化主菜单显示
        RefreshMainMenuButtons();
        RefreshPhaseUI();
        if (ScoreManager.Instance != null) UpdateScoreUI(0, ScoreManager.Instance.TotalScore);
        if (PlayerController.Instance != null)
        {
            UpdateTokenUI(0, PlayerController.Instance.currentTokens);
            UpdateDashUI(PlayerController.Instance.currentDashCharges, PlayerController.Instance.maxDashCharges);
        }
    }

    private void OnDestroy()
    {
        EventBus.OnScoreChanged -= UpdateScoreUI;
        EventBus.OnTokenCountChanged -= UpdateTokenUI;
        EventBus.OnDashChargeChanged -= UpdateDashUI;
        EventBus.OnAIActivated -= UpdatePhaseUI;
        EventBus.OnLevelCompleted -= ShowLevelComplete;
        EventBus.OnPlayerRespawned -= RefreshPhaseUI;
    }

    private void Update()
    {
        // 监听暂停面板同步
        if (GameManager.Instance != null && pauseMenuPanel != null)
        {
            bool isPaused = GameManager.Instance.CurrentState == GameManager.GameState.Paused;
            if (pauseMenuPanel.activeSelf != isPaused && (settingsPanel == null || !settingsPanel.activeSelf))
            {
                pauseMenuPanel.SetActive(isPaused);
            }
        }
    }

    #region HUD Updates
    private void UpdateScoreUI(int delta, int total)
    {
        if (totalScoreText != null)
        {
            totalScoreText.text = $"SCORE: {total}";
        }
    }

    private void UpdateTokenUI(int delta, int current)
    {
        if (tokenCountText != null)
        {
            tokenCountText.text = $"TOKENS: {current}";
        }
    }

    private void UpdateDashUI(int current, int max)
    {
        if (dashChargeSlots != null)
        for (int i = 0; i < dashChargeSlots.Length; i++)
        {
            if (dashChargeSlots[i] != null)
            {
                dashChargeSlots[i].gameObject.SetActive(i < max);
                dashChargeSlots[i].color = (i < current) ? dashSlotActiveColor : dashSlotEmptyColor;
            }
        }
        UpdateDashStatus();
    }

    private void UpdateDashStatus()
    {
        if (dashStatusText == null) return;
        var player = PlayerController.Instance;
        int progress = player != null ? player.dashChargeProgress : 0;
        bool ready = player != null && player.currentDashCharges > 0;
        dashStatusText.text = ready ? "冲刺 1/1 · Shift 水平冲刺" : $"冲刺 0/1 · 充能 {progress}/{DashChargeMeter.TokensPerCharge}";
    }

    private void UpdatePhaseUI(int tokens, float difficulty)
    {
        if (phaseText != null) phaseText.text = "AI 已启动 · 尽快抵达出口";
    }

    private void RefreshPhaseUI()
    {
        bool fast = GameManager.Instance != null && GameManager.Instance.CurrentState == GameManager.GameState.FastPacedPhase;
        if (phaseText != null) phaseText.text = fast ? "AI 已启动 · 尽快抵达出口" : "探索 · 收集 Token";
    }

    private void ShowLevelComplete(int level)
    {
        if (completionScoreText != null && ScoreManager.Instance != null)
            completionScoreText.text = "累计得分  " + ScoreManager.Instance.TotalScore.ToString("N0");
        if (levelCompletePanel != null) levelCompletePanel.SetActive(true);
    }
    #endregion

    #region Main Menu Level Selection
    public void RefreshMainMenuButtons()
    {
        bool hasSave = SaveManager.Instance != null && SaveManager.Instance.GlobalData.hasSavedGame;
        if (bestScoreText != null && SaveManager.Instance != null)
            bestScoreText.text = "最高得分  " + SaveManager.Instance.GlobalData.highScore.ToString("N0");
        if (continueGameButton != null)
        {
            continueGameButton.gameObject.SetActive(hasSave);
        }

        UpdateLevelSelectionCards(isNewGame: !hasSave);
    }

    public void UpdateLevelSelectionCards(bool isNewGame)
    {
        if (levelCards == null || levelCards.Length == 0 || LevelManager.Instance == null) return;

        for (int i = 0; i < levelCards.Length; i++)
        {
            int levelIndex = i + 1;
            LevelManager.LevelState state = LevelManager.Instance.GetLevelDisplayState(levelIndex, isNewGame);

            if (levelCards[i] != null)
            {
                switch (state)
                {
                    case LevelManager.LevelState.ActiveLatest:
                        levelCards[i].color = levelHighlightColor;
                        break;
                    case LevelManager.LevelState.Unlocked:
                        levelCards[i].color = levelClearedColor;
                        break;
                    case LevelManager.LevelState.Locked:
                        levelCards[i].color = levelLockedColor;
                        break;
                }
            }
        }
    }
    #endregion

    #region UI Button Callbacks
    public void OnClickResume()
    {
        GameManager.Instance?.ResumeGame();
        if (pauseMenuPanel != null) pauseMenuPanel.SetActive(false);
        if (settingsPanel != null) settingsPanel.SetActive(false);
    }

    public void OnClickOpenSettings()
    {
        if (settingsPanel != null) settingsPanel.SetActive(true);
    }

    public void OnClickCloseSettings()
    {
        if (settingsPanel != null) settingsPanel.SetActive(false);
    }

    public void OnClickNewGame()
    {
        UpdateLevelSelectionCards(isNewGame: true);
        GameManager.Instance?.StartNewGame();
    }

    public void OnClickContinueGame()
    {
        UpdateLevelSelectionCards(isNewGame: false);
        GameManager.Instance?.ContinueGame();
    }
    #endregion
}
