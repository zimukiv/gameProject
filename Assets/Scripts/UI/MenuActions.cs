using UnityEngine;
using UnityEngine.SceneManagement;

public class MenuActions : MonoBehaviour
{
    private void Start()
    {
        foreach (var slider in FindObjectsOfType<UnityEngine.UI.Slider>(true))
            slider.SetValueWithoutNotify(AudioListener.volume);
    }
    public void NewGame() { GameManager.Instance.StartNewGame(); }
    public void ContinueGame() { GameManager.Instance.ContinueGame(); }
    public void LoadLevel(int index)
    {
        if (LevelManager.Instance.GetLevelDisplayState(index, false) != LevelManager.LevelState.Locked)
            LevelManager.Instance.LoadLevel(index);
    }
    public void LoadLevel1() { LoadLevel(1); }
    public void LoadLevel2() { LoadLevel(2); }
    public void LoadLevel3() { LoadLevel(3); }
    public void SetVolume(float value) { SettingsManager.Instance.SetVolume(value); }
    public void ToggleFullscreen() { SettingsManager.Instance.ToggleFullscreen(); }
    public void Resume() { GameManager.Instance.ResumeGame(); }
    public void MainMenu()
    {
        Time.timeScale = 1f;
        SceneManager.LoadScene("MainMenu");
    }
    public void NextLevel()
    {
        int next = LevelManager.Instance.currentLevelIndex + 1;
        Time.timeScale = 1f;
        if (next <= LevelManager.TOTAL_LEVELS) LevelManager.Instance.LoadLevel(next);
        else SceneManager.LoadScene("MainMenu");
    }
}
