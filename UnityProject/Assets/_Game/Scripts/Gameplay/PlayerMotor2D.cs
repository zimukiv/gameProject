using System;
using UnityEngine;

namespace Minigame
{
    [RequireComponent(typeof(Rigidbody2D), typeof(CapsuleCollider2D), typeof(PlayerInputReader))]
    public sealed class PlayerMotor2D : MonoBehaviour
    {
        [SerializeField] private PlayerMovementSettings settings;
        [SerializeField] private LayerMask groundLayers;
        [SerializeField, Min(0.001f)] private float groundProbeDistance = 0.06f;

        private Rigidbody2D body;
        private CapsuleCollider2D shape;
        private PlayerInputReader input;
        private ContactFilter2D groundFilter;
        private readonly RaycastHit2D[] groundHits = new RaycastHit2D[8];

        public bool IsGrounded { get; private set; }
        public int FacingSign { get; private set; } = 1;
        public event Action Landed;

        private void Awake()
        {
            body = GetComponent<Rigidbody2D>();
            shape = GetComponent<CapsuleCollider2D>();
            input = GetComponent<PlayerInputReader>();
            if (settings == null)
            {
                Debug.LogError("PlayerMotor2D needs PlayerMovementSettings.", this);
                enabled = false;
                return;
            }
            groundFilter = new ContactFilter2D { useTriggers = false };
            groundFilter.SetLayerMask(groundLayers);
        }

        private void FixedUpdate()
        {
            // Ground must be below our feet; a nearby wall must not allow jumping.
            bool wasGrounded = IsGrounded;
            IsGrounded = CheckGrounded();
            if (IsGrounded && !wasGrounded)
                Landed?.Invoke();

            float moveX = input.MoveX;
            if (Mathf.Abs(moveX) > 0.01f)
                FacingSign = moveX > 0f ? 1 : -1;

            body.gravityScale = settings.gravityScale;
            Vector2 velocity = body.linearVelocity;
            velocity.x = moveX * settings.moveSpeed;
            velocity.y = Mathf.Max(velocity.y, -settings.maxFallSpeed);

            // Consume every press, even in midair: T02 has a single ground jump.
            if (input.ConsumeJumpPress() && IsGrounded)
            {
                velocity.y = settings.jumpSpeed;
                IsGrounded = false;
            }
            body.linearVelocity = velocity;
        }

        private bool CheckGrounded()
        {
            if (body.linearVelocity.y > 0.01f)
                return false;

            int count = shape.Cast(Vector2.down, groundFilter, groundHits, groundProbeDistance);
            for (int i = 0; i < count; i++)
            {
                if (groundHits[i].normal.y >= 0.65f)
                    return true;
            }
            return false;
        }
    }
}
