export interface StoredFile {
  id: string;
  blob: Blob;
  name: string;
  type: string;
}
const DB_NAME = "workday-companion-files";
const openDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("files", { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () =>
      reject(new Error("无法打开本地文件库，请检查浏览器存储权限。"));
  });
export function validateFile(file: File) {
  if (file.size > 20 * 1024 * 1024)
    throw new Error("文件超过 20 MB，请选择较小的文件。");
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!["pdf", "png", "jpg", "jpeg", "txt"].includes(ext || ""))
    throw new Error("不支持此文件类型，请选择 PDF、PNG、JPG 或 TXT。");
  const types = [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "text/plain",
    "",
  ];
  if (!types.includes(file.type)) throw new Error("文件类型与支持格式不符。");
}
export const fileService = {
  async put(file: File, id = crypto.randomUUID()) {
    validateFile(file);
    const db = await openDB();
    try {
      await new Promise<void>((res, rej) => {
        const tx = db.transaction("files", "readwrite");
        tx.objectStore("files").put({
          id,
          blob: file,
          name: file.name,
          type: file.type,
        });
        tx.oncomplete = () => res();
        tx.onerror = () =>
          rej(new Error("文件保存失败，可能是浏览器存储空间不足。"));
        tx.onabort = () => rej(new Error("文件保存已中断。"));
      });
      return id;
    } finally {
      db.close();
    }
  },
  async get(id: string): Promise<StoredFile | undefined> {
    const db = await openDB();
    try {
      return await new Promise((res, rej) => {
        const r = db.transaction("files").objectStore("files").get(id);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(new Error("文件读取失败，请重试。"));
      });
    } finally {
      db.close();
    }
  },
  async remove(id: string) {
    const db = await openDB();
    try {
      await new Promise<void>((res, rej) => {
        const tx = db.transaction("files", "readwrite");
        tx.objectStore("files").delete(id);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(new Error("文件清理失败。"));
      });
    } finally {
      db.close();
    }
  },
  async clear() {
    const db = await openDB();
    try {
      await new Promise<void>((res, rej) => {
        const tx = db.transaction("files", "readwrite");
        tx.objectStore("files").clear();
        tx.oncomplete = () => res();
        tx.onerror = () => rej(new Error("无法清空本地文件，请重试。"));
      });
    } finally {
      db.close();
    }
  },
};
export const downloadBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
