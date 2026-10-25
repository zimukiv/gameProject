using UnityEngine;

// Identity/configuration marker for public runner objects reconstructed by V3.
// It does not alter gameplay or replace a verified runner prefab/template.
public sealed class LevelRunnerBindingV3 : MonoBehaviour
{
    [SerializeField] string templateSlot;
    [SerializeField] string configPath;

    public string TemplateSlot => templateSlot;
    public string ConfigPath => configPath;

    public void Set(string slot, string path)
    {
        templateSlot = slot;
        configPath = path;
    }
}
