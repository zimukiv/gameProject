using UnityEngine;

namespace RoomLab.Native
{
    public sealed partial class NativePixelWorld
    {
        SpriteRenderer previewVignette;

        bool UseWebPreviewBackground => Game.IsEditorBuild15 &&
            Game.Project.OriginalJson["mainlinePackage"] != null;

        void BuildWebPreviewBackground()
        {
            // The preview defaults to the unified math background. Keep the
            // attached 512 px tile at its native world scale.
            authorBackdrop = true;
            const string key = "preview-web-math-background";
            if(!pixels.TryGetValue(key,out var tile))
            {
                var texture=Resources.Load<Texture2D>("PhysicsPixel/"+key);
                if(texture==null)throw new NativeDataException("预览版背景素材缺失："+key);
                tile=Sprite.Create(texture,new Rect(0,0,texture.width,texture.height),new Vector2(.5f,.5f),32,0,SpriteMeshType.FullRect);
                pixels[key]=tile;
            }
            var paper=Add("Paper base", white, new MotionRect(null,0,0,Game.Room.Cols*32,Game.Room.Rows*32), -21);
            paper.color=new Color(.94f,.925f,.87f);
            themeBackdrop = Add("Web preview math grid", tile, new MotionRect(null,0,0,32,32), -20);
            themeBackdrop.transform.localScale = Vector3.one;
            themeBackdrop.drawMode = SpriteDrawMode.Tiled;
            themeBackdrop.color = new Color(1,1,1,.28f);
            previewVignette = Add("Web preview background vignette", WebPreviewVignette(), new MotionRect(null,0,0,32,32), -19);
        }

        Sprite WebPreviewVignette()
        {
            const string key = "preview-background-vignette";
            if(pixels.TryGetValue(key,out var cached)) return cached;
            const int width = 640, height = 360;
            const float inner = height * .24f, outer = width * .72f;
            var bayer = new[]{0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5};
            var dots = new Color32[width*height];
            for(int y=0;y<height;y++)for(int x=0;x<width;x++)
            {
                float dx=x-width/2f,dy=y-height/2f;
                float grade=Mathf.Clamp01((Mathf.Sqrt(dx*dx+dy*dy)-inner)/(outer-inner));
                float alpha=grade<.62f ? grade/.62f*.22f : .22f+(grade-.62f)/.38f*.46f;
                alpha=Mathf.Clamp01(Mathf.Floor(alpha*8+bayer[(y&3)*4+(x&3)]/16f)/8f);
                dots[y*width+x]=new Color32(46,35,30,(byte)Mathf.RoundToInt(alpha*66));
            }
            var texture=new Texture2D(width,height,TextureFormat.RGBA32,false){filterMode=FilterMode.Point,wrapMode=TextureWrapMode.Clamp};
            texture.SetPixels32(dots);
            texture.Apply(false,true);
            generatedTextures.Add(texture);
            return pixels[key]=Sprite.Create(texture,new Rect(0,0,width,height),new Vector2(.5f,.5f),32,0,SpriteMeshType.FullRect);
        }

        void RefreshWebPreviewBackground(Camera camera)
        {

            if(previewVignette==null)return;
            if(Game.IsEditorBuild15)previewVignette.enabled=Game.Room.Zones.Exists(z=>
                (Game.Player.x+Game.Player.w*.5)>=z.X*32&&(Game.Player.x+Game.Player.w*.5)<(z.X+z.W)*32&&
                (Game.Player.y+Game.Player.h*.5)>=z.Y*32&&(Game.Player.y+Game.Player.h*.5)<(z.Y+z.H)*32);
            float width=Game.Room.Cols,height=Game.Room.Rows;
            var center=new Vector3(width/2,height/2,0);
            themeBackdrop.size=new Vector2(width,height);
            themeBackdrop.transform.position=center;
            previewVignette.transform.position=center;
            previewVignette.transform.localScale=new Vector3(width/20,height/11.25f,1);
        }
    }
}
