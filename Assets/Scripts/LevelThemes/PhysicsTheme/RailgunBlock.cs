using UnityEngine;

/// <summary>A solid carrier launches together with its rider, then returns for the next attempt.</summary>
[RequireComponent(typeof(Rigidbody2D))]
public class RailgunBlock : InteractiveBlock
{
    [Header("Railgun Acceleration")]
    public Transform launchEndPoint;
    public float acceleration = 30f;
    public float launchExitSpeed = 32f;
    public Vector2 launchDirection = Vector2.right;
    // Optional imported route. Existing scenes retain the original single segment.
    public Transform[] routePoints;
    public float travelSpeedLimit;
    private int routeIndex;
    private Vector3 segmentStart;

    private bool isLaunching;
    private PlayerController launchPlayer;
    private Rigidbody2D platformBody;
    private Vector3 startPosition;
    private Vector3 endPosition;
    private Vector3 riderOffset;
    private float currentSpeed;
    private float returnDelay;
    private bool returning;
    public Vector3 LaunchStartPosition => startPosition;
    public bool IsLaunching => isLaunching;

    protected override void Awake()
    {
        base.Awake();
        startPosition = transform.position;
        platformBody = GetComponent<Rigidbody2D>();
        platformBody.bodyType = RigidbodyType2D.Kinematic;
        platformBody.gravityScale = 0f;
        platformBody.freezeRotation = true;
    }

    private void Start() => MechanismGuideVisuals.AddRailgun(this);

    private void OnEnable()
    {
        EventBus.OnPlayerDied += CancelLaunch;
        EventBus.OnPlayerRespawned += CancelLaunch;
    }

    private void OnDisable()
    {
        EventBus.OnPlayerDied -= CancelLaunch;
        EventBus.OnPlayerRespawned -= CancelLaunch;
        CancelLaunch();
    }

    private void CancelLaunch()
    {
        if (launchPlayer != null) launchPlayer.CancelScriptedMotion(this);
        launchPlayer = null;
        isLaunching = returning = false;
        currentSpeed = returnDelay = 0f;
        if (platformBody != null) MovePlatform(startPosition);
        if (boxCollider != null) boxCollider.enabled = true;
    }

    private bool CanLaunch() => Time.timeScale > 0f && (GameManager.Instance == null ||
        GameManager.Instance.CurrentState == GameManager.GameState.SlowPacedPhase ||
        GameManager.Instance.CurrentState == GameManager.GameState.FastPacedPhase);

    protected override void OnPlayerStepped(PlayerController player)
    {
        if (isLaunching || returning || returnDelay > 0f || !CanLaunch() ||
            player == null || acceleration <= 0f || launchExitSpeed <= 0f ||
            launchDirection.sqrMagnitude < .001f) return;
        if (!player.TryBeginScriptedMotion(this)) return;
        launchPlayer = player;
        isLaunching = true;
        currentSpeed = 0f;
        routeIndex = 0;
        segmentStart = startPosition;
        endPosition = launchEndPoint != null ? launchEndPoint.position : startPosition + (Vector3)launchDirection.normalized * 5f;
        if (routePoints != null && routePoints.Length > 0 && routePoints[0] != null)
            endPosition = routePoints[0].position;
        var rider = player.GetComponent<Collider2D>().bounds;
        float halfRoom = Mathf.Max(0f, boxCollider.bounds.extents.x - rider.extents.x - .05f);
        riderOffset = new Vector3(Mathf.Clamp(player.transform.position.x - transform.position.x, -halfRoom, halfRoom),
            boxCollider.bounds.max.y - transform.position.y + player.transform.position.y - rider.min.y + .025f, 0f);
        CarryRider();
    }

    private void OnCollisionStay2D(Collision2D collision)
    {
        if (!collision.gameObject.CompareTag("Player")) return;
        foreach (var contact in collision.contacts)
            if (contact.normal.y < -.5f)
            {
                OnPlayerStepped(collision.gameObject.GetComponent<PlayerController>());
                break;
            }
    }

    public bool TryJumpOff(PlayerController player)
    {
        if (!CanLaunch() || !isLaunching || player == null || player != launchPlayer ||
            !player.IsScriptedMotionControlledBy(this)) return false;
        Vector3 velocity = (endPosition - segmentStart).normalized * currentSpeed;
        launchPlayer = null;
        // Let the empty platform finish its trip without catching the departing rider.
        boxCollider.enabled = false;
        player.CompleteScriptedMotion(this, new Vector2(velocity.x, player.jumpVelocity));
        return true;
    }

    private void FixedUpdate()
    {
        if (!CanLaunch()) return;
        if (isLaunching)
        {
            if (launchPlayer != null && !launchPlayer.IsScriptedMotionControlledBy(this))
            {
                CancelLaunch();
                return;
            }
            float step = Time.fixedDeltaTime;
            float distance = currentSpeed * step + .5f * acceleration * step * step;
            currentSpeed += acceleration * step;
            if (travelSpeedLimit > 0f)
            {
                currentSpeed = Mathf.Min(currentSpeed, travelSpeedLimit);
                distance = Mathf.Min(distance, travelSpeedLimit * step);
            }
            MovePlatform(Vector3.MoveTowards(transform.position, endPosition, distance));
            if (launchPlayer != null) CarryRider();
            if (Vector3.Distance(transform.position, endPosition) <= .001f)
            {
                if (routePoints != null && ++routeIndex < routePoints.Length && routePoints[routeIndex] != null)
                {
                    segmentStart = endPosition;
                    endPosition = routePoints[routeIndex].position;
                    return;
                }
                var player = launchPlayer;
                launchPlayer = null;
                isLaunching = false;
                // The empty carrier cannot catch or push the departing player on its return.
                boxCollider.enabled = false;
                returnDelay = .5f;
                returning = true;
                if (player != null) player.CompleteScriptedMotion(this, launchDirection.normalized * launchExitSpeed);
            }
        }
        else if (returning)
        {
            if (returnDelay > 0f) { returnDelay = Mathf.Max(0f, returnDelay - Time.fixedDeltaTime); return; }
            MovePlatform(Vector3.MoveTowards(transform.position, startPosition, 8f * Time.fixedDeltaTime));
            if (Vector3.Distance(transform.position, startPosition) <= .001f)
            {
                returning = false;
                boxCollider.enabled = true;
            }
        }
    }

    private void MovePlatform(Vector3 position)
    {
        platformBody.position = position;
        transform.position = position;
        platformBody.linearVelocity = Vector2.zero;
    }

    private void CarryRider()
    {
        launchPlayer.transform.position = transform.position + riderOffset;
        var body = launchPlayer.GetComponent<Rigidbody2D>();
        body.position = launchPlayer.transform.position;
        body.linearVelocity = Vector2.zero;
    }

    private void OnDrawGizmosSelected()
    {
        Gizmos.color = Color.yellow;
        Vector3 start = Application.isPlaying ? startPosition : transform.position;
        Vector3 end = launchEndPoint != null ? launchEndPoint.position : start + (Vector3)launchDirection * 5f;
        Gizmos.DrawLine(start, end);
        Gizmos.DrawWireSphere(end, .3f);
    }
}
