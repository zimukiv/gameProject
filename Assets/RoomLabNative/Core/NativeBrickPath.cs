using System;
using Newtonsoft.Json.Linq;
namespace RoomLab.Native
{
    // RoomLab build11 path evaluation; elapsed seconds are reversible and checkpointed.
    public static class NativeBrickPath
    {
        public static double Duration(JArray path){double total=0;if(path!=null)foreach(var n in path)total+=(double)n["seconds"];return total;}
        public static NativePoint Position(double x,double y,JArray path,double time)
        {
            foreach(var n in path){double nx=(double)n["x"],ny=(double)n["y"],seconds=(double)n["seconds"];
                if(time<=seconds){double t=Math.Max(0,Math.Min(1,time/seconds));switch((string)n["mode"]){case "smooth":t=t*t*(3-2*t);break;case "easeIn":t*=t;break;case "easeOut":t=1-(1-t)*(1-t);break;}return new NativePoint(x+(nx-x)*t,y+(ny-y)*t);}
                time-=seconds;x=nx;y=ny;
            }return new NativePoint(x,y);
        }
    }
}
