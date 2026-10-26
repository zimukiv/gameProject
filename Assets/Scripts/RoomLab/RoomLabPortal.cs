using UnityEngine;
public class RoomLabPortal : MonoBehaviour
{
    public Transform destination;
    private void OnTriggerEnter2D(Collider2D other)
    {
        var ai=other.GetComponent<EnemyAI>();
        if(ai!=null&&ai.isHunting&&destination!=null)
        { ai.transform.position=destination.position;ai.GetComponent<Rigidbody2D>().position=destination.position; }
    }
}
