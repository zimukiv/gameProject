using UnityEngine;

/// <summary>
/// 基础关卡砖块：不可穿透，作为房间边框与平台使用
/// </summary>
[RequireComponent(typeof(BoxCollider2D))]
public class BaseBlock : MonoBehaviour
{
    protected BoxCollider2D boxCollider;
    protected SpriteRenderer spriteRenderer;

    protected virtual void Awake()
    {
        boxCollider = GetComponent<BoxCollider2D>();
        spriteRenderer = GetComponent<SpriteRenderer>();
    }
}
