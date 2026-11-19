import csv
import hashlib
import hmac
import io
import json
from unittest import mock

import requests
from django.test import override_settings

from .base import Base


def fake_response(status=200, text='ok'):
    r = mock.Mock()
    r.status_code, r.text, r.ok = status, text, 200 <= status < 300
    return r


class IntegrationTestCase(Base):
    def setUp(self):
        super().setUp()
        self.owner = self.signup('owner@co.test', 'Olivia Owner')
        self.slug = self.make_workspace(self.owner, 'Co')
        self.upgrade(self.slug, 'pro')
        self.project = self.make_project(self.owner, self.slug)
        self.pid = self.project['id']
        self.base = f'/api/w/{self.slug}'

    def hook(self, **extra):
        r = self.client.post(f'{self.base}/webhooks/', {'url': 'https://example.test/hook', 'events': ['*'], **extra}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        return r.data


class AssignmentEmailTests(IntegrationTestCase):
    def test_assigning_someone_else_sends_one_email(self):
        dev = self.signup('dev@co.test', 'Dana Dev')
        self.add_member(self.owner, self.slug, 'dev@co.test', 'member')
        self.as_user(self.owner)
        dev_id = [m['user'] for m in self.client.get(f'{self.base}/members/').data['results'] if m['email'] == 'dev@co.test'][0]
        issue = self.make_issue(self.slug, self.pid, 'Fix the login page', assignee=dev_id)
        self.assertEqual(len(self.outbox), 1)
        mail = self.outbox[0]
        self.assertEqual(mail.to, ['dev@co.test'])
        self.assertIn('WEB-1', mail.subject)
        self.assertIn('Olivia Owner', mail.subject)
        self.assertIn(f'/w/{self.slug}/projects/{self.pid}?issue={issue["id"]}', mail.body)

    def test_reassigning_emails_the_new_person_and_self_assignment_is_silent(self):
        dev = self.signup('dev@co.test')
        self.add_member(self.owner, self.slug, 'dev@co.test', 'member')
        self.as_user(self.owner)
        me = self.client.get('/api/auth/me/').data['user']['id']
        dev_id = [m['user'] for m in self.client.get(f'{self.base}/members/').data['results'] if m['email'] == 'dev@co.test'][0]
        issue = self.make_issue(self.slug, self.pid, assignee=me)
        self.assertEqual(len(self.outbox), 0)                                  # assigned to myself: no email
        self.client.patch(f'{self.base}/issues/{issue["id"]}/', {'assignee': dev_id}, format='json')
        self.assertEqual([m.to for m in self.outbox], [['dev@co.test']])
        self.client.patch(f'{self.base}/issues/{issue["id"]}/', {'title': 'renamed'}, format='json')
        self.assertEqual(len(self.outbox), 1)                                  # unrelated edit: no new email


class WebhookTests(IntegrationTestCase):
    @mock.patch('apps.integrations.tasks.requests.post', return_value=fake_response())
    def test_event_is_delivered_with_a_valid_signature(self, post):
        hook = self.hook()
        self.make_issue(self.slug, self.pid, 'Hello hooks')
        self.assertTrue(post.called)
        call = post.call_args_list[-1]
        body = call.kwargs['data']
        headers = call.kwargs['headers']
        self.assertEqual(headers['X-PM-Event'], 'issue.created')
        expected = 'sha256=' + hmac.new(hook['secret'].encode(), body.encode(), hashlib.sha256).hexdigest()
        self.assertEqual(headers['X-PM-Signature'], expected)                 # the receiver can verify the sender
        payload = json.loads(body)
        self.assertEqual((payload['event'], payload['workspace'], payload['target']['label']), ('issue.created', self.slug, 'WEB-1: Hello hooks'))
        self.assertEqual(payload['actor']['name'], 'Olivia Owner')

    @mock.patch('apps.integrations.tasks.requests.post', return_value=fake_response())
    def test_only_subscribed_events_are_sent(self, post):
        self.hook(events=['issue.status_changed'])
        issue = self.make_issue(self.slug, self.pid)
        self.client.post(f'{self.base}/comments/', {'issue': issue['id'], 'body': 'x'}, format='json')
        self.assertEqual(post.call_count, 0)
        st = self.statuses(self.slug, self.pid)
        self.client.post(f'{self.base}/issues/{issue["id"]}/move/', {'status': st['Done']['id'], 'index': 0}, format='json')
        self.assertEqual(post.call_count, 1)
        self.assertEqual(post.call_args.kwargs['headers']['X-PM-Event'], 'issue.status_changed')

    @mock.patch('apps.integrations.tasks.requests.post', return_value=fake_response())
    def test_inactive_webhooks_and_other_workspaces_receive_nothing(self, post):
        hook = self.hook()
        self.client.patch(f'{self.base}/webhooks/{hook["id"]}/', {'active': False}, format='json')
        post.reset_mock()
        self.make_issue(self.slug, self.pid)
        self.assertEqual(post.call_count, 0)
        # another company's activity never reaches this company's hook
        self.client.patch(f'{self.base}/webhooks/{hook["id"]}/', {'active': True}, format='json')
        other_owner = self.signup('x@other.test')
        other = self.make_workspace(other_owner, 'Other')
        self.make_project(other_owner, other, 'Their site', 'THR')
        post.reset_mock()
        self.assertEqual(post.call_count, 0)

    @mock.patch('apps.integrations.tasks.requests.post', return_value=fake_response(500, 'boom'))
    def test_failing_endpoint_is_retried_then_marked_failed(self, post):
        hook = self.hook(events=['issue.created'])
        self.make_issue(self.slug, self.pid)
        d = self.client.get(f'{self.base}/webhooks/{hook["id"]}/deliveries/').data[0]
        self.assertEqual(d['status'], 'failed')
        self.assertEqual(d['response_status'], 500)
        self.assertGreater(d['attempts'], 1)                                   # Celery retried with backoff

    @mock.patch('apps.integrations.tasks.requests.post', side_effect=requests.ConnectionError('refused'))
    def test_unreachable_endpoint_never_breaks_the_users_request(self, post):
        self.hook(events=['issue.created'])
        self.make_issue(self.slug, self.pid)          # make_issue asserts a 201 response

    @mock.patch('apps.integrations.tasks.requests.post', return_value=fake_response())
    def test_test_button_sends_a_sample_event(self, post):
        hook = self.hook(events=['issue.created'])
        r = self.client.post(f'{self.base}/webhooks/{hook["id"]}/test/')
        self.assertEqual(r.status_code, 202)
        self.assertEqual(post.call_args.kwargs['headers']['X-PM-Event'], 'webhook.test')
        self.assertEqual(self.client.get(f'{self.base}/webhooks/{hook["id"]}/deliveries/').data[0]['status'], 'success')

    def test_rotating_the_secret_changes_it(self):
        hook = self.hook()
        new = self.client.post(f'{self.base}/webhooks/{hook["id"]}/rotate_secret/').data['secret']
        self.assertNotEqual(hook['secret'], new)

    def test_validation_of_events_and_urls(self):
        self.assertEqual(self.client.post(f'{self.base}/webhooks/', {'url': 'https://e.test/h', 'events': ['nonsense']}, format='json').status_code, 400)
        self.assertEqual(self.client.post(f'{self.base}/webhooks/', {'url': 'https://e.test/h', 'events': []}, format='json').status_code, 400)
        self.assertEqual(self.client.post(f'{self.base}/webhooks/', {'url': 'ftp://e.test/h', 'events': ['*']}, format='json').status_code, 400)

    @override_settings(WEBHOOK_ALLOW_PRIVATE=False)
    def test_private_addresses_are_blocked_in_production(self):
        for url in ('http://127.0.0.1/hook', 'http://localhost/hook', 'http://169.254.169.254/latest/meta-data', 'http://10.0.0.5/x', 'http://192.168.1.1/x'):
            r = self.client.post(f'{self.base}/webhooks/', {'url': url, 'events': ['*']}, format='json')
            self.assertEqual(r.status_code, 400, url)

    def test_webhook_changes_are_audited_and_admin_only(self):
        self.hook()
        self.assertIn('webhook.created', self.audit_actions(self.slug))
        member = self.signup('m@co.test')
        self.add_member(self.owner, self.slug, 'm@co.test', 'member')
        self.as_user(member)
        self.assertEqual(self.client.get(f'{self.base}/webhooks/').status_code, 403)   # secrets are admin-only


class ReportTests(IntegrationTestCase):
    def setUp(self):
        super().setUp()
        self.st = self.statuses(self.slug, self.pid)
        self.sprint = self.client.post(f'{self.base}/sprints/', {'project': self.pid, 'name': 'Sprint 1'}, format='json').data
        self.a = self.make_issue(self.slug, self.pid, 'Build login', sprint=self.sprint['id'], story_points=5)
        self.b = self.make_issue(self.slug, self.pid, 'Write docs', sprint=self.sprint['id'], story_points=3)
        self.make_issue(self.slug, self.pid, 'Not in the sprint', story_points=8)
        self.client.post(f'{self.base}/issues/{self.a["id"]}/move/', {'status': self.st['Done']['id']}, format='json')

    def rows(self, report_id):
        r = self.client.get(f'{self.base}/reports/{report_id}/download/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r['Content-Type'], 'text/csv')
        return list(csv.reader(io.StringIO(b''.join(r.streaming_content).decode())))

    def test_sprint_report_is_generated_in_the_background(self):
        r = self.client.post(f'{self.base}/reports/', {'kind': 'sprint', 'sprint': self.sprint['id']}, format='json')
        self.assertEqual(r.status_code, 202)                      # accepted immediately
        rep = self.client.get(f'{self.base}/reports/{r.data["id"]}/').data
        self.assertEqual(rep['status'], 'done')
        self.assertEqual(rep['summary'], {'todo': 1, 'in_progress': 0, 'done': 1, 'total': 2, 'points_total': 8, 'points_done': 5, 'completion_percent': 50})
        rows = self.rows(r.data['id'])
        self.assertEqual(rows[0][:3], ['Key', 'Title', 'Type'])
        self.assertEqual(sorted(x[1] for x in rows[1:]), ['Build login', 'Write docs'])        # the issue outside the sprint is excluded
        self.assertIn('report.ready', self.audit_actions(self.slug))

    def test_project_report_includes_everything(self):
        r = self.client.post(f'{self.base}/reports/', {'kind': 'project', 'project': self.pid}, format='json')
        self.assertEqual(len(self.rows(r.data['id'])) - 1, 3)

    def test_csv_formula_injection_is_neutralised(self):
        self.make_issue(self.slug, self.pid, '=HYPERLINK("http://evil.test","click")', sprint=self.sprint['id'])
        r = self.client.post(f'{self.base}/reports/', {'kind': 'sprint', 'sprint': self.sprint['id']}, format='json')
        titles = [x[1] for x in self.rows(r.data['id'])[1:]]
        self.assertIn('\'=HYPERLINK("http://evil.test","click")', titles)

    def test_report_validation_and_cross_tenant_ids(self):
        self.assertEqual(self.client.post(f'{self.base}/reports/', {'kind': 'sprint'}, format='json').status_code, 400)
        other_owner = self.signup('x@other.test')
        other = self.make_workspace(other_owner, 'Other')
        op = self.make_project(other_owner, other, 'Theirs', 'THR')
        osprint = self.client.post(f'/api/w/{other}/sprints/', {'project': op['id'], 'name': 'S'}, format='json').data
        self.as_user(self.owner)
        r = self.client.post(f'{self.base}/reports/', {'kind': 'sprint', 'sprint': osprint['id']}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_report_that_fails_is_reported_as_failed(self):
        with mock.patch('apps.integrations.tasks.csv.writer', side_effect=RuntimeError('disk full')):
            r = self.client.post(f'{self.base}/reports/', {'kind': 'project', 'project': self.pid}, format='json')
        rep = self.client.get(f'{self.base}/reports/{r.data["id"]}/').data
        self.assertEqual((rep['status'], rep['error']), ('failed', 'disk full'))
        self.assertEqual(self.client.get(f'{self.base}/reports/{r.data["id"]}/download/').status_code, 400)

    def test_viewers_cannot_request_reports(self):
        viewer = self.signup('v@co.test')
        self.add_member(self.owner, self.slug, 'v@co.test', 'viewer')
        self.as_user(viewer)
        self.assertEqual(self.client.post(f'{self.base}/reports/', {'kind': 'project', 'project': self.pid}, format='json').status_code, 403)
