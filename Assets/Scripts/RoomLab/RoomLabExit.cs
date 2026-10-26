using UnityEngine;
public class RoomLabExit : MonoBehaviour
{
    public RoomLabRoom room;
    public string targetRoom,targetEntry;
    public bool keepVelocity;
    private void OnTriggerEnter2D(Collider2D other)
    {
        if(other.GetComponent<PlayerController>()!=null)room.ExitTo(targetRoom,targetEntry,keepVelocity);
    }
}
