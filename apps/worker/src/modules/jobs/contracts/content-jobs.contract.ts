export const CONTENT_PROCESS_QUEUE_NAME = 'content-process';
export const CONTENT_PROCESS_JOB_NAME = 'process-file-content';

export type ContentProcessJobPayload = {
  fileId: string;
};
