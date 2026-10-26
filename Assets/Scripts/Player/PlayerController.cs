using UnityEngine;

/// <summary>
/// 玩家核心控制器：
/// - 双兼容输入系统（无缝兼容 Unity 6 New Input System 与 Legacy Input）
/// - 左右朝向切换与移动
/// - S 键下蹲
/// - 空格/W 单段跳跃（调优初速度与下落阻尼）
/// - Shift 水平冲刺；每收集 3 Token 充能一次，最多储存一次
/// </summary>
[RequireComponent(typeof(Rigidbody2D), typeof(Collider2D))]
public class PlayerController : MonoBehaviour
{
    public static PlayerController Instance { get; private set; }

    [Header("Horizontal Movement")]
    public float moveSpeed = 10f;
    public float crouchSpeed = 5.0f;
    public float groundAcceleration = 95f;
    public float airAcceleration = 55f;
    public float iceAcceleration = 10f;

    [Header("Jump Parameters")]
    public float jumpVelocity = 19f; // 提升初速，轻松跃上高台
    public float maxFallSpeed = 22f;

    [Header("Dash Parameters")]
    public float dashInitialSpeed = 25f;
    public float dashDeceleration = 50f;
    public float dashDuration = 0.22f;
    public int maxDashCharges => DashChargeMeter.Capacity;
    public int currentDashCharges => dashCharges.Charges;
    public int dashChargeProgress => dashCharges.Progress;

    [Header("Ground Detection")]
    public Transform groundCheck;
    public float groundCheckRadius = 0.4f;
    public LayerMask groundLayer;

    [Header("Crouch Configuration")]
    public Vector2 normalColliderSize = new Vector2(0.8f, 1.6f);
    public Vector2 crouchColliderSize = new Vector2(0.8f, 0.8f);
    public Vector2 normalColliderOffset = Vector2.zero;
    public Vector2 crouchColliderOffset = new Vector2(0f, -0.4f);

    [Header("Tokens")]
    public int currentTokens = 0;

    [Header("State Flags")]
    public bool isGrounded;
    public bool isOnIce;
    public bool isCrouching;
    public bool isDashing;
    public int facingDirection = 1;

    private Rigidbody2D rb;
    private BoxCollider2D boxCollider;
    private SpriteRenderer spriteRenderer;

    private float defaultGravityScale;
    private Vector2 currentDashDirection;
    private float externalMotionTimer;
    private readonly TimedSpeedModifiers speedModifiers = new TimedSpeedModifiers();
    private readonly PlayerInputBuffer inputBuffer = new PlayerInputBuffer();
    private readonly DashMotion dashMotion = new DashMotion();
    private readonly DashChargeMeter dashCharges = new DashChargeMeter();
    private object scriptedMotionOwner;

    private void Awake()
    {
        if (Instance != null && Instance != this)
        {
            Destroy(gameObject);
            return;
        }
        Instance = this;

        rb = GetComponent<Rigidbody2D>();
        boxCollider = GetComponent<BoxCollider2D>();
        spriteRenderer = GetComponentInChildren<SpriteRenderer>();

        defaultGravityScale = rb.gravityScale;
        currentTokens = 0;
        dashCharges.Reset();
    }

    private void Start()
    {
        EventBus.TriggerDashChargeChanged(currentDashCharges, maxDashCharges);
        EventBus.TriggerTokenCountChanged(0, currentTokens);
    }

    private void Update()
    {
        if (!CanControl() || externalMotionTimer > 0f)
        {
            inputBuffer.Clear();
            return;
        }
        if (scriptedMotionOwner != null)
        {
            if (scriptedMotionOwner is RailgunBlock)
                inputBuffer.Sample(false, false, false, false,
                    GameInput.WasPressed(KeyCode.Space) || GameInput.WasPressed(KeyCode.W), false);
            else inputBuffer.Clear();
            return;
        }
        inputBuffer.Sample(GameInput.IsHeld(KeyCode.A), GameInput.IsHeld(KeyCode.D),
            GameInput.IsHeld(KeyCode.W), GameInput.IsHeld(KeyCode.S),
            GameInput.WasPressed(KeyCode.Space) || GameInput.WasPressed(KeyCode.W),
            GameInput.WasPressed(KeyCode.LeftShift));
    }

    private bool CanControl() => GameManager.Instance == null ||
        GameManager.Instance.CurrentState == GameManager.GameState.SlowPacedPhase ||
        GameManager.Instance.CurrentState == GameManager.GameState.FastPacedPhase;

    private void FixedUpdate()
    {
        if (!CanControl())
        {
            inputBuffer.Clear();
            return;
        }
        if (scriptedMotionOwner != null)
        {
            var ridingCommand = inputBuffer.Consume();
            if (ridingCommand.jump && scriptedMotionOwner is RailgunBlock carrier)
                carrier.TryJumpOff(this);
            return;
        }
        var command = inputBuffer.Consume();
        CheckGrounded();
        HandleDirectionFacing(command.moveX);
        HandleCrouch(command.crouch);

        if (externalMotionTimer > 0f)
        {
            externalMotionTimer = Mathf.Max(0f, externalMotionTimer - Time.fixedDeltaTime);
            ClampFallSpeed();
            return;
        }

        if (isDashing)
        {
            if (!dashMotion.IsComplete) { UpdateDash(); return; }
            EndDash();
        }

        HandleMovement(command.moveX);
        if (command.jump && isGrounded && !isCrouching)
            rb.linearVelocity = new Vector2(rb.linearVelocity.x, jumpVelocity);
        if (command.dash && currentDashCharges > 0 && dashDuration > 0f && dashInitialSpeed > 0f)
        {
            StartDash(command.dashX);
            UpdateDash();
            return;
        }
        ClampFallSpeed();
    }

    private void ClampFallSpeed()
    {
        if (rb.linearVelocity.y < -maxFallSpeed) rb.linearVelocity = new Vector2(rb.linearVelocity.x, -maxFallSpeed);
    }

    private void OnDisable() => inputBuffer.Clear();

    private void CheckGrounded()
    {
        if (groundCheck != null)
        {
            var ground = Physics2D.Raycast(groundCheck.position + Vector3.up * .15f, Vector2.down, .27f, groundLayer);
            isGrounded = ground.collider != null;
            // Thermal ice is ordinary footing; temperature alone determines its presence.
            isOnIce = false;
        }
        else
        {
            isGrounded = Physics2D.Raycast(transform.position, Vector2.down, 1.2f, groundLayer);
            isOnIce = false;
        }
    }

    private void HandleDirectionFacing(int moveX)
    {
        if (moveX > 0)
        {
            facingDirection = 1;
            if (spriteRenderer != null) spriteRenderer.flipX = false;
        }
        else if (moveX < 0)
        {
            facingDirection = -1;
            if (spriteRenderer != null) spriteRenderer.flipX = true;
        }
    }

    private void HandleCrouch(bool crouchHeld)
    {
        if (crouchHeld && isGrounded)
        {
            if (!isCrouching)
            {
                isCrouching = true;
                if (boxCollider != null)
                {
                    boxCollider.size = crouchColliderSize;
                    boxCollider.offset = crouchColliderOffset;
                }
            }
        }
        else
        {
            if (isCrouching)
            {
                isCrouching = false;
                if (boxCollider != null)
                {
                    boxCollider.size = normalColliderSize;
                    boxCollider.offset = normalColliderOffset;
                }
            }
        }
    }

    private void HandleMovement(int moveInput)
    {
        float targetSpeed = (isCrouching ? crouchSpeed : moveSpeed) * speedModifiers.GetMultiplier(Time.time);
        float acceleration = isOnIce ? iceAcceleration : isGrounded ? groundAcceleration : airAcceleration;
        float x = Mathf.MoveTowards(rb.linearVelocity.x, moveInput * targetSpeed, acceleration * Time.fixedDeltaTime);
        rb.linearVelocity = new Vector2(x, rb.linearVelocity.y);
    }

    private void StartDash(int horizontal)
    {
        if (!dashCharges.TrySpend()) return;
        EventBus.TriggerDashChargeChanged(currentDashCharges, maxDashCharges);

        isDashing = true;
        dashMotion.Begin(dashInitialSpeed, Mathf.Max(0f, dashDeceleration), dashDuration);

        rb.linearVelocity = Vector2.zero;
        rb.gravityScale = 0f;

        currentDashDirection = new Vector2(horizontal == 0 ? facingDirection : horizontal > 0 ? 1 : -1, 0f);
    }

    private void UpdateDash()
    {
        rb.linearVelocity = currentDashDirection * (dashMotion.Step(Time.fixedDeltaTime) / Time.fixedDeltaTime);
    }

    private void EndDash()
    {
        isDashing = false;
        dashMotion.Reset();
        rb.gravityScale = defaultGravityScale;
        rb.linearVelocity = Vector2.zero;
    }

    public void ResetMotion()
    {
        transform.SetParent(null, true);
        speedModifiers.Clear();
        inputBuffer.Clear();
        dashMotion.Reset();
        scriptedMotionOwner = null;
        isDashing = false;
        isCrouching = false;
        isGrounded = false;
        isOnIce = false;
        if (boxCollider != null)
        {
            boxCollider.size = normalColliderSize;
            boxCollider.offset = normalColliderOffset;
        }
        externalMotionTimer = 0f;
        rb.gravityScale = defaultGravityScale;
        rb.linearVelocity = Vector2.zero;
    }

    public void ApplySpeedModifier(object source, float multiplier, float duration)
        => speedModifiers.Apply(source, multiplier, duration, Time.time);

    public void RemoveSpeedModifier(object source) => speedModifiers.Remove(source);

    public bool TryBeginScriptedMotion(object owner)
    {
        if (owner == null || scriptedMotionOwner != null) return false;
        inputBuffer.Clear();
        if (isDashing) EndDash();
        scriptedMotionOwner = owner;
        rb.linearVelocity = Vector2.zero;
        rb.gravityScale = 0f;
        return true;
    }

    public bool IsScriptedMotionControlledBy(object owner) => owner != null && ReferenceEquals(scriptedMotionOwner, owner);

    public void CancelScriptedMotion(object owner)
    {
        if (!IsScriptedMotionControlledBy(owner)) return;
        scriptedMotionOwner = null;
        rb.gravityScale = defaultGravityScale;
        rb.linearVelocity = Vector2.zero;
    }

    public void CompleteScriptedMotion(object owner, Vector2 launchVelocity)
    {
        if (!IsScriptedMotionControlledBy(owner)) return;
        CancelScriptedMotion(owner);
        LaunchWithControl(launchVelocity);
    }

    // Friendly launchers restore steering immediately; hostile knockback still uses ForceLaunch.
    public bool LaunchWithControl(Vector2 launchVelocity)
    {
        if (!CanControl() || scriptedMotionOwner != null) return false;
        if (isDashing) EndDash();
        transform.SetParent(null, true);
        inputBuffer.Clear();
        externalMotionTimer = 0f;
        isGrounded = false;
        rb.linearVelocity = launchVelocity;
        return true;
    }

    public bool LaunchFromAirVent(Vector2 launchVelocity)
    {
        if (launchVelocity.sqrMagnitude < .001f) return false;
        Vector2 direction = launchVelocity.normalized;
        Vector2 sidewaysVelocity = rb.linearVelocity - Vector2.Dot(rb.linearVelocity, direction) * direction;
        return LaunchWithControl(sidewaysVelocity + launchVelocity);
    }

    public void RestoreRunResources(int tokens, int charges, int progress)
    {
        currentTokens = Mathf.Max(0, tokens);
        dashCharges.Restore(charges, progress);
        EventBus.TriggerTokenCountChanged(0, currentTokens);
        EventBus.TriggerDashChargeChanged(currentDashCharges, maxDashCharges);
    }

    public void AddTokens(int amount)
    {
        if (amount <= 0) return;
        currentTokens += amount;
        dashCharges.Collect(amount);
        EventBus.TriggerTokenCountChanged(amount, currentTokens);
        EventBus.TriggerDashChargeChanged(currentDashCharges, maxDashCharges);
    }

    public int ConsumeAllTokens()
    {
        int tokens = currentTokens;
        currentTokens = 0;
        EventBus.TriggerTokenCountChanged(-tokens, currentTokens);
        return tokens;
    }

    public void ForceLaunch(Vector2 force)
    {
        inputBuffer.Clear();
        if (isDashing) EndDash();
        rb.linearVelocity = force;
        externalMotionTimer = .38f;
    }
}
