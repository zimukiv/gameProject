using System.Collections;
using UnityEngine;

/// <summary>
/// 核心敌人 AI：
/// 1. 快慢两段节律：启动装置前低速巡游/休眠，启动后全速追击
/// 2. 距离近身触发技能：当与玩家距离小于 5m 时额外释放一次技能（短途爆发/脉冲）
/// 3. 分叉点标记寻路：优先朝向被玩家触发的 NavigationMarker 移动
/// 4. 传送节点路径：支持离线脱卡或传送网络
/// </summary>
[RequireComponent(typeof(Rigidbody2D), typeof(Collider2D))]
public class EnemyAI : MonoBehaviour
{
    public enum AISkillType
    {
        BurstDash,        // 物理关：超强爆发突刺
        CalculusDrift,    // 高数关：旋转力场/牵引
        DeadlinePressure  // 水课关：减速光环
    }

    [Header("AI Phase & Difficulty")]
    public bool isHunting = false;
    public float baseChaseSpeed = 5.5f;
    public float currentSpeed = 5.5f;
    public float difficultyMultiplier = 1.0f;

    [Header("Skill Parameters")]
    public AISkillType skillType = AISkillType.BurstDash;
    public float skillTriggerDistance = 5.0f; // 暂定 5m
    public float skillCooldown = 6.0f;
    private float skillCooldownTimer = 0f;
    private float chaseStartDelay = 0f;
    private bool isExecutingSkill = false;

    [Header("Burst Dash Skill Settings")]
    public float burstSpeed = 16f;
    public float burstDuration = 0.35f;

    [Header("Teleport Points")]
    public Transform[] teleportNodes;
    public float maxAllowedPlayerLagDistance = 30f; // 落后太远时触发传送追赶

    private Rigidbody2D rb;
    private Transform playerTransform;

    private void Awake()
    {
        rb = GetComponent<Rigidbody2D>();
    }

    private void Start()
    {
        var player = FindObjectOfType<PlayerController>();
        if (player != null) playerTransform = player.transform;

        EventBus.OnAIActivated += HandleAIActivated;
        EventBus.OnPlayerRespawned += HandlePlayerRespawned;
    }

    private void OnDestroy()
    {
        EventBus.OnAIActivated -= HandleAIActivated;
        EventBus.OnPlayerRespawned -= HandlePlayerRespawned;
    }

    private void HandleAIActivated(int consumedTokens, float difficulty)
    {
        isHunting = true;
        rb.gravityScale = 0f;
        GetComponent<Collider2D>().isTrigger = true;
        difficultyMultiplier = difficulty;
        currentSpeed = baseChaseSpeed * difficultyMultiplier;
        skillCooldownTimer = Mathf.Max(skillCooldownTimer, 2.5f);
        chaseStartDelay = 1f;
        Debug.Log($"[EnemyAI] AI 进入狂暴追击模式！速度: {currentSpeed}");
    }

    private void HandlePlayerRespawned()
    {
        // 玩家复活后重置技能冷却与追击速度
        skillCooldownTimer = skillCooldown;
        isExecutingSkill = false;
        if (playerTransform != null)
        {
            transform.position = playerTransform.position + Vector3.left * 8f;
            rb.velocity = Vector2.zero;
        }
    }

    private void Update()
    {
        if (GameManager.Instance != null && GameManager.Instance.CurrentState == GameManager.GameState.LevelClear)
        {
            rb.velocity = Vector2.zero;
            return;
        }
        if (playerTransform == null)
        {
            var p = FindObjectOfType<PlayerController>();
            if (p != null) playerTransform = p.transform;
            return;
        }

        if (skillCooldownTimer > 0)
        {
            skillCooldownTimer -= Time.deltaTime;
        }

        // 仅在被激活（快节奏期）时全速追击
        if (!isHunting)
        {
            rb.velocity = new Vector2(0, rb.velocity.y);
            return;
        }

        if (chaseStartDelay > 0f)
        {
            chaseStartDelay -= Time.deltaTime;
            rb.velocity = Vector2.zero;
            return;
        }

        if (isExecutingSkill) return;

        float distToPlayer = Vector2.Distance(transform.position, playerTransform.position);

        // 5m 距离近身额外触发技能
        if (distToPlayer <= skillTriggerDistance && skillCooldownTimer <= 0)
        {
            ExecuteSpecialSkill();
            return;
        }

        // 距离过大时触发传送路径
        if (distToPlayer > maxAllowedPlayerLagDistance && teleportNodes != null && teleportNodes.Length > 0)
        {
            TeleportCloserToPlayer();
        }

        MoveTowardsTarget();
    }

    private void MoveTowardsTarget()
    {
        Vector3 targetPos = playerTransform.position;

        // 检查附近是否有被激活的分叉点标记
        NavigationMarker[] markers = FindObjectsOfType<NavigationMarker>();
        NavigationMarker nearestTriggeredMarker = null;
        float minMarkerDist = float.MaxValue;

        foreach (var marker in markers)
        {
            if (marker.isTriggeredByPlayer)
            {
                float d = Vector2.Distance(transform.position, marker.transform.position);
                if (d < 12f && d < minMarkerDist)
                {
                    minMarkerDist = d;
                    nearestTriggeredMarker = marker;
                }
            }
        }

        if (nearestTriggeredMarker != null)
        {
            targetPos = nearestTriggeredMarker.transform.position;
        }

        Vector2 dir = (targetPos - transform.position).normalized;
        rb.velocity = dir * currentSpeed;
    }

    private void ExecuteSpecialSkill()
    {
        skillCooldownTimer = skillCooldown;
        isExecutingSkill = true;
        Debug.Log($"[EnemyAI] 距离小于 {skillTriggerDistance}m！额外释放技能: {skillType}");

        switch (skillType)
        {
            case AISkillType.BurstDash:
                StartCoroutine(BurstDashCoroutine());
                break;
            case AISkillType.CalculusDrift:
                StartCoroutine(CalculusDriftCoroutine());
                break;
            case AISkillType.DeadlinePressure:
                StartCoroutine(DeadlinePressureCoroutine());
                break;
        }
    }

    private IEnumerator BurstDashCoroutine()
    {
        Vector2 dir = (playerTransform.position - transform.position).normalized;
        rb.velocity = dir * burstSpeed * difficultyMultiplier;

        yield return new WaitForSeconds(burstDuration);

        isExecutingSkill = false;
    }

    private IEnumerator CalculusDriftCoroutine()
    {
        var body = playerTransform.GetComponent<Rigidbody2D>();
        if (body != null)
        {
            Vector2 pull = ((Vector2)transform.position - (Vector2)playerTransform.position).normalized;
            body.velocity = pull * 9f * difficultyMultiplier;
        }
        yield return new WaitForSeconds(.4f);
        isExecutingSkill = false;
    }

    private IEnumerator DeadlinePressureCoroutine()
    {
        var player = playerTransform.GetComponent<PlayerController>();
        if (player != null)
        {
            float previousSpeed = player.moveSpeed;
            player.moveSpeed *= .65f;
            isExecutingSkill = false;
            yield return new WaitForSeconds(1.5f);
            if (player != null) player.moveSpeed = previousSpeed;
        }
        else isExecutingSkill = false;
    }

    public void TeleportCloserToPlayer()
    {
        Transform bestNode = null;
        float bestDist = float.MaxValue;

        foreach (var node in teleportNodes)
        {
            if (node == null) continue;
            float distToP = Vector2.Distance(node.position, playerTransform.position);
            if (distToP < bestDist && distToP > 5.0f)
            {
                bestDist = distToP;
                bestNode = node;
            }
        }

        if (bestNode != null)
        {
            transform.position = bestNode.position;
            rb.velocity = Vector2.zero;
            Debug.Log($"[EnemyAI] AI 已通过传送路径瞬移至: {bestNode.position}");
        }
    }

    private void OnCollisionEnter2D(Collision2D collision)
    {
        if (isHunting && collision.gameObject.CompareTag("Player"))
        {
            PlayerHealthRespawn health = collision.gameObject.GetComponent<PlayerHealthRespawn>();
            if (health != null)
            {
                health.Die();
            }
        }
    }

    private void OnTriggerEnter2D(Collider2D other)
    {
        if (isHunting && other.CompareTag("Player"))
        {
            var health = other.GetComponent<PlayerHealthRespawn>();
            if (health != null) health.Die();
        }
    }

    public void ResetChase()
    {
        isHunting = false;
        chaseStartDelay = 0f;
        rb.velocity = Vector2.zero;
        rb.gravityScale = 0f;
        GetComponent<Collider2D>().isTrigger = true;
    }

    private void OnDrawGizmosSelected()
    {
        Gizmos.color = Color.red;
        Gizmos.DrawWireSphere(transform.position, skillTriggerDistance);
    }
}
