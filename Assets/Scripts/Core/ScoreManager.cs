using UnityEngine;

/// <summary>
/// 积分系统：管理跨关累计总分与各类得分规则
/// </summary>
public class ScoreManager : MonoBehaviour
{
    public static ScoreManager Instance { get; private set; }

    public const int TOKEN_SCORE = 100;
    public const int BIG_TOKEN_SCORE = 1000;
    public const int COLLECTIBLE_SCORE = 10000;
    public const int LEVEL_CLEAR_SCORE = 50000;

    [Header("Current Scores")]
    [SerializeField] private int totalScore = 0;

    public int TotalScore => totalScore;

    private void Awake()
    {
        if (Instance != null && Instance != this)
        {
            Destroy(gameObject);
            return;
        }
        Instance = this;
        DontDestroyOnLoad(gameObject);
        if (SaveManager.Instance != null && SaveManager.Instance.GlobalData.hasSavedGame)
        {
            totalScore = SaveManager.Instance.GlobalData.committedScore;
        }
    }

    public void AddScore(int amount)
    {
        totalScore += amount;
        EventBus.TriggerScoreChanged(amount, totalScore);

        if (SaveManager.Instance != null)
        {
            SaveManager.Instance.GlobalData.currentScore = totalScore;
            SaveManager.Instance.SaveLiveScore();
        }
    }

    public void DeductScore(int amount)
    {
        totalScore = Mathf.Max(0, totalScore - amount);
        EventBus.TriggerScoreChanged(-amount, totalScore);

        if (SaveManager.Instance != null)
        {
            SaveManager.Instance.GlobalData.currentScore = totalScore;
            SaveManager.Instance.SaveLiveScore();
        }
    }

    public void SetScore(int score)
    {
        totalScore = score;
        EventBus.TriggerScoreChanged(0, totalScore);

        if (SaveManager.Instance != null)
        {
            SaveManager.Instance.GlobalData.currentScore = totalScore;
            SaveManager.Instance.SaveLiveScore();
        }
    }

    public void ResetAllScore()
    {
        totalScore = 0;
        if (SaveManager.Instance != null) SaveManager.Instance.GlobalData.currentScore = 0;
        EventBus.TriggerScoreChanged(0, totalScore);
    }
}
