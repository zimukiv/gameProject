using System.Collections;
using UnityEngine;

/// <summary>
/// 通用机关门：
/// 默认阻挡玩家，响应 TriggerButton 或代码调用 OpenDoor 后平滑升起开启，支持关门
/// </summary>
[RequireComponent(typeof(BoxCollider2D))]
public class DoorMechanism : BaseBlock, ICheckpointState
{
    [Header("Door Movement")]
    public Vector3 openOffset = new Vector3(0, 3.5f, 0); // 向上升起3.5米
    public float moveSpeed = 4.0f;
    public bool isOpen = false;

    private Vector3 closedPos;
    private Vector3 targetPos;
    private Coroutine moveCoroutine;

    protected override void Awake()
    {
        base.Awake();
        closedPos = transform.position;
        targetPos = closedPos;
    }

    public void OpenDoor()
    {
        if (isOpen) return;
        isOpen = true;
        targetPos = closedPos + openOffset;

        if (moveCoroutine != null) StopCoroutine(moveCoroutine);
        moveCoroutine = StartCoroutine(MoveToTarget());
        Debug.Log($"[DoorMechanism] 机关门 {gameObject.name} 开启！");
    }

    public void CloseDoor()
    {
        if (!isOpen) return;
        isOpen = false;
        targetPos = closedPos;

        if (moveCoroutine != null) StopCoroutine(moveCoroutine);
        moveCoroutine = StartCoroutine(MoveToTarget());
        Debug.Log($"[DoorMechanism] 机关门 {gameObject.name} 关闭！");
    }

    public void ToggleDoor()
    {
        if (isOpen) CloseDoor();
        else OpenDoor();
    }

    public object CaptureCheckpointState() => (isOpen, transform.position, targetPos);

    public void RestoreCheckpointState(object state)
    {
        var saved = ((bool open, Vector3 position, Vector3 target))state;
        if (moveCoroutine != null) StopCoroutine(moveCoroutine);
        isOpen = saved.open;
        transform.position = saved.position;
        targetPos = saved.target;
        moveCoroutine = null;
        if (isActiveAndEnabled && Vector3.Distance(transform.position, targetPos) > .02f)
            moveCoroutine = StartCoroutine(MoveToTarget());
    }

    private IEnumerator MoveToTarget()
    {
        while (Vector3.Distance(transform.position, targetPos) > 0.02f)
        {
            transform.position = Vector3.MoveTowards(transform.position, targetPos, moveSpeed * Time.deltaTime);
            yield return null;
        }
        transform.position = targetPos;
        moveCoroutine = null;
    }
}
