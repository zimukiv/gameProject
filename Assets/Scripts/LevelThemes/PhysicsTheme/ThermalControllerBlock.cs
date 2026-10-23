using UnityEngine;

/// <summary>Linked control terminals share one temperature; E toggles the room's ice route.</summary>
[DefaultExecutionOrder(-50)]
public class ThermalControllerBlock : InteractiveBlock, ICheckpointState
{
    public enum TemperatureState { Cold, Hot }
    public TemperatureState currentState = TemperatureState.Hot;
    public ThermalControllerBlock linkedController;
    public IceBlock[] controlledIce;
    public string terminalName = "A";
    public float interactionRadius = 1.8f;
    public float controlRadius = 20f;
    public SpriteRenderer roomFilterOverlay;
    public Color coldFilterColor = new Color(.2f, .5f, 1f, .12f);
    public Color hotFilterColor = new Color(1f, .45f, .1f, .12f);
    private TextMesh sign;
    private string lastText;
    private float blockedUntil;
    private LineRenderer pulse;
    private Material pulseMaterial;
    private float pulseRemaining;

    private ThermalControllerBlock Authority => linkedController != null ? linkedController : this;
    public TemperatureState CurrentTemperature => Authority.currentState;

    private void Start()
    {
        if (Authority == this) ApplyStateEffects();
        sign = MechanismGuideVisuals.CreateLabel(transform, "", transform.position + Vector3.up * 1.25f,
            Color.white, .08f);
        var ring = new GameObject("Temperature wave");
        ring.transform.SetParent(transform, false);
        pulse = ring.AddComponent<LineRenderer>();
        pulseMaterial = new Material(Shader.Find("Sprites/Default"));
        pulse.sharedMaterial = pulseMaterial;
        pulse.useWorldSpace = true;
        pulse.loop = true;
        pulse.positionCount = 40;
        pulse.startWidth = pulse.endWidth = .045f;
        pulse.sortingOrder = 4;
        pulse.enabled = false;
        UpdateColors();
    }

    private void Update()
    {
        var player = PlayerController.Instance;
        bool nearby = player != null && player.gameObject.scene == gameObject.scene &&
            ((Vector2)(player.transform.position - transform.position)).sqrMagnitude <= interactionRadius * interactionRadius;
        bool playing = GameManager.Instance == null ||
            GameManager.Instance.CurrentState == GameManager.GameState.SlowPacedPhase ||
            GameManager.Instance.CurrentState == GameManager.GameState.FastPacedPhase;
        if (nearby && playing && Time.timeScale > 0f && GameInput.WasPressed(KeyCode.E)) ToggleTemperature();

        string text = terminalName + (CurrentTemperature == TemperatureState.Cold ? " · 冷态 ❄" : " · 热态 ♨");
        if (Time.time < blockedUntil) text += "\n请先离开冰块位置";
        else if (nearby) text += CurrentTemperature == TemperatureState.Cold ? "\n[E] 升温：融冰开路" : "\n[E] 降温：生成冰阶";
        else text += "\n靠近按 E 切换";
        if (sign != null && lastText != text) { sign.text = text; lastText = text; }

        if (pulseRemaining > 0f && pulse != null)
        {
            pulseRemaining = Mathf.Max(0f, pulseRemaining - Time.deltaTime);
            float progress = 1f - pulseRemaining / .65f;
            Color color = CurrentTemperature == TemperatureState.Cold ? Color.cyan : new Color(1f, .55f, .15f);
            color.a = 1f - progress;
            pulse.startColor = pulse.endColor = color;
            for (int i = 0; i < pulse.positionCount; i++)
            {
                float angle = i * Mathf.PI * 2f / pulse.positionCount;
                pulse.SetPosition(i, transform.position + new Vector3(Mathf.Cos(angle), Mathf.Sin(angle)) * (progress * 4f));
            }
            pulse.enabled = pulseRemaining > 0f;
        }
    }

    public void ToggleTemperature()
    {
        var root = Authority;
        var next = root.currentState == TemperatureState.Cold ? TemperatureState.Hot : TemperatureState.Cold;
        if (next == TemperatureState.Cold)
        {
            foreach (var ice in root.GetControlledIce())
                if (root.Controls(ice) && ice.OverlapsPlayer(PlayerController.Instance))
                {
                    blockedUntil = Time.time + 1.5f;
                    return;
                }
        }
        root.currentState = next;
        root.ApplyStateEffects();
        foreach (var terminal in FindObjectsOfType<ThermalControllerBlock>(true))
            if (terminal.gameObject.scene == gameObject.scene && terminal.Authority == root)
                terminal.pulseRemaining = .65f;
    }

    private IceBlock[] GetControlledIce()
    {
        if (controlledIce == null || controlledIce.Length == 0) controlledIce = FindObjectsOfType<IceBlock>(true);
        return controlledIce;
    }

    private bool Controls(IceBlock ice) => ice != null && ice.gameObject.scene == gameObject.scene &&
        ((Vector2)(ice.transform.position - transform.position)).sqrMagnitude <= controlRadius * controlRadius;

    private void ApplyStateEffects()
    {
        foreach (var ice in GetControlledIce())
            if (Controls(ice)) ice.SetTemperature(currentState == TemperatureState.Hot);
        foreach (var terminal in FindObjectsOfType<ThermalControllerBlock>(true))
            if (terminal.gameObject.scene == gameObject.scene && terminal.Authority == this)
            {
                terminal.currentState = currentState;
                terminal.UpdateColors();
            }
    }

    private void UpdateColors()
    {
        bool cold = CurrentTemperature == TemperatureState.Cold;
        if (spriteRenderer != null) spriteRenderer.color = cold ? new Color(.2f, .7f, 1f) : new Color(1f, .5f, .15f);
        if (roomFilterOverlay != null) roomFilterOverlay.color = cold ? coldFilterColor : hotFilterColor;
        if (sign != null) sign.color = cold ? new Color(.65f, .9f, 1f) : new Color(1f, .8f, .5f);
    }

    public object CaptureCheckpointState() => CurrentTemperature;
    public void RestoreCheckpointState(object state)
    {
        // All linked terminals and ice share this state, so restore order does not matter.
        Authority.currentState = (TemperatureState)state;
        Authority.ApplyStateEffects();
        pulseRemaining = 0f;
        if (pulse != null) pulse.enabled = false;
        blockedUntil = 0f;
    }

    private void OnDestroy()
    {
        if (pulseMaterial != null) Destroy(pulseMaterial);
    }
}
