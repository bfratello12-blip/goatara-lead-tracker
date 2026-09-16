import * as Dialog from '@radix-ui/react-dialog';
import * as Tooltip from '@radix-ui/react-tooltip';
import { ArrowUpRight, Building2, CircleAlert, LoaderCircle, X, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  cloneElement,
  isValidElement,
  useId,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { Company, TeamMember } from '../../shared/crm.ts';
import { stageLabels } from '../../shared/crm.ts';
import { initials } from '../lib.ts';

export function Button({
  children,
  className = '',
  variant = 'secondary',
  busy,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  busy?: boolean;
}) {
  return (
    <button {...props} disabled={props.disabled || busy} className={`button ${variant} ${className}`}>
      {busy && <LoaderCircle size={15} className="spin" />}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button type="button" {...props} className={`icon-button ${className}`} aria-label={label}>
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={6}>
          {label}
          <Tooltip.Arrow />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function Avatar({
  name,
  color = 'green',
  size = 'normal',
  company = false,
}: {
  name: string;
  color?: string;
  size?: 'tiny' | 'small' | 'normal' | 'large';
  company?: boolean;
}) {
  return (
    <span className={`avatar ${color} ${size} ${company ? 'company-mark' : ''}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function Owner({ user, compact = false }: { user?: TeamMember; compact?: boolean }) {
  if (!user) return <span className="muted">Unassigned</span>;
  return (
    <span className="owner" title={user.name}>
      <Avatar name={user.name} color={user.color} size="tiny" />
      {!compact && <span>{user.name.split(' ')[0]}</span>}
    </span>
  );
}

export function StatusBadge({ company, salesOnly = false }: { company: Company; salesOnly?: boolean }) {
  const status = !salesOnly && company.clientStatus ? company.clientStatus : company.stage;
  const label =
    !salesOnly && company.clientStatus
      ? company.clientStatus[0].toUpperCase() + company.clientStatus.slice(1)
      : stageLabels[company.stage];
  return (
    <span className={`badge status-${status}`}>
      <span className="status-dot" />
      {label}
    </span>
  );
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  trigger,
  wide = false,
  className = '',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  trigger?: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className={`modal ${wide ? 'wide' : ''} ${className}`}>
          <div className="modal-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description className={description ? 'muted' : 'sr-only'}>
                {description ?? title}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="icon-button" aria-label="Close dialog">
                <X size={19} />
              </button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Field({
  label,
  children,
  required = false,
  className = '',
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`field ${className}`}>
      <label className="field-label" htmlFor={id}>
        {label}
        {required && (
          <span className="required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {isValidElement(children) ? cloneElement(children as ReactElement<{ id: string }>, { id }) : children}
    </div>
  );
}

export function InlineError({ message }: { message: string }) {
  return message ? (
    <div className="inline-error" role="alert">
      <CircleAlert size={17} />
      <span>{message}</span>
    </div>
  ) : null;
}

export function Empty({
  icon: Icon = Building2,
  title,
  detail,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={25} strokeWidth={1.5} />
      </span>
      <h3>{title}</h3>
      {detail && <p>{detail}</p>}
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  eyebrow,
  subtitle,
  actions,
}: {
  title: string;
  eyebrow?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {subtitle && <div className="page-subtitle">{subtitle}</div>}
      </div>
      <div className="page-actions">{actions}</div>
    </header>
  );
}

export function SectionHeading({
  title,
  count,
  link,
  linkText = 'View all',
  children,
}: {
  title: string;
  count?: number;
  link?: string;
  linkText?: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <h2>
        {title}
        {count !== undefined && <span className="count-badge">{count}</span>}
      </h2>
      {link ? (
        <Link className="text-link" to={link}>
          {linkText}
          <ArrowUpRight size={15} />
        </Link>
      ) : (
        children
      )}
    </div>
  );
}

export function Segmented({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: string; label: ReactNode }[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={value === option.value ? 'selected' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
