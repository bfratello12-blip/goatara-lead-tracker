import { randomUUID } from 'node:crypto';
import { Store } from './store.ts';
import type { Company, SalesStage, ClientStatus } from '../shared/crm.ts';

function relativeDate(days: number, hour = 12) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function dueDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

type SeedCompany = [string, string, string, string, SalesStage, number, string, ClientStatus?];
const companies: SeedCompany[] = [
  [
    'form-field',
    'Form & Field',
    'Olivia Bennett',
    'Considered home essentials',
    'proposal',
    4500,
    'Home & living',
  ],
  ['sunday-supply', 'Sunday Supply', 'James Wilson', 'Everyday apparel', 'discovery', 3500, 'Apparel'],
  ['nori', 'Nori Skincare', 'Emma Park', 'Plant-based skincare', 'new', 3000, 'Beauty'],
  [
    'northline',
    'Northline Outdoors',
    'Daniel Reed',
    'Outdoor apparel and equipment',
    'contacted',
    4000,
    'Lifestyle',
  ],
  ['bloom', 'Bloom Botanics', 'Sophie Ellis', 'Botanical skincare', 'won', 4800, 'Beauty', 'onboarding'],
  [
    'kin-home',
    'KIN Home',
    'Charlotte Hayes',
    'Modern homeware and textiles',
    'won',
    5500,
    'Home & living',
    'active',
  ],
  [
    'good-habit',
    'Good Habit',
    'Marcus Cole',
    'Everyday wellness supplements',
    'won',
    6200,
    'Wellness',
    'active',
  ],
  [
    'oat-studio',
    'Oat Studio',
    'Isabella Scott',
    'Linen clothing and accessories',
    'proposal',
    3800,
    'Apparel',
  ],
  [
    'morrow',
    'Morrow Coffee',
    'Ethan Brooks',
    'Specialty coffee and brewing tools',
    'new',
    2500,
    'Food & drink',
  ],
  [
    'common-ground',
    'Common Ground',
    'Ava Mitchell',
    'Sustainable everyday essentials',
    'contacted',
    3200,
    'Lifestyle',
  ],
  ['everwell', 'Everwell', 'Noah Carter', 'Daily health and wellness', 'won', 4200, 'Wellness', 'onboarding'],
  [
    'daily-edit',
    'The Daily Edit',
    'Mia Thompson',
    'Curated fashion accessories',
    'discovery',
    2800,
    'Accessories',
  ],
  ['ridge', 'Ridge Supply', 'Oliver Wright', 'Travel bags and accessories', 'proposal', 4200, 'Lifestyle'],
  ['sola', 'Sola Ceramics', 'Amelia Rose', 'Handmade ceramics', 'new', 2000, 'Home & living'],
  [
    'fieldwork',
    'Fieldwork Goods',
    'Henry Evans',
    'Well-made everyday clothing',
    'won',
    3800,
    'Apparel',
    'active',
  ],
  [
    'atelier',
    'Atelier No. 8',
    'Harper Lewis',
    'Independent fine jewellery',
    'won',
    5000,
    'Accessories',
    'active',
  ],
  [
    'verde',
    'Verde Living',
    'Lucas Green',
    'Sustainable home and garden',
    'won',
    3600,
    'Home & living',
    'paused',
  ],
  [
    'studio-forma',
    'Studio Forma',
    'Ella Walker',
    'Design-led home accessories',
    'won',
    3200,
    'Home & living',
    'onboarding',
  ],
  ['juniper', 'Juniper Market', 'Benjamin Hall', 'Specialty pantry goods', 'lost', 2400, 'Food & drink'],
  ['stillwater', 'Stillwater', 'Grace King', 'Bath and body products', 'lost', 3000, 'Beauty'],
  ['monday', 'Monday Essentials', 'Liam Baker', 'Everyday personal care', 'new', 2800, 'Wellness'],
  [
    'objects',
    'Objects of Note',
    'Zoe Adams',
    'Stationery and desk accessories',
    'contacted',
    2400,
    'Lifestyle',
  ],
];

export function seedDemo(store: Store) {
  if (store.get('SELECT id FROM users LIMIT 1')) return;
  store.transaction(() => {
    [
      ['user-alex', 'Alex Morgan', 'alex@goatara.example', 'admin', 'green'],
      ['user-jamie', 'Jamie Chen', 'jamie@goatara.example', 'member', 'purple'],
      ['user-sam', 'Sam Rivera', 'sam@goatara.example', 'member', 'blue'],
    ].forEach(([id, name, email, role, color]) =>
      store.insert('users', {
        id,
        name,
        email,
        role,
        color,
        passwordHash: null,
        createdAt: relativeDate(-120),
      }),
    );

    const records: Record<string, Company> = {};
    companies.forEach(
      ([key, businessName, fullName, products, stage, dealValue, category, clientStatus], index) => {
        const ownerId = ['user-alex', 'user-jamie', 'user-sam'][index % 3];
        const input = {
          businessName,
          fullName,
          email: `${fullName.split(' ')[0].toLowerCase()}@${key}.example`,
          phone: `+1 (415) 555-${String(100 + index).padStart(4, '0')}`,
          storeUrl: `https://${key}.example`,
          products,
          currentSituation: 'An established store, ready for the next stage of growth',
          productCount: index % 2 ? '25-50 products' : '50-100 products',
          monthlyRevenue: index % 3 ? '$25,000-$50,000' : '$50,000-$100,000',
          shippingMethod: index % 2 ? 'Third-party fulfillment partner' : 'Shipped in-house',
          desiredStart: 'Within the next month',
          stage,
          dealValue,
          tags: [category],
          ownerId,
          followUpAt: stage === 'won' || stage === 'lost' ? null : dueDate((index % 4) - 1),
          expectedCloseAt: stage === 'proposal' ? dueDate(7) : null,
        };
        let company = store.insertCompany(input, ownerId);
        const age = stage === 'new' ? index % 3 : stage === 'won' ? 45 + index * 3 : 9 + index;
        company = {
          ...company,
          createdAt: relativeDate(-age, 9),
          updatedAt: relativeDate(-(index % 4), 10),
          clientStatus: clientStatus ?? null,
          clientSince: clientStatus ? dueDate(-age + 14) : null,
          lostReason: stage === 'lost' ? 'Timing and budget. Revisit next quarter.' : null,
        };
        store.saveCompany(company);
        store.db
          .prepare('UPDATE activities SET createdAt = ? WHERE companyId = ?')
          .run(company.createdAt, company.id);
        records[key] = company;
        store.insert('submissions', {
          id: randomUUID(),
          companyId: company.id,
          receivedAt: company.createdAt,
          payload: JSON.stringify({
            businessName,
            fullName,
            email: input.email,
            phone: input.phone,
            currentSituation: input.currentSituation,
            storeUrl: input.storeUrl,
            products,
            productCount: input.productCount,
            monthlyRevenue: input.monthlyRevenue,
            shippingMethod: input.shippingMethod,
            desiredStart: input.desiredStart,
          }),
          idempotencyKey: null,
        });
        if (clientStatus) {
          const received =
            clientStatus === 'active' || clientStatus === 'paused'
              ? 12
              : key === 'bloom'
                ? 8
                : key === 'everwell'
                  ? 5
                  : 2;
          store.db
            .prepare(
              "UPDATE onboarding SET status = CASE WHEN position < ? THEN 'received' WHEN position < ? THEN 'requested' ELSE 'needed' END, updatedAt = ? WHERE companyId = ?",
            )
            .run(received, received + 2, relativeDate(-1), company.id);
        }
      },
    );

    const noteSeeds: [string, string, string, 'call' | 'note' | 'meeting', number, boolean][] = [
      [
        'form-field',
        'user-alex',
        'Great discovery call with Olivia. Their organic sales are strong, but paid acquisition has been inconsistent. The hero products are their linen range and ceramic tableware.\n\nAgreed on a phased approach: start with Google Shopping, then introduce Meta once we have fresh creative. Olivia is the decision-maker; her co-founder will review the agreement.\n\nNext step: send the revised proposal with the 90-day roadmap and confirm a Friday check-in.',
        'call',
        0,
        true,
      ],
      [
        'form-field',
        'user-alex',
        'Proposal sent at $4,500/month. Includes Google Ads, Meta Ads, and a monthly strategy call. Initial ad budget of $8,000-$10,000. Olivia asked for a breakdown of the first 30 days.',
        'note',
        -2,
        false,
      ],
      [
        'form-field',
        'user-jamie',
        'Reviewed the store before discovery. Clean product photography and a healthy average order value. Bundles could be a strong starting point for acquisition.',
        'note',
        -5,
        false,
      ],
      [
        'sunday-supply',
        'user-jamie',
        'James is launching a new collection next month. They want a clear creative testing plan before committing. Current fulfillment can comfortably handle a 2x increase in orders.\n\nDiscovery call booked. Ask for their current bestsellers and seasonal inventory plan.',
        'call',
        0,
        false,
      ],
      [
        'bloom',
        'user-jamie',
        'Kickoff complete with Sophie and the marketing team. Shopify and Google access are in. Waiting on creative assets and the final account review. Targeting launch in two weeks.',
        'meeting',
        -1,
        true,
      ],
      [
        'kin-home',
        'user-sam',
        'Monthly review: revenue is tracking ahead of the agreed target. Charlotte would like to test the new textile collection in October. Creative brief to be shared by Thursday.',
        'meeting',
        -1,
        false,
      ],
      [
        'good-habit',
        'user-alex',
        'Marcus approved the next round of creative. Focus on the subscription offer and customer testimonials. Monthly check-in is scheduled for next week.',
        'call',
        -2,
        false,
      ],
      [
        'northline',
        'user-alex',
        'Daniel replied and is interested in a discovery call. Their store has a strong winter collection coming. Follow up with two available times.',
        'note',
        0,
        false,
      ],
      [
        'oat-studio',
        'user-jamie',
        'Isabella is happy with the strategy. Waiting on final approval from the finance team. Keep the proposal open through the end of this week.',
        'call',
        -1,
        false,
      ],
      [
        'everwell',
        'user-jamie',
        'Agreement signed and billing is set up. Noah will add us to the advertising accounts. Sent the access checklist this morning.',
        'note',
        -1,
        false,
      ],
      [
        'morrow',
        'user-sam',
        'New enquiry from Ethan. Looking for support growing subscriptions alongside one-off purchases. Start with a short introduction call.',
        'note',
        0,
        false,
      ],
      [
        'verde',
        'user-jamie',
        'Campaigns paused while the team replenishes their core range. Lucas expects inventory in six weeks. Keep the account and historical reporting intact.',
        'call',
        -3,
        true,
      ],
    ];
    noteSeeds.forEach(([key, authorId, content, kind, days, pinned], index) => {
      const companyId = records[key].id;
      const createdAt = relativeDate(days, 9 + (index % 4));
      store.insert('notes', {
        id: randomUUID(),
        companyId,
        authorId,
        content,
        kind,
        pinned: pinned ? 1 : 0,
        createdAt,
      });
      store.activity(
        companyId,
        authorId,
        'note',
        kind === 'call' ? 'Added a call note' : kind === 'meeting' ? 'Added a meeting note' : 'Added a note',
        createdAt,
      );
    });

    const taskSeeds: [string, string, number, string, 'normal' | 'high', boolean][] = [
      ['form-field', 'Send revised proposal', 0, 'user-alex', 'high', false],
      ['northline', 'Follow up on discovery call', -2, 'user-alex', 'high', false],
      ['bloom', 'Review creative assets', 0, 'user-jamie', 'normal', false],
      ['sunday-supply', 'Prepare discovery questions', 0, 'user-jamie', 'normal', false],
      ['everwell', 'Request Meta Ads access', -1, 'user-jamie', 'high', false],
      ['kin-home', 'Send October creative brief', 1, 'user-sam', 'normal', false],
      ['oat-studio', 'Check in on proposal approval', 0, 'user-jamie', 'normal', false],
      ['morrow', 'Schedule introduction call', 1, 'user-sam', 'normal', false],
      ['nori', 'Reply to new enquiry', 0, 'user-sam', 'high', false],
      ['good-habit', 'Prepare monthly account review', 3, 'user-alex', 'normal', false],
      ['studio-forma', 'Send the onboarding checklist', 2, 'user-sam', 'normal', false],
      ['ridge', 'Follow up on agreement', -3, 'user-alex', 'high', false],
      ['form-field', 'Complete store review', -2, 'user-alex', 'normal', true],
      ['bloom', 'Confirm billing setup', -1, 'user-jamie', 'normal', true],
      ['objects', 'Make first contact', 2, 'user-alex', 'normal', false],
    ];
    taskSeeds.forEach(([key, title, days, assigneeId, priority, completed]) => {
      const companyId = records[key].id;
      const contactId = store.get<{ id: string }>(
        'SELECT id FROM contacts WHERE companyId = ? AND isPrimary = 1',
        companyId,
      )!.id;
      store.insert('tasks', {
        id: randomUUID(),
        companyId,
        contactId,
        assigneeId,
        title,
        dueAt: dueDate(days),
        priority,
        completedAt: completed ? relativeDate(-1) : null,
        createdAt: relativeDate(-4),
      });
    });
    store.insert('contacts', {
      id: randomUUID(),
      companyId: records['form-field'].id,
      name: 'Henry Bennett',
      email: 'henry@form-field.example',
      phone: null,
      title: 'Co-founder',
      isPrimary: 0,
    });
    store.activity(
      records.bloom.id,
      'user-jamie',
      'onboarding',
      'Shopify access: received',
      relativeDate(0, 8),
    );
    store.activity(
      records['form-field'].id,
      'user-alex',
      'stage',
      'Moved from Discovery to Proposal',
      relativeDate(-1, 14),
    );
  });
}
