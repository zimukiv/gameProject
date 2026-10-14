using UnityEngine;
using UnityEngine.InputSystem;

namespace Minigame
{
    public sealed class PlayerInputReader : MonoBehaviour
    {
        [SerializeField] private InputActionAsset controls;
        private InputActionAsset runtimeControls;
        private InputAction move;
        private InputAction jump;
        private bool jumpQueued;

        public float MoveX => move != null ? move.ReadValue<float>() : 0f;

        private void Awake()
        {
            if (controls == null)
            {
                Debug.LogError("PlayerInputReader needs PlayerControls.", this);
                enabled = false;
                return;
            }
            // A private copy prevents one player disabling another's shared asset.
            runtimeControls = Instantiate(controls);
            move = runtimeControls.FindAction("Player/Move", true);
            jump = runtimeControls.FindAction("Player/Jump", true);
            jump.performed += QueueJump;
        }

        private void OnEnable() => runtimeControls?.Enable();

        private void OnDisable()
        {
            runtimeControls?.Disable();
            jumpQueued = false;
        }

        private void QueueJump(InputAction.CallbackContext context) => jumpQueued = true;

        public bool ConsumeJumpPress()
        {
            bool pressed = jumpQueued;
            jumpQueued = false;
            return pressed;
        }

        private void OnDestroy()
        {
            if (runtimeControls != null)
            {
                jump.performed -= QueueJump;
                Destroy(runtimeControls);
            }
        }
    }
}
