using UnityEngine;

/// <summary>
/// 关卡1（物理）：喷气装置
/// 踩上去或进入喷流范围时，将玩家向指定方向（默认垂直向上）强力喷射推起
/// </summary>
public class AirVentBlock : InteractiveBlock
{
    [Header("Air Vent Force")]
    public Vector2 ventDirection = Vector2.up;
    public float upwardForce = 22f;

    [Header("Continuous or Trigger")]
    public bool isContinuous = false;
    public ParticleSystem ventParticles;

    protected override void OnPlayerStepped(PlayerController player)
    {
        if (player != null)
        {
            LaunchPlayer(player);
        }
    }

    private void OnTriggerStay2D(Collider2D other)
    {
        if (isContinuous && other.CompareTag("Player"))
        {
            PlayerController pc = other.GetComponent<PlayerController>();
            if (pc != null)
            {
                LaunchPlayer(pc);
            }
        }
    }

    private void LaunchPlayer(PlayerController player)
    {
        player.ForceLaunch(ventDirection.normalized * upwardForce);
        if (ventParticles != null && !ventParticles.isPlaying)
        {
            ventParticles.Play();
        }
    }
}
