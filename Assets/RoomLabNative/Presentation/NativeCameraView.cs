using UnityEngine;
namespace RoomLab.Native
{
    // Adaptive view for large rooms: when a room's play window is much smaller than the room, the
    // camera pulls back up to Zoom so the player can still read the level. Zoom 1.0 disables it.
    public static class NativeCameraView
    {
        public static float Zoom=1.3f;
        public static bool Enabled{get{return Zoom>1.0001f;}}
        public static float Apply(float baseSize,bool fitRoom,float roomCols,float roomRows,float cameraCols,float cameraRows,float aspect)
        {
            if(fitRoom||!Enabled)return baseSize;
            if(cameraCols<=0||cameraRows<=0||roomCols<=0||roomRows<=0)return baseSize;
            float factor=Mathf.Sqrt((roomCols/cameraCols)*(roomRows/cameraRows));
            factor=Mathf.Clamp(factor,1f,Mathf.Max(1f,Zoom));
            if(factor<=1.0001f)return baseSize;
            // Never pull back past the room itself, otherwise the view shows empty space around it.
            float limitY=Mathf.Max(baseSize,roomRows/2f);
            float limitX=Mathf.Max(baseSize,roomCols/(2f*Mathf.Max(.25f,aspect)));
            return Mathf.Min(baseSize*factor,Mathf.Min(limitY,limitX));
        }
    }
}
