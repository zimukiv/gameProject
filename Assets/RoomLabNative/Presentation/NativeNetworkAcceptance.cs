using System;
using System.Collections;
using System.Linq;
using UnityEngine;
using UnityEngine.UI;
namespace RoomLab.Native
{
    public sealed partial class NativePhysicsDemoPlayer
    {
        IEnumerator VerifyNetworkPresentation()
        {
            if(!Game.IsNetwork)yield break;
            bool originalPreference=courseMapPreferred;
            if(Game.IsAwarenessResource){
                if(awarenessHud==null||awarenessValue==null)throw new Exception("Resource HUD missing");
                foreach(double value in new[]{20d,50d,80d}){Game.Awareness=value;TickAwarenessHud();yield return Capture("network-awareness-"+value);}
                Game.Awareness=50;Game.RequestAwareness(80);TickAwarenessHud();yield return Capture("network-awareness-pending");
            }
            double clock=Game.Elapsed;var position=new Vector2((float)Game.Player.x,(float)Game.Player.y);
            courseMapPreferred=false;OpenExplorationMap();yield return new WaitForSecondsRealtime(.25f);
            for(int i=0;i<30;i++)Game.Tick(NativeMotion.Step);
            if(Game.Mode!="paused"||Game.Elapsed!=clock||position!=new Vector2((float)Game.Player.x,(float)Game.Player.y))throw new Exception("Map must pause clock and movement");
            yield return Capture("network-"+Game.Course.Kind+"-panorama");
            Screen.SetResolution(1024,768,FullScreenMode.Windowed);yield return new WaitForSecondsRealtime(.4f);
            if(page!="exploration-map"||Game.Mode!="paused"||Game.Elapsed!=clock)throw new Exception("Resizing map resumed simulation");
            yield return Capture("network-"+Game.Course.Kind+"-panorama-resized");
            Screen.SetResolution(1280,720,FullScreenMode.Windowed);yield return new WaitForSecondsRealtime(.4f);
            courseMapPreferred=true;OpenExplorationMap();yield return null;
            var text=panels.GetComponentsInChildren<Text>();foreach(var room in Game.Course.Rooms)if(!Game.VisitedRooms.Contains(room.Id)&&text.Any(t=>t.text==MapRoomName(room)))throw new Exception("Map exposed unexplored room name");
            if(panels.GetComponentInChildren<NativeCourseGraphGraphic>()==null)throw new Exception("Explored graph missing");
            yield return Capture("network-"+Game.Course.Kind+"-explored-map");
            // Synthetic discovery is isolated to rendering acceptance; it is not route completion.
            foreach(var room in Game.Course.Rooms)Game.VisitedRooms.Add(room.Id);foreach(var edge in Game.Course.Connections)Game.TraversedConnections.Add(edge.Id);
            OpenExplorationMap();yield return Capture("network-"+Game.Course.Kind+"-full-graph-render-only");
            var graphProblems=new System.Collections.Generic.List<string>();NativeUiKit.Validate((RectTransform)panels,graphProblems,NativeUiKit.WorldRect(ui));if(graphProblems.Count>0)throw new Exception("Network map layout: "+string.Join("; ",graphProblems));
            CloseExplorationMap(true);if(map||page!="play"||Game.Mode!="playing")throw new Exception("Map close failed");
            Show("pause");if(!panels.GetComponentsInChildren<Text>().Any(t=>t.text=="从上个存档点开始"))throw new Exception("Checkpoint button missing");
            Show("settings");yield return Capture("network-"+Game.Course.Kind+"-map-settings");
            var problems=new System.Collections.Generic.List<string>();NativeUiKit.Validate((RectTransform)panels,problems,NativeUiKit.WorldRect(ui));if(problems.Count>0)throw new Exception("Network settings layout: "+string.Join("; ",problems));
            courseMapPreferred=originalPreference;SaveSettings();NewGame();
            Debug.Log("NETWORK_UI_PASS "+Game.Course.Kind+" mapPaused=true discoveryFiltered=true checkpointButton=true resourceHud="+Game.IsAwarenessResource);
        }
    }
}
