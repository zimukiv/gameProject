using UnityEngine;

// Serialized identity for objects created by the level importer. Source scenes use a sidecar.
public sealed class LevelObjectId : MonoBehaviour
{
    [SerializeField] private string objectId;
    public string ObjectId => objectId;

    public void SetId(string value) => objectId = value;
}
