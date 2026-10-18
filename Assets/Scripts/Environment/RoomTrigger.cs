using UnityEngine;

/// <summary>
/// 房间区域触发器：进入新房间后可联动检查点，并触发边界或相机切换
/// </summary>
[RequireComponent(typeof(Collider2D))]
public class RoomTrigger : MonoBehaviour
{
    public int roomId;
    public Checkpoint roomCheckpoint;

    private void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Player"))
        {
            if (roomCheckpoint != null && !roomCheckpoint.isActivated)
            {
                roomCheckpoint.ActivateCheckpoint(other.GetComponent<PlayerController>());
            }
        }
    }
}
