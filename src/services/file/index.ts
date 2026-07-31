export { VFS } from './vfs.js';
export { LocalFileProvider } from './local-file-provider.js';
export { SSHFileService } from './ssh-service.js';
export type { SSHConfig } from './ssh-service.js';
export type { IFileService } from './ifile-service.js';
export type { IVFSProvider } from './ivfs-provider.js';
export { vfsToReal, realToVfs, vfsParent, vfsBaseName, vfsResolve } from './path-utils.js';
