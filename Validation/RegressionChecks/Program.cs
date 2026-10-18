using System;

internal static class Program
{
    private static int checks;

    private static void Equal(float expected, float actual, string scenario)
    {
        checks++;
        if (float.IsNaN(actual) || Math.Abs(expected - actual) > .0001f)
            throw new Exception($"{scenario}: expected {expected}, got {actual}");
    }

    private static void Reject(Action action, string scenario)
    {
        checks++;
        try { action(); }
        catch (ArgumentException) { return; }
        throw new Exception($"{scenario}: invalid effect was accepted");
    }

    private static void Check(bool condition, string scenario)
    {
        checks++;
        if (!condition) throw new Exception(scenario);
    }

    private static void CheckSavedProgress()
    {
        var data = new GlobalSaveData { highestUnlockedLevel = 3, currentScore = 99500,
            committedScore = 100000, highScore = 100000, hasSavedGame = true };
        data.Normalize(3);
        Equal(100000, data.committedScore, "Restart after a live penalty preserves banked score");
        Equal(99500, data.currentScore, "Live penalty remains separate");
        data.Normalize(3);
        Equal(100000, data.committedScore, "Repeated loading is stable");
        data.currentScore = -1;
        data.highScore = -1;
        data.highestUnlockedLevel = 99;
        data.Normalize(3);
        Equal(0, data.currentScore, "Invalid live score is clamped independently");
        Equal(100000, data.committedScore, "Invalid live score cannot erase banked score");
        Equal(100000, data.highScore, "High score includes banked progress");
        Equal(3, data.highestUnlockedLevel, "Unlocked level is bounded");
        var legacy = new GlobalSaveData { highestUnlockedLevel = 2, currentScore = 65000 };
        legacy.Normalize(3);
        Equal(65000, legacy.committedScore, "Legacy save migration still works");
        var firstLevel = new GlobalSaveData { currentScore = 1500 };
        firstLevel.Normalize(3);
        Equal(0, firstLevel.committedScore, "Unfinished first-level pickups are not banked");
    }

    private static void CheckInputBuffer()
    {
        var input = new PlayerInputBuffer();
        input.Sample(false, true, false, false, true, true);
        input.Sample(false, false, false, false, false, false);
        var command = input.Consume();
        Check(command.jump && command.dash, "Button edges survive a render frame with no physics tick");
        Equal(1, command.dashX, "Dash keeps the direction at the button press");
        Equal(0, command.moveX, "Released movement uses the latest held state");
        command = input.Consume();
        Check(!command.jump && !command.dash, "A second physics tick does not repeat button edges");
        input.Sample(true, false, true, true, false, true);
        command = input.Consume();
        Equal(-1, command.moveX, "Left movement survives sampling");
        Equal(1, command.dashY, "Up wins when both vertical dash keys are held");
        Check(command.crouch, "Crouch remains a held action");
        command = input.Consume();
        Equal(-1, command.moveX, "Held direction survives multiple physics ticks");
        input.Sample(false, true, false, false, true, true);
        input.Clear();
        command = input.Consume();
        Check(!command.jump && !command.dash && command.moveX == 0, "Pause or death discards pending input");
    }

    private static float DashDistance(float step, float speed = 25f, float slowdown = 50f, float duration = .22f)
    {
        var dash = new DashMotion();
        dash.Begin(speed, slowdown, duration);
        float distance = 0f;
        int ticks = 0;
        while (!dash.IsComplete)
        {
            if (++ticks > 1000) throw new Exception("Dash failed to finish");
            distance += dash.Step(step);
        }
        return distance;
    }

    private static void CheckDashMotion()
    {
        Equal(4.29f, DashDistance(.02f), "50 Hz dash distance");
        Equal(4.29f, DashDistance(.01f), "100 Hz dash distance");
        Equal(4.29f, DashDistance(1f / 120f), "120 Hz dash distance");
        Equal(4.29f, DashDistance(.05f), "Partial last tick contributes the right distance");
        Equal(4.29f, DashDistance(1f), "A tick longer than the dash cannot overshoot");
        Equal(6.25f, DashDistance(.02f, duration: 1f), "Deceleration stops without reversing");
        Equal(5f, DashDistance(.02f, 20f, 0f, .25f), "Constant-speed dash");
        var dash = new DashMotion();
        dash.Begin(25f, 50f, .22f);
        dash.Step(.02f);
        dash.Reset();
        Check(dash.IsComplete, "Death or knockback cancels the dash");
        Equal(0f, dash.Step(.02f), "Cancelled dash has no residual motion");
        Reject(() => dash.Begin(25f, -1f, 1f), "Negative deceleration");
        Reject(() => dash.Step(0f), "Zero physics step");
    }

    private static void CheckDeferredWrites()
    {
        var writes = new DeferredWrite(1f);
        Check(!writes.IsPending && !writes.IsDue(100f), "Idle saves do not write");
        writes.Request(0f);
        Check(!writes.IsDue(.9f), "Live edits wait for the batching window");
        writes.Request(.9f);
        Check(writes.IsDue(1f), "Continuous edits cannot postpone saving forever");
        writes.RetryLater(1f);
        Check(writes.IsPending && !writes.IsDue(1.1f), "Failed writes stay pending without retrying every frame");
        Check(writes.IsDue(2f), "Failed writes become due again");
        writes.MarkWritten();
        Check(!writes.IsPending && !writes.IsDue(5f), "Successful flush clears the queue");
        writes.Request(10f);
        writes.MarkWritten();
        Check(!writes.IsPending, "Explicit pause/exit flush may complete before the deadline");
        writes.Request(11f);
        Check(!writes.IsDue(11.5f) && writes.IsDue(12f), "A later change opens a fresh batching window");
    }

    private static void CheckContactProtection()
    {
        var protection = new InvulnerabilityWindow();
        Check(protection.TryStart(0f, 1.5f), "First contact can kill");
        Check(!protection.TryStart(.02f, 1.5f), "Immediate repeated contact is protected");
        Check(!protection.TryStart(1.49f, 1.5f), "Contact stays protected before expiry");
        Check(protection.TryStart(1.5f, 1.5f), "Continuous contact can kill after protection expires");
        Check(!protection.TryStart(1.51f, 1.5f), "A new respawn starts a new protection window");
        Check(protection.TryStart(3f, 1.5f), "Later contact is not permanently suppressed");
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
        CheckSavedProgress();
        CheckInputBuffer();
        CheckDashMotion();
        CheckDeferredWrites();
        CheckContactProtection();
        Console.WriteLine($"Runtime rules regressions passed: {checks} assertions.");
    }
}
