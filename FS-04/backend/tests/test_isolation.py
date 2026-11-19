"""THE most important tests: one company must never see or touch another company's data."""
from .base import Base


class TenantIsolationTests(Base):
    def setUp(self):
        super().setUp()
        self.alice, self.bob = self.signup('alice@acme.test'), self.signup('bob@globex.test')
        self.acme, self.globex = self.make_workspace(self.alice, 'Acme Inc'), self.make_workspace(self.bob, 'Globex')
        self.acme_project = self.make_project(self.alice, self.acme, 'Acme Site', 'ACM')
        self.acme_issue = self.make_issue(self.acme, self.acme_project['id'], 'Acme secret roadmap')
        self.globex_project = self.make_project(self.bob, self.globex, 'Globex App', 'GLX')
        self.globex_statuses = self.statuses(self.globex, self.globex_project['id'])

    def test_outsider_gets_404_for_every_workspace_endpoint(self):
        """Bob is not in Acme: every Acme URL answers 404, so he cannot even tell the workspace exists."""
        self.as_user(self.bob)
        pid, iid = self.acme_project['id'], self.acme_issue['id']
        urls = [f'/api/w/{self.acme}/', f'/api/w/{self.acme}/projects/', f'/api/w/{self.acme}/projects/{pid}/',
                f'/api/w/{self.acme}/projects/{pid}/board/', f'/api/w/{self.acme}/issues/', f'/api/w/{self.acme}/issues/{iid}/',
                f'/api/w/{self.acme}/members/', f'/api/w/{self.acme}/audit/', f'/api/w/{self.acme}/billing/',
                f'/api/w/{self.acme}/webhooks/', f'/api/w/{self.acme}/reports/', f'/api/w/{self.acme}/comments/',
                f'/api/w/{self.acme}/attachments/', f'/api/w/{self.acme}/sprints/', f'/api/w/{self.acme}/statuses/']
        for url in urls:
            self.assertEqual(self.client.get(url).status_code, 404, url)
        self.assertEqual(self.client.post(f'/api/w/{self.acme}/issues/', {'project': pid, 'title': 'x'}, format='json').status_code, 404)
        self.assertEqual(self.client.delete(f'/api/w/{self.acme}/issues/{iid}/').status_code, 404)

    def test_unknown_workspace_looks_the_same_as_a_forbidden_one(self):
        self.as_user(self.bob)
        self.assertEqual(self.client.get('/api/w/does-not-exist/projects/').status_code, 404)

    def test_anonymous_requests_are_rejected(self):
        self.as_user(None)
        self.assertEqual(self.client.get(f'/api/w/{self.acme}/projects/').status_code, 401)

    def test_my_own_workspace_never_leaks_other_tenants_rows(self):
        self.as_user(self.bob)
        titles = [i['title'] for i in self.client.get(f'/api/w/{self.globex}/issues/').data['results']]
        self.assertNotIn('Acme secret roadmap', titles)
        self.assertEqual([p['name'] for p in self.client.get(f'/api/w/{self.globex}/projects/').data['results']], ['Globex App'])

    def test_using_another_tenants_id_inside_my_own_workspace_does_not_work(self):
        """Bob is a member of Globex and tries URLs of his workspace with Acme's object ids."""
        self.as_user(self.bob)
        self.assertEqual(self.client.get(f'/api/w/{self.globex}/issues/{self.acme_issue["id"]}/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/w/{self.globex}/projects/{self.acme_project["id"]}/').status_code, 404)
        self.assertEqual(self.client.delete(f'/api/w/{self.globex}/projects/{self.acme_project["id"]}/').status_code, 404)

    def test_cannot_reference_another_tenants_objects_when_creating(self):
        self.as_user(self.bob)
        base = f'/api/w/{self.globex}'
        # issue in Acme's project
        r = self.client.post(f'{base}/issues/', {'project': self.acme_project['id'], 'title': 'sneaky'}, format='json')
        self.assertEqual(r.status_code, 400)
        # my project, but Acme's status / Acme's user as assignee
        acme_status = self.statuses_as(self.alice, self.acme, self.acme_project['id'])['To Do']['id']
        self.as_user(self.bob)
        r = self.client.post(f'{base}/issues/', {'project': self.globex_project['id'], 'title': 'x', 'status': acme_status}, format='json')
        self.assertEqual(r.status_code, 400)
        alice_id = self.client.get('/api/auth/me/').data['user']['id']
        me = self.client.get('/api/auth/me/').data['user']['id']
        acme_members = self.members_as(self.alice, self.acme)
        alice_user_id = [m['user'] for m in acme_members if m['email'] == 'alice@acme.test'][0]
        self.as_user(self.bob)
        r = self.client.post(f'{base}/issues/', {'project': self.globex_project['id'], 'title': 'x', 'assignee': alice_user_id}, format='json')
        self.assertEqual(r.status_code, 400)   # Alice is not a member of Globex
        # comment on Acme's issue
        r = self.client.post(f'{base}/comments/', {'issue': self.acme_issue['id'], 'body': 'hi'}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_cannot_move_issue_into_another_tenants_status(self):
        issue = self.make_issue_as(self.bob, self.globex, self.globex_project['id'])
        acme_status = self.statuses_as(self.alice, self.acme, self.acme_project['id'])['Done']['id']
        self.as_user(self.bob)
        r = self.client.post(f'/api/w/{self.globex}/issues/{issue["id"]}/move/', {'status': acme_status, 'index': 0}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_files_and_reports_are_tenant_protected(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        self.as_user(self.alice)
        r = self.client.post(f'/api/w/{self.acme}/attachments/', {'issue': self.acme_issue['id'], 'file': SimpleUploadedFile('plan.txt', b'secret')}, format='multipart')
        self.assertEqual(r.status_code, 201, r.content)
        att_id = r.data['id']
        self.assertEqual(self.client.get(f'/api/w/{self.acme}/attachments/{att_id}/download/').status_code, 200)
        self.as_user(self.bob)
        self.assertEqual(self.client.get(f'/api/w/{self.acme}/attachments/{att_id}/download/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/w/{self.globex}/attachments/{att_id}/download/').status_code, 404)

    def test_audit_log_is_per_workspace(self):
        self.as_user(self.bob)
        labels = ' '.join(e['target_label'] for e in self.client.get(f'/api/w/{self.globex}/audit/').data['results'])
        self.assertNotIn('Acme', labels)

    def test_workspace_list_only_shows_my_workspaces(self):
        self.as_user(self.bob)
        self.assertEqual([w['slug'] for w in self.client.get('/api/workspaces/').data], [self.globex])

    def test_one_person_can_belong_to_two_workspaces_with_different_roles(self):
        self.add_member(self.alice, self.acme, 'bob@globex.test', 'viewer')
        self.as_user(self.bob)
        self.assertEqual(self.client.get(f'/api/w/{self.acme}/issues/').status_code, 200)               # viewer in Acme
        self.assertEqual(self.client.post(f'/api/w/{self.acme}/issues/', {'project': self.acme_project['id'], 'title': 'x'}, format='json').status_code, 403)
        self.assertEqual(self.client.post(f'/api/w/{self.globex}/issues/', {'project': self.globex_project['id'], 'title': 'x'}, format='json').status_code, 201)  # owner in Globex

    def test_deleting_a_workspace_removes_only_its_own_data(self):
        self.as_user(self.alice)
        r = self.client.delete(f'/api/w/{self.acme}/', {'confirm': self.acme}, format='json')
        self.assertEqual(r.status_code, 204)
        self.as_user(self.bob)
        self.assertEqual(self.client.get(f'/api/w/{self.globex}/projects/').data['count'], 1)

    # ---- helpers that act as another user and then return to the previous one ----
    def statuses_as(self, token, slug, project_id):
        self.as_user(token)
        return self.statuses(slug, project_id)

    def members_as(self, token, slug):
        self.as_user(token)
        return self.client.get(f'/api/w/{slug}/members/').data['results']

    def make_issue_as(self, token, slug, project_id):
        self.as_user(token)
        return self.make_issue(slug, project_id)
