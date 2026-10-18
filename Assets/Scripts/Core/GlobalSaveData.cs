using System;

/// <summary>Persistent run progress. Banked score is independent of live penalties.</summary>
[Serializable]
public class GlobalSaveData
{
    public int highestUnlockedLevel = 1;
    public bool isGameFullyCompleted;
    public int currentScore;
    public int committedScore;
    public int highScore;
    public bool hasSavedGame;

    public void Normalize(int totalLevels)
    {
        highestUnlockedLevel = Math.Max(1, Math.Min(totalLevels, highestUnlockedLevel));
        currentScore = Math.Max(0, currentScore);
        committedScore = Math.Max(0, committedScore);
        // Compatibility with the original saves that only stored currentScore.
        if (committedScore == 0 && (highestUnlockedLevel > 1 || isGameFullyCompleted))
            committedScore = currentScore;
        highScore = Math.Max(highScore, Math.Max(currentScore, committedScore));
    }
}
