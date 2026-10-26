using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class RoomLabBuildValidation
{
    public static void Run()
    {
        PlayerSettings.companyName="MiniGame RoomLab Test";
        PlayerSettings.productName="RoomLab Unity Imported Playtest";
        PlayerSettings.fullScreenMode=FullScreenMode.Windowed;
        PlayerSettings.defaultScreenWidth=1280;PlayerSettings.defaultScreenHeight=720;
        PlayerSettings.defaultIsNativeResolution=false;
        AssetDatabase.SaveAssets();
        string file=Environment.GetEnvironmentVariable("ROOMLAB_IMPORT_JSON");
        var data=JsonUtility.FromJson<RoomLabProjectData>(File.ReadAllText(file));
        string directory=Path.GetDirectoryName(file)+"/Scenes";
        if(!Directory.Exists(directory)||Directory.GetFiles(directory,"Room*.unity").Length==0)RoomLabImporter.Batch();
        var scenes=Directory.GetFiles(directory,"Room*.unity").OrderBy(x=>x).Select(x=>x.Replace('\\','/')).ToArray();
        Require(scenes.Length==17,"scene count");
        int items=0,tiles=0;
        for(int i=0;i<scenes.Length;i++)
        {
            EditorSceneManager.OpenScene(scenes[i]);
            var context=UnityEngine.Object.FindObjectOfType<RoomLabRoom>();
            Require(context!=null&&context.roomId==data.rooms[i].id,"room identity");
            Require(context.transform.Find("Terrain").childCount==data.rooms[i].tiles.Length,"terrain completeness");
            var objects=UnityEngine.Object.FindObjectsOfType<RoomLabSourceObject>();
            Require(objects.Length==data.rooms[i].objects.Length,"object completeness");
            foreach(var o in objects)
            {
                var source=data.rooms[i].objects.Single(x=>x.id==o.sourceId);
                var expected=RoomLabCoordinates.Center(source.x,source.y,source.w,source.h,data.rooms[i].rows);
                if(source.type=="physics.jet"||source.type=="physics.thermal"||source.type=="physics.rail")expected.y=data.rooms[i].rows-source.y-.1f;
                Require(Vector3.Distance(o.transform.position,expected)<.001f,"source coordinate "+o.sourceId);
                if(source.type=="physics.rail")Require(o.GetComponent<RailgunBlock>().routePoints.Length==Math.Max(0,source.config.path.Length-1),"rail nodes");
            }
            var player=UnityEngine.Object.FindObjectOfType<PlayerController>();
            Require(player.moveSpeed==8&&player.jumpVelocity==15&&player.maxDashCharges==1,"preserve player rules");
            Require(UnityEngine.Object.FindObjectOfType<EnemyAI>().baseChaseSpeed==14,"preserve AI baseline");
            tiles+=data.rooms[i].tiles.Length;items+=objects.Length;
        }
        Require(tiles==1833&&items==571,"total imported geometry");
        Debug.Log("ROOMLAB_SCENE_AUDIT_PASS rooms=17 tiles=1833 objects=571");
        string output=Environment.GetEnvironmentVariable("ROOMLAB_BUILD_PATH");
        if(string.IsNullOrEmpty(output)||File.Exists(output))throw new IOException("Choose a new build output");
        Directory.CreateDirectory(Path.GetDirectoryName(output));
        var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions{scenes=scenes,locationPathName=output,target=BuildTarget.StandaloneWindows64,options=BuildOptions.None});
        Require(report.summary.result==BuildResult.Succeeded,"player build");
        Debug.Log("ROOMLAB_BUILD_PASS "+output);
    }
    private static void Require(bool value,string label){if(!value)throw new InvalidDataException(label);}
}
