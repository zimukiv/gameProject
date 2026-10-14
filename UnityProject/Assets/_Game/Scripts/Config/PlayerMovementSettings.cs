using UnityEngine;

namespace Minigame
{
    // B owns the data; A's motor reads it. Values are prototype defaults.
    [CreateAssetMenu(menuName = "Minigame/Player Movement Settings")]
    public sealed class PlayerMovementSettings : ScriptableObject
    {
        [Min(0f)] public float moveSpeed = 7f;
        [Min(0f)] public float jumpSpeed = 12f;
        [Min(0f)] public float gravityScale = 3f;
        [Min(0.1f)] public float maxFallSpeed = 20f;
    }
}
