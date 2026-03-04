import { FileStatus } from '@prisma/client';

const ALLOWED_TRANSITIONS: Record<FileStatus, FileStatus[]> = {
  created: ['stored', 'deleted'],
  stored: ['quarantined', 'deleted'],
  quarantined: ['scan_pending', 'blocked', 'deleted'],
  scan_pending: ['active', 'blocked', 'deleted'],
  active: ['blocked', 'expired', 'deleted'],
  blocked: ['deleted'],
  expired: ['deleted'],
  deleted: [],
};

export function requireFileStatusTransition(from: FileStatus, to: FileStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new Error(`Illegal file status transition: ${from} -> ${to}`);
  }
}

export function isFileDownloadAllowed(status: FileStatus): boolean {
  return status === 'active';
}
