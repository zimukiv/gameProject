using System;
using System.Collections.Generic;
namespace RoomLab.Native
{
    [Flags] public enum MotionBinding {Left=1,Right=2,Up=4,Down=8,Jump=16,Dash=32,Interact=64}
    // Raw physical transitions keep two presses within a render frame distinct. OS key-repeat
    // is ignored until a real key-up; multiple bindings do not manufacture extra releases.
    public sealed class NativeKeyboardEvents
    {
        readonly Dictionary<int,MotionBinding> bindings=new Dictionary<int,MotionBinding>();
        readonly HashSet<int> held=new HashSet<int>();readonly Queue<MotionInput> edges=new Queue<MotionInput>(32);
        public bool Overflowed{get;private set;}public int PendingEdges{get{return edges.Count;}}
        public IEnumerable<int> BoundKeys{get{return bindings.Keys;}}
        public void Bind(int physical,MotionBinding action){bindings[physical]=action;}
        public MotionInput Held{get{MotionBinding flags=0;foreach(int key in held)flags|=bindings[key];return new MotionInput{left=(flags&MotionBinding.Left)!=0,right=(flags&MotionBinding.Right)!=0,up=(flags&MotionBinding.Up)!=0,down=(flags&MotionBinding.Down)!=0};}}
        public void Apply(int physical,bool down)
        {
            if(!bindings.TryGetValue(physical,out var action))return;
            if(!down){held.Remove(physical);return;}if(!held.Add(physical))return;
            if((action&(MotionBinding.Jump|MotionBinding.Dash|MotionBinding.Interact))==0)return;
            if(edges.Count>=64){edges.Clear();Overflowed=true;return;}var edge=Held;edge.jumpPressed=(action&MotionBinding.Jump)!=0;edge.dashPressed=(action&MotionBinding.Dash)!=0;edge.interactPressed=(action&MotionBinding.Interact)!=0;edges.Enqueue(edge);
        }
        public bool TryRead(out MotionInput input){if(edges.Count>0){input=edges.Dequeue();return true;}input=default(MotionInput);return false;}
        public void DiscardEdges(){edges.Clear();Overflowed=false;}
        public void Clear(){held.Clear();DiscardEdges();}
    }
}
