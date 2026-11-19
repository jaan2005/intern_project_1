from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings

from .base import Base


class BoardTestCase(Base):
    def setUp(self):
        super().setUp()
        self.owner = self.signup('owner@co.test')
        self.slug = self.make_workspace(self.owner, 'Co')
        self.upgrade(self.slug, 'business')
        self.project = self.make_project(self.owner, self.slug)
        self.pid = self.project['id']
        self.st = self.statuses(self.slug, self.pid)
        self.base = f'/api/w/{self.slug}'

    def move(self, issue_id, status_name, index=None, expect=200):
        data = {'status': self.st[status_name]['id']}
        if index is not None:
            data['index'] = index
        r = self.client.post(f'{self.base}/issues/{issue_id}/move/', data, format='json')
        self.assertEqual(r.status_code, expect, r.content)
        return r

    def column(self, name):
        board = self.client.get(f'{self.base}/projects/{self.pid}/board/').data
        return [i['key'] for c in board['columns'] if c['status']['name'] == name for i in c['issues']]


class IssueTests(BoardTestCase):
    def test_new_project_gets_a_default_workflow(self):
        self.assertEqual(list(self.st), ['To Do', 'In Progress', 'Done'])
        self.assertEqual([s['category'] for s in self.st.values()], ['todo', 'in_progress', 'done'])

    def test_issue_keys_count_up_per_project(self):
        a, b = self.make_issue(self.slug, self.pid, 'A'), self.make_issue(self.slug, self.pid, 'B')
        self.assertEqual((a['key'], b['key']), ('WEB-1', 'WEB-2'))
        other = self.make_project(self.owner, self.slug, 'Mobile', 'MOB')
        self.assertEqual(self.make_issue(self.slug, other['id'], 'C')['key'], 'MOB-1')
        self.assertEqual(a['status_name'], 'To Do')                 # default column

    def test_project_key_rules(self):
        self.assertEqual(self.client.post(f'{self.base}/projects/', {'name': 'X', 'key': 'web'}, format='json').status_code, 400)   # lowercase
        self.assertEqual(self.client.post(f'{self.base}/projects/', {'name': 'X', 'key': 'WEB'}, format='json').status_code, 400)   # duplicate

    def test_filters(self):
        me = self.client.get('/api/auth/me/').data['user']['id']
        self.make_issue(self.slug, self.pid, 'Login bug', type='bug', assignee=me)
        self.make_issue(self.slug, self.pid, 'Write docs', priority='low')
        get = lambda q: [i['title'] for i in self.client.get(f'{self.base}/issues/?{q}').data['results']]
        self.assertEqual(get('assignee=me'), ['Login bug'])
        self.assertEqual(get('search=docs'), ['Write docs'])
        self.assertEqual(get('type=bug'), ['Login bug'])
        self.assertEqual(sorted(get('sprint=backlog')), ['Login bug', 'Write docs'])

    def test_update_is_audited_with_old_and_new_values(self):
        i = self.make_issue(self.slug, self.pid, 'Old title')
        self.client.patch(f'{self.base}/issues/{i["id"]}/', {'title': 'New title', 'priority': 'urgent'}, format='json')
        entry = self.client.get(f'{self.base}/audit/?action=issue.updated').data['results'][0]
        self.assertEqual(entry['changes']['title'], ['Old title', 'New title'])
        self.assertEqual(entry['changes']['priority'], ['medium', 'urgent'])
        self.assertEqual(entry['actor_name'], 'Owner')

    def test_audit_records_create_and_delete(self):
        i = self.make_issue(self.slug, self.pid, 'Temp')
        self.client.delete(f'{self.base}/issues/{i["id"]}/')
        actions = self.audit_actions(self.slug)
        self.assertIn('issue.created', actions)
        self.assertIn('issue.deleted', actions)
        deleted = self.client.get(f'{self.base}/audit/?action=issue.deleted').data['results'][0]
        self.assertIn('WEB-1', deleted['target_label'])

    def test_story_points_and_validation(self):
        self.assertEqual(self.client.post(f'{self.base}/issues/', {'project': self.pid, 'title': ''}, format='json').status_code, 400)
        self.assertEqual(self.client.post(f'{self.base}/issues/', {'project': self.pid, 'title': 'x', 'type': 'epic'}, format='json').status_code, 400)
        self.assertEqual(self.make_issue(self.slug, self.pid, 'Pts', story_points=5)['story_points'], 5)

    def test_issue_cannot_change_project(self):
        other = self.make_project(self.owner, self.slug, 'Mobile', 'MOB')
        i = self.make_issue(self.slug, self.pid)
        r = self.client.patch(f'{self.base}/issues/{i["id"]}/', {'project': other['id']}, format='json')
        self.assertEqual(r.status_code, 400)


class KanbanTests(BoardTestCase):
    def test_board_groups_cards_by_column_in_order(self):
        a, b, c = [self.make_issue(self.slug, self.pid, t) for t in 'ABC']
        self.move(c['id'], 'In Progress')
        self.assertEqual(self.column('To Do'), ['WEB-1', 'WEB-2'])
        self.assertEqual(self.column('In Progress'), ['WEB-3'])
        self.assertEqual(self.column('Done'), [])

    def test_drag_between_columns_and_reorder_within_a_column(self):
        issues = [self.make_issue(self.slug, self.pid, t) for t in 'ABCD']      # WEB-1..4 in To Do
        self.move(issues[3]['id'], 'To Do', 0)       # drag D to the top
        self.assertEqual(self.column('To Do'), ['WEB-4', 'WEB-1', 'WEB-2', 'WEB-3'])
        self.move(issues[0]['id'], 'To Do', 2)       # drag A to the middle
        self.assertEqual(self.column('To Do'), ['WEB-4', 'WEB-2', 'WEB-1', 'WEB-3'])
        self.move(issues[1]['id'], 'Done', 0)        # B to another (empty) column
        self.assertEqual(self.column('Done'), ['WEB-2'])
        self.move(issues[2]['id'], 'Done', 99)       # index past the end = last
        self.assertEqual(self.column('Done'), ['WEB-2', 'WEB-3'])

    def test_many_inserts_between_two_cards_keep_the_order(self):
        """Repeatedly dropping a card between the first two cards squeezes the gap to nothing; the server renumbers."""
        first, last = self.make_issue(self.slug, self.pid, 'first'), self.make_issue(self.slug, self.pid, 'last')
        self.move(first['id'], 'Done', 0)
        self.move(last['id'], 'Done', 1)
        keys = []
        for n in range(45):
            card = self.make_issue(self.slug, self.pid, f'card {n}')
            self.move(card['id'], 'Done', 1)
            keys.append(card['key'])
        expected = [first['key']] + list(reversed(keys)) + [last['key']]
        self.assertEqual(self.column('Done'), expected)
        from apps.projects.models import Issue
        positions = list(Issue.objects.filter(status_id=self.st['Done']['id']).order_by('position').values_list('position', flat=True))
        self.assertEqual(positions, sorted(set(positions)))          # strictly increasing, no duplicates

    def test_a_move_is_audited_as_a_status_change(self):
        i = self.make_issue(self.slug, self.pid)
        self.move(i['id'], 'In Progress', 0)
        entry = self.client.get(f'{self.base}/audit/?action=issue.status_changed').data['results'][0]
        self.assertEqual(entry['changes']['status_id'], [self.st['To Do']['id'], self.st['In Progress']['id']])

    def test_reordering_inside_a_column_is_not_a_status_change(self):
        a, b = self.make_issue(self.slug, self.pid, 'A'), self.make_issue(self.slug, self.pid, 'B')
        self.move(b['id'], 'To Do', 0)
        self.assertNotIn('issue.status_changed', self.audit_actions(self.slug))

    def test_moving_to_a_bad_status_fails(self):
        i = self.make_issue(self.slug, self.pid)
        r = self.client.post(f'{self.base}/issues/{i["id"]}/move/', {'status': 999999}, format='json')
        self.assertEqual(r.status_code, 400)
        r = self.client.post(f'{self.base}/issues/{i["id"]}/move/', {}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_board_filters_by_sprint(self):
        sprint = self.client.post(f'{self.base}/sprints/', {'project': self.pid, 'name': 'S1'}, format='json').data
        a, b = self.make_issue(self.slug, self.pid, 'in sprint', sprint=sprint['id']), self.make_issue(self.slug, self.pid, 'backlog')
        keys = lambda q: [i['key'] for c in self.client.get(f'{self.base}/projects/{self.pid}/board/?sprint={q}').data['columns'] for i in c['issues']]
        self.assertEqual(keys(sprint['id']), [a['key']])
        self.assertEqual(keys('backlog'), [b['key']])
        self.assertEqual(sorted(keys('all')), sorted([a['key'], b['key']]))


class CustomWorkflowTests(BoardTestCase):
    def test_add_a_custom_column(self):
        r = self.client.post(f'{self.base}/statuses/', {'project': self.pid, 'name': 'In Review', 'category': 'in_progress'}, format='json')
        self.assertEqual(r.status_code, 201)
        names = lambda: [c['status']['name'] for c in self.client.get(f'{self.base}/projects/{self.pid}/board/').data['columns']]
        self.assertEqual(names(), ['To Do', 'In Progress', 'Done', 'In Review'])        # new columns are appended
        self.client.patch(f'{self.base}/statuses/{self.st["Done"]["id"]}/', {'order': 10}, format='json')   # reorder: Done goes last
        self.assertEqual(names(), ['To Do', 'In Progress', 'In Review', 'Done'])
        self.assertEqual(self.client.post(f'{self.base}/statuses/', {'project': self.pid, 'name': 'In Review'}, format='json').status_code, 400)  # duplicate

    def test_transition_rules_are_enforced(self):
        # To Do may only go to In Progress; In Progress may go to To Do or Done
        sid = {k: v['id'] for k, v in self.st.items()}
        self.client.patch(f'{self.base}/statuses/{sid["To Do"]}/', {'next_statuses': [sid['In Progress']]}, format='json')
        i = self.make_issue(self.slug, self.pid)
        r = self.move(i['id'], 'Done', expect=400)                       # skipping a step is refused
        self.assertIn('In Progress', str(r.data))
        self.move(i['id'], 'In Progress', expect=200)
        self.move(i['id'], 'Done', expect=200)                           # In Progress has no rule: anything goes
        # the same rule applies when changing the status through a normal update
        j = self.make_issue(self.slug, self.pid, 'J')
        r = self.client.patch(f'{self.base}/issues/{j["id"]}/', {'status': sid['Done']}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_rules_cannot_point_at_another_projects_status(self):
        other = self.make_project(self.owner, self.slug, 'Mobile', 'MOB')
        other_todo = self.statuses(self.slug, other['id'])['To Do']['id']
        r = self.client.patch(f'{self.base}/statuses/{self.st["To Do"]["id"]}/', {'next_statuses': [other_todo]}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_cannot_delete_a_status_that_has_issues_or_the_last_status(self):
        self.make_issue(self.slug, self.pid)
        self.assertEqual(self.client.delete(f'{self.base}/statuses/{self.st["To Do"]["id"]}/').status_code, 400)
        self.assertEqual(self.client.delete(f'{self.base}/statuses/{self.st["Done"]["id"]}/').status_code, 204)
        self.assertEqual(self.client.delete(f'{self.base}/statuses/{self.st["In Progress"]["id"]}/').status_code, 204)
        self.assertEqual(self.client.delete(f'{self.base}/statuses/{self.st["To Do"]["id"]}/').status_code, 400)   # still has an issue
        i = self.client.get(f'{self.base}/issues/').data['results'][0]
        self.client.delete(f'{self.base}/issues/{i["id"]}/')
        self.assertEqual(self.client.delete(f'{self.base}/statuses/{self.st["To Do"]["id"]}/').status_code, 400)   # the last status


class SprintTests(BoardTestCase):
    def sprint(self, name='Sprint 1', **extra):
        r = self.client.post(f'{self.base}/sprints/', {'project': self.pid, 'name': name, **extra}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        return r.data

    def test_lifecycle_and_unfinished_work_returns_to_backlog(self):
        s = self.sprint()
        done, todo = self.make_issue(self.slug, self.pid, 'done', sprint=s['id']), self.make_issue(self.slug, self.pid, 'todo', sprint=s['id'])
        self.move(done['id'], 'Done')
        self.assertEqual(self.client.post(f'{self.base}/sprints/{s["id"]}/complete/').status_code, 400)       # not started yet
        self.assertEqual(self.client.post(f'{self.base}/sprints/{s["id"]}/start/').data['status'], 'active')
        r = self.client.post(f'{self.base}/sprints/{s["id"]}/complete/')
        self.assertEqual((r.data['status'], r.data['returned_to_backlog']), ('completed', 1))
        issues = {i['title']: i for i in self.client.get(f'{self.base}/issues/').data['results']}
        self.assertEqual(issues['done']['sprint'], s['id'])           # finished work stays in the sprint
        self.assertIsNone(issues['todo']['sprint'])                   # unfinished work goes back
        self.assertIn('sprint.started', self.audit_actions(self.slug))

    def test_only_one_active_sprint_per_project(self):
        a, b = self.sprint('A'), self.sprint('B')
        self.client.post(f'{self.base}/sprints/{a["id"]}/start/')
        self.assertEqual(self.client.post(f'{self.base}/sprints/{b["id"]}/start/').status_code, 400)

    def test_dates_validated_and_status_is_read_only(self):
        r = self.client.post(f'{self.base}/sprints/', {'project': self.pid, 'name': 'X', 'start_date': '2026-11-10', 'end_date': '2026-11-01'}, format='json')
        self.assertEqual(r.status_code, 400)
        s = self.sprint()
        self.client.patch(f'{self.base}/sprints/{s["id"]}/', {'status': 'completed'}, format='json')
        self.assertEqual(self.client.get(f'{self.base}/sprints/{s["id"]}/').data['status'], 'planned')

    def test_issue_cannot_join_a_sprint_of_another_project(self):
        other = self.make_project(self.owner, self.slug, 'Mobile', 'MOB')
        s = self.client.post(f'{self.base}/sprints/', {'project': other['id'], 'name': 'Other'}, format='json').data
        r = self.client.post(f'{self.base}/issues/', {'project': self.pid, 'title': 'x', 'sprint': s['id']}, format='json')
        self.assertEqual(r.status_code, 400)


class CommentAttachmentTests(BoardTestCase):
    def setUp(self):
        super().setUp()
        self.issue = self.make_issue(self.slug, self.pid)
        self.member = self.signup('member@co.test')
        self.add_member(self.owner, self.slug, 'member@co.test', 'member')

    def test_comments_belong_to_their_author(self):
        self.as_user(self.member)
        c = self.client.post(f'{self.base}/comments/', {'issue': self.issue['id'], 'body': 'My comment'}, format='json').data
        self.assertEqual(c['author_name'], 'Member')
        self.as_user(self.owner)                                    # an admin/owner may moderate
        self.assertEqual(self.client.delete(f'{self.base}/comments/{c["id"]}/').status_code, 204)

    def test_a_member_cannot_edit_or_delete_someone_elses_comment(self):
        self.as_user(self.owner)
        c = self.client.post(f'{self.base}/comments/', {'issue': self.issue['id'], 'body': 'Boss says'}, format='json').data
        self.as_user(self.member)
        self.assertEqual(self.client.patch(f'{self.base}/comments/{c["id"]}/', {'body': 'edited'}, format='json').status_code, 403)
        self.assertEqual(self.client.delete(f'{self.base}/comments/{c["id"]}/').status_code, 403)

    def test_comment_list_per_issue_and_audit(self):
        self.client.post(f'{self.base}/comments/', {'issue': self.issue['id'], 'body': 'one'}, format='json')
        self.assertEqual(self.client.get(f'{self.base}/comments/?issue={self.issue["id"]}').data['count'], 1)
        self.assertIn('comment.created', self.audit_actions(self.slug))

    def upload(self, name='notes.txt', content=b'hello', issue=None):
        return self.client.post(f'{self.base}/attachments/', {'issue': issue or self.issue['id'], 'file': SimpleUploadedFile(name, content)}, format='multipart')

    def test_upload_download_delete(self):
        r = self.upload()
        self.assertEqual(r.status_code, 201, r.content)
        att = r.data
        self.assertEqual((att['filename'], att['size']), ('notes.txt', 5))
        d = self.client.get(f'{self.base}/attachments/{att["id"]}/download/')
        self.assertEqual(b''.join(d.streaming_content), b'hello')
        self.assertIn('attachment', d['Content-Disposition'])
        self.assertEqual(d['X-Content-Type-Options'], 'nosniff')
        self.assertEqual(self.client.delete(f'{self.base}/attachments/{att["id"]}/').status_code, 204)
        self.assertEqual(self.client.get(f'{self.base}/attachments/{att["id"]}/download/').status_code, 404)
        self.assertIn('attachment.created', self.audit_actions(self.slug))

    @override_settings(MAX_ATTACHMENT_MB=1)
    def test_size_limit_and_missing_file(self):
        self.assertEqual(self.upload('big.bin', b'x' * (1024 * 1024 + 1)).status_code, 400)
        self.assertEqual(self.client.post(f'{self.base}/attachments/', {'issue': self.issue['id']}, format='multipart').status_code, 400)

    def test_path_tricks_in_the_filename_are_neutralised(self):
        r = self.upload('../../etc/passwd.txt')
        self.assertEqual(r.data['filename'], 'passwd.txt')

    def test_viewer_cannot_upload(self):
        viewer = self.signup('viewer@co.test')
        self.add_member(self.owner, self.slug, 'viewer@co.test', 'viewer')
        self.as_user(viewer)
        self.assertEqual(self.upload().status_code, 403)
