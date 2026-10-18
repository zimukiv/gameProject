using UnityEngine;

/// <summary>Allows a generated level to be played directly from the editor.</summary>
public class SceneBootstrap : MonoBehaviour
{
    public int levelIndex = 1;
    public Vector3 spawnPosition = new Vector3(-8, -2.3f, 0);

    private void Awake()
    {
        Ensure<SaveManager>("Save Manager");
        Ensure<ScoreManager>("Score Manager");
        Ensure<LevelManager>("Level Manager");
        Ensure<SettingsManager>("Settings Manager");
        Ensure<GameManager>("Game Manager");
        if (levelIndex > 0)
        {
            LevelManager.Instance.currentLevelIndex = levelIndex;
            GameManager.Instance.CurrentState = GameManager.GameState.SlowPacedPhase;
        }
        else GameManager.Instance.CurrentState = GameManager.GameState.MainMenu;
        Time.timeScale = 1f;
    }

    private void Start()
    {
        if (levelIndex > 0)
        {
            SaveManager.Instance.InitTempSave(spawnPosition, levelIndex);
            if (levelIndex == 3) AttendanceBlock.ResetAttendance();
        }
    }

    private static void Ensure<T>(string objectName) where T : MonoBehaviour
    {
        if (FindObjectOfType<T>() == null) new GameObject(objectName).AddComponent<T>();
    }
}
