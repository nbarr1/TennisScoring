export type ConfirmAction =
  | { type: 'cancel' }
  | { type: 'postpone'; newTime: number }
  | { type: 'delete'; message: string };

type ConfirmDialogCopy = {
  confirmTitle: string;
  confirmBody: string;
  confirmLabel: string;
};

export function getConfirmDialogCopy(
  confirmAction: ConfirmAction | null,
): ConfirmDialogCopy {
  if (!confirmAction) {
    return { confirmTitle: '', confirmBody: '', confirmLabel: '' };
  }

  switch (confirmAction.type) {
    case 'cancel':
      return {
        confirmTitle: 'Cancel this match?',
        confirmBody: 'This match will be marked as cancelled.',
        confirmLabel: 'Cancel Match',
      };
    case 'postpone':
      return {
        confirmTitle: 'Postpone this match?',
        confirmBody: `Postpone to ${new Date(confirmAction.newTime).toLocaleString()}?`,
        confirmLabel: 'Postpone Match',
      };
    case 'delete':
      return {
        confirmTitle: 'Delete this match?',
        confirmBody: confirmAction.message,
        confirmLabel: 'Delete Match',
      };
  }
}
