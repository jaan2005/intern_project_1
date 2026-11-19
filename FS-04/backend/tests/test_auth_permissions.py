from .base import Base


class AuthTests(Base):
    def test_register_login_me(self):
        token = self.signup('dev@example.test', 'Dev One')
        self.as_user(token)
        self.assertEqual(self.client.get('/api/auth/me/').data['user']['email'], 'dev@example.test')
        r = self.client.post('/api/auth/login/', {'email': 'DEV@example.test', 'password': self.password}, format='json')
        self.assertEqual(r.status_code, 200)       # email is case-insensitive
        self.assertIn('token', r.data)

    def test_wrong_email_and_wrong_password_look_identical(self):
        self.signup('dev@example.test')
        a = self.client.post('/api/auth/login/', {'email': 'dev@example.test', 'password': 'wrong-password'}, format='json')
        b = self.client.post('/api/auth/login/', {'email': 'nobody@example.test', 'password': 'wrong-password'}, format='json')
        self.assertEqual((a.status_code, a.data), (b.status_code, b.data))

    def test_duplicate_email_and_weak_password_rejected(self):
        self.signup('dev@example.test')
        r = self.client.post('/api/auth/register/', {'email': 'dev@example.test', 'name': 'X', 'password': self.password}, format='json')
        self.assertEqual(r.status_code, 400)
        r = self.client.post('/api/auth/register/', {'email': 'new@example.test', 'name': 'X', 'password': '123'}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_password_is_never_returned(self):
        r = self.client.post('/api/auth/register/', {'email': 'a@example.test', 'name': 'A', 'password': self.password}, format='json')
        self.assertNotIn('password', str(r.data))

    def test_invalid_token_rejected(self):
        self.as_user('not-a-real-token')
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 401)


class RoleTests(Base):
    """owner > admin > member > viewer"""

    def setUp(self):
        super().setUp()
        self.owner = self.signup('owner@co.test')
        self.slug = self.make_workspace(self.owner, 'Co')
        self.upgrade(self.slug, 'business')          # no plan limits in this class
        self.tokens = {'owner': self.owner}
        for role in ('admin', 'member', 'viewer'):
            self.tokens[role] = self.signup(f'{role}@co.test')
            self.add_member(self.owner, self.slug, f'{role}@co.test', role)
        self.project = self.make_project(self.owner, self.slug)
        self.issue = self.make_issue(self.slug, self.project['id'])

    def status_of(self, role, method, path, data=None):
        self.as_user(self.tokens[role])
        return getattr(self.client, method)(f'/api/w/{self.slug}/{path}', data, format='json').status_code

    def test_viewer_is_read_only(self):
        self.assertEqual(self.status_of('viewer', 'get', 'issues/'), 200)
        self.assertEqual(self.status_of('viewer', 'get', f'projects/{self.project["id"]}/board/'), 200)
        self.assertEqual(self.status_of('viewer', 'post', 'issues/', {'project': self.project['id'], 'title': 'x'}), 403)
        self.assertEqual(self.status_of('viewer', 'patch', f'issues/{self.issue["id"]}/', {'title': 'x'}), 403)
        self.assertEqual(self.status_of('viewer', 'post', 'comments/', {'issue': self.issue['id'], 'body': 'x'}), 403)

    def test_member_works_on_issues_but_cannot_administer(self):
        self.assertEqual(self.status_of('member', 'post', 'issues/', {'project': self.project['id'], 'title': 'x'}), 201)
        self.assertEqual(self.status_of('member', 'patch', f'issues/{self.issue["id"]}/', {'title': 'renamed'}), 200)
        self.assertEqual(self.status_of('member', 'post', 'comments/', {'issue': self.issue['id'], 'body': 'x'}), 201)
        self.assertEqual(self.status_of('member', 'delete', f'issues/{self.issue["id"]}/'), 403)          # delete = admin
        self.assertEqual(self.status_of('member', 'post', 'projects/', {'name': 'P', 'key': 'PP'}), 403)
        self.assertEqual(self.status_of('member', 'post', 'sprints/', {'project': self.project['id'], 'name': 'S'}), 403)
        self.assertEqual(self.status_of('member', 'post', 'statuses/', {'project': self.project['id'], 'name': 'QA'}), 403)
        self.assertEqual(self.status_of('member', 'get', 'audit/'), 403)
        self.assertEqual(self.status_of('member', 'get', 'billing/'), 403)
        self.assertEqual(self.status_of('member', 'get', 'webhooks/'), 403)
        self.assertEqual(self.status_of('member', 'post', 'members/', {'email': 'x@x.test', 'role': 'member'}), 403)

    def test_admin_manages_the_workspace_but_not_billing(self):
        self.assertEqual(self.status_of('admin', 'post', 'projects/', {'name': 'P2', 'key': 'PTWO'}), 201)
        self.assertEqual(self.status_of('admin', 'get', 'audit/'), 200)
        self.assertEqual(self.status_of('admin', 'get', 'billing/'), 200)
        self.assertEqual(self.status_of('admin', 'delete', f'issues/{self.issue["id"]}/'), 204)
        self.assertEqual(self.status_of('admin', 'post', 'billing/checkout/', {'plan': 'pro'}), 403)       # owner only
        self.assertEqual(self.status_of('admin', 'delete', ''), 403)                                       # delete workspace = owner only

    def test_owner_can_do_everything(self):
        self.assertEqual(self.status_of('owner', 'patch', '', {'name': 'Renamed Co'}), 200)
        self.assertEqual(self.status_of('owner', 'get', 'billing/'), 200)

    def test_error_explains_which_role_is_needed(self):
        self.as_user(self.tokens['member'])
        r = self.client.post(f'/api/w/{self.slug}/projects/', {'name': 'P', 'key': 'PP'}, format='json')
        self.assertIn('admin', r.data['detail'])


class MemberManagementTests(Base):
    def setUp(self):
        super().setUp()
        self.owner = self.signup('owner@co.test')
        self.slug = self.make_workspace(self.owner, 'Co')
        self.upgrade(self.slug, 'business')
        self.admin = self.signup('admin@co.test')
        self.add_member(self.owner, self.slug, 'admin@co.test', 'admin')
        self.member = self.signup('member@co.test')
        self.add_member(self.owner, self.slug, 'member@co.test', 'member')

    def members(self):
        return {m['email']: m for m in self.client.get(f'/api/w/{self.slug}/members/').data['results']}

    def test_add_unknown_and_duplicate_members(self):
        self.as_user(self.owner)
        r = self.client.post(f'/api/w/{self.slug}/members/', {'email': 'ghost@x.test', 'role': 'member'}, format='json')
        self.assertEqual(r.status_code, 400)
        r = self.client.post(f'/api/w/{self.slug}/members/', {'email': 'member@co.test', 'role': 'member'}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_admin_cannot_create_owners_or_exceed_own_role(self):
        self.signup('new@co.test')
        self.as_user(self.admin)
        for role in ('owner',):
            r = self.client.post(f'/api/w/{self.slug}/members/', {'email': 'new@co.test', 'role': role}, format='json')
            self.assertEqual(r.status_code, 403)
        r = self.client.post(f'/api/w/{self.slug}/members/', {'email': 'new@co.test', 'role': 'superuser'}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_role_change_and_audit(self):
        self.as_user(self.owner)
        mid = self.members()['member@co.test']['id']
        r = self.client.patch(f'/api/w/{self.slug}/members/{mid}/', {'role': 'viewer'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertIn('member.role_changed', self.audit_actions(self.slug))

    def test_admin_cannot_touch_the_owner(self):
        self.as_user(self.admin)
        oid = self.members()['owner@co.test']['id']
        self.assertEqual(self.client.patch(f'/api/w/{self.slug}/members/{oid}/', {'role': 'viewer'}, format='json').status_code, 403)
        self.assertEqual(self.client.delete(f'/api/w/{self.slug}/members/{oid}/').status_code, 403)

    def test_last_owner_cannot_be_demoted_or_removed(self):
        self.as_user(self.owner)
        oid = self.members()['owner@co.test']['id']
        self.assertEqual(self.client.patch(f'/api/w/{self.slug}/members/{oid}/', {'role': 'admin'}, format='json').status_code, 400)
        self.assertEqual(self.client.delete(f'/api/w/{self.slug}/members/{oid}/').status_code, 400)

    def test_member_can_leave_but_not_remove_others(self):
        self.as_user(self.member)
        ms = self.members()
        self.assertEqual(self.client.delete(f'/api/w/{self.slug}/members/{ms["admin@co.test"]["id"]}/').status_code, 403)
        self.assertEqual(self.client.delete(f'/api/w/{self.slug}/members/{ms["member@co.test"]["id"]}/').status_code, 204)
        self.assertEqual(self.client.get(f'/api/w/{self.slug}/issues/').status_code, 404)    # no longer in the workspace
