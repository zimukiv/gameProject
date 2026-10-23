using System;

/// <summary>Three collected Token units fill one charge. Full capacity discards further energy.</summary>
public sealed class DashChargeMeter
{
    public const int TokensPerCharge = 3;
    public const int Capacity = 1;
    public int Charges { get; private set; }
    public int Progress { get; private set; }

    public void Collect(int tokenAmount)
    {
        if (tokenAmount <= 0 || Charges == Capacity) return;
        if (tokenAmount >= TokensPerCharge - Progress) { Charges = Capacity; Progress = 0; }
        else Progress += tokenAmount;
    }

    public bool TrySpend()
    {
        if (Charges == 0) return false;
        Charges = 0;
        Progress = 0;
        return true;
    }

    public void Restore(int charges, int progress)
    {
        Charges = Math.Max(0, Math.Min(Capacity, charges));
        Progress = Charges > 0 ? 0 : Math.Max(0, Math.Min(TokensPerCharge - 1, progress));
    }
    public void Reset() => Restore(0, 0);
}
