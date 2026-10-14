using UnityEngine;
using UnityEngine.InputSystem;

namespace Minigame
{
    // Temporary A-test-scene helper. Replace with B's checkpoint flow in T04.
    [RequireComponent(typeof(Rigidbody2D))]
    public sealed class SandboxReset : MonoBehaviour
    {
        [SerializeField] private float fallLimit = -8f;
        private Rigidbody2D body;
        private Vector2 spawnPosition;

        private void Awake()
        {
            body = GetComponent<Rigidbody2D>();
            spawnPosition = body.position;
        }

        private void Update()
        {
            if (body.position.y < fallLimit ||
                (Keyboard.current != null && Keyboard.current.rKey.wasPressedThisFrame))
            {
                body.position = spawnPosition;
                body.linearVelocity = Vector2.zero;
                body.angularVelocity = 0f;
            }
        }
    }
}
