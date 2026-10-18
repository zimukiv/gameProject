using UnityEngine;
using UnityEngine.Events;

/// <summary>
/// 通用触发踏板/按钮：
/// 玩家踩上去时触发 onButtonPressed 事件（可驱动门、升降梯、光源等），离开时可选择是否重置
/// </summary>
[RequireComponent(typeof(BoxCollider2D))]
public class TriggerButton : MonoBehaviour
{
    [Header("Button Settings")]
    public bool isOneShot = true; // 是否为一次性触发
    public bool isPressed = false;

    [Header("Visual Feedback")]
    public SpriteRenderer buttonRenderer;
    public Color unpressedColor = Color.red;
    public Color pressedColor = Color.green;
    public Vector3 pressOffset = new Vector3(0, -0.1f, 0);

    [Header("Events")]
    public UnityEvent onButtonPressed = new UnityEvent();
    public UnityEvent onButtonReleased = new UnityEvent();

    private Vector3 originalPos;

    private void Awake()
    {
        originalPos = transform.position;
        if (buttonRenderer == null) buttonRenderer = GetComponent<SpriteRenderer>();
        if (buttonRenderer != null) buttonRenderer.color = unpressedColor;
    }

    private void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Player") && !isPressed)
        {
            Press();
        }
    }

    private void OnTriggerExit2D(Collider2D other)
    {
        if (other.CompareTag("Player") && isPressed && !isOneShot)
        {
            Release();
        }
    }

    public void Press()
    {
        isPressed = true;
        if (buttonRenderer != null) buttonRenderer.color = pressedColor;
        transform.position = originalPos + pressOffset;

        Debug.Log($"[TriggerButton] 踏板 {gameObject.name} 被踩下！");
        onButtonPressed?.Invoke();
    }

    public void Release()
    {
        isPressed = false;
        if (buttonRenderer != null) buttonRenderer.color = unpressedColor;
        transform.position = originalPos;

        onButtonReleased?.Invoke();
    }
}
