export const SEARCH_INDEX_QUEUE_NAME = 'search-index';
export const SEARCH_INDEX_JOB_NAME = 'index-file';

export type SearchIndexAction = 'upsert' | 'delete';

export type SearchIndexJobPayload = {
  action: SearchIndexAction;
  fileId: string;
};
