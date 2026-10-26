using System;
using UnityEngine;

[DefaultExecutionOrder(-60)]
public class RoomLabTemperature : MonoBehaviour,ICheckpointState
{
    [Serializable] public class Zone { public string id; public Rect bounds; public bool hot; }
    [Serializable] public class Terminal { public Transform point; public string zoneId,mode; }
    public bool roomHot;
    public Zone[] zones;
    public Terminal[] terminals;
    public IceBlock[] ice;
    private void Start()=>Apply();
    private void Update()
    {
        if(Time.timeScale<=0||PlayerController.Instance==null||!GameInput.WasPressed(KeyCode.E))return;
        if(GameManager.Instance!=null&&GameManager.Instance.CurrentState!=GameManager.GameState.SlowPacedPhase&&GameManager.Instance.CurrentState!=GameManager.GameState.FastPacedPhase)return;
        Terminal nearest=null;float distance=1.8f;
        foreach(var terminal in terminals)
        {
            float d=Vector2.Distance(terminal.point.position,PlayerController.Instance.transform.position);
            if(d<distance){distance=d;nearest=terminal;}
        }
        if(nearest==null)return;
        var previous=CaptureCheckpointState();
        Zone zone=Array.Find(zones,z=>z.id==nearest.zoneId);
        bool old=zone==null?roomHot:zone.hot;
        bool next=nearest.mode=="cold"?false:nearest.mode=="hot"?true:!old;
        if(zone==null)roomHot=next;else zone.hot=next;
        foreach(var block in ice)
            if(!HotAt(block)&&block.isMelted&&block.OverlapsPlayer(PlayerController.Instance))
            { RestoreCheckpointState(previous);return; }
        Apply();
    }
    private bool HotAt(IceBlock block)
    {
        var b=block.GetIceBounds();var r=new Rect(b.min.x,b.min.y,b.size.x,b.size.y);
        bool inside=false;
        foreach(var z in zones)if(z.bounds.Overlaps(r)){inside=true;if(z.hot)return true;}
        return inside?false:roomHot;
    }
    private void Apply()
    {
        foreach(var b in ice)if(b!=null)b.SetTemperature(HotAt(b));
        foreach(var t in terminals)
        { var z=Array.Find(zones,x=>x.id==t.zoneId);t.point.GetComponent<SpriteRenderer>().color=(z==null?roomHot:z.hot)?new Color(1,.4f,.1f):Color.cyan; }
    }
    public object CaptureCheckpointState()
    {
        bool[] state=new bool[zones.Length+1];state[0]=roomHot;
        for(int i=0;i<zones.Length;i++)state[i+1]=zones[i].hot;
        return state;
    }
    public void RestoreCheckpointState(object value)
    { var s=(bool[])value;roomHot=s[0];for(int i=0;i<zones.Length;i++)zones[i].hot=s[i+1];Apply(); }
}
