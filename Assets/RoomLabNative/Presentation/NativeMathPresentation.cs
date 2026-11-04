using System;
using System.Collections.Generic;
using UnityEngine;
namespace RoomLab.Native {
    // Presentation only: fixed geometry buffers, one renderer, no physics or author-data writes.
    public sealed class NativeMathPresentation : IDisposable {
        readonly NativeMotion game;
        readonly GameObject root;
        readonly Mesh mesh;
        readonly Material material;
        readonly Vector3[] points;
        readonly Color[] colors;
        readonly Link[] links;
        readonly float rows;
        struct Link { public NativeRegion block; public int offset; public Vector3 start,end; }
        public NativeMathPresentation(NativeMotion game,Transform parent,bool authorBackground=false) {
            this.game=game;rows=game.Room.Rows;
            root=new GameObject("Mathematical motion guides");root.transform.SetParent(parent,false);
            mesh=new Mesh{name="Calculus coordinate and motion lines"};mesh.MarkDynamic();
            material=new Material(Shader.Find("Sprites/Default")){name="Calculus guide ink"};
            root.AddComponent<MeshFilter>().sharedMesh=mesh;
            var renderer=root.AddComponent<MeshRenderer>();renderer.sharedMaterial=material;renderer.sortingOrder=-2;
            var vertices=new List<Vector3>();var ink=new List<Color>();var dynamicLinks=new List<Link>();
            void Segment(Vector3 a,Vector3 b,Color color){vertices.Add(a);vertices.Add(b);ink.Add(color);ink.Add(color);}
            Vector3 Grid(float x,float y)=>new Vector3(x,rows-y,0);
            var room=game.Room;
            bool ownBackground=authorBackground;
            if(!ownBackground){
                var grid=new Color(.35f,.65f,.68f,.12f);int step=Math.Max(2,(int)Math.Ceiling(Math.Max(room.Cols,room.Rows)/48.0));
                for(int x=0;x<=room.Cols;x+=step)Segment(Grid(x,0),Grid(x,room.Rows),grid);
                for(int y=0;y<=room.Rows;y+=step)Segment(Grid(0,y),Grid(room.Cols,y),grid);
                var axis=new Color(.55f,.78f,.72f,.3f);Segment(Grid(1,room.Rows-1),Grid(room.Cols-1,room.Rows-1),axis);Segment(Grid(1,room.Rows-1),Grid(1,1),axis);
                Segment(Grid(room.Cols-1,room.Rows-1),Grid(room.Cols-1.35f,room.Rows-1.2f),axis);Segment(Grid(1,1),Grid(1.2f,1.35f),axis);
            }
            foreach(var block in room.Movables){
                var from=Grid(block.X+.5f,block.Y+.5f);float tx=(float?)block.Raw["targetX"]??block.X,ty=(float?)block.Raw["targetY"]??block.Y;
                var to=Grid(tx+.5f,ty+.5f);var faint=new Color(.1f,.2f,.28f,.48f);
                Segment(from,to,faint);
                Segment(Grid(tx,ty),Grid(tx+1,ty),faint);Segment(Grid(tx+1,ty),Grid(tx+1,ty+1),faint);Segment(Grid(tx+1,ty+1),Grid(tx,ty+1),faint);Segment(Grid(tx,ty+1),Grid(tx,ty),faint);
                int offset=vertices.Count;for(int i=0;i<3;i++)Segment(from,from,faint);
                dynamicLinks.Add(new Link{block=block,offset=offset,start=from,end=to});
            }
            points=vertices.ToArray();colors=ink.ToArray();links=dynamicLinks.ToArray();int[] indices=new int[points.Length];for(int i=0;i<indices.Length;i++)indices[i]=i;
            mesh.vertices=points;mesh.colors=colors;mesh.SetIndices(indices,MeshTopology.Lines,0);mesh.bounds=new Bounds(new Vector3(room.Cols/2f,rows/2f),new Vector3(room.Cols+4,rows+4,2));
            Refresh(0);
        }
        public void Refresh(double dt){
            // Progress comes from the real transform animation (including retry/continuation).
            foreach(var link in links){if(!game.Movables.TryGetValue(link.block.Id,out var state))continue;
                var rect=game.MovableRect(link.block);var current=new Vector3((float)(rect.x+rect.w/2)/32,rows-(float)(rect.y+rect.h/2)/32,0);
                int i=link.offset;points[i]=link.start;points[i+1]=current;
                points[i+2]=current+new Vector3(-.16f,0);points[i+3]=current+new Vector3(.16f,0);
                points[i+4]=current+new Vector3(0,-.16f);points[i+5]=current+new Vector3(0,.16f);
                bool derivative=state.anim!=null&&state.anim.to<state.anim.from;var color=state.anim!=null?(derivative?new Color(.06f,.35f,.4f,.8f):new Color(.3f,.16f,.48f,.8f)):new Color(.1f,.2f,.28f,.5f);
                for(int j=0;j<6;j++)colors[i+j]=color;
            }
            if(links.Length>0){mesh.vertices=points;mesh.colors=colors;}
        }
        public void Dispose(){root.SetActive(false);NativeDemoAssets.Release(root);NativeDemoAssets.Release(mesh);NativeDemoAssets.Release(material);}
    }
}
