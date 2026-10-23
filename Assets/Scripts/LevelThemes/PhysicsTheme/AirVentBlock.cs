using System.Collections.Generic;
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
    public string guideText = "喷气口 ↑\nA / D 左右调整";

    [Header("Airflow Visuals")]
    [Tooltip("Legacy scene setting. Airflow is visible continuously; each visit launches only once.")]
    public bool isContinuous = false;
    public ParticleSystem ventParticles;
    private readonly HashSet<Collider2D> contacts = new HashSet<Collider2D>();
    private readonly HashSet<PlayerController> launchedPlayers = new HashSet<PlayerController>();

    private void Start()
    {
        MechanismGuideVisuals.AddAirVent(this);
        if (ventParticles != null) ventParticles.Play();
    }

    private void OnEnable() => EventBus.OnPlayerRespawned += ClearContacts;

    private void OnDisable()
    {
        EventBus.OnPlayerRespawned -= ClearContacts;
        ClearContacts();
    }

    private void ClearContacts()
    {
        contacts.Clear();
        launchedPlayers.Clear();
    }

    protected override void OnPlayerStepped(PlayerController player)
    {
        LaunchPlayer(player);
    }

    private void OnTriggerEnter2D(Collider2D other) => OnTriggerStay2D(other);

    private void OnTriggerStay2D(Collider2D other)
    {
        PlayerController player = other.GetComponentInParent<PlayerController>();
        if (player == null) return;
        contacts.Add(other);
        LaunchPlayer(player);
    }

    private void OnTriggerExit2D(Collider2D other)
    {
        contacts.Remove(other);
        PlayerController player = other.GetComponentInParent<PlayerController>();
        if (player == null) return;
        foreach (var contact in contacts)
            if (contact != null && contact.GetComponentInParent<PlayerController>() == player) return;
        launchedPlayers.Remove(player);
    }

    protected override void OnPlayerLeft(PlayerController player)
    {
        if (player != null) launchedPlayers.Remove(player);
    }

    private void LaunchPlayer(PlayerController player)
    {
        if (player == null || launchedPlayers.Contains(player) || upwardForce <= 0f) return;
        if (player.LaunchFromAirVent(ventDirection.normalized * upwardForce))
            launchedPlayers.Add(player);
    }
}
