using System;

/// <summary>Coalesces updates within a bounded window; failed writes remain pending.</summary>
public sealed class DeferredWrite
{
    private readonly float interval;
    private float deadline;
    public bool IsPending { get; private set; }

    public DeferredWrite(float interval)
    {
        if (interval <= 0f || float.IsNaN(interval) || float.IsInfinity(interval))
            throw new ArgumentOutOfRangeException(nameof(interval));
        this.interval = interval;
    }

    public void Request(float now)
    {
        if (IsPending) return;
        IsPending = true;
        deadline = now + interval;
    }

    public bool IsDue(float now) => IsPending && now >= deadline;
    public void MarkWritten() => IsPending = false;

    public void RetryLater(float now)
    {
        IsPending = true;
        deadline = now + interval;
    }
}
