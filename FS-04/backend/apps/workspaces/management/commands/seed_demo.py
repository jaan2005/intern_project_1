"""python manage.py seed_demo : two demo companies so you can SEE tenant isolation. Safe to run twice."""
from datetime import date, timedelta

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import User
from apps.billing import services as billing
from apps.projects.models import Issue, Project, Sprint, WorkflowStatus
from apps.workspaces.models import Membership, Workspace

PASSWORD = 'Demo@12345'

PEOPLE = {
    'priya@acme.test': 'Priya Owner', 'arjun@acme.test': 'Arjun Admin', 'meera@acme.test': 'Meera Member', 'vik@acme.test': 'Vik Viewer',
    'sam@globex.test': 'Sam Owner', 'gina@globex.test': 'Gina Member',
}
ACME_ISSUES = [  # (title, type, priority, status, points, assignee)
    ('Design the new landing page', 'story', 'high', 'In Progress', 5, 'meera@acme.test'),
    ('Fix login redirect loop', 'bug', 'urgent', 'To Do', 2, 'arjun@acme.test'),
    ('Set up CI pipeline', 'task', 'medium', 'Done', 3, 'arjun@acme.test'),
    ('Write onboarding emails', 'task', 'low', 'To Do', 2, None),
    ('Optimise image loading', 'task', 'medium', 'In Progress', 3, 'meera@acme.test'),
    ('Accessibility audit', 'story', 'high', 'To Do', 8, None),
    ('Update privacy policy', 'task', 'low', 'Done', 1, 'priya@acme.test'),
]
MOBILE_ISSUES = [('Push notifications', 'story', 'high', 'To Do', 5, None), ('Crash on startup (Android 14)', 'bug', 'urgent', 'In Progress', 3, 'meera@acme.test')]
GLOBEX_ISSUES = [('Confidential: merger plan', 'task', 'urgent', 'To Do', 8, 'sam@globex.test'), ('Quarterly report', 'task', 'medium', 'In Progress', 3, 'gina@globex.test')]


class Command(BaseCommand):
    help = 'Create two demo companies (Acme on the Pro plan, Globex on Free) with users, projects, a sprint and issues.'

    @transaction.atomic
    def handle(self, *args, **opts):
        if User.objects.filter(email='priya@acme.test').exists():
            self.stdout.write('Demo data already exists. Nothing to do.')
            return
        users = {e: User.objects.create_user(email=e, name=n, password=PASSWORD) for e, n in PEOPLE.items()}

        acme = self.company('Acme Corp', users['priya@acme.test'], 'pro')
        for email, role in (('arjun@acme.test', 'admin'), ('meera@acme.test', 'member'), ('vik@acme.test', 'viewer')):
            Membership.objects.create(workspace=acme, user=users[email], role=role)
        web = self.project(acme, 'Website Redesign', 'WEB', ACME_ISSUES, users)
        self.project(acme, 'Mobile App', 'MOB', MOBILE_ISSUES, users)
        sprint = Sprint.objects.create(workspace=acme, project=web, name='Sprint 1', goal='Ship the new landing page',
                                       start_date=date.today(), end_date=date.today() + timedelta(days=14), status='active')
        Issue.objects.filter(project=web, number__lte=5).update(sprint=sprint)

        globex = self.company('Globex Ltd', users['sam@globex.test'], 'free')
        Membership.objects.create(workspace=globex, user=users['gina@globex.test'], role='member')
        self.project(globex, 'Reporting', 'REP', GLOBEX_ISSUES, users)

        self.stdout.write(self.style.SUCCESS('Demo data created. All passwords: ' + PASSWORD))
        self.stdout.write('  Acme Corp (Pro):   priya@acme.test (owner), arjun@acme.test (admin), meera@acme.test (member), vik@acme.test (viewer)')
        self.stdout.write('  Globex Ltd (Free): sam@globex.test (owner), gina@globex.test (member)')

    def company(self, name, owner, plan):
        ws = Workspace.objects.create(name=name, slug=Workspace.make_slug(name), created_by=owner)
        Membership.objects.create(workspace=ws, user=owner, role='owner')
        billing.ensure_subscription(ws)
        if plan != 'free':
            billing.activate(ws, plan, 'mock')
        return ws

    def project(self, ws, name, key, issues, users):
        project = Project.objects.create(workspace=ws, name=name, key=key)
        statuses = {}
        for i, (n, cat) in enumerate([('To Do', 'todo'), ('In Progress', 'in_progress'), ('Done', 'done')]):
            statuses[n] = WorkflowStatus.objects.create(workspace=ws, project=project, name=n, category=cat, order=i)
        owner = Membership.objects.filter(workspace=ws, role='owner').first().user
        for n, (title, typ, prio, status, points, assignee) in enumerate(issues, start=1):
            Issue.objects.create(workspace=ws, project=project, number=n, title=title, type=typ, priority=prio, status=statuses[status],
                                 assignee=users.get(assignee), reporter=owner, story_points=points, position=n * 1024.0)
        project.issue_counter = len(issues)
        project.save(update_fields=['issue_counter'])
        return project
