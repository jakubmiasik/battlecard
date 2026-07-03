import type { MouseEvent, ReactNode } from 'react';

type ModalProps = {
  open: boolean;
  title: string;
  message?: string;
  children?: ReactNode;
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'confirm' | 'info';
};

export default function Modal({
  open,
  title,
  message,
  children,
  onConfirm,
  onCancel,
  confirmLabel,
  cancelLabel,
  variant = 'info',
}: ModalProps) {
  if (!open) return null;

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onCancel?.();
    }
  };

  const confirmText = confirmLabel ?? (variant === 'confirm' ? 'Confirm' : 'OK');

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick} role="presentation">
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={(event) => event.stopPropagation()}>
        <h3 id="modal-title">{title}</h3>
        {message && <p className="muted">{message}</p>}
        {children}
        <div className="modal-actions">
          {variant === 'confirm' && (
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              {cancelLabel ?? 'Cancel'}
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={onConfirm ?? onCancel}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
