using System;
using System.Collections.Generic;
using UnityEngine;

// Identity of source components on an imported test object. This contains no gameplay behavior.
public sealed class LevelComponentIdMap : MonoBehaviour
{
    [Serializable]
    public sealed class Entry
    {
        public string componentId;
        public string typeId;
        public Component target;
    }

    [SerializeField] private List<Entry> entries = new List<Entry>();
    public IReadOnlyList<Entry> Entries => entries;

    public void Add(string componentId, string typeId, Component target)
    {
        if (string.IsNullOrEmpty(componentId) || string.IsNullOrEmpty(typeId) || target == null)
            throw new ArgumentException("Component identity requires an ID, type and target.");
        foreach (var entry in entries)
            if (entry.componentId == componentId)
                throw new InvalidOperationException("Duplicate component ID " + componentId);
        entries.Add(new Entry { componentId = componentId, typeId = typeId, target = target });
    }
}
