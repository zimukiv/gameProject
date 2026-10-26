using System.Collections;
using System.Linq;
using UnityEngine;
using UnityEngine.SceneManagement;

[DefaultExecutionOrder(200)]
public class RoomLabRoom : MonoBehaviour
{
    public string roomId,roomName,phase,aiPolicy;
    public string[] roomIds,roomNames,scenePaths;
    public string[] entryIds;
    public Vector3[] entryPositions;
    public int tileCount,objectCount;
    private bool chooseRoom,ending;
    private Vector2 scroll;
    private Font font;
    private static string pendingEntry;
    private static bool carry,wasFast;
    private static int tokens,charges,progress;
    private static float difficulty;
    private static Vector2 velocity;

    private IEnumerator Start()
    {
        yield return null; // SceneBootstrap initializes saves before the imported room entry.
        var player=PlayerController.Instance;
        int at=System.Array.IndexOf(entryIds,pendingEntry);
        if(at<0)at=0;
        player.ResetMotion();player.transform.position=entryPositions[at];
        if(carry)player.RestoreRunResources(tokens,charges,progress);
        bool hunt=aiPolicy!="off"&&(aiPolicy=="start"||phase=="fast"||(phase!="slow"&&carry&&wasFast));
        if(hunt)
        {
            int spent=carry&&wasFast?0:player.ConsumeAllTokens();
            EventBus.TriggerAIActivated(spent,carry&&wasFast?difficulty:TokenChaseSpeed.Calculate(spent,1f,.03f));
        }
        else { EnemyAI.Instance?.ResetChase(); GameManager.Instance.CurrentState=GameManager.GameState.SlowPacedPhase; }
        player.GetComponent<Rigidbody2D>().linearVelocity=carry?velocity:Vector2.zero;
        Physics2D.SyncTransforms();
        SaveManager.Instance.UpdateTempCheckpoint(player.transform.position,player.currentTokens,player.currentDashCharges);
        carry=false;pendingEntry=null;
        if(!Application.isBatchMode)font=Font.CreateDynamicFontFromOSFont("Microsoft YaHei",18);
    }
    private void Update()
    {
        if(GameInput.WasPressed(KeyCode.F1))chooseRoom=!chooseRoom;
        if(GameInput.WasPressed(KeyCode.R)&&!ending&&Time.timeScale>0)
            PlayerController.Instance?.GetComponent<PlayerHealthRespawn>().Die();
    }
    public void ExitTo(string targetRoom,string targetEntry,bool keepVelocity)
    {
        if(ending||Time.timeScale<=0)return;
        if(string.IsNullOrEmpty(targetRoom)) { ending=true;chooseRoom=true;GameManager.Instance.PauseGame();return; }
        int index=System.Array.IndexOf(roomIds,targetRoom);
        if(index<0)throw new System.InvalidOperationException("Unresolved RoomLab connection "+targetRoom);
        var p=PlayerController.Instance;
        tokens=p.currentTokens;charges=p.currentDashCharges;progress=p.dashChargeProgress;
        wasFast=GameManager.Instance.CurrentState==GameManager.GameState.FastPacedPhase;
        difficulty=GameManager.Instance.currentAIDifficulty;
        velocity=keepVelocity?p.GetComponent<Rigidbody2D>().linearVelocity:Vector2.zero;
        carry=true;pendingEntry=targetEntry;ending=true;Load(scenePaths[index]);
    }
    public static void Load(string path)
    {
        Time.timeScale=1f;
#if UNITY_EDITOR
        if(!Application.CanStreamedLevelBeLoaded(path))
        {
            UnityEditor.SceneManagement.EditorSceneManager.LoadSceneInPlayMode(path,new LoadSceneParameters(LoadSceneMode.Single));
            return;
        }
#endif
        SceneManager.LoadScene(path);
    }
    private void OnGUI()
    {
        if(font!=null)GUI.skin.font=font;
        var p=PlayerController.Instance;
        GUI.Box(new Rect(8,8,650,80),roomName+"  |  Unity 规则试玩");
        GUI.Label(new Rect(20,34,630,25),"A/D 移动 · 空格/W 跳跃 · Shift 水平冲刺 · E 温控 · R 重试 · F1 选房");
        GUI.Label(new Rect(20,58,630,25),p==null?"加载中":$"Token {p.currentTokens}   冲刺 {p.currentDashCharges}/1   充能 {p.dashChargeProgress}/3   {GameManager.Instance.CurrentState}");
        bool paused=GameManager.Instance!=null&&GameManager.Instance.CurrentState==GameManager.GameState.Paused;
        if(paused&&!ending&&GUI.Button(new Rect(8,95,120,32),"继续试玩"))GameManager.Instance.ResumeGame();
        if(GUI.Button(new Rect(Screen.width-140,8,130,32),"选择房间 (F1)"))chooseRoom=!chooseRoom;
        if(!chooseRoom)return;
        GUILayout.BeginArea(new Rect(Screen.width-300,48,290,Mathf.Max(200,Screen.height-60)),GUI.skin.box);
        GUILayout.Label(ending?"当前房间出口未接线，单房测试结束":"单房测试（从入口重新开始）");
        scroll=GUILayout.BeginScrollView(scroll);
        for(int i=0;i<roomIds.Length;i++)if(GUILayout.Button((i+1)+". "+roomNames[i],GUILayout.Height(30)))
        { carry=false;pendingEntry=null;Load(scenePaths[i]); }
        GUILayout.EndScrollView();GUILayout.EndArea();
    }
    private void OnDestroy(){if(font!=null)Destroy(font);}
}
