using UnityEngine;

/// <summary>
/// 关卡2（高数）：旋转方块
/// 自身小范围旋转，碰撞时利用力矩和切向速度猛烈打飞玩家与 AI
/// </summary>
[RequireComponent(typeof(Rigidbody2D))]
public class RotatingHazardBlock : BaseBlock
{
    [Header("Rotation Settings")]
    public float rotationSpeed = 180f; // 度/秒
    public float knockbackForce = 22f;
    public float knockbackDuration = .4f;

    private Rigidbody2D rb;

    protected override void Awake()
    {
        base.Awake();
        rb = GetComponent<Rigidbody2D>();
        rb.bodyType = RigidbodyType2D.Kinematic;
    }

    private void FixedUpdate()
    {
        rb.MoveRotation(rb.rotation + rotationSpeed * Time.fixedDeltaTime);
    }

    private void OnCollisionEnter2D(Collision2D collision)
    {
        Hit(collision.collider);
    }

    private void OnTriggerEnter2D(Collider2D other) => Hit(other);

    private void Hit(Collider2D other)
    {
        Vector2 hitDir = ((Vector2)other.bounds.center - (Vector2)transform.position).normalized;
        if (hitDir.sqrMagnitude < .001f) hitDir = Vector2.up;
        var player = other.GetComponentInParent<PlayerController>();
        if (player != null)
        {
            player.ForceLaunch(hitDir * knockbackForce);
        }
        else
        {
            var enemy = other.GetComponentInParent<EnemyAI>();
            if (enemy != null) enemy.ApplyKnockback(hitDir * knockbackForce, knockbackDuration);
        }
    }
}
