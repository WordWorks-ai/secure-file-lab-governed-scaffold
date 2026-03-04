import { BadRequestException, ValidationError } from '@nestjs/common';

type ValidationIssue = {
  field: string;
  constraints: string[];
};

function collectValidationIssues(errors: ValidationError[], parentPath = ''): ValidationIssue[] {
  return errors.flatMap((error) => {
    const fieldPath = parentPath ? `${parentPath}.${error.property}` : error.property;
    const constraints = error.constraints ? Object.values(error.constraints) : [];
    const current: ValidationIssue[] = constraints.length > 0 ? [{ field: fieldPath, constraints }] : [];
    const nested = error.children ? collectValidationIssues(error.children, fieldPath) : [];

    return [...current, ...nested];
  });
}

export function createValidationException(errors: ValidationError[]): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: 'Request validation failed',
    errors: collectValidationIssues(errors),
  });
}
