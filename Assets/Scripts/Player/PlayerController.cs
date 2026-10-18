using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

/// <summary>
/// 玩家核心控制器：
/// - 双兼容输入系统（无缝兼容 Unity 6 New Input System 与 Legacy Input）
/// - 左右朝向切换与移动
/// - S 键下蹲
/// - 空格/W 单段跳跃（调优初速度与下落阻尼）
/// - Shift 8向匀减速冲刺（支持空中跳跃中二次冲刺衔接）
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
    public int maxDashCharges = 3;
    public int currentDashCharges = 3;
    public bool isFirstDashFree = true;

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

    private float dashTimer;
    private float defaultGravityScale;
    private Vector2 currentDashDirection;
    private float currentDashSpeed;
    private float externalMotionTimer;

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
        currentDashCharges = maxDashCharges;
    }

    private void Start()
    {
        EventBus.TriggerDashChargeChanged(currentDashCharges, maxDashCharges);
        EventBus.TriggerTokenCountChanged(0, currentTokens);
    }

    private void Update()
    {
        if (GameManager.Instance != null &&
            GameManager.Instance.CurrentState != GameManager.GameState.SlowPacedPhase &&
            GameManager.Instance.CurrentState != GameManager.GameState.FastPacedPhase)
            return;

        CheckGrounded();
        HandleDirectionFacing();
        HandleCrouch();

        if (externalMotionTimer > 0f)
        {
            externalMotionTimer -= Time.deltaTime;
            return;
        }

        if (isDashing)
        {
            UpdateDash();
            return;
        }

        HandleMovement();
        HandleJump();
        HandleDashInput();
    }

    private void FixedUpdate()
    {
        if (!isDashing && rb.velocity.y < -maxFallSpeed)
        {
            rb.velocity = new Vector2(rb.velocity.x, -maxFallSpeed);
        }
    }

    #region Input Abstraction (Hybrid Input Support)
    private bool IsKeyHeld(KeyCode code)
    {
#if ENABLE_INPUT_SYSTEM
        var kb = Keyboard.current;
        if (kb != null)
        {
            switch (code)
            {
                case KeyCode.A: return kb.aKey.isPressed || kb.leftArrowKey.isPressed;
                case KeyCode.D: return kb.dKey.isPressed || kb.rightArrowKey.isPressed;
                case KeyCode.W: return kb.wKey.isPressed || kb.upArrowKey.isPressed;
                case KeyCode.S: return kb.sKey.isPressed || kb.downArrowKey.isPressed;
                case KeyCode.Space: return kb.spaceKey.isPressed;
                case KeyCode.LeftShift: return kb.leftShiftKey.isPressed || kb.rightShiftKey.isPressed;
            }
        }
#endif
        try
        {
            return Input.GetKey(code);
        }
        catch
        {
            return false;
        }
    }

    private bool IsKeyDown(KeyCode code)
    {
#if ENABLE_INPUT_SYSTEM
        var kb = Keyboard.current;
        if (kb != null)
        {
            switch (code)
            {
                case KeyCode.A: return kb.aKey.wasPressedThisFrame || kb.leftArrowKey.wasPressedThisFrame;
                case KeyCode.D: return kb.dKey.wasPressedThisFrame || kb.rightArrowKey.wasPressedThisFrame;
                case KeyCode.W: return kb.wKey.wasPressedThisFrame || kb.upArrowKey.wasPressedThisFrame;
                case KeyCode.S: return kb.sKey.wasPressedThisFrame || kb.downArrowKey.wasPressedThisFrame;
                case KeyCode.Space: return kb.spaceKey.wasPressedThisFrame;
                case KeyCode.LeftShift: return kb.leftShiftKey.wasPressedThisFrame || kb.rightShiftKey.wasPressedThisFrame;
            }
        }
#endif
        try
        {
            return Input.GetKeyDown(code);
        }
        catch
        {
            return false;
        }
    }
    #endregion

    private void CheckGrounded()
    {
        if (groundCheck != null)
        {
            var ground = Physics2D.Raycast(groundCheck.position + Vector3.up * .15f, Vector2.down, .27f, groundLayer);
            isGrounded = ground.collider != null;
            isOnIce = ground.collider != null && ground.collider.GetComponent<IceBlock>() != null;
        }
        else
        {
            isGrounded = Physics2D.Raycast(transform.position, Vector2.down, 1.2f, groundLayer);
            isOnIce = false;
        }
    }

    private void HandleDirectionFacing()
    {
        bool right = IsKeyHeld(KeyCode.D);
        bool left = IsKeyHeld(KeyCode.A);

        if (right && !left)
        {
            facingDirection = 1;
            if (spriteRenderer != null) spriteRenderer.flipX = false;
        }
        else if (left && !right)
        {
            facingDirection = -1;
            if (spriteRenderer != null) spriteRenderer.flipX = true;
        }
    }

    private void HandleCrouch()
    {
        if (IsKeyHeld(KeyCode.S) && isGrounded)
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

    private void HandleMovement()
    {
        float moveInput = 0f;
        if (IsKeyHeld(KeyCode.D)) moveInput += 1f;
        if (IsKeyHeld(KeyCode.A)) moveInput -= 1f;

        float targetSpeed = isCrouching ? crouchSpeed : moveSpeed;
        float acceleration = isOnIce ? iceAcceleration : isGrounded ? groundAcceleration : airAcceleration;
        float x = Mathf.MoveTowards(rb.velocity.x, moveInput * targetSpeed, acceleration * Time.deltaTime);
        rb.velocity = new Vector2(x, rb.velocity.y);
    }

    private void HandleJump()
    {
        if ((IsKeyDown(KeyCode.Space) || IsKeyDown(KeyCode.W)) && isGrounded && !isCrouching)
        {
            rb.velocity = new Vector2(rb.velocity.x, jumpVelocity);
        }
    }

    private void HandleDashInput()
    {
        if (IsKeyDown(KeyCode.LeftShift))
        {
            if (isFirstDashFree || currentDashCharges > 0)
            {
                StartDash();
            }
        }
    }

    private void StartDash()
    {
        if (isFirstDashFree)
        {
            isFirstDashFree = false;
        }
        else
        {
            currentDashCharges--;
            EventBus.TriggerDashChargeChanged(currentDashCharges, maxDashCharges);
        }

        isDashing = true;
        dashTimer = dashDuration;
        currentDashSpeed = dashInitialSpeed;

        rb.velocity = Vector2.zero;
        rb.gravityScale = 0f;

        currentDashDirection = CalculateDashDirection();
        rb.velocity = currentDashDirection * currentDashSpeed;
    }

    private Vector2 CalculateDashDirection()
    {
        bool w = IsKeyHeld(KeyCode.W);
        bool s = IsKeyHeld(KeyCode.S);
        bool a = IsKeyHeld(KeyCode.A);
        bool d = IsKeyHeld(KeyCode.D);

        int h = 0;
        if (a && !d) h = -1;
        else if (d && !a) h = 1;

        int v = 0;
        if (w && s)
        {
            v = 1;
        }
        else if (w) v = 1;
        else if (s) v = -1;

        if (h == 0 && v == 0)
        {
            return new Vector2(facingDirection, 0f).normalized;
        }

        return new Vector2(h, v).normalized;
    }

    private void UpdateDash()
    {
        dashTimer -= Time.deltaTime;
        currentDashSpeed = Mathf.Max(0f, currentDashSpeed - dashDeceleration * Time.deltaTime);
        rb.velocity = currentDashDirection * currentDashSpeed;

        if (dashTimer <= 0f)
        {
            EndDash();
        }
    }

    private void EndDash()
    {
        isDashing = false;
        rb.gravityScale = defaultGravityScale;
        rb.velocity = Vector2.zero;
    }

    public void ResetMotion()
    {
        isDashing = false;
        dashTimer = 0f;
        externalMotionTimer = 0f;
        rb.gravityScale = defaultGravityScale;
        rb.velocity = Vector2.zero;
    }

    public void RechargeDash(int count = 1)
    {
        currentDashCharges = Mathf.Min(maxDashCharges, currentDashCharges + count);
        EventBus.TriggerDashChargeChanged(currentDashCharges, maxDashCharges);
    }

    public void AddTokens(int amount)
    {
        currentTokens += amount;
        EventBus.TriggerTokenCountChanged(amount, currentTokens);
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
        if (isDashing) EndDash();
        rb.velocity = force;
        externalMotionTimer = .38f;
    }
}
