/// <summary>Persistent mechanism state saved with the current room checkpoint.</summary>
public interface ICheckpointState
{
    object CaptureCheckpointState();
    void RestoreCheckpointState(object state);
}
