using System;
using System.IO;
using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// 全局与临时双档位保存系统
/// </summary>
public class SaveManager : MonoBehaviour
{
    public static SaveManager Instance { get; private set; }

    [System.Serializable]
    public class GlobalSaveData
    {
        public int highestUnlockedLevel = 1; // 1 ~ 3
        public bool isGameFullyCompleted = false;
        public int currentScore = 0;
        public int committedScore = 0;
        public int highScore = 0;
        public bool hasSavedGame = false;
    }

    [System.Serializable]
    public class TempSaveData
    {
        public bool isValid = false;
        public Vector3 respawnPosition;
        public int scoreAtCheckpoint;
        public int tokensHeld;
        public int dashChargesRemaining;
        public int currentLevelIndex = 1;
        public bool firstDashFree;
        public bool wasFastPhase;
        public float aiDifficulty = 1f;
    }

    public GlobalSaveData GlobalData = new GlobalSaveData();
    public TempSaveData TempData = new TempSaveData();
    private readonly Dictionary<GameObject, bool> pickupSnapshot = new Dictionary<GameObject, bool>();

    private string globalSavePath;

    private void Awake()
    {
        if (Instance != null && Instance != this)
        {
            Destroy(gameObject);
            return;
        }
        Instance = this;
        DontDestroyOnLoad(gameObject);

        globalSavePath = Path.Combine(Application.persistentDataPath, "minigame_globalsave.json");
        LoadGlobalSave();
    }

    #region 全局保存逻辑
    public void LoadGlobalSave()
    {
        if (File.Exists(globalSavePath))
        {
            try
            {
                string json = File.ReadAllText(globalSavePath);
                GlobalData = JsonUtility.FromJson<GlobalSaveData>(json);
                if (GlobalData == null) throw new InvalidDataException("Empty save data");
                GlobalData.highestUnlockedLevel = Mathf.Clamp(GlobalData.highestUnlockedLevel, 1, LevelManager.TOTAL_LEVELS);
                GlobalData.currentScore = Mathf.Max(0, GlobalData.currentScore);
                if (GlobalData.committedScore == 0 &&
                    (GlobalData.highestUnlockedLevel > 1 || GlobalData.isGameFullyCompleted))
                    GlobalData.committedScore = GlobalData.currentScore;
                GlobalData.committedScore = Mathf.Clamp(GlobalData.committedScore, 0, GlobalData.currentScore);
                GlobalData.highScore = Mathf.Max(GlobalData.currentScore, GlobalData.highScore);
            }
            catch (Exception ex)
            {
                Debug.LogError($"[SaveManager] 读取全局存档失败: {ex.Message}");
                GlobalData = new GlobalSaveData();
            }
        }
        else
        {
            GlobalData = new GlobalSaveData { hasSavedGame = false };
        }
    }

    public void SaveGlobal()
    {
        GlobalData.hasSavedGame = true;
        if (GlobalData.currentScore > GlobalData.highScore)
        {
            GlobalData.highScore = GlobalData.currentScore;
        }

        try
        {
            WriteGlobalAtomically();
            Debug.Log("[SaveManager] 全局存档已写入。");
        }
        catch (Exception ex)
        {
            Debug.LogError($"[SaveManager] 写入全局存档失败: {ex.Message}");
        }
    }

    public void SaveLiveScore()
    {
        if (GlobalData.hasSavedGame) SaveGlobal();
    }

    public void ClearGlobalSave()
    {
        int best = GlobalData != null ? GlobalData.highScore : 0;
        GlobalData = new GlobalSaveData { highScore = best, hasSavedGame = false };
        try
        {
            WriteGlobalAtomically();
        }
        catch (Exception ex) { Debug.LogError("[SaveManager] Failed to reset run: " + ex.Message); }
    }

    private void WriteGlobalAtomically()
    {
        string stagingPath = globalSavePath + ".new";
        Directory.CreateDirectory(Path.GetDirectoryName(globalSavePath));
        File.WriteAllText(stagingPath, JsonUtility.ToJson(GlobalData, true));
        if (File.Exists(globalSavePath)) File.Replace(stagingPath, globalSavePath, null);
        else File.Move(stagingPath, globalSavePath);
    }
    #endregion

    #region 临时保存逻辑 (检查点)
    public void InitTempSave(Vector3 startPos, int startLevelIndex)
    {
        TempData.isValid = true;
        TempData.respawnPosition = startPos;
        TempData.scoreAtCheckpoint = ScoreManager.Instance != null ? ScoreManager.Instance.TotalScore : 0;
        TempData.tokensHeld = 0;
        TempData.dashChargesRemaining = 3;
        TempData.currentLevelIndex = startLevelIndex;
        TempData.firstDashFree = true;
        TempData.wasFastPhase = false;
        TempData.aiDifficulty = 1f;
        CapturePickups();
    }

    public void UpdateTempCheckpoint(Vector3 checkpointPos, int currentTokens, int currentDashCharges)
    {
        TempData.isValid = true;
        TempData.respawnPosition = checkpointPos;
        TempData.scoreAtCheckpoint = ScoreManager.Instance != null ? ScoreManager.Instance.TotalScore : 0;
        TempData.tokensHeld = currentTokens;
        TempData.dashChargesRemaining = currentDashCharges;
        TempData.firstDashFree = PlayerController.Instance != null && PlayerController.Instance.isFirstDashFree;
        TempData.wasFastPhase = GameManager.Instance != null && GameManager.Instance.CurrentState == GameManager.GameState.FastPacedPhase;
        TempData.aiDifficulty = GameManager.Instance != null ? GameManager.Instance.currentAIDifficulty : 1f;
        CapturePickups();
        Debug.Log($"[SaveManager] 临时存档更新点: {checkpointPos}, Tokens: {currentTokens}, Dash: {currentDashCharges}");
    }

    public void ClearTempSave()
    {
        TempData = new TempSaveData();
        pickupSnapshot.Clear();
    }

    private void CapturePickups()
    {
        pickupSnapshot.Clear();
        foreach (var go in Resources.FindObjectsOfTypeAll<GameObject>())
        {
            if (!go.scene.IsValid()) continue;
            if (go.GetComponent<TokenItem>() != null || go.GetComponent<BigTokenItem>() != null || go.GetComponent<CollectibleItem>() != null)
                pickupSnapshot[go] = go.activeSelf;
        }
    }

    public void RestorePickups()
    {
        foreach (var pair in pickupSnapshot)
            if (pair.Key != null) pair.Key.SetActive(pair.Value);
    }
    #endregion
}
