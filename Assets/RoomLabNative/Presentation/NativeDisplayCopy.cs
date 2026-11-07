using System;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace RoomLab.Native
{
    // Display aliases are deliberately outside the level document and continuation data.
    // An edited/imported level has a different source hash and keeps its author's wording.
    public static class NativeDisplayCopy
    {
        static JObject catalog;
        static string catalogSha;
        static JObject Catalog {
            get {
                if(catalog!=null)return catalog;
                try {
                    var asset=Resources.Load<TextAsset>("DisplayCopy/contact-auto");
                    if(asset==null)throw new InvalidOperationException("Missing display copy catalog");
                    catalog=JObject.Parse(asset.text);catalogSha=NativeProjectLoader.Sha(asset.bytes);
                } catch(Exception error) { Debug.LogWarning("DISPLAY_COPY_FALLBACK "+error.Message);catalog=new JObject(); }
                return catalog;
            }
        }
        public static string CatalogSha256 {get{var loaded=Catalog;return catalogSha??"";}}
        public static bool Active(NativeMotion game)=>game!=null&&game.IsContactAutosave&&game.Project.SourceSha256==(string)Catalog["sourceSha256"];
        static JObject Entry(string course,string room)=>Catalog["courses"]?[course]?["rooms"]?[room] as JObject;
        static string Field(JObject entry,string key,string fallback)=>entry?[key]?.Type==JTokenType.String?(string)entry[key]:fallback;
        public static string Name(NativeMotion game,string course,string room,string fallback)
        {
            return Active(game)?Field(Entry(course,room),"name",fallback):fallback;
        }
        public static bool HasRoom(NativeMotion game,NativeRoom room)=>Active(game)&&Entry(game.Course.Id,room.Id)!=null;
        public static void Apply(NativeMotion game)
        {
            if(!Active(game))return;
            foreach(var course in game.Project.Courses)foreach(var room in course.Rooms) {
                var entry=Entry(course.Id,room.Id);
                if(entry!=null&&(string)room.Raw["name"]==Field(entry,"originalName",null))room.Name=Field(entry,"name",room.Name);
            }
        }
        public static string Text(NativeMotion game,string key,string fallback="")=>Active(game)?Field(Entry(game.Course.Id,game.Room.Id),key,fallback):fallback;
        public static string Locked(NativeMotion game,NativeRegion exit,string fallback)
        {
            if(!Active(game))return fallback;
            if(exit==null)return "还没到齐。";
            var value=Entry(game.Course.Id,game.Room.Id)?["locked"]?[exit.Id];
            return value?.Type==JTokenType.String?(string)value:"这一页还合着。";
        }
        public static string SavedRoom(NativeMotion game,JObject data,string fallback)
        {
            if(!Active(game))return fallback;
            var snapshot=data?["continuation"] as JObject;
            if(snapshot?["course"]?.Type!=JTokenType.String||snapshot["room"]?.Type!=JTokenType.String)return fallback;
            return Name(game,(string)snapshot["course"],(string)snapshot["room"],fallback);
        }
    }
}
