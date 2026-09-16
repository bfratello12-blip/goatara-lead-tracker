import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Plus, Save, UserPlus } from 'lucide-react';
import { salesStages, stageLabels, type Company, type Contact, type Task } from '../../shared/crm.ts';
import { useCRM, useSave } from '../context.tsx';
import { Button, Field, InlineError, Modal } from './ui.tsx';

const value = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
const optional = (form: FormData, name: string) => value(form, name) || null;

function EnquiryFields({ company }: { company?: Company }) {
  return (
    <>
      <Field label="Where are you at right now?" className="full">
        <textarea
          name="currentSituation"
          rows={2}
          defaultValue={company?.currentSituation ?? ''}
          maxLength={10000}
        />
      </Field>
      <Field label="What do you sell?" className="full">
        <textarea name="products" rows={2} defaultValue={company?.products ?? ''} maxLength={10000} />
      </Field>
      <Field label="Roughly how many products?">
        <input name="productCount" defaultValue={company?.productCount ?? ''} maxLength={200} />
      </Field>
      <Field label="Current monthly revenue across all channels">
        <input name="monthlyRevenue" defaultValue={company?.monthlyRevenue ?? ''} maxLength={200} />
      </Field>
      <Field label="How would orders get shipped?">
        <input name="shippingMethod" defaultValue={company?.shippingMethod ?? ''} maxLength={2000} />
      </Field>
      <Field label="When would you want to start?">
        <input name="desiredStart" defaultValue={company?.desiredStart ?? ''} maxLength={1000} />
      </Field>
    </>
  );
}

export function CompanyDialog({ company, children }: { company?: Company; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { data, session, mutate, notify } = useCRM();
  const { saving, error, save } = useSave();
  const navigate = useNavigate();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fields = {
      storeUrl: optional(form, 'storeUrl'),
      currentSituation: optional(form, 'currentSituation'),
      products: optional(form, 'products'),
      productCount: optional(form, 'productCount'),
      monthlyRevenue: optional(form, 'monthlyRevenue'),
      shippingMethod: optional(form, 'shippingMethod'),
      desiredStart: optional(form, 'desiredStart'),
      ownerId: optional(form, 'ownerId'),
      dealValue: Number(value(form, 'dealValue')),
      followUpAt: optional(form, 'followUpAt'),
      expectedCloseAt: optional(form, 'expectedCloseAt'),
      tags: value(form, 'tags')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    };
    void save(async () => {
      const result = await mutate<Company>(
        company ? `/companies/${company.id}` : '/companies',
        company ? 'PATCH' : 'POST',
        company
          ? {
              ...fields,
              name: value(form, 'businessName'),
              ...(company.clientStatus ? { clientSince: optional(form, 'clientSince') } : {}),
              ...(company.stage === 'lost' ? { lostReason: optional(form, 'lostReason') } : {}),
            }
          : {
              ...fields,
              businessName: value(form, 'businessName'),
              fullName: optional(form, 'fullName'),
              email: optional(form, 'email'),
              phone: optional(form, 'phone'),
              stage: value(form, 'stage'),
            },
      );
      notify(company ? 'Company details saved' : 'Company added');
      setOpen(false);
      if (!company) navigate(`/companies/${result.id}`);
    });
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!saving) setOpen(next);
      }}
      title={company ? 'Edit company' : 'New company'}
      wide
      trigger={
        children ?? (
          <Button variant="primary">
            <Plus size={17} />
            New company
          </Button>
        )
      }
    >
      <form onSubmit={submit} className="modal-form">
        <div className="modal-body form-grid">
          <h3 className="form-section full">Company details</h3>
          <Field label="Business name" required className="full">
            <input
              name="businessName"
              required
              autoFocus
              defaultValue={company?.name ?? ''}
              maxLength={200}
              placeholder="Company name"
            />
          </Field>
          {!company && (
            <>
              <Field label="Full name">
                <input name="fullName" autoComplete="name" maxLength={200} />
              </Field>
              <Field label="Email">
                <input name="email" type="email" autoComplete="email" />
              </Field>
              <Field label="Phone">
                <input name="phone" type="tel" autoComplete="tel" maxLength={80} />
              </Field>
              <Field label="Sales stage">
                <select name="stage" defaultValue="new">
                  {salesStages.map((stage) => (
                    <option key={stage} value={stage}>
                      {stageLabels[stage]}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
          <Field label="Link to your store, listings, or products" className="full">
            <input
              name="storeUrl"
              defaultValue={company?.storeUrl ?? ''}
              placeholder="https://"
              maxLength={2000}
            />
          </Field>
          <h3 className="form-section full">Relationship details</h3>
          <Field label="Account owner">
            <select name="ownerId" defaultValue={company?.ownerId ?? session.user.id}>
              <option value="">Unassigned</option>
              {data.team.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Monthly retainer (USD)">
            <input
              name="dealValue"
              type="number"
              min="0"
              max="1000000000"
              step="0.01"
              defaultValue={company?.dealValue ?? 0}
            />
          </Field>
          <Field label="Next follow-up">
            <input name="followUpAt" type="date" defaultValue={company?.followUpAt ?? ''} />
          </Field>
          <Field label="Expected close date">
            <input name="expectedCloseAt" type="date" defaultValue={company?.expectedCloseAt ?? ''} />
          </Field>
          {company?.clientStatus && (
            <Field label="Client start date">
              <input name="clientSince" type="date" defaultValue={company.clientSince ?? ''} />
            </Field>
          )}
          {company?.stage === 'lost' && (
            <Field label="Lost reason" className="full">
              <textarea name="lostReason" defaultValue={company.lostReason ?? ''} rows={2} maxLength={4000} />
            </Field>
          )}
          <Field label="Tags (comma-separated)" className="full">
            <input
              name="tags"
              defaultValue={company?.tags.join(', ') ?? ''}
              placeholder="e.g. Home & living, Shopify"
            />
          </Field>
          <h3 className="form-section full">Website enquiry</h3>
          <EnquiryFields company={company} />
        </div>
        <div className="modal-footer">
          <InlineError message={error} />
          <Button type="button" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" busy={saving}>
            <Save size={16} />
            {company ? 'Save changes' : 'Create company'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TaskForm({ companyId, task, close }: { companyId?: string; task?: Task; close: () => void }) {
  const { data, session, mutate, notify } = useCRM();
  const [selectedCompany, setSelectedCompany] = useState(task?.companyId ?? companyId ?? '');
  const [selectedContact, setSelectedContact] = useState(task?.contactId ?? '');
  const { saving, error, save } = useSave();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void save(async () => {
      await mutate(task ? `/tasks/${task.id}` : '/tasks', task ? 'PATCH' : 'POST', {
        ...(!task ? { companyId: selectedCompany } : {}),
        title: value(form, 'title'),
        contactId: selectedContact || null,
        assigneeId: optional(form, 'assigneeId'),
        dueAt: optional(form, 'dueAt'),
        priority: value(form, 'priority'),
      });
      notify(task ? 'Task updated' : 'Task created');
      close();
    });
  }
  return (
    <form className="modal-form" onSubmit={submit}>
      <div className="modal-body form-grid">
        <Field label="Task" required className="full">
          <input
            name="title"
            required
            autoFocus
            placeholder="What needs to happen?"
            maxLength={500}
            defaultValue={task?.title ?? ''}
          />
        </Field>
        <Field label="Company" required className="full">
          <select
            required
            value={selectedCompany}
            disabled={Boolean(task)}
            onChange={(event) => {
              setSelectedCompany(event.target.value);
              setSelectedContact('');
            }}
          >
            <option value="">Select a company</option>
            {data.companies
              .toSorted((first, second) => first.name.localeCompare(second.name))
              .map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Contact">
          <select
            value={selectedContact}
            onChange={(event) => setSelectedContact(event.target.value)}
            disabled={!selectedCompany}
          >
            <option value="">No specific contact</option>
            {data.contacts
              .filter((contact) => contact.companyId === selectedCompany)
              .map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Assignee">
          <select name="assigneeId" defaultValue={task?.assigneeId ?? session.user.id}>
            <option value="">Unassigned</option>
            {data.team.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Due date">
          <input name="dueAt" type="date" defaultValue={task?.dueAt ?? ''} />
        </Field>
        <Field label="Priority">
          <select name="priority" defaultValue={task?.priority ?? 'normal'}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </Field>
      </div>
      <div className="modal-footer">
        <InlineError message={error} />
        <Button type="button" onClick={close} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" busy={saving}>
          <Check size={16} />
          {task ? 'Save task' : 'Create task'}
        </Button>
      </div>
    </form>
  );
}

export function TaskDialog({
  companyId,
  task,
  children,
}: {
  companyId?: string;
  task?: Task;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title={task ? 'Edit task' : 'New task'}
      trigger={
        children ?? (
          <Button variant="primary">
            <Plus size={17} />
            New task
          </Button>
        )
      }
    >
      <TaskForm companyId={companyId} task={task} close={() => setOpen(false)} />
    </Modal>
  );
}

export function ContactDialog({
  companyId,
  contact,
  children,
}: {
  companyId: string;
  contact?: Contact;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { mutate, notify } = useCRM();
  const { saving, error, save } = useSave();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void save(async () => {
      await mutate(
        contact ? `/contacts/${contact.id}` : `/companies/${companyId}/contacts`,
        contact ? 'PATCH' : 'POST',
        {
          name: value(form, 'name'),
          email: optional(form, 'email'),
          phone: optional(form, 'phone'),
          title: optional(form, 'title'),
          isPrimary: form.get('isPrimary') === 'on',
        },
      );
      notify(contact ? 'Contact updated' : 'Contact added');
      setOpen(false);
    });
  }
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!saving) setOpen(next);
      }}
      title={contact ? 'Edit contact' : 'Add contact'}
      trigger={
        children ?? (
          <Button>
            <UserPlus size={16} />
            Add contact
          </Button>
        )
      }
    >
      <form className="modal-form" onSubmit={submit}>
        <div className="modal-body form-grid">
          <Field label="Full name" required className="full">
            <input name="name" required autoFocus defaultValue={contact?.name ?? ''} maxLength={200} />
          </Field>
          <Field label="Email">
            <input name="email" type="email" defaultValue={contact?.email ?? ''} />
          </Field>
          <Field label="Phone">
            <input name="phone" type="tel" defaultValue={contact?.phone ?? ''} maxLength={80} />
          </Field>
          <Field label="Job title" className="full">
            <input name="title" defaultValue={contact?.title ?? ''} maxLength={200} />
          </Field>
          <label className="checkbox-label full">
            <input name="isPrimary" type="checkbox" defaultChecked={contact?.isPrimary} />
            Primary contact
          </label>
        </div>
        <div className="modal-footer">
          <InlineError message={error} />
          <Button type="button" disabled={saving} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" busy={saving}>
            <Save size={16} />
            Save contact
          </Button>
        </div>
      </form>
    </Modal>
  );
}
