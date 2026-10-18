using UnityEngine;
using UnityEngine.UI;

/// <summary>Uses an installed Windows CJK font for generated prototype UI.</summary>
public class UIFontBootstrap : MonoBehaviour
{
    private static Font runtimeFont;

    private void Awake()
    {
        if (runtimeFont == null)
        {
            string[] candidates = { "Microsoft YaHei UI", "Microsoft YaHei", "SimHei" };
            foreach (string candidate in candidates)
            {
                try
                {
                    runtimeFont = Font.CreateDynamicFontFromOSFont(candidate, 24);
                    if (runtimeFont != null) break;
                }
                catch { /* Try the next installed font. */ }
            }
        }
        if (runtimeFont == null) return;
        foreach (var label in GetComponentsInChildren<Text>(true)) label.font = runtimeFont;
    }
}
