from django.test import override_settings

from .base import Base

GOOD, DECLINED = '4242 4242 4242 4242', '4000 0000 0000 0002'


class BillingTestCase(Base):
    def setUp(self):
        super().setUp()
        self.owner = self.signup('owner@co.test')
        self.slug = self.make_workspace(self.owner, 'Co')
        self.base = f'/api/w/{self.slug}'

    def buy(self, plan='pro', card=GOOD):
        r = self.client.post(f'{self.base}/billing/checkout/', {'plan': plan}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        session = r.data['url'].split('session_id=')[1]
        return session, self.client.post('/api/billing/mock/pay/', {'session_id': session, 'card_number': card}, format='json')

    def plan(self):
        return self.client.get(f'{self.base}/billing/').data


class PlanLimitTests(BillingTestCase):
    def test_new_workspaces_start_on_the_free_plan(self):
        b = self.plan()
        self.assertEqual((b['plan'], b['limits']['max_projects'], b['limits']['max_members'], b['limits']['webhooks']), ('free', 2, 3, False))
        self.assertEqual(b['usage'], {'projects': 0, 'members': 1})
        self.assertEqual(b['billing_mode'], 'mock')

    def test_project_limit_returns_402_with_an_upgrade_message(self):
        self.make_project(self.owner, self.slug, 'A', 'AA')
        self.make_project(self.owner, self.slug, 'B', 'BB')
        r = self.client.post(f'{self.base}/projects/', {'name': 'C', 'key': 'CC'}, format='json')
        self.assertEqual(r.status_code, 402)
        self.assertEqual((r.data['code'], r.data['plan'], r.data['limit']), ('plan_limit', 'free', 2))
        self.assertIn('Upgrade', r.data['detail'])

    def test_member_limit(self):
        for n in range(2):
            self.signup(f'u{n}@co.test')
            self.add_member(self.owner, self.slug, f'u{n}@co.test', 'member')
        self.signup('late@co.test')
        r = self.client.post(f'{self.base}/members/', {'email': 'late@co.test', 'role': 'member'}, format='json')
        self.assertEqual((r.status_code, r.data['code']), (402, 'plan_limit'))

    def test_webhooks_need_a_paid_plan(self):
        r = self.client.post(f'{self.base}/webhooks/', {'url': 'https://e.test/h', 'events': ['*']}, format='json')
        self.assertEqual((r.status_code, r.data['code']), (402, 'plan_limit'))

    def test_limits_are_per_workspace(self):
        self.make_project(self.owner, self.slug, 'A', 'AA')
        self.make_project(self.owner, self.slug, 'B', 'BB')
        other = self.make_workspace(self.owner, 'Second Co')            # a new workspace has its own allowance
        self.assertEqual(self.client.post(f'/api/w/{other}/projects/', {'name': 'C', 'key': 'CC'}, format='json').status_code, 201)

    def test_business_plan_is_unlimited(self):
        self.upgrade(self.slug, 'business')
        for n in range(15):
            self.make_project(self.owner, self.slug, f'P{n}', f'PR{n}')
        self.assertIsNone(self.plan()['limits']['max_projects'])


class SimulatedCheckoutTests(BillingTestCase):
    def test_full_upgrade_flow(self):
        self.make_project(self.owner, self.slug, 'A', 'AA')
        self.make_project(self.owner, self.slug, 'B', 'BB')
        r = self.client.post(f'{self.base}/billing/checkout/', {'plan': 'pro'}, format='json')
        self.assertEqual(r.data['provider'], 'mock')
        session = r.data['url'].split('session_id=')[1]
        info = self.client.get(f'/api/billing/mock/{session}/').data
        self.assertEqual((info['plan'], info['price_cents'], info['status']), ('pro', 1500, 'pending'))
        self.assertEqual(self.plan()['plan'], 'free')                      # nothing changes until the card is accepted
        r = self.client.post('/api/billing/mock/pay/', {'session_id': session, 'card_number': GOOD}, format='json')
        self.assertEqual((r.status_code, r.data['status']), (200, 'paid'))
        b = self.plan()
        self.assertEqual((b['plan'], b['status'], b['provider']), ('pro', 'active', 'mock'))
        self.assertIsNotNone(b['current_period_end'])
        self.assertEqual(self.client.post(f'{self.base}/projects/', {'name': 'C', 'key': 'CC'}, format='json').status_code, 201)   # limit lifted
        self.assertEqual(self.client.post(f'{self.base}/webhooks/', {'url': 'https://e.test/h', 'events': ['*']}, format='json').status_code, 201)
        self.assertIn('billing.plan_changed', self.audit_actions(self.slug))

    def test_declined_and_invalid_cards_do_not_upgrade(self):
        session, r = self.buy('pro', DECLINED)
        self.assertEqual((r.status_code, r.data['code']), (400, 'card_declined'))
        r = self.client.post('/api/billing/mock/pay/', {'session_id': session, 'card_number': '1111 2222 3333 4444'}, format='json')
        self.assertEqual((r.status_code, r.data['code']), (400, 'invalid_card'))
        self.assertEqual(self.plan()['plan'], 'free')
        r = self.client.post('/api/billing/mock/pay/', {'session_id': session, 'card_number': GOOD}, format='json')    # a retry works
        self.assertEqual(self.plan()['plan'], 'pro')

    def test_paying_twice_is_harmless(self):
        session, _ = self.buy('pro')
        again = self.client.post('/api/billing/mock/pay/', {'session_id': session, 'card_number': GOOD}, format='json')
        self.assertEqual(again.data['status'], 'paid')
        self.assertEqual(self.plan()['plan'], 'pro')

    def test_only_the_owner_can_buy_or_pay(self):
        admin = self.signup('admin@co.test')
        self.add_member(self.owner, self.slug, 'admin@co.test', 'admin')
        session, _ = self.buy('pro')                                       # owner creates a session (already paid, fine)
        self.as_user(admin)
        self.assertEqual(self.client.post(f'{self.base}/billing/checkout/', {'plan': 'business'}, format='json').status_code, 403)
        self.assertEqual(self.client.post(f'{self.base}/billing/cancel/').status_code, 403)
        self.assertEqual(self.client.get(f'/api/billing/mock/{session}/').status_code, 404)             # not even visible to others
        r = self.client.post('/api/billing/mock/pay/', {'session_id': session, 'card_number': GOOD}, format='json')
        self.assertEqual(r.status_code, 404)

    def test_another_company_cannot_pay_for_my_session(self):
        r = self.client.post(f'{self.base}/billing/checkout/', {'plan': 'pro'}, format='json')
        session = r.data['url'].split('session_id=')[1]
        self.as_user(self.signup('mallory@evil.test'))
        self.assertEqual(self.client.post('/api/billing/mock/pay/', {'session_id': session, 'card_number': GOOD}, format='json').status_code, 404)

    def test_checkout_input_validation(self):
        for plan in ('free', 'platinum', None):
            self.assertEqual(self.client.post(f'{self.base}/billing/checkout/', {'plan': plan}, format='json').status_code, 400, plan)
        self.buy('pro')
        self.assertEqual(self.client.post(f'{self.base}/billing/checkout/', {'plan': 'pro'}, format='json').status_code, 400)   # already on it

    def test_cancel_returns_to_free_when_usage_fits(self):
        self.buy('pro')
        r = self.client.post(f'{self.base}/billing/cancel/')
        self.assertEqual((r.status_code, r.data['plan']), (200, 'free'))

    def test_downgrade_is_refused_while_usage_exceeds_the_free_plan(self):
        self.buy('pro')
        for n in range(3):
            self.make_project(self.owner, self.slug, f'P{n}', f'PR{n}')
        r = self.client.post(f'{self.base}/billing/cancel/')
        self.assertEqual(r.status_code, 400)
        self.assertIn('3 projects', str(r.data))
        self.assertEqual(self.plan()['plan'], 'pro')
        for p in self.client.get(f'{self.base}/projects/').data['results'][:2]:
            self.client.delete(f'{self.base}/projects/{p["id"]}/')
        self.assertEqual(self.client.post(f'{self.base}/billing/cancel/').status_code, 200)

    def test_existing_data_survives_a_downgrade_but_features_switch_off(self):
        self.buy('pro')
        self.client.post(f'{self.base}/webhooks/', {'url': 'https://e.test/h', 'events': ['*']}, format='json')
        self.client.post(f'{self.base}/billing/cancel/')
        self.assertEqual(self.client.post(f'{self.base}/webhooks/', {'url': 'https://e.test/2', 'events': ['*']}, format='json').status_code, 402)


class RealStripeSwitchTests(BillingTestCase):
    @override_settings(BILLING_PROVIDER='stripe', STRIPE_WEBHOOK_SECRET='')
    def test_simulated_endpoints_are_off_when_real_stripe_is_configured(self):
        self.assertEqual(self.client.get('/api/billing/mock/mock_abc/').status_code, 404)
        self.assertEqual(self.client.post('/api/billing/mock/pay/', {'session_id': 'mock_abc', 'card_number': GOOD}, format='json').status_code, 404)

    def test_stripe_webhook_is_off_without_stripe(self):
        self.as_user(None)
        self.assertEqual(self.client.post('/api/billing/stripe/webhook/', {}, format='json').status_code, 404)

    @override_settings(BILLING_PROVIDER='stripe', STRIPE_WEBHOOK_SECRET='whsec_test')
    def test_stripe_webhook_rejects_unsigned_requests(self):
        self.as_user(None)
        r = self.client.post('/api/billing/stripe/webhook/', {'type': 'checkout.session.completed'}, format='json')
        self.assertEqual(r.status_code, 400)
