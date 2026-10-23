/// <summary>Preserves button edges between rendered frames and physics ticks.</summary>
public sealed class PlayerInputBuffer
{
    public struct Command
    {
        public int moveX;
        public bool crouch;
        public bool jump;
        public bool dash;
        public int dashX;
    }

    private Command pending;

    public void Sample(bool left, bool right, bool up, bool down, bool jumpPressed, bool dashPressed)
    {
        pending.moveX = (right ? 1 : 0) - (left ? 1 : 0);
        pending.crouch = down;
        pending.jump |= jumpPressed;
        if (dashPressed && !pending.dash)
        {
            pending.dash = true;
            pending.dashX = pending.moveX;
            // Vertical keys still control jumping/crouching, never the dash direction.
        }
    }

    public Command Consume()
    {
        Command command = pending;
        pending.jump = pending.dash = false;
        return command;
    }

    public void Clear() => pending = default;
}
