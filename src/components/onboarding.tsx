import { useState, type FormEvent } from 'react';
import { Check, CheckCircle2, Circle, CircleDashed, MinusCircle, Plus, Rocket } from 'lucide-react';
import type { Company, OnboardingItem } from '../../shared/crm.ts';
import { useCRM, useSave } from '../context.tsx';
import { onboardingProgress } from '../lib.ts';
import { Button, Empty, Field, InlineError, Modal, SectionHeading } from './ui.tsx';

function AddStep({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(false);
  const { mutate, notify } = useCRM();
  const { saving, error, save } = useSave();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void save(async () => {
      await mutate(`/companies/${companyId}/onboarding`, 'POST', {
        title: form.get('title'),
        category: form.get('category'),
      });
      notify('Onboarding item added');
      setOpen(false);
    });
  }
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!saving) setOpen(next);
      }}
      title="Add onboarding item"
      trigger={
        <Button>
          <Plus size={15} />
          Add item
        </Button>
      }
    >
      <form className="modal-form" onSubmit={submit}>
        <div className="modal-body form-grid">
          <Field label="Item name" required className="full">
            <input name="title" required autoFocus maxLength={200} placeholder="e.g. TikTok Ads access" />
          </Field>
          <Field label="Category" className="full">
            <select name="category">
              <option value="setup">Setup</option>
              <option value="access">Account access</option>
              <option value="launch">Launch preparation</option>
            </select>
          </Field>
        </div>
        <div className="modal-footer">
          <InlineError message={error} />
          <Button type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={saving}>
            <Plus size={16} />
            Add item
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ChecklistItem({ item }: { item: OnboardingItem }) {
  const { perform } = useCRM();
  const [saving, setSaving] = useState(false);
  const StatusIcon =
    item.status === 'received'
      ? CheckCircle2
      : item.status === 'requested'
        ? CircleDashed
        : item.status === 'not_required'
          ? MinusCircle
          : Circle;
  return (
    <div className={`checklist-item item-${item.status}`}>
      <StatusIcon size={19} />
      <span>{item.title}</span>
      <select
        aria-label={`${item.title} status`}
        value={item.status}
        disabled={saving}
        onChange={async (event) => {
          setSaving(true);
          await perform(
            `/onboarding/${item.id}`,
            'PATCH',
            { status: event.target.value },
            `${item.title} updated`,
          );
          setSaving(false);
        }}
      >
        <option value="needed">{item.category === 'access' ? 'Needed' : 'Not started'}</option>
        <option value="requested">{item.category === 'access' ? 'Requested' : 'In progress'}</option>
        <option value="received">{item.category === 'access' ? 'Received' : 'Complete'}</option>
        <option value="not_required">Not required</option>
      </select>
    </div>
  );
}

export function OnboardingChecklist({ company }: { company: Company }) {
  const { data, perform } = useCRM();
  const [saving, setSaving] = useState(false);
  const items = data.onboarding.filter((item) => item.companyId === company.id);
  const progress = onboardingProgress(items);
  if (!company.clientStatus) return <Empty icon={Rocket} title="Not a client yet" />;
  return (
    <section className="onboarding-checklist">
      <SectionHeading title="Onboarding">
        <AddStep companyId={company.id} />
      </SectionHeading>
      <div className="checklist-summary">
        <div>
          <strong>{progress.percent}% complete</strong>
          <span>
            {progress.done} of {progress.total} required items
          </span>
        </div>
        <div className="progress-track">
          <span style={{ width: `${progress.percent}%` }} />
        </div>
      </div>
      {(['setup', 'access', 'launch'] as const).map((category) => (
        <div className="checklist-group" key={category}>
          <h3>
            {category === 'setup'
              ? 'Getting started'
              : category === 'access'
                ? 'Account access'
                : 'Ready for launch'}
            <span>{items.filter((item) => item.category === category).length}</span>
          </h3>
          {items
            .filter((item) => item.category === category)
            .map((item) => (
              <ChecklistItem item={item} key={item.id} />
            ))}
        </div>
      ))}
      {company.clientStatus === 'onboarding' && progress.percent === 100 && (
        <div className="onboarding-complete">
          <span>
            <Check size={18} />
            All required items complete
          </span>
          <Button
            variant="primary"
            busy={saving}
            onClick={async () => {
              setSaving(true);
              await perform(
                `/companies/${company.id}`,
                'PATCH',
                { clientStatus: 'active' },
                'Onboarding complete. Client is now active.',
              );
              setSaving(false);
            }}
          >
            <Rocket size={15} />
            Activate client
          </Button>
        </div>
      )}
    </section>
  );
}
