"""Shared helpers for the tests."""
from unittest import mock

from django.core import mail
from rest_framework.test import APITestCase

from config.celery import app as celery_app

celery_app.conf.task_always_eager = True       # run Celery tasks inline so tests need no worker
celery_app.conf.task_eager_propagates = False  # a failing task is recorded, it does not crash the request


class Base(APITestCase):
    password = 'S3cure-passw0rd!'

    def setUp(self):
        # Tests run inside a transaction that never commits, so "after commit" hooks (webhooks, emails, reports)
        # would never fire. Run them immediately instead.
        patcher = mock.patch('django.db.transaction.on_commit', side_effect=lambda fn, **kw: fn())
        patcher.start()
        self.addCleanup(patcher.stop)

    def signup(self, email, name=None):
        r = self.client.post('/api/auth/register/', {'email': email, 'name': name or email.split('@')[0].title(), 'password': self.password}, format='json')
        assert r.status_code == 201, r.content
        return r.data['token']

    def as_user(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}' if token else '')

    def make_workspace(self, token, name):
        self.as_user(token)
        r = self.client.post('/api/workspaces/', {'name': name}, format='json')
        assert r.status_code == 201, r.content
        return r.data['slug']

    def add_member(self, owner_token, slug, email, role):
        self.as_user(owner_token)
        r = self.client.post(f'/api/w/{slug}/members/', {'email': email, 'role': role}, format='json')
        assert r.status_code == 201, r.content
        return r.data

    def make_project(self, token, slug, name='Website', key='WEB'):
        self.as_user(token)
        r = self.client.post(f'/api/w/{slug}/projects/', {'name': name, 'key': key}, format='json')
        assert r.status_code == 201, r.content
        return r.data

    def statuses(self, slug, project_id):
        r = self.client.get(f'/api/w/{slug}/statuses/?project={project_id}')
        return {s['name']: s for s in r.data['results']}

    def make_issue(self, slug, project_id, title='Fix login', **extra):
        r = self.client.post(f'/api/w/{slug}/issues/', {'project': project_id, 'title': title, **extra}, format='json')
        assert r.status_code == 201, r.content
        return r.data

    def audit_actions(self, slug):
        return [e['action'] for e in self.client.get(f'/api/w/{slug}/audit/').data['results']]

    @property
    def outbox(self):
        return mail.outbox

    def upgrade(self, slug, plan='pro'):
        from apps.billing import services
        from apps.workspaces.models import Workspace
        services.activate(Workspace.objects.get(slug=slug), plan, 'mock')
