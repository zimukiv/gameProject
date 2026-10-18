using UnityEngine;

/// <summary>
/// 互动砖块基类：继承自 BaseBlock，提供玩家站立检测与交互触发虚方法
/// </summary>
public abstract class InteractiveBlock : BaseBlock
{
    [Header("Interaction Settings")]
    public bool isInteractable = true;

    protected bool isPlayerSteppingOn = false;

    protected virtual void OnCollisionEnter2D(Collision2D collision)
    {
        if (collision.gameObject.CompareTag("Player"))
        {
            // 判断是否是从上方踩踏
            foreach (ContactPoint2D contact in collision.contacts)
            {
                if (contact.normal.y < -0.5f)
                {
                    isPlayerSteppingOn = true;
                    OnPlayerStepped(collision.gameObject.GetComponent<PlayerController>());
                    break;
                }
            }
        }
    }

    protected virtual void OnCollisionExit2D(Collision2D collision)
    {
        if (collision.gameObject.CompareTag("Player"))
        {
            isPlayerSteppingOn = false;
            OnPlayerLeft(collision.gameObject.GetComponent<PlayerController>());
        }
    }

    protected virtual void OnPlayerStepped(PlayerController player) { }
    protected virtual void OnPlayerLeft(PlayerController player) { }
}
