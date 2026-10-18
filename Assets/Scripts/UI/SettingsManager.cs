using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// 设置系统：声音音量调节与全屏/小窗切换
/// </summary>
public class SettingsManager : MonoBehaviour
{
    public static SettingsManager Instance { get; private set; }

    [Header("UI Bindings (Optional)")]
    public Slider volumeSlider;
    public Toggle fullscreenToggle;

    private const string PREF_VOLUME = "GameVolume";
    private const string PREF_FULLSCREEN = "GameFullscreen";

    private void Awake()
    {
        if (Instance != null && Instance != this)
        {
            Destroy(gameObject);
            return;
        }
        Instance = this;
        DontDestroyOnLoad(gameObject);

        LoadSettings();
    }

    private void Start()
    {
        if (volumeSlider != null)
        {
            volumeSlider.value = AudioListener.volume;
            volumeSlider.onValueChanged.AddListener(SetVolume);
        }

        if (fullscreenToggle != null)
        {
            fullscreenToggle.isOn = Screen.fullScreen;
            fullscreenToggle.onValueChanged.AddListener(SetFullscreen);
        }
    }

    public void SetVolume(float volume)
    {
        AudioListener.volume = Mathf.Clamp01(volume);
        PlayerPrefs.SetFloat(PREF_VOLUME, AudioListener.volume);
        PlayerPrefs.Save();
    }

    public void SetFullscreen(bool isFullscreen)
    {
        Screen.fullScreen = isFullscreen;
        PlayerPrefs.SetInt(PREF_FULLSCREEN, isFullscreen ? 1 : 0);
        PlayerPrefs.Save();
        Debug.Log($"[SettingsManager] 屏幕模式切换: {(isFullscreen ? "全屏" : "窗口化")}");
    }

    public void ToggleFullscreen()
    {
        SetFullscreen(!Screen.fullScreen);
        if (fullscreenToggle != null)
        {
            fullscreenToggle.isOn = Screen.fullScreen;
        }
    }

    private void LoadSettings()
    {
        float savedVol = PlayerPrefs.GetFloat(PREF_VOLUME, 1.0f);
        AudioListener.volume = savedVol;

        bool savedFull = PlayerPrefs.GetInt(PREF_FULLSCREEN, 1) == 1;
        Screen.fullScreen = savedFull;
    }
}
