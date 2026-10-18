using System;
using System.Collections.Generic;

/// <summary>Independent timed effects; reapplying one source refreshes its duration.</summary>
public sealed class TimedSpeedModifiers
{
    private struct Effect
    {
        public float multiplier;
        public float expiresAt;
    }

    private readonly Dictionary<object, Effect> effects = new Dictionary<object, Effect>();
    private readonly List<object> expired = new List<object>();

    public void Apply(object source, float multiplier, float duration, float now)
    {
        if (source == null) throw new ArgumentNullException(nameof(source));
        if (multiplier <= 0f || float.IsNaN(multiplier) || float.IsInfinity(multiplier))
            throw new ArgumentOutOfRangeException(nameof(multiplier));
        if (duration <= 0f || float.IsNaN(duration) || float.IsInfinity(duration))
            throw new ArgumentOutOfRangeException(nameof(duration));
        effects[source] = new Effect { multiplier = multiplier, expiresAt = now + duration };
    }

    public float GetMultiplier(float now)
    {
        float result = 1f;
        expired.Clear();
        foreach (var pair in effects)
        {
            if (now >= pair.Value.expiresAt) expired.Add(pair.Key);
            else result *= pair.Value.multiplier;
        }
        foreach (var source in expired) effects.Remove(source);
        return result;
    }

    public void Remove(object source) { if (source != null) effects.Remove(source); }
    public void Clear() { effects.Clear(); expired.Clear(); }
}
