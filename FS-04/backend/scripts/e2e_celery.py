"""
Real end-to-end check of the background jobs (NOT inline): needs Postgres + Redis, and starts its own Celery worker.
  python scripts/e2e_celery.py
It creates a company, a webhook pointing at a tiny receiver started here, then checks that the worker process
delivered a correctly SIGNED webhook, printed the assignment email, and generated a CSV report.
"""
import hashlib
import hmac
import json
import os
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
os.environ['CELERY_TASK_ALWAYS_EAGER'] = '0'
os.environ.setdefault('MEDIA_ROOT', '/tmp/pm-e2e-media')

import django  # noqa: E402

django.setup()
from django.core.management import call_command  # noqa: E402
from rest_framework.test import APIClient  # noqa: E402

received = []


class Receiver(BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers['Content-Length'])).decode()
        received.append((dict(self.headers), body))
        self.send_response(200)
        self.end_headers()

    def log_message(self, *a):
        pass


def wait_for(condition, seconds=25, what='condition'):
    end = time.time() + seconds
    while time.time() < end:
        if condition():
            return
        time.sleep(0.3)
    raise SystemExit(f'FAILED: timed out waiting for {what}')


def main():
    call_command('migrate', verbosity=0)
    server = HTTPServer(('127.0.0.1', 0), Receiver)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    log = open('/tmp/celery-worker.log', 'w')
    worker = subprocess.Popen([sys.executable, '-m', 'celery', '-A', 'config', 'worker', '-l', 'info', '--concurrency', '2'], cwd=ROOT, stdout=log, stderr=log, env=os.environ)
    try:
        wait_for(lambda: 'ready.' in open('/tmp/celery-worker.log').read(), what='the Celery worker to start')
        suffix = str(int(time.time()))
        api = APIClient()
        reg = lambda e, n: api.post('/api/auth/register/', {'email': e, 'name': n, 'password': 'S3cure-passw0rd!'}, format='json').data['token']
        owner, dev = reg(f'owner{suffix}@e2e.test', 'Olivia Owner'), reg(f'dev{suffix}@e2e.test', 'Dana Dev')
        api.credentials(HTTP_AUTHORIZATION=f'Token {owner}')
        slug = api.post('/api/workspaces/', {'name': f'E2E Co {suffix}'}, format='json').data['slug']
        from apps.billing import services
        from apps.workspaces.models import Workspace
        services.activate(Workspace.objects.get(slug=slug), 'pro', 'mock')
        base = f'/api/w/{slug}'
        api.post(f'{base}/members/', {'email': f'dev{suffix}@e2e.test', 'role': 'member'}, format='json')
        dev_id = [m['user'] for m in api.get(f'{base}/members/').data['results'] if m['email'].startswith('dev')][0]
        hook = api.post(f'{base}/webhooks/', {'url': f'http://127.0.0.1:{server.server_port}/hook', 'events': ['issue.created', 'report.ready']}, format='json').data
        pid = api.post(f'{base}/projects/', {'name': 'Site', 'key': 'WEB'}, format='json').data['id']

        issue = api.post(f'{base}/issues/', {'project': pid, 'title': 'Ship it', 'assignee': dev_id, 'story_points': 3}, format='json').data
        wait_for(lambda: any(h['X-PM-Event'] == 'issue.created' for h, _ in received), what='the webhook')
        headers, body = next(x for x in received if x[0]['X-PM-Event'] == 'issue.created')
        expected = 'sha256=' + hmac.new(hook['secret'].encode(), body.encode(), hashlib.sha256).hexdigest()
        assert headers['X-PM-Signature'] == expected, 'bad signature'
        assert json.loads(body)['target']['label'] == f'WEB-1: Ship it'
        print('OK  webhook delivered by the worker with a valid HMAC signature')

        wait_for(lambda: 'Ship it' in open('/tmp/celery-worker.log').read() and 'dev' in open('/tmp/celery-worker.log').read(), what='the email')
        assert 'Subject: [WEB-1] Olivia Owner assigned you: Ship it' in open('/tmp/celery-worker.log').read()
        print('OK  assignment email produced by the worker')

        rep = api.post(f'{base}/reports/', {'kind': 'project', 'project': pid}, format='json')
        assert rep.status_code == 202 and rep.data['status'] == 'pending', rep.data
        wait_for(lambda: api.get(f'{base}/reports/{rep.data["id"]}/').data['status'] == 'done', what='the report')
        csv_text = b''.join(api.get(f'{base}/reports/{rep.data["id"]}/download/').streaming_content).decode()
        assert 'WEB-1' in csv_text and 'Ship it' in csv_text
        print('OK  report generated in the background and downloadable')
        wait_for(lambda: any(h['X-PM-Event'] == 'report.ready' for h, _ in received), what='the report.ready webhook')
        print('OK  report.ready event delivered too')
        deliveries = api.get(f'{base}/webhooks/{hook["id"]}/deliveries/').data
        assert all(d['status'] == 'success' for d in deliveries), deliveries
        print(f'OK  delivery log shows {len(deliveries)} successful deliveries')
        print('\nALL BACKGROUND-JOB CHECKS PASSED')
    finally:
        worker.terminate()
        worker.wait(timeout=10)


if __name__ == '__main__':
    main()
