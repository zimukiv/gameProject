using UnityEngine;

/// <summary>
/// 平滑相机跟随组件：
/// 解决视野受限问题，使主相机在 X 和 Y 轴上平滑跟踪玩家主角，并限制在关卡边界内
/// </summary>
public class CameraFollow : MonoBehaviour
{
    [Header("Target")]
    public Transform target;

    [Header("Follow Settings")]
    public float smoothSpeed = 5.0f;
    public Vector3 offset = new Vector3(2.5f, 1.5f, -10f); // 略微向前上方看，预留跳跃视野

    [Header("Camera Bounds")]
    public bool enableBounds = true;
    public Vector2 minBounds = new Vector2(-8f, -2f);
    public Vector2 maxBounds = new Vector2(35f, 15f);

    private void Start()
    {
        FindPlayerTarget();
    }

    private void LateUpdate()
    {
        if (target == null)
        {
            FindPlayerTarget();
            return;
        }

        Vector3 desiredPosition = target.position + offset;

        if (enableBounds)
        {
            desiredPosition.x = Mathf.Clamp(desiredPosition.x, minBounds.x, maxBounds.x);
            desiredPosition.y = Mathf.Clamp(desiredPosition.y, minBounds.y, maxBounds.y);
        }
        desiredPosition.z = offset.z;

        transform.position = Vector3.Lerp(transform.position, desiredPosition, smoothSpeed * Time.deltaTime);
    }

    private void FindPlayerTarget()
    {
        var player = GameObject.FindGameObjectWithTag("Player");
        if (player != null)
        {
            target = player.transform;
        }
    }
}
