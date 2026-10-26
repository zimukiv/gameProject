using System;
using UnityEngine;

[Serializable] public class RoomLabProjectData
{
    public int importVersion;
    public string sourceSha256, projectName;
    public RoomLabRoomData[] rooms;
    public RoomLabConnection[] connections;
}
[Serializable] public class RoomLabRoomData
{
    public string id, name, environment, phase, aiPolicy;
    public int cols, rows;
    public RoomLabTile[] tiles;
    public RoomLabObject[] objects;
    public RoomLabPort[] entries, exits;
    public RoomLabZone[] zones;
}
[Serializable] public class RoomLabTile { public float x, y; public bool collision; }
[Serializable] public class RoomLabPort { public string id, name; public float x,y,w=1,h=1; public int face=1; }
[Serializable] public class RoomLabZone { public string id, name, initial; public float x,y,w,h; }
[Serializable] public class RoomLabObject
{
    public string id,type,name,sourceJson;
    public float x,y,w=1,h=1;
    public bool collision;
    public RoomLabConfig config;
    public RoomLabTrigger trigger;
}
[Serializable] public class RoomLabConfig
{
    public float launchX,launchY,acceleration,maxSpeed,launchAngle;
    public string zoneId,mode,initialState,routeId;
    public RoomLabPoint[] path;
}
[Serializable] public class RoomLabPoint { public float x,y; }
[Serializable] public class RoomLabTrigger { public bool requiresAI; public float distance=5; }
[Serializable] public class RoomLabConnection
{
    public RoomLabConnectionFrom from;
    public RoomLabConnectionTo to;
    public string velocity;
}
[Serializable] public class RoomLabConnectionFrom { public string roomId,exitId; }
[Serializable] public class RoomLabConnectionTo { public string roomId,entryId; }

public static class RoomLabCoordinates
{
    public static Vector3 Center(float x,float y,float w,float h,int rows) => new Vector3(x+w/2,rows-y-h/2,0);
}
