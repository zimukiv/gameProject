type Opened = { path: string; text: string; fingerprint: string };
declare global {
  interface Window { levelFiles: {
    open(): Promise<Opened | null>; openSample(): Promise<Opened>;
    save(path: string, text: string, fingerprint: string): Promise<Opened>;
    saveAs(text: string): Promise<Opened | null>;
    openTemplate(): Promise<{ path: string; text: string } | null>;
    saveTemplate(text: string): Promise<string | null>;
  } }
}
export {};
