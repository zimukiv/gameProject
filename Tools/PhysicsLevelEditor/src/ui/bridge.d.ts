type Opened = { path: string; text: string; fingerprint: string };
import type {ProjectManifestV1,RoomId} from '../model/m1-contract.ts';
import type {OpenRoom,RoomOverlay} from '../editor/release-project.ts';
declare global {
  interface Window { releaseProject: {
    overview():Promise<ProjectManifestV1>;
    open(roomId:RoomId):Promise<OpenRoom>;
    save(roomId:RoomId,overlay:RoomOverlay,expected:string|null):Promise<OpenRoom>;
    playtest(roomId:RoomId,overlay:RoomOverlay,expected:string|null,
      rect:{x:number;y:number;width:number;height:number}):Promise<{
      sessionId:string;pid:number|undefined;receiptPath:string;logPath:string;
      appliedCount:number;runnerPath:string}>;
    resizePlaytest(rect:{x:number;y:number;width:number;height:number}):Promise<boolean>;
    focusPlaytest():Promise<void>;
    stopPlaytest():Promise<void>;
    onPlaytestExit(listener:(result:{sessionId:string;exitCode:number|null})=>void):()=>void;
    onPlaytestEvent(listener:(event:{type:string;line?:string;message?:string;
      sessionId?:string;exitCode?:number|null})=>void):()=>void;
  }; levelFiles: {
    open(): Promise<Opened | null>; openSample(): Promise<Opened>;
    save(path: string, text: string, fingerprint: string): Promise<Opened>;
    saveAs(text: string): Promise<Opened | null>;
    openTemplate(): Promise<{ path: string; text: string } | null>;
    saveTemplate(text: string): Promise<string | null>;
  } }
}
export {};
