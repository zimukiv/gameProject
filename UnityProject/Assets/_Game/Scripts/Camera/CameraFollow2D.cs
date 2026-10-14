using UnityEngine;

namespace Minigame
{
    [RequireComponent(typeof(Camera))]
    public sealed class CameraFollow2D : MonoBehaviour
    {
        [SerializeField] private Transform target;
        [SerializeField] private Vector2 offset = new Vector2(2f, 1f);
        [SerializeField, Min(0.01f)] private float smoothTime = 0.15f;
        private Vector3 smoothVelocity;

        private void LateUpdate()
        {
            if (target == null)
                return;
            // Use the rendered player pose after this frame's movement.
            Vector3 desired = new Vector3(target.position.x + offset.x,
                target.position.y + offset.y, -10f);
            transform.position = Vector3.SmoothDamp(transform.position, desired,
                ref smoothVelocity, smoothTime);
        }
    }
}
