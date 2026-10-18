using System;

internal static class Program
{
    private static int checks;

    private static void Equal(float expected, float actual, string scenario)
    {
        checks++;
        if (Math.Abs(expected - actual) > .0001f)
            throw new Exception($"{scenario}: expected {expected}, got {actual}");
    }

    private static void Reject(Action action, string scenario)
    {
        checks++;
        try { action(); }
        catch (ArgumentException) { return; }
        throw new Exception($"{scenario}: invalid effect was accepted");
    }

    private static void Main()
    {
        var effects = new TimedSpeedModifiers();
        object boost = new object(), slow = new object();
        Equal(1f, effects.GetMultiplier(0f), "No active effects");

        effects.Apply(boost, 1.6f, 3f, 0f);
        effects.Apply(slow, .65f, 1.5f, 0f);
        Equal(1.04f, effects.GetMultiplier(1f), "Boost and slowdown overlap");
        Equal(1.6f, effects.GetMultiplier(1.5f), "Slowdown expires first");
        Equal(1f, effects.GetMultiplier(3f), "All effects expire");

        effects.Apply(boost, 1.6f, 1f, 10f);
        effects.Apply(slow, .65f, 3f, 10f);
        Equal(.65f, effects.GetMultiplier(11f), "Boost expires first");
        Equal(1f, effects.GetMultiplier(13f), "No stale boosted speed");

        effects.Apply(boost, 1.6f, 2f, 20f);
        effects.Apply(boost, 1.6f, 2f, 21f);
        Equal(1.6f, effects.GetMultiplier(22f), "Same block refreshes rather than stacks");
        Equal(1.6f, effects.GetMultiplier(22f), "Paused clock leaves duration unchanged");
        Equal(1f, effects.GetMultiplier(23f), "Refreshed effect eventually expires");

        effects.Apply(boost, 1.6f, 2f, 30f);
        effects.Apply(slow, .65f, 2f, 30f);
        effects.Remove(slow);
        Equal(1.6f, effects.GetMultiplier(30f), "Removing one source preserves the other");
        effects.Apply(boost, 1.2f, 2f, 30f);
        Equal(1.2f, effects.GetMultiplier(30f), "Updated source replaces its multiplier");
        effects.Clear();
        Equal(1f, effects.GetMultiplier(30f), "Death clears every active effect");

        Reject(() => effects.Apply(null, 1f, 1f, 0f), "Missing source");
        Reject(() => effects.Apply(boost, float.NaN, 1f, 0f), "NaN speed");
        Reject(() => effects.Apply(boost, 1f, 0f, 0f), "Zero duration");
        Reject(() => effects.Apply(boost, 1f, float.PositiveInfinity, 0f), "Infinite duration");
        Console.WriteLine($"Speed modifier regressions passed: {checks} assertions.");
    }
}
