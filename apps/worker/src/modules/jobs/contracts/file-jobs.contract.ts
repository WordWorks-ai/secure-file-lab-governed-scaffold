export const FILE_SCAN_QUEUE_NAME = 'file-scan';
export const FILE_SCAN_JOB_NAME = 'scan-file';

export const MAINTENANCE_QUEUE_NAME = 'maintenance';
export const EXPIRE_FILES_JOB_NAME = 'expire-files';
export const CLEANUP_FILES_JOB_NAME = 'cleanup-files';

export type FileScanJobPayload = {
  fileId: string;
};
