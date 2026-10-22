using UnityEngine;
using UnityEngine.UI;

/// <summary>Uses an installed CJK font for generated prototype UI across Windows, macOS and Linux.</summary>
public class UIFontBootstrap : MonoBehaviour
{
    private static Font runtimeFont;

    private void Awake()
    {
        if (runtimeFont == null)
        {
            string[] candidates = {
                "Microsoft YaHei UI", "Microsoft YaHei", "SimHei",
                "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Source Han Sans SC",
                "Arial"
            };
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
