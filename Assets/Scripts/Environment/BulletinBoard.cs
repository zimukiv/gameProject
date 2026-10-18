using UnityEngine;

/// <summary>
/// 引导系统：关卡起始布告栏/说明文档。
/// 严格遵守策划案：不强制打断玩家操作，不暂停移动，玩家靠近时平滑显示说明气泡。
/// </summary>
[RequireComponent(typeof(Collider2D))]
public class BulletinBoard : MonoBehaviour
{
    [Header("UI Prompt")]
    [TextArea(3, 8)]
    public string guideMessage = "【基础操作指南】\nA / D: 左右移动\nS: 下蹲\nW / Space: 跳跃\nShift: 8方向高速冲刺 (无方向默认面朝向前，WS同时按向上)\n收集 Token 可为冲刺充能，并作为启动 AI 的动力源！";

    public GameObject popupPanel;
    public CanvasGroup canvasGroup;
    public float fadeSpeed = 5f;

    private bool isPlayerNearby = false;

    private void Start()
    {
        if (canvasGroup != null)
        {
            canvasGroup.alpha = 0f;
        }
        else if (popupPanel != null)
        {
            popupPanel.SetActive(false);
        }
    }

    private void Update()
    {
        if (canvasGroup != null)
        {
            float targetAlpha = isPlayerNearby ? 1f : 0f;
            canvasGroup.alpha = Mathf.MoveTowards(canvasGroup.alpha, targetAlpha, fadeSpeed * Time.deltaTime);
            if (popupPanel != null)
            {
                popupPanel.SetActive(canvasGroup.alpha > 0.01f);
            }
        }
    }

    private void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Player"))
        {
            isPlayerNearby = true;
            if (popupPanel != null && canvasGroup == null)
            {
                popupPanel.SetActive(true);
            }
        }
    }

    private void OnTriggerExit2D(Collider2D other)
    {
        if (other.CompareTag("Player"))
        {
            isPlayerNearby = false;
            if (popupPanel != null && canvasGroup == null)
            {
                popupPanel.SetActive(false);
            }
        }
    }
}
