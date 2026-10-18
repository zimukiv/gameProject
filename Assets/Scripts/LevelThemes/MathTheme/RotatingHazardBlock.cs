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

    private Rigidbody2D rb;

    protected override void Awake()
    {
        base.Awake();
        rb = GetComponent<Rigidbody2D>();
        rb.bodyType = RigidbodyType2D.Kinematic;
    }

    private void Update()
    {
        transform.Rotate(0f, 0f, rotationSpeed * Time.deltaTime);
    }

    private void OnCollisionEnter2D(Collision2D collision)
    {
        Vector2 contactPoint = collision.contacts[0].point;
        Vector2 center = transform.position;
        Vector2 hitDir = (contactPoint - center).normalized;

        if (collision.gameObject.CompareTag("Player"))
        {
            PlayerController pc = collision.gameObject.GetComponent<PlayerController>();
            if (pc != null)
            {
                pc.ForceLaunch(hitDir * knockbackForce);
            }
        }
        else if (collision.gameObject.CompareTag("Enemy") || collision.gameObject.GetComponent<EnemyAI>() != null)
        {
            Rigidbody2D enemyRb = collision.gameObject.GetComponent<Rigidbody2D>();
            if (enemyRb != null)
            {
                enemyRb.velocity = hitDir * knockbackForce;
            }
        }
    }
}
