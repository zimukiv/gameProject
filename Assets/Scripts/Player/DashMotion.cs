using System;

/// <summary>Integrates a decelerating dash, including the last partial physics step.</summary>
public sealed class DashMotion
{
    private double initialSpeed;
    private double deceleration;
    private double duration;
    private double elapsed;
    public bool IsComplete => elapsed >= duration;

    public void Begin(float speed, float slowdown, float seconds)
    {
        if (speed <= 0f || float.IsNaN(speed) || float.IsInfinity(speed))
            throw new ArgumentOutOfRangeException(nameof(speed));
        if (slowdown < 0f || float.IsNaN(slowdown) || float.IsInfinity(slowdown))
            throw new ArgumentOutOfRangeException(nameof(slowdown));
        if (seconds <= 0f || float.IsNaN(seconds) || float.IsInfinity(seconds))
            throw new ArgumentOutOfRangeException(nameof(seconds));
        initialSpeed = speed;
        deceleration = slowdown;
        duration = seconds;
        elapsed = 0d;
    }

    public float Step(float seconds)
    {
        if (seconds <= 0f || float.IsNaN(seconds) || float.IsInfinity(seconds))
            throw new ArgumentOutOfRangeException(nameof(seconds));
        if (IsComplete) return 0f;
        double end = Math.Min(duration, elapsed + seconds);
        if (duration - end < .000001d) end = duration;
        double movingEnd = deceleration > 0d ? Math.Min(end, initialSpeed / deceleration) : end;
        double startSpeed = Math.Max(0d, initialSpeed - deceleration * elapsed);
        double distance = movingEnd > elapsed
            ? (movingEnd - elapsed) * (startSpeed + Math.Max(0d, initialSpeed - deceleration * movingEnd)) * .5d
            : 0d;
        elapsed = end;
        return (float)distance;
    }

    public void Reset() { elapsed = duration; }
}
