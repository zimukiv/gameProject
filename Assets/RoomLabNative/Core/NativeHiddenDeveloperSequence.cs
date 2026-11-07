using System;

namespace RoomLab.Native
{
    public enum NativeHiddenDirection { Other, Up, Down, Left, Right }

    // Pure recognizer. Push accepts one physical key-down edge, never a held-key sample.
    // UI/input ownership stays with the caller; this class has no Unity or gameplay dependency.
    public sealed class NativeHiddenDeveloperSequence
    {
        public const double MaximumGapSeconds = 2;
        static readonly NativeHiddenDirection[] Sequence = {
            NativeHiddenDirection.Up, NativeHiddenDirection.Up,
            NativeHiddenDirection.Down, NativeHiddenDirection.Down,
            NativeHiddenDirection.Left, NativeHiddenDirection.Right,
            NativeHiddenDirection.Left, NativeHiddenDirection.Right
        };
        int progress;
        double lastEdge;
        public int Progress => progress;

        public void Reset() { progress = 0; lastEdge = 0; }

        public bool Push(NativeHiddenDirection direction, double time)
        {
            if (double.IsNaN(time) || double.IsInfinity(time) || time < 0) { Reset(); return false; }
            if (progress > 0 && (time < lastEdge || time - lastEdge > MaximumGapSeconds)) Reset();
            if (direction != Sequence[progress])
            {
                // A wrong Up can be the beginning of the next complete attempt.
                progress = direction == NativeHiddenDirection.Up ? 1 : 0;
                lastEdge = time;
                return false;
            }
            lastEdge = time;
            progress++;
            if (progress != Sequence.Length) return false;
            Reset();
            return true;
        }
    }
}
