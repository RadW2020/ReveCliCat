export interface Writer {
  write(s: string): unknown;
}
export interface Io {
  stdout: Writer;
  stderr: Writer;
}
export const defaultIo: Io = { stdout: process.stdout, stderr: process.stderr };
export const println = (w: Writer, s = ""): void => {
  w.write(s + "\n");
};
