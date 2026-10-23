using UnityEngine;

/// <summary>Thermal ice is solid when cold and absent when hot. It never melts on a timer.</summary>
public class IceBlock : InteractiveBlock, ICheckpointState
{
    public bool isMelted;
    public Color solidColor = new Color(.45f, .85f, 1f, 1f);
    public Color meltedColor = new Color(.45f, .85f, 1f, 0f);
    private LineRenderer outline;
    private TextMesh symbol;
    private Material outlineMaterial;

    protected override void Awake()
    {
        base.Awake();
        ApplyState();
    }

    private void Start()
    {
        symbol = MechanismGuideVisuals.CreateLabel(transform, "❄", transform.position, Color.white, .08f);
        var guide = new GameObject("Ice boundary");
        guide.transform.SetParent(transform, false);
        outline = guide.AddComponent<LineRenderer>();
        outlineMaterial = new Material(Shader.Find("Sprites/Default"));
        outline.sharedMaterial = outlineMaterial;
        outline.useWorldSpace = true;
        outline.loop = true;
        outline.positionCount = 4;
        outline.startWidth = outline.endWidth = .035f;
        outline.sortingOrder = 3;
        Bounds bounds = GetIceBounds();
        outline.SetPositions(new[] {
            new Vector3(bounds.min.x, bounds.min.y), new Vector3(bounds.max.x, bounds.min.y),
            new Vector3(bounds.max.x, bounds.max.y), new Vector3(bounds.min.x, bounds.max.y)
        });
        ApplyState();
    }

    private void ApplyState()
    {
        if (boxCollider != null) boxCollider.enabled = !isMelted;
        if (spriteRenderer != null) spriteRenderer.color = isMelted ? meltedColor : solidColor;
        if (symbol != null) symbol.gameObject.SetActive(!isMelted);
        if (outline != null)
        {
            Color color = isMelted ? new Color(1f, .7f, .3f, .12f) : new Color(.8f, .97f, 1f);
            outline.startColor = outline.endColor = color;
        }
    }

    public Bounds GetIceBounds()
    {
        Vector3 size = Vector3.Scale((Vector3)boxCollider.size, transform.lossyScale);
        size = new Vector3(Mathf.Abs(size.x), Mathf.Abs(size.y), .1f);
        return new Bounds(transform.TransformPoint(boxCollider.offset), size);
    }

    public bool OverlapsPlayer(PlayerController player)
    {
        if (player == null) return false;
        var playerCollider = player.GetComponent<Collider2D>();
        if (playerCollider == null) return false;
        Bounds ice = GetIceBounds();
        Bounds actor = playerCollider.bounds;
        const float skin = .03f;
        return actor.max.x > ice.min.x + skin && actor.min.x < ice.max.x - skin &&
            actor.max.y > ice.min.y + skin && actor.min.y < ice.max.y - skin;
    }

    public void Melt() => SetTemperature(true);
    public void Refreeze() => SetTemperature(false);

    public void SetTemperature(bool hot)
    {
        isMelted = hot;
        ApplyState();
    }

    public object CaptureCheckpointState() => isMelted;
    public void RestoreCheckpointState(object state) => SetTemperature((bool)state);

    private void OnDestroy()
    {
        if (outlineMaterial != null) Destroy(outlineMaterial);
    }
}
