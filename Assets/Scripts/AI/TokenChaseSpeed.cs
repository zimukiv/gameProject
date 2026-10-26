using System;

/// <summary>Tokens slow pursuit while preserving at least 70% of baseline speed.</summary>
public static class TokenChaseSpeed
{
    public static float Calculate(int tokens, float baseScale, float weakeningPerToken)
    {
        float baseline = Math.Max(.01f, baseScale);
        float resistance = 1f + Math.Max(0, tokens) * Math.Max(0f, weakeningPerToken);
        return baseline * Math.Max(.7f, 1f / resistance);
    }
}
