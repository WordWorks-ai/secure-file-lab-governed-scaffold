export const FILE_STATUSES = [
  'created',
  'stored',
  'quarantined',
  'scan_pending',
  'active',
  'blocked',
  'expired',
  'deleted',
] as const;

export type FileStatus = (typeof FILE_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<FileStatus, FileStatus[]> = {
  created: ['stored', 'deleted'],
  stored: ['quarantined', 'deleted'],
  quarantined: ['scan_pending', 'blocked', 'deleted'],
  scan_pending: ['active', 'blocked', 'deleted'],
  active: ['expired', 'deleted'],
  blocked: ['deleted'],
  expired: ['deleted'],
  deleted: [],
};

export function canTransitionFileStatus(from: FileStatus, to: FileStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function requireFileStatusTransition(from: FileStatus, to: FileStatus): void {
  if (!canTransitionFileStatus(from, to)) {
    throw new Error(`Illegal file status transition: ${from} -> ${to}`);
  }
}

export function isFileDownloadAllowed(status: FileStatus): boolean {
  return status === 'active';
}
